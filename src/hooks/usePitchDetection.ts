/**
 * usePitchDetection — the core audio engine.
 *
 * Requests microphone access on demand, streams time-domain audio into an
 * AnalyserNode, and runs monophonic pitch detection (McLeod Pitch Method via
 * the `pitchy` package) ~30–60 times a second. It converts the detected
 * frequency into a note + cents offset, gates it by a clarity/volume
 * threshold and a guitar-range filter, and debounces so a note only
 * "registers" once it has been held stably for ~150 ms (guitar attack
 * transients are noisy and would otherwise produce spurious detections).
 *
 * Two views of the signal are exposed:
 *   - Live values (`currentNote`, `frequency`, `centsOffset`, `clarity`) —
 *     updated every frame, for the always-on tuner strip.
 *   - `stableNote` + the `onStableNote` callback — the debounced note the game
 *     logic should react to.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PitchDetector } from "pitchy";
import {
  DEFAULT_A4,
  frequencyToNote,
  type DetectedNote,
} from "../lib/theory";
import {
  MAX_GUITAR_FREQUENCY,
  MIN_GUITAR_FREQUENCY,
} from "../lib/guitar";
import { sensitivityToThresholds } from "../store/settings";

export interface UsePitchDetectionOptions {
  /** Concert pitch for A4 (Hz). Default 440. */
  a4?: number;
  /** Input sensitivity 0–100 (see settings). Default 55. */
  sensitivity?: number;
  /** How long a note must be held before it "registers" (ms). Default 150. */
  debounceMs?: number;
  /**
   * Analyser buffer size (power of two). Larger = better low-frequency
   * resolution but more latency. 4096 comfortably resolves low E (82 Hz).
   */
  bufferSize?: number;
  /** Fired once each time a new stable note registers. */
  onStableNote?: (note: DetectedNote) => void;
}

export interface PitchDetectionState {
  isListening: boolean;
  /** False when the browser has no getUserMedia / Web Audio support. */
  isSupported: boolean;
  /** Human-readable error (e.g. permission denied), or null. */
  error: string | null;

  // --- live values, updated every analysis frame ---
  /** Nearest note to the live signal, or null when nothing clear is heard. */
  currentNote: DetectedNote | null;
  /** Live fundamental frequency in Hz (0 when silent). */
  frequency: number;
  /** Live cents offset from the nearest note (0 when silent). */
  centsOffset: number;
  /** Live clarity 0–1 from the pitch detector (0 when silent). */
  clarity: number;

  // --- debounced value the game reacts to ---
  /** The note currently held stably for >= debounceMs, or null. */
  stableNote: DetectedNote | null;
}

const SILENT: Pick<
  PitchDetectionState,
  "currentNote" | "frequency" | "centsOffset" | "clarity"
> = { currentNote: null, frequency: 0, centsOffset: 0, clarity: 0 };

