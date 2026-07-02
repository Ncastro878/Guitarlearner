/**
 * GameShell — shared in-game layout: a header (back / title / streak), a
 * flexible content area, and the always-on tuner strip pinned at the bottom.
 */

import type { ReactNode } from "react";
import type { PitchProps } from "../App";
import { TunerStrip } from "./TunerStrip";

interface GameShellProps {
  title: string;
  pitch: PitchProps;
  streak?: number;
  bestStreak?: number;
  onExit: () => void;
  children: ReactNode;
}

export function GameShell({
  title,
  pitch,
  streak,
  bestStreak,
  onExit,
  children,
}: GameShellProps) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mb-4 flex items-center justify-between">
        <button
          onClick={onExit}
          className="rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 active:scale-95"
        >
          ← Menu
        </button>
        <h1 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          {title}
        </h1>
        <div className="min-w-[4.5rem] text-right">
          {streak !== undefined && (
            <div className="text-sm">
              <span className="text-lg font-bold text-emerald-400 tabular-nums">
                {streak}
              </span>
              <span className="text-slate-500"> streak</span>
              {bestStreak !== undefined && bestStreak > 0 && (
                <div className="text-[10px] text-slate-600">
                  best {bestStreak}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 py-4">
        {children}
      </main>

      <footer className="mt-4">
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
