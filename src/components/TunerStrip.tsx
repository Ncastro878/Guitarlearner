/**
 * TunerStrip — an always-on readout of what the microphone is hearing.
 *
 * Shows the nearest note, a cents needle, the raw frequency and a clarity
 * meter. This is deliberately prominent: it's the player's window into what
 * the game "heard", which builds trust and makes debugging obvious.
 */

import { pitchClassName, type DetectedNote } from "../lib/theory";

interface TunerStripProps {
  currentNote: DetectedNote | null;
  centsOffset: number;
  clarity: number;
  frequency: number;
  isListening: boolean;
  useFlats?: boolean;
}

/** Clamp cents to the needle's visible range. */
function centsToPercent(cents: number): number {
  const clamped = Math.max(-50, Math.min(50, cents));
  return 50 + clamped; // 0–100 across the strip
}

export function TunerStrip({
  currentNote,
  centsOffset,
  clarity,
  frequency,
  isListening,
  useFlats = false,
}: TunerStripProps) {
  const inTune = currentNote != null && Math.abs(centsOffset) <= 5;
  const close = currentNote != null && Math.abs(centsOffset) <= 15;
  const needleColor = !currentNote
    ? "bg-slate-600"
    : inTune
      ? "bg-emerald-400"
      : close
        ? "bg-amber-400"
        : "bg-rose-400";

  return (
    <div className="w-full rounded-2xl border border-slate-700/60 bg-slate-900/70 p-4 backdrop-blur">
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-slate-400">
        <span className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              isListening ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
            }`}
            aria-hidden
          />
          {isListening ? "Listening" : "Mic off"}
        </span>
        <span aria-label="Clarity">
          {isListening ? `${Math.round(clarity * 100)}% clear` : "—"}
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* Big note readout */}
        <div className="w-24 shrink-0 text-center">
          {currentNote ? (
            <>
              <div className="text-4xl font-bold tabular-nums text-slate-50">
                {pitchClassName(currentNote.pitchClass, useFlats)}
                <span className="align-top text-lg text-slate-400">
                  {currentNote.octave}
                </span>
              </div>
              <div className="text-xs tabular-nums text-slate-500">
                {frequency.toFixed(1)} Hz
              </div>
            </>
          ) : (
            <div className="text-3xl font-bold text-slate-700">–</div>
          )}
        </div>

        {/* Cents needle */}
        <div className="relative h-14 flex-1">
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-700" />
          {/* center + guide ticks */}
          {[-50, -25, 0, 25, 50].map((t) => (
            <div
              key={t}
              className={`absolute top-1/2 h-3 w-px -translate-y-1/2 ${
                t === 0 ? "h-6 bg-slate-400" : "bg-slate-700"
              }`}
              style={{ left: `${centsToPercent(t)}%` }}
            />
          ))}
          {currentNote && (
            <div
              className={`absolute top-1/2 h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left] duration-75 ${needleColor}`}
              style={{ left: `${centsToPercent(centsOffset)}%` }}
            />
          )}
          <div className="absolute inset-x-0 -bottom-1 flex justify-between text-[10px] text-slate-600">
            <span>♭ flat</span>
            <span className="tabular-nums">
              {currentNote ? `${centsOffset > 0 ? "+" : ""}${centsOffset}¢` : ""}
            </span>
            <span>sharp ♯</span>
          </div>
        </div>
      </div>
    </div>
  );
}
