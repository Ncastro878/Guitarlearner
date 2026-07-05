/**
 * noteHunt.ts — pure level definitions and target generation for the Note Hunt
 * game mode. No React here so the level logic stays testable.
 */

import { STANDARD_TUNING } from "../lib/guitar";
import {
  centsFromPitchClass,
  type PitchClass,
  type PitchReading,
} from "../lib/theory";

/** Pitch classes of the seven natural notes (C D E F G A B). */
export const NATURAL_PITCH_CLASSES: PitchClass[] = [0, 2, 4, 5, 7, 9, 11];
/** All twelve chromatic pitch classes. */
export const ALL_PITCH_CLASSES: PitchClass[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
];

export interface NoteHuntLevel {
  id: number;
  name: string;
  description: string;
  /** Pool of pitch classes targets are drawn from. */
  pool: PitchClass[];
  /** Seconds allowed per target. */
  timeLimit: number;
  /** Number of targets in a level run. */
  rounds: number;
  /** Whether to also name a target string (honor system — pitch only checked). */
  stringSpecific: boolean;
}

export const NOTE_HUNT_LEVELS: NoteHuntLevel[] = [
  {
    id: 0,
    name: "Naturals",
    description: "Find the natural notes anywhere on the neck.",
    pool: NATURAL_PITCH_CLASSES,
    timeLimit: 8,
    rounds: 8,
    stringSpecific: false,
  },
  {
    id: 1,
    name: "Sharps & Flats",
    description: "All twelve notes are now in play.",
    pool: ALL_PITCH_CLASSES,
    timeLimit: 7,
    rounds: 10,
    stringSpecific: false,
  },
  {
    id: 2,
    name: "String Specific",
    description:
      "Play the note on the named string (string is on the honor system — only the pitch is checked).",
    pool: ALL_PITCH_CLASSES,
    timeLimit: 8,
    rounds: 10,
    stringSpecific: true,
  },
  {
    id: 3,
    name: "Speed Round",
    description: "All twelve notes, on the clock. Keep the streak alive!",
    pool: ALL_PITCH_CLASSES,
    timeLimit: 4,
    rounds: 12,
    stringSpecific: false,
  },
];

export interface NoteHuntTarget {
  pitchClass: PitchClass;
  /** String number 1–6 for string-specific levels, else null. */
  stringNumber: number | null;
  /** Friendly string label, else null. */
  stringLabel: string | null;
}

/**
 * Generate a fresh target for a level. Avoids immediately repeating the
 * previous pitch class so consecutive prompts feel varied.
 *
 * `rng` is injectable for deterministic tests; defaults to Math.random.
 */
export function nextTarget(
  level: NoteHuntLevel,
  previous: NoteHuntTarget | null,
  rng: () => number = Math.random,
): NoteHuntTarget {
  const pool =
    previous && level.pool.length > 1
      ? level.pool.filter((pc) => pc !== previous.pitchClass)
      : level.pool;
  const pitchClass = pool[Math.floor(rng() * pool.length)];

  let stringNumber: number | null = null;
  let stringLabel: string | null = null;
  if (level.stringSpecific) {
    const s = STANDARD_TUNING[Math.floor(rng() * STANDARD_TUNING.length)];
    stringNumber = s.number;
    stringLabel = s.label;
  }

  return { pitchClass, stringNumber, stringLabel };
}

/**
 * A guess is correct if it lands within `toleranceCents` of the target's
 * pitch class (octave ignored) — the tolerance forgives out-of-tune strings
 * and imperfect intonation.
 */
export function isCorrectGuess(
  target: NoteHuntTarget,
  guess: PitchReading,
  toleranceCents = 50,
): boolean {
  return centsFromPitchClass(guess, target.pitchClass) < toleranceCents;
}
