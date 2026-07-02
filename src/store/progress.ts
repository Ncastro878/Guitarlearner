/**
 * progress.ts — per-mode level unlocks and best streaks, persisted to
 * localStorage and exposed through a React hook.
 */

import { useCallback, useEffect, useState } from "react";
import { loadJSON, saveJSON } from "./storage";

const KEY = "guitarlearner.progress.v1";

export type GameModeId =
  | "noteHunt"
  | "intervalEcho"
  | "arpeggioGauntlet"
  | "scaleRunner"
  | "aurora";

export interface ModeProgress {
  /** Highest level index the player has unlocked (0-based). */
  unlockedLevel: number;
  /** Best streak ever achieved in this mode. */
  bestStreak: number;
  /** Total correct answers across all sessions (a lifetime score). */
  totalCorrect: number;
}

export type Progress = Record<GameModeId, ModeProgress>;

const EMPTY_MODE: ModeProgress = {
  unlockedLevel: 0,
  bestStreak: 0,
  totalCorrect: 0,
};

export const DEFAULT_PROGRESS: Progress = {
  noteHunt: { ...EMPTY_MODE },
  intervalEcho: { ...EMPTY_MODE },
  arpeggioGauntlet: { ...EMPTY_MODE },
  scaleRunner: { ...EMPTY_MODE },
  aurora: { ...EMPTY_MODE },
};

export function useProgress() {
  const [progress, setProgress] = useState<Progress>(() =>
    loadJSON(KEY, DEFAULT_PROGRESS),
  );

  useEffect(() => {
    saveJSON(KEY, progress);
  }, [progress]);

  /** Record a completed round's outcome for a mode. */
  const recordResult = useCallback(
    (
      mode: GameModeId,
      opts: { streak?: number; correct?: number; reachedLevel?: number },
    ) => {
      setProgress((prev) => {
        const cur = prev[mode] ?? EMPTY_MODE;
        return {
          ...prev,
          [mode]: {
            unlockedLevel: Math.max(
              cur.unlockedLevel,
              opts.reachedLevel ?? cur.unlockedLevel,
            ),
            bestStreak: Math.max(cur.bestStreak, opts.streak ?? 0),
            totalCorrect: cur.totalCorrect + (opts.correct ?? 0),
          },
        };
      });
    },
    [],
  );

  const reset = useCallback(() => setProgress(DEFAULT_PROGRESS), []);

  return { progress, recordResult, reset };
}
