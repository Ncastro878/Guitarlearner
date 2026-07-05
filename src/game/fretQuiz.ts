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

// ---------------------------------------------------------------------------
// Spaced-repetition memory (Leitner boxes, adapted for an in-session drill)
// ---------------------------------------------------------------------------
//
// Every position on the neck is a "card" with a box 0–4. A correct answer
// promotes the card one box; a wrong answer (or timeout) drops it back to
// box 0. Question selection samples positions weighted by box — box-0 cards
// are drawn ~16× as often as box-4 cards, unseen cards land in between — so
// the drill automatically concentrates on the player's gaps and lets the
// notes they know recede. Unlike calendar-based Anki scheduling, everything
// happens within and across play sessions via weights, which fits a timed
// 10-question round.

export interface CardStats {
  /** Leitner box 0 (weakest) – 4 (mastered). */
  box: number;
  /** Lifetime attempts at this position. */
  attempts: number;
  /** Lifetime correct answers. */
  correct: number;
}

/** Memory across all positions, keyed by {@link cardId}. */
export type FretQuizMemory = Record<string, CardStats>;

export const MAX_BOX = 4;
/** Box at or above which a position counts as "solid" for mastery stats. */
export const MASTERY_BOX = 3;
/** Selection weight per box — box 0 is asked 16× as often as box 4. */
const BOX_WEIGHTS = [8, 4, 2, 1, 0.5];
/** Unseen positions sit between "wrong" and "learning" so new material flows in. */
const NEW_WEIGHT = 5;
/** Damping for positions asked in the last few questions (no ping-pong). */
const RECENT_DAMP = 0.2;

/** Stable identity of a position. */
export function cardId(q: Pick<FretQuizQuestion, "string" | "fret">): string {
  return `s${q.string}f${q.fret}`;
}

/** Fold one answer into the memory (immutably). */
export function applyResult(
  memory: FretQuizMemory,
  question: FretQuizQuestion,
  correct: boolean,
): FretQuizMemory {
  const id = cardId(question);
  const cur = memory[id];
  return {
    ...memory,
    [id]: {
      box: correct ? Math.min(MAX_BOX, (cur?.box ?? 0) + 1) : 0,
      attempts: (cur?.attempts ?? 0) + 1,
      correct: (cur?.correct ?? 0) + (correct ? 1 : 0),
    },
  };
}

/** Selection weight of a position given its stats (unseen = NEW_WEIGHT). */
export function weightFor(stats: CardStats | undefined): number {
  if (!stats) return NEW_WEIGHT;
  return BOX_WEIGHTS[Math.max(0, Math.min(MAX_BOX, stats.box))];
}

/**
 * Pick the next question with gap-focused weighting: candidates are sampled
 * in proportion to their weakness, the exact previous position is excluded,
 * and anything asked within the last few questions is heavily damped.
 */
export function nextQuestionWeighted(
  level: FretQuizLevel,
  memory: FretQuizMemory,
  previous: FretQuizQuestion | null,
  recentIds: readonly string[] = [],
  rng: () => number = Math.random,
): FretQuizQuestion {
  let pool = questionCandidates(level);
  if (previous && pool.length > 1) {
    pool = pool.filter(
      (q) => !(q.string === previous.string && q.fret === previous.fret),
    );
  }
  const weights = pool.map((q) => {
    const w = weightFor(memory[cardId(q)]);
    return recentIds.includes(cardId(q)) ? w * RECENT_DAMP : w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** How many of a level's positions are solid (box ≥ MASTERY_BOX). */
export function levelMastery(
  level: FretQuizLevel,
  memory: FretQuizMemory,
): { solid: number; total: number } {
  const pool = questionCandidates(level);
  const solid = pool.filter(
    (q) => (memory[cardId(q)]?.box ?? 0) >= MASTERY_BOX,
  ).length;
  return { solid, total: pool.length };
}
