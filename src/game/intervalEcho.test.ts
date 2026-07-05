import { describe, it, expect } from "vitest";
import { parseNote } from "../lib/theory";
import {
  INTERVAL_ECHO_LEVELS,
  ROOT_MAX_MIDI,
  ROOT_MIN_MIDI,
  guessedInterval,
  isCorrectGuess,
  nextTarget,
  targetIntervalName,
  targetNote,
} from "./intervalEcho";

describe("intervalEcho levels", () => {
  it("defines four levels of increasing difficulty", () => {
    expect(INTERVAL_ECHO_LEVELS).toHaveLength(4);
    expect(INTERVAL_ECHO_LEVELS[3].pool).toHaveLength(11);
    expect(INTERVAL_ECHO_LEVELS[3].timeLimit).toBeLessThan(
      INTERVAL_ECHO_LEVELS[0].timeLimit,
    );
  });

  it("only uses intervals between a minor 2nd and a major 7th", () => {
    for (const level of INTERVAL_ECHO_LEVELS) {
      for (const s of level.pool) {
        expect(s).toBeGreaterThanOrEqual(1);
        expect(s).toBeLessThanOrEqual(11);
      }
    }
  });
});

describe("nextTarget", () => {
  it("draws intervals from the level pool and roots from the playable range", () => {
    const level = INTERVAL_ECHO_LEVELS[0];
    for (let i = 0; i < 50; i++) {
      const t = nextTarget(level, null);
      expect(level.pool).toContain(t.semitones);
      expect(t.root.midi).toBeGreaterThanOrEqual(ROOT_MIN_MIDI);
      expect(t.root.midi).toBeLessThanOrEqual(ROOT_MAX_MIDI);
    }
  });

  it("does not repeat the previous interval", () => {
    const level = INTERVAL_ECHO_LEVELS[1];
    let prev = nextTarget(level, null, () => 0);
    for (let i = 0; i < 30; i++) {
      const t = nextTarget(level, prev);
      expect(t.semitones).not.toBe(prev.semitones);
      prev = t;
    }
  });

  it("is deterministic for a fixed rng", () => {
    const level = INTERVAL_ECHO_LEVELS[3];
    const t = nextTarget(level, null, () => 0);
    expect(t.semitones).toBe(level.pool[0]);
    expect(t.root.midi).toBe(ROOT_MIN_MIDI);
  });
});

describe("targetNote / targetIntervalName", () => {
  it("lands the target a named interval above the root", () => {
    const target = { root: parseNote("A2"), semitones: 7 };
    const note = targetNote(target);
    expect(note.midi).toBe(parseNote("E3").midi);
    expect(targetIntervalName(target).long).toBe("Perfect 5th");
  });
});

describe("isCorrectGuess", () => {
  const target = { root: parseNote("A2"), semitones: 7 }; // P5 above A2 = E
  const r = (name: string, cents = 0) => ({
    midi: parseNote(name).midi,
    cents,
  });

  it("accepts the exact target note", () => {
    expect(isCorrectGuess(target, r("E3"))).toBe(true);
  });

  it("accepts the right pitch class in any octave, even below the root", () => {
    expect(isCorrectGuess(target, r("E4"))).toBe(true);
    expect(isCorrectGuess(target, r("E2"))).toBe(true);
  });

  it("rejects wrong notes and the root itself", () => {
    expect(isCorrectGuess(target, r("D3"))).toBe(false);
    expect(isCorrectGuess(target, r("A2"))).toBe(false);
    expect(isCorrectGuess(target, r("A3"))).toBe(false);
  });

  it("forgives detuned strings within a widened tolerance", () => {
    // 35 cents sharp of D#3 = 65 cents from E3.
    expect(isCorrectGuess(target, r("D#3", 35))).toBe(false);
    expect(isCorrectGuess(target, r("D#3", 35), 80)).toBe(true);
  });
});

describe("guessedInterval", () => {
  it("reduces the guess to an interval above the root within an octave", () => {
    const target = { root: parseNote("C3"), semitones: 4 };
    expect(guessedInterval(target, parseNote("C3").midi)).toBe(0);
    expect(guessedInterval(target, parseNote("E3").midi)).toBe(4);
    expect(guessedInterval(target, parseNote("G4").midi)).toBe(7);
    expect(guessedInterval(target, parseNote("B2").midi)).toBe(11);
  });
});
