/**
 * fretQuiz.ts — pure level definitions and question generation for the
 * Fret Quiz game mode: a fret lights up on the neck diagram and the player
 * names the note. The one mode that needs no microphone — input is typed or
 * tapped — so the logic here is just fretboard geography.
 *
 * Levels follow the classic method: natural notes two strings at a time
 * (bass → middle → treble), then the whole neck including accidentals.
 */

import { STANDARD_TUNING } from "../lib/guitar";
import { mod12, parseNote, type PitchClass } from "../lib/theory";

/** Pitch classes of the seven natural notes. */
const NATURALS = new Set([0, 2, 4, 5, 7, 9, 11]);

export interface FretQuizLevel {
  id: number;
  name: string;
  description: string;
  /** String numbers (1 = high E … 6 = low E) questions are drawn from. */
  strings: number[];
  /** Highest fret asked (0 = open included). */
  maxFret: number;
  /** Restrict questions to natural notes. */
  naturalsOnly: boolean;
  /** Seconds allowed per question. */
  timeLimit: number;
  /** Number of questions in a level run. */
  rounds: number;
}

export const FRET_QUIZ_LEVELS: FretQuizLevel[] = [
  {
    id: 0,
    name: "Low E & A",
    description: "Natural notes on the two bass strings — the barre-chord roots.",
    strings: [6, 5],
    maxFret: 12,
    naturalsOnly: true,
    timeLimit: 8,
    rounds: 10,
  },
  {
    id: 1,
    name: "D & G",
    description: "Naturals on the middle strings.",
    strings: [4, 3],
    maxFret: 12,
    naturalsOnly: true,
    timeLimit: 8,
    rounds: 10,
  },
  {
    id: 2,
    name: "B & High E",
    description: "Naturals on the treble strings.",
    strings: [2, 1],
    maxFret: 12,
    naturalsOnly: true,
    timeLimit: 8,
    rounds: 10,
  },
  {
    id: 3,
    name: "Full Neck",
    description: "Every string, every note — sharps and flats included.",
    strings: [1, 2, 3, 4, 5, 6],
    maxFret: 12,
    naturalsOnly: false,
    timeLimit: 6,
    rounds: 12,
  },
];

const OPEN_MIDI_BY_STRING = new Map(
  STANDARD_TUNING.map((s) => [s.number, parseNote(s.openNote).midi]),
);

/** MIDI note at a string/fret position in standard tuning. */
export function midiOnString(stringNumber: number, fret: number): number {
  const open = OPEN_MIDI_BY_STRING.get(stringNumber);
  if (open === undefined) throw new Error(`No string ${stringNumber}`);
  return open + fret;
}

export interface FretQuizQuestion {
  /** String number 1–6. */
  string: number;
  /** Fret 0–maxFret (0 = open). */
  fret: number;
  /** The note at that position. */
  midi: number;
}

/** Every position a level may ask about. */
export function questionCandidates(level: FretQuizLevel): FretQuizQuestion[] {
  const out: FretQuizQuestion[] = [];
  for (const s of level.strings) {
    for (let f = 0; f <= level.maxFret; f++) {
      const midi = midiOnString(s, f);
      if (level.naturalsOnly && !NATURALS.has(mod12(midi))) continue;
      out.push({ string: s, fret: f, midi });
    }
  }
  return out;
}

/**
 * Pick the next question, never repeating the exact previous position.
 *
 * `rng` is injectable for deterministic tests; defaults to Math.random.
 */
export function nextQuestion(
  level: FretQuizLevel,
  previous: FretQuizQuestion | null,
  rng: () => number = Math.random,
): FretQuizQuestion {
  let pool = questionCandidates(level);
  if (previous && pool.length > 1) {
    pool = pool.filter(
      (q) => !(q.string === previous.string && q.fret === previous.fret),
    );
  }
  return pool[Math.floor(rng() * pool.length)];
}

/** An answer is the note's pitch class (octave never matters). */
export function isCorrectAnswer(
  question: FretQuizQuestion,
  answer: PitchClass,
): boolean {
  return mod12(question.midi) === mod12(answer);
}
