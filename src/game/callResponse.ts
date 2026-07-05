/**
 * callResponse.ts — pure phrase generation and matching for the
 * Call & Response game mode. No React here so the logic stays testable.
 *
 * The game plays a short phrase through the speakers; the player echoes it
 * back note by note. Notes are matched by pitch class in sequence (any
 * octave / position). Consecutive phrase notes always differ in pitch —
 * the pitch engine only re-fires after the signal drops, so a repeated
 * identical note would be unreliable to detect.
 */

import {
  centsFromPitchClass,
  mod12,
  type PitchReading,
} from "../lib/theory";

export interface CallResponseLevel {
  id: number;
  name: string;
  description: string;
  /** Number of notes in a phrase. */
  phraseLen: number;
  /** Step sizes (semitones, applied up or down) phrases are built from. */
  steps: number[];
  /** Seconds allowed to echo the phrase (clock starts after playback). */
  timeLimit: number;
  /** Number of phrases in a level run. */
  rounds: number;
}

export const CALL_RESPONSE_LEVELS: CallResponseLevel[] = [
  {
    id: 0,
    name: "Echo Two",
    description: "Two-note phrases built from small steps.",
    phraseLen: 2,
    steps: [1, 2, 3, 4, 5],
    timeLimit: 10,
    rounds: 8,
  },
  {
    id: 1,
    name: "Echo Three",
    description: "Three notes, with leaps up to a fifth.",
    phraseLen: 3,
    steps: [1, 2, 3, 4, 5, 7],
    timeLimit: 12,
    rounds: 10,
  },
  {
    id: 2,
    name: "Echo Four",
    description: "Four-note phrases — hold the whole shape in your ear.",
    phraseLen: 4,
    steps: [1, 2, 3, 4, 5, 7],
    timeLimit: 14,
    rounds: 10,
  },
  {
    id: 3,
    name: "Wide Leaps",
    description: "Four notes with big jumps — 6ths, 7ths and everything between.",
    phraseLen: 4,
    steps: [3, 4, 5, 7, 8, 9, 10, 11],
    timeLimit: 14,
    rounds: 12,
  },
];

/** Full range a phrase may wander over: A2–E5, comfortable on any guitar. */
export const PHRASE_MIN_MIDI = 45; // A2
export const PHRASE_MAX_MIDI = 76; // E5
/** First notes start mid-range so phrases have room to move either way. */
const ROOT_MIN_MIDI = 50; // D3
const ROOT_MAX_MIDI = 69; // A4

/**
 * Generate a phrase as a list of MIDI notes. Each note steps up or down from
 * the previous by a level-pool amount; a step that would leave the playable
 * range is reflected the other way (always back in range since steps ≤ 11).
 *
 * `rng` is injectable for deterministic tests; defaults to Math.random.
 */
export function generatePhrase(
  level: CallResponseLevel,
  rng: () => number = Math.random,
): number[] {
  const midis = [
    ROOT_MIN_MIDI + Math.floor(rng() * (ROOT_MAX_MIDI - ROOT_MIN_MIDI + 1)),
  ];
  while (midis.length < level.phraseLen) {
    const prev = midis[midis.length - 1];
    const step = level.steps[Math.floor(rng() * level.steps.length)];
    const dir = rng() < 0.5 ? -1 : 1;
    let next = prev + dir * step;
    if (next < PHRASE_MIN_MIDI || next > PHRASE_MAX_MIDI) {
      next = prev - dir * step;
    }
    midis.push(next);
  }
  return midis;
}

/**
 * Whether a played note matches the phrase note at `index` within the pitch
 * tolerance (octave ignored, consistent with the other modes).
 */
export function matchesAt(
  phrase: number[],
  index: number,
  guess: PitchReading,
  toleranceCents = 50,
): boolean {
  return (
    index < phrase.length &&
    centsFromPitchClass(guess, mod12(phrase[index])) < toleranceCents
  );
}

/** Seconds between phrase-note onsets during playback. */
export const NOTE_SPACING_S = 0.55;

/** Total playback duration of a phrase, in seconds. */
export function playbackDurationS(phraseLen: number): number {
  return (phraseLen - 1) * NOTE_SPACING_S + 0.6;
}
