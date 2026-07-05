/**
 * useSpokenNote — hands-free note answers via the Web Speech API.
 *
 * While enabled, a continuous SpeechRecognition session listens for spoken
 * note names ("C sharp", "B flat", bare letters and their homophones — see
 * lib/speechNotes.ts) and fires `onNote` with the parsed pitch class. Only
 * FINAL results are parsed: interim text would submit "C" while the player
 * is still saying "C sharp", and answers here are one-guess.
 *
 * Support is Chrome/Edge/Safari (webkit-prefixed); Firefox has no
 * SpeechRecognition, so callers should hide the option when `isSupported`
 * is false. The recogniser auto-restarts when the browser ends the session
 * (they time out after silence).
 */

import { useEffect, useRef, useState } from "react";
import { parseSpokenNote } from "../lib/speechNotes";
import type { PitchClass } from "../lib/theory";

/** Minimal typings — SpeechRecognition isn't in TS's dom lib everywhere. */
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResult };
}
interface RecognitionErrorEvent {
  error: string;
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseSpokenNoteOptions {
  enabled: boolean;
  /** Fired once per final utterance that names a note. */
  onNote: (pc: PitchClass) => void;
}

export function useSpokenNote({ enabled, onNote }: UseSpokenNoteOptions) {
  const isSupported = recognitionCtor() !== null;
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");

  const onNoteRef = useRef(onNote);
  onNoteRef.current = onNote;

  useEffect(() => {
    if (!enabled) return;
    const Ctor = recognitionCtor();
    if (!Ctor) return;

    let stopped = false;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (!result?.isFinal) continue;
        const text = result[0]?.transcript ?? "";
        setTranscript(text.trim());
        const pc = parseSpokenNote(text);
        if (pc !== null) onNoteRef.current(pc);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone permission for voice input was denied.");
        stopped = true;
      } else if (e.error === "network") {
        setError("Voice recognition needs a network connection.");
      }
      // "no-speech" / "aborted" are routine — onend's restart handles them.
    };
    rec.onend = () => {
      // Browsers end continuous sessions after silence; keep it alive.
      if (!stopped) {
        try {
          rec.start();
        } catch {
          setIsListening(false);
        }
      } else {
        setIsListening(false);
      }
    };

    try {
      rec.start();
      setIsListening(true);
      setError(null);
    } catch {
      setError("Could not start voice recognition.");
    }

    return () => {
      stopped = true;
      rec.onresult = null;
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
      setIsListening(false);
    };
  }, [enabled]);

  return { isSupported, isListening, error, transcript };
}
