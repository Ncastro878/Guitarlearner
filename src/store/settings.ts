/**
 * settings.ts — user-tweakable settings, persisted to localStorage, exposed
 * through a small React hook.
 */

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_A4 } from "../lib/theory";
import { loadJSON, saveJSON } from "./storage";

const KEY = "guitarlearner.settings.v1";

export interface Settings {
  /** Concert pitch reference for A4, in Hz. */
  a4: number;
  /**
   * Input sensitivity 0–100. Higher = more sensitive (registers quieter /
   * less-clear signals). Maps to the detector's clarity + volume thresholds.
   */
  sensitivity: number;
  /** Whether to play success/error sound effects. */
  soundEffects: boolean;
  /** Prefer flat spellings in the UI. */
  useFlats: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  a4: DEFAULT_A4,
  sensitivity: 55,
  soundEffects: true,
  useFlats: false,
};

/**
 * Translate the 0–100 sensitivity slider into concrete detector thresholds.
 * At low sensitivity we demand a very clear, loud signal; at high sensitivity
 * we accept fainter, noisier input.
 */
export function sensitivityToThresholds(sensitivity: number): {
  clarityThreshold: number;
  minVolumeDecibels: number;
} {
  const s = Math.min(100, Math.max(0, sensitivity)) / 100;
  return {
    // clarity 0.95 (strict) → 0.75 (lenient)
    clarityThreshold: 0.95 - 0.2 * s,
    // volume floor -20 dB (strict) → -55 dB (lenient)
    minVolumeDecibels: -20 - 35 * s,
  };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() =>
    loadJSON(KEY, DEFAULT_SETTINGS),
  );

  useEffect(() => {
    saveJSON(KEY, settings);
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  return { settings, update, reset };
}