export function usePitchDetection(
  options: UsePitchDetectionOptions = {},
): PitchDetectionState & { start: () => Promise<boolean>; stop: () => void } {
  const {
    a4 = DEFAULT_A4,
    sensitivity = 55,
    debounceMs = 150,
    bufferSize = 4096,
  } = options;

  const isSupported =
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    !!(window.AudioContext ||
      (window as unknown as { webkitAudioContext?: unknown })
        .webkitAudioContext);

  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(SILENT);
  const [stableNote, setStableNote] = useState<DetectedNote | null>(null);

  // Mutable pipeline refs (not state — they must not trigger re-renders).
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const detectorRef = useRef<PitchDetector<Float32Array> | null>(null);
  const bufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const rafRef = useRef<number | null>(null);

  // Debounce bookkeeping, kept in refs so the RAF loop always sees fresh values.
  const candidateMidiRef = useRef<number | null>(null);
  const candidateSinceRef = useRef<number>(0);
  const registeredMidiRef = useRef<number | null>(null);

  // Keep the latest options accessible from inside the animation loop without
  // re-subscribing the loop on every render.
  const optsRef = useRef(options);
  optsRef.current = options;
  const a4Ref = useRef(a4);
  a4Ref.current = a4;
  const debounceRef = useRef(debounceMs);
  debounceRef.current = debounceMs;

  // Re-tune the detector thresholds whenever sensitivity changes.
  useEffect(() => {
    const det = detectorRef.current;
    if (!det) return;
    const { clarityThreshold, minVolumeDecibels } =
      sensitivityToThresholds(sensitivity);
    det.clarityThreshold = clarityThreshold;
    det.minVolumeDecibels = minVolumeDecibels;
  }, [sensitivity]);

  const stop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    detectorRef.current = null;
    bufRef.current = null;
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      void ctxRef.current.close();
    }
    ctxRef.current = null;

    candidateMidiRef.current = null;
    registeredMidiRef.current = null;

    setIsListening(false);
    setLive(SILENT);
    setStableNote(null);
  }, []);

  /** Returns true when the mic is live; false when it failed (error is set). */
  const start = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError("Your browser does not support microphone audio input.");
      return false;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
      streamRef.current = stream;

      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();
      if (ctx.state === "suspended") await ctx.resume();
      ctxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = bufferSize;
      source.connect(analyser);
      analyserRef.current = analyser;

      const detector = PitchDetector.forFloat32Array(analyser.fftSize);
      const { clarityThreshold, minVolumeDecibels } =
        sensitivityToThresholds(optsRef.current.sensitivity ?? sensitivity);
      detector.clarityThreshold = clarityThreshold;
      detector.minVolumeDecibels = minVolumeDecibels;
      detectorRef.current = detector;
      bufRef.current = new Float32Array(detector.inputLength);

      setIsListening(true);
      loop();
      return true;
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone permission was denied. Enable it in your browser settings and try again."
          : err instanceof Error
            ? err.message
            : "Could not start the microphone.";
      setError(message);
      stop();
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported, bufferSize, sensitivity, stop]);

  // The per-frame analysis loop. Defined with a ref so `start` can call it
  // without listing it as a dependency.
  const loopRef = useRef<() => void>(() => {});
  const loop = useCallback(() => loopRef.current(), []);

  loopRef.current = () => {
    const analyser = analyserRef.current;
    const detector = detectorRef.current;
    const ctx = ctxRef.current;
    const buf = bufRef.current;
    if (!analyser || !detector || !ctx || !buf) return;

    analyser.getFloatTimeDomainData(buf);
    const [frequency, clarity] = detector.findPitch(buf, ctx.sampleRate);

    const now = performance.now();
    const inRange =
      frequency >= MIN_GUITAR_FREQUENCY && frequency <= MAX_GUITAR_FREQUENCY;

    if (clarity > 0 && frequency > 0 && inRange) {
      const note = frequencyToNote(frequency, a4Ref.current);
      setLive({
        currentNote: note,
        frequency,
        centsOffset: note.cents,
        clarity,
      });

      // Debounce: the same MIDI note must persist for debounceMs.
      if (candidateMidiRef.current === note.midi) {
        const held = now - candidateSinceRef.current;
        if (
          held >= debounceRef.current &&
          registeredMidiRef.current !== note.midi
        ) {
          registeredMidiRef.current = note.midi;
          setStableNote(note);
          optsRef.current.onStableNote?.(note);
        }
      } else {
        candidateMidiRef.current = note.midi;
        candidateSinceRef.current = now;
      }
    } else {
      // Signal dropped out: clear live readout and allow the same note to be
      // re-triggered next time it is played.
      setLive(SILENT);
      candidateMidiRef.current = null;
      registeredMidiRef.current = null;
      setStableNote(null);
    }

    rafRef.current = requestAnimationFrame(loopRef.current);
  };

  // Clean up on unmount.
  useEffect(() => stop, [stop]);

  return {
    isListening,
    isSupported,
    error,
    currentNote: live.currentNote,
    frequency: live.frequency,
    centsOffset: live.centsOffset,
    clarity: live.clarity,
    stableNote,
    start,
    stop,
  };
}
