import { describe, it, expect } from "vitest";
import { mod12, parseNote } from "../lib/theory";
import {
  FRET_QUIZ_LEVELS,
  isCorrectAnswer,
  midiOnString,
  nextQuestion,
  questionCandidates,
} from "./fretQuiz";

describe("fretQuiz levels", () => {
  it("defines four levels ending with the full chromatic neck", () => {
    expect(FRET_QUIZ_LEVELS).toHaveLength(4);
    expect(FRET_QUIZ_LEVELS[0].strings).toEqual([6, 5]);
    expect(FRET_QUIZ_LEVELS[3].strings).toHaveLength(6);
    expect(FRET_QUIZ_LEVELS[3].naturalsOnly).toBe(false);
    expect(FRET_QUIZ_LEVELS[3].timeLimit).toBeLessThan(
      FRET_QUIZ_LEVELS[0].timeLimit,
    );
  });
});

describe("midiOnString", () => {
  it("computes standard-tuning positions", () => {
    expect(midiOnString(6, 0)).toBe(parseNote("E2").midi);
    expect(midiOnString(6, 5)).toBe(parseNote("A2").midi); // 5th fret = next open
    expect(midiOnString(2, 1)).toBe(parseNote("C4").midi);
    expect(midiOnString(1, 12)).toBe(parseNote("E5").midi);
  });

  it("throws on an unknown string", () => {
    expect(() => midiOnString(7, 0)).toThrow();
  });
});

describe("questionCandidates", () => {
  it("keeps only naturals when naturalsOnly is set", () => {
    const naturals = new Set([0, 2, 4, 5, 7, 9, 11]);
    for (const q of questionCandidates(FRET_QUIZ_LEVELS[0])) {
      expect(naturals.has(mod12(q.midi))).toBe(true);
      expect([6, 5]).toContain(q.string);
      expect(q.fret).toBeGreaterThanOrEqual(0);
      expect(q.fret).toBeLessThanOrEqual(12);
    }
    // E string naturals in 12 frets: E F G A B C D E = 8 positions per string.
    expect(
      questionCandidates(FRET_QUIZ_LEVELS[0]).filter((q) => q.string === 6),
    ).toHaveLength(8);
  });

  it("includes all 13 frets per string on the chromatic level", () => {
    expect(questionCandidates(FRET_QUIZ_LEVELS[3])).toHaveLength(6 * 13);
  });
});

describe("nextQuestion", () => {
  it("never immediately repeats the same position", () => {
    const level = FRET_QUIZ_LEVELS[3];
    let prev = nextQuestion(level, null, () => 0);
    for (let i = 0; i < 50; i++) {
      const q = nextQuestion(level, prev);
      expect(q.string === prev.string && q.fret === prev.fret).toBe(false);
      prev = q;
    }
  });

  it("is deterministic for a fixed rng", () => {
    const q = nextQuestion(FRET_QUIZ_LEVELS[0], null, () => 0);
    expect(q).toEqual({ string: 6, fret: 0, midi: parseNote("E2").midi });
  });
});

describe("isCorrectAnswer", () => {
  it("matches by pitch class regardless of octave", () => {
    const q = { string: 6, fret: 3, midi: parseNote("G2").midi };
    expect(isCorrectAnswer(q, parseNote("G4").pitchClass)).toBe(true);
    expect(isCorrectAnswer(q, parseNote("G#4").pitchClass)).toBe(false);
  });
});
