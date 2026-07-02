import { describe, it, expect } from "vitest";
import {
  NOTE_HUNT_LEVELS,
  nextTarget,
  isCorrectGuess,
  NATURAL_PITCH_CLASSES,
} from "./noteHunt";

describe("noteHunt levels", () => {
  it("defines four levels of increasing difficulty", () => {
    expect(NOTE_HUNT_LEVELS).toHaveLength(4);
    expect(NOTE_HUNT_LEVELS[0].pool).toEqual(NATURAL_PITCH_CLASSES);
    expect(NOTE_HUNT_LEVELS[3].timeLimit).toBeLessThan(
      NOTE_HUNT_LEVELS[0].timeLimit,
    );
    expect(NOTE_HUNT_LEVELS[2].stringSpecific).toBe(true);
  });
});

describe("nextTarget", () => {
  it("draws from the level pool", () => {
    const level = NOTE_HUNT_LEVELS[0];
    for (let i = 0; i < 50; i++) {
      const t = nextTarget(level, null);
      expect(level.pool).toContain(t.pitchClass);
    }
  });

  it("does not repeat the previous pitch class", () => {
    const level = NOTE_HUNT_LEVELS[1];
    let prev = nextTarget(level, null, () => 0);
    for (let i = 0; i < 30; i++) {
      const t = nextTarget(level, prev);
      expect(t.pitchClass).not.toBe(prev.pitchClass);
      prev = t;
    }
  });

  it("assigns a string only for string-specific levels", () => {
    const plain = nextTarget(NOTE_HUNT_LEVELS[0], null);
    expect(plain.stringNumber).toBeNull();
    expect(plain.stringLabel).toBeNull();

    const specific = nextTarget(NOTE_HUNT_LEVELS[2], null);
    expect(specific.stringNumber).toBeGreaterThanOrEqual(1);
    expect(specific.stringNumber).toBeLessThanOrEqual(6);
    expect(typeof specific.stringLabel).toBe("string");
  });
});

describe("isCorrectGuess", () => {
  it("matches by pitch class, ignoring octave", () => {
    const target = { pitchClass: 1, stringNumber: null, stringLabel: null };
    expect(isCorrectGuess(target, 1)).toBe(true);
    expect(isCorrectGuess(target, 2)).toBe(false);
  });
});
