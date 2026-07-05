import { describe, it, expect } from "vitest";
import { mod12, parseNote } from "../lib/theory";
import {
  FRET_QUIZ_LEVELS,
  MASTERY_BOX,
  MAX_BOX,
  applyResult,
  cardId,
  isCorrectAnswer,
  levelMastery,
  midiOnString,
  nextQuestion,
  nextQuestionWeighted,
  questionCandidates,
  weightFor,
  type FretQuizMemory,
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

// ---------------------------------------------------------------------------
// Spaced-repetition memory
// ---------------------------------------------------------------------------

const Q = { string: 6, fret: 3, midi: parseNote("G2").midi };

describe("applyResult", () => {
  it("promotes one box per correct answer, capped at MAX_BOX", () => {
    let m: FretQuizMemory = {};
    for (let i = 1; i <= MAX_BOX + 2; i++) {
      m = applyResult(m, Q, true);
      expect(m[cardId(Q)].box).toBe(Math.min(MAX_BOX, i));
    }
    expect(m[cardId(Q)].attempts).toBe(MAX_BOX + 2);
    expect(m[cardId(Q)].correct).toBe(MAX_BOX + 2);
  });

  it("drops a card back to box 0 on a wrong answer", () => {
    let m: FretQuizMemory = {};
    m = applyResult(m, Q, true);
    m = applyResult(m, Q, true);
    m = applyResult(m, Q, false);
    expect(m[cardId(Q)]).toEqual({ box: 0, attempts: 3, correct: 2 });
  });

  it("does not mutate the previous memory object", () => {
    const before: FretQuizMemory = {};
    const after = applyResult(before, Q, true);
    expect(before).toEqual({});
    expect(after).not.toBe(before);
  });
});

describe("weightFor", () => {
  it("asks weak cards far more than mastered ones, new cards in between", () => {
    const weak = weightFor({ box: 0, attempts: 3, correct: 0 });
    const learning = weightFor({ box: 2, attempts: 3, correct: 2 });
    const mastered = weightFor({ box: MAX_BOX, attempts: 9, correct: 9 });
    const unseen = weightFor(undefined);
    expect(weak).toBeGreaterThan(learning);
    expect(learning).toBeGreaterThan(mastered);
    expect(unseen).toBeGreaterThan(mastered);
    expect(unseen).toBeLessThan(weak);
    expect(weak / mastered).toBeGreaterThanOrEqual(16);
  });
});

describe("nextQuestionWeighted", () => {
  const level = FRET_QUIZ_LEVELS[0];

  it("still never repeats the previous position", () => {
    let prev = nextQuestionWeighted(level, {}, null);
    for (let i = 0; i < 40; i++) {
      const q = nextQuestionWeighted(level, {}, prev);
      expect(q.string === prev.string && q.fret === prev.fret).toBe(false);
      prev = q;
    }
  });

  it("drills a missed position much more often than mastered ones", () => {
    // Everything mastered except one weak card.
    const pool = questionCandidates(level);
    const weak = pool[3];
    const memory: FretQuizMemory = {};
    for (const q of pool) {
      memory[cardId(q)] = {
        box: cardId(q) === cardId(weak) ? 0 : MAX_BOX,
        attempts: 5,
        correct: cardId(q) === cardId(weak) ? 0 : 5,
      };
    }
    let weakHits = 0;
    const draws = 800;
    for (let i = 0; i < draws; i++) {
      const q = nextQuestionWeighted(level, memory, null);
      if (cardId(q) === cardId(weak)) weakHits++;
    }
    // Expected ~52% (8 / (8 + 15×0.5)); uniform would be ~6%. Wide margin.
    expect(weakHits / draws).toBeGreaterThan(0.3);
  });

  it("damps positions asked in the last few questions", () => {
    const pool = questionCandidates(level);
    const weak = pool[3];
    const memory: FretQuizMemory = {};
    for (const q of pool) {
      memory[cardId(q)] = {
        box: cardId(q) === cardId(weak) ? 0 : MAX_BOX,
        attempts: 5,
        correct: 5,
      };
    }
    let weakHits = 0;
    const draws = 800;
    for (let i = 0; i < draws; i++) {
      const q = nextQuestionWeighted(level, memory, null, [cardId(weak)]);
      if (cardId(q) === cardId(weak)) weakHits++;
    }
    // Damped weight 1.6 vs 7.5 for the rest → ~18%; must be well under the
    // undamped ~52%.
    expect(weakHits / draws).toBeLessThan(0.35);
  });
});

describe("levelMastery", () => {
  it("counts positions at or above the mastery box", () => {
    const level = FRET_QUIZ_LEVELS[0];
    const pool = questionCandidates(level);
    const memory: FretQuizMemory = {
      [cardId(pool[0])]: { box: MASTERY_BOX, attempts: 3, correct: 3 },
      [cardId(pool[1])]: { box: MASTERY_BOX - 1, attempts: 3, correct: 2 },
    };
    expect(levelMastery(level, memory)).toEqual({
      solid: 1,
      total: pool.length,
    });
  });
});
