/**
 * intervalEcho.ts — pure level definitions and target generation for the
 * Interval Echo game mode. No React here so the logic stays testable.
 *
 * A target is a concrete root note plus an interval (1–11 semitones). The
 * game plays the root as a reference tone and the player must find the note
 * that interval above the root. Guesses are matched by pitch class relative
 * to the root, so any octave/string/position of the correct note counts
 * (direction is on the honor system — pitch alone can't tell "a 5th above"
 * from "a 4th below", and both land on the same pitch class).
 */

import {
  INTERVALS,
  centsFromPitchClass,
  mod12,
  noteFromMidi,
  type IntervalName,
  type Note,
  type PitchReading,
} from "../lib/theory";

export interface IntervalEchoLevel {
  id: number;
  name: string;
  description: string;
  /** Pool of interval sizes (semitones above the root, 1–11). */
  pool: number[];
  /** Seconds allowed per target (countdown starts after the root plays). */
  timeLimit: number;
  /** Number of targets in a level run. */
  rounds: number;
}

export const INTERVAL_ECHO_LEVELS: IntervalEchoLevel[] = [
  {
    id: 0,
    name: "Home Base",
    description:
      "Major 3rd, perfect 4th and perfect 5th — the backbone of every chord.",
    pool: [4, 5, 7],
    timeLimit: 10,
    rounds: 8,
  },
  {
    id: 1,
    name: "Thirds & Sixths",
    description: "Both 3rds and both 6ths — the sweet, singable intervals.",
    pool: [3, 4, 8, 9],
    timeLimit: 9,
    rounds: 10,
  },
  {
    id: 2,
    name: "Seconds & Sevenths",
    description: "The crunchy ones: 2nds, 7ths and the tritone.",
    pool: [1, 2, 6, 10, 11],
    timeLimit: 9,
    rounds: 10,
  },
  {
    id: 3,
    name: "Chromatic Echo",
    description: "Every interval from a minor 2nd to a major 7th, on the clock.",
    pool: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    timeLimit: 6,
    rounds: 12,
  },
];

/**
 * Range roots are drawn from: E2 (open low E) up to E4 (open high E). The
 * widest interval (11 semitones) above E4 is D#5, comfortably on the neck.
 */
export const ROOT_MIN_MIDI = 40; // E2
export const ROOT_MAX_MIDI = 64; // E4

export interface IntervalEchoTarget {
  /** Concrete root note (the reference tone the game plays). */
  root: Note;
  /** Interval size in semitones above the root, 1–11. */
  semitones: number;
}

/** The concrete note the interval lands on (root + semitones). */
export function targetNote(target: IntervalEchoTarget): Note {
  return noteFromMidi(target.root.midi + target.semitones);
}

/** Display name of a target's interval. */
export function targetIntervalName(target: IntervalEchoTarget): IntervalName {
  return INTERVALS[target.semitones];
}

/**
 * Generate a fresh target for a level. Avoids immediately repeating the
 * previous interval so consecutive prompts feel varied.
 *
 * `rng` is injectable for deterministic tests; defaults to Math.random.
 */
export function nextTarget(
  level: IntervalEchoLevel,
  previous: IntervalEchoTarget | null,
  rng: () => number = Math.random,
): IntervalEchoTarget {
  const pool =
    previous && level.pool.length > 1
      ? level.pool.filter((s) => s !== previous.semitones)
      : level.pool;
  const semitones = pool[Math.floor(rng() * pool.length)];

  const span = ROOT_MAX_MIDI - ROOT_MIN_MIDI + 1;
  const rootMidi = ROOT_MIN_MIDI + Math.floor(rng() * span);

  return { root: noteFromMidi(rootMidi), semitones };
}

/**
 * Interval (in semitones, 0–11) that a guessed note forms above the target's
 * root, reduced to within an octave. 0 means the guess is the root itself.
 */
export function guessedInterval(
  target: IntervalEchoTarget,
  guessMidi: number,
): number {
  return mod12(guessMidi - target.root.midi);
}

/**
 * A guess is correct if it lands within `toleranceCents` of the pitch class
 * `semitones` above the root (octave ignored). Since pools only contain
 * 1–11, playing the root back is never a correct answer.
 */
export function isCorrectGuess(
  target: IntervalEchoTarget,
  guess: PitchReading,
  toleranceCents = 50,
): boolean {
  const targetPc = mod12(target.root.pitchClass + target.semitones);
  return centsFromPitchClass(guess, targetPc) < toleranceCents;
}
