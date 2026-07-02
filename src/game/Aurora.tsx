/**
 * Aurora — free-play visualizer mode. Not a drill: no timer, no fail state.
 *
 * Pick a key, then just play. In-key notes erupt colour from the
 * polyrhythmic orbit rings (one ring per scale degree) and build "flow",
 * which makes the whole scene bloom. Out-of-key notes glitch the scene —
 * shake, red wash, gray shards — and collapse the flow. Clicking the canvas
 * fires a random in-key burst so the visuals can be previewed without an
 * instrument. The longest in-key run is recorded as the mode's best streak.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PitchProps } from "../App";
import { TunerStrip } from "../components/TunerStrip";
import {
  pitchClassName,
  type DetectedNote,
  type PitchClass,
  type ScaleName,
  SCALE_FORMULAS,
} from "../lib/theory";
import {
  AURORA_SCALES,
  buildRings,
  burstScaleForMidi,
  scaleDegreeOf,
  type AuroraKey,
} from "./aurora";
import { AuroraEngine } from "./auroraEngine";

interface AuroraProps {
  pitch: PitchProps;
  bestStreak: number;
  onRecord: (o: { streak?: number; correct?: number }) => void;
  onExit: () => void;
}

interface LastNote {
  label: string;
  inKey: boolean;
}

export function Aurora({ pitch, bestStreak, onRecord, onExit }: AuroraProps) {
  const [root, setRoot] = useState<PitchClass>(9); // A
  const [scale, setScale] = useState<ScaleName>("minorPentatonic");
  const [run, setRun] = useState(0);
  const [lastNote, setLastNote] = useState<LastNote | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<AuroraEngine | null>(null);
  const keyRef = useRef<AuroraKey>({ root, scale });
  keyRef.current = { root, scale };
  const ringsRef = useRef(buildRings(keyRef.current));
  const runRef = useRef(0);
  const bestRunRef = useRef(0);
  const inKeyCountRef = useRef(0);
  const onRecordRef = useRef(onRecord);
  onRecordRef.current = onRecord;

  // --- engine lifecycle ----------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new AuroraEngine(canvas);
    engineRef.current = engine;
    engine.setRings(ringsRef.current);
    engine.start();

    const ro = new ResizeObserver(() => engine.resize());
    ro.observe(canvas);

    return () => {
      ro.disconnect();
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  // Rebuild the ring system when the key changes.
  useEffect(() => {
    ringsRef.current = buildRings({ root, scale });
    engineRef.current?.setRings(ringsRef.current);
  }, [root, scale]);

  // --- react to played notes ----------------------------------------------

  const handleNote = useCallback(
    (note: DetectedNote) => {
      const degree = scaleDegreeOf(note.pitchClass, keyRef.current);
      const label = `${pitchClassName(note.pitchClass, pitch.useFlats)}${note.octave}`;
      if (degree >= 0) {
        const ring = ringsRef.current[degree];
        engineRef.current?.pulse(degree, ring.hue, burstScaleForMidi(note.midi));
        runRef.current += 1;
        inKeyCountRef.current += 1;
        if (runRef.current > bestRunRef.current)
          bestRunRef.current = runRef.current;
        setRun(runRef.current);
        setLastNote({ label, inKey: true });
      } else {
        engineRef.current?.dissonance();
        runRef.current = 0;
        setRun(0);
        setLastNote({ label, inKey: false });
      }
    },
    [pitch.useFlats],
  );

  useEffect(() => {
    pitch.registerNoteHandler(handleNote);
    return () => pitch.registerNoteHandler(null);
  }, [pitch, handleNote]);

  // Record the session (longest run + in-key note count) when leaving.
  useEffect(() => {
    return () => {
      if (bestRunRef.current > 0 || inKeyCountRef.current > 0) {
        onRecordRef.current({
          streak: bestRunRef.current,
          correct: inKeyCountRef.current,
        });
      }
    };
  }, []);

  // Clicking the canvas previews a burst without an instrument.
  const previewBurst = useCallback(() => {
    const rings = ringsRef.current;
    const i = Math.floor(Math.random() * rings.length);
    engineRef.current?.pulse(i, rings[i].hue, 0.9 + Math.random() * 0.5);
  }, []);

  // --- render ------------------------------------------------------------

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mb-3 flex items-center justify-between gap-2">
        <button
          onClick={onExit}
          className="rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 active:scale-95"
        >
          ← Menu
        </button>
        <h1 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Aurora
        </h1>
        <div className="min-w-[4.5rem] text-right text-xs text-slate-500">
          {run > 1 ? (
            <span className="text-emerald-400">{run} in key</span>
          ) : (
            bestStreak > 0 && `best ${bestStreak}`
          )}
        </div>
      </header>

      {/* key picker */}
      <div className="mb-3 flex items-center justify-center gap-2 text-sm">
        <label className="text-xs uppercase tracking-wider text-slate-500">
          Key
        </label>
        <select
          value={root}
          onChange={(e) => setRoot(Number(e.target.value))}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100"
        >
          {Array.from({ length: 12 }, (_, pc) => (
            <option key={pc} value={pc}>
              {pitchClassName(pc, pitch.useFlats)}
            </option>
          ))}
        </select>
        <select
          value={scale}
          onChange={(e) => setScale(e.target.value as ScaleName)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100"
        >
          {AURORA_SCALES.map((s) => (
            <option key={s} value={s}>
              {SCALE_FORMULAS[s].label}
            </option>
          ))}
        </select>
      </div>

      {/* the sky */}
      <div className="relative flex-1 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
        <canvas
          ref={canvasRef}
          onClick={previewBurst}
          className="h-full w-full cursor-pointer"
          style={{ minHeight: "50vh" }}
        />

        {/* last-note readout */}
        {lastNote && (
          <div
            className={`pointer-events-none absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ${
              lastNote.inKey
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-rose-500/20 text-rose-300"
            }`}
          >
            {lastNote.label} {lastNote.inKey ? "· in key" : "· out of key"}
          </div>
        )}

        {/* mic gate overlay */}
        {!pitch.isListening && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/70 p-6 text-center">
            <div className="text-4xl">✨</div>
            <p className="max-w-xs text-sm text-slate-300">
              Play anything in the key and the sky lights up. Stray out of key
              and it glitches. No timer, no score — just play.
            </p>
            {pitch.error && (
              <p className="rounded-lg bg-rose-950/60 px-3 py-2 text-sm text-rose-300">
                {pitch.error}
              </p>
            )}
            <button
              onClick={() => void pitch.start()}
              className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 active:scale-95"
            >
              Enable microphone
            </button>
            <button
              onClick={previewBurst}
              className="text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
            >
              or tap the sky to preview
            </button>
          </div>
        )}
      </div>

      <footer className="mt-3">
        <TunerStrip
          currentNote={pitch.currentNote}
          centsOffset={pitch.centsOffset}
          clarity={pitch.clarity}
          frequency={pitch.frequency}
          isListening={pitch.isListening}
          useFlats={pitch.useFlats}
        />
      </footer>
    </div>
  );
}
