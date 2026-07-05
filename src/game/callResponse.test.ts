import { describe, it, expect } from "vitest";
import { mod12, parseNote } from "../lib/theory";
import {
  CALL_RESPONSE_LEVELS,
  PHRASE_MAX_MIDI,
  PHRASE_MIN_MIDI,
  generatePhrase,
  matchesAt,
  playbackDurationS,
} from "./callResponse";

describe("callResponse levels", () => {
  it("defines four levels of growing phrase length", () => {
    expect(CALL_RESPONSE_LEVELS).toHaveLength(4);
    expect(CALL_RESPONSE_LEVELS[0].phraseLen).toBe(2);
    expect(CALL_RESPONSE_LEVELS[3].phraseLen).toBeGreaterThanOrEqual(
      CALL_RESPONSE_LEVELS[0].phraseLen,
    );
  });

  it("never uses a zero or octave step (repeats would be undetectable)", () => {
    for (const level of CALL_RESPONSE_LEVELS) {
      for (const s of level.steps) {
        expect(s).toBeGreaterThanOrEqual(1);
        expect(s).toBeLessThanOrEqual(11);
      }
    }
  });
});

describe("generatePhrase", () => {
  it("produces the right length within the playable range", () => {
    for (const level of CALL_RESPONSE_LEVELS) {
      for (let run = 0; run < 40; run++) {
        const phrase = generatePhrase(level);
        expect(phrase).toHaveLength(level.phraseLen);
        for (const m of phrase) {
          expect(m).toBeGreaterThanOrEqual(PHRASE_MIN_MIDI);
          expect(m).toBeLessThanOrEqual(PHRASE_MAX_MIDI);
        }
      }
    }
  });

  it("moves by a pool step between consecutive notes, never repeating a pitch", () => {
    const level = CALL_RESPONSE_LEVELS[3];
    for (let run = 0; run < 40; run++) {
      const phrase = generatePhrase(level);
      for (let i = 1; i < phrase.length; i++) {
        const step = Math.abs(phrase[i] - phrase[i - 1]);
        expect(level.steps).toContain(step);
        expect(mod12(phrase[i])).not.toBe(mod12(phrase[i - 1]));
      }
    }
  });

  it("is deterministic for a fixed rng", () => {
    const level = CALL_RESPONSE_LEVELS[0];
    const phrase = generatePhrase(level, () => 0);
    // rng()=0 → root 50 (D3), step 1 downward.
    expect(phrase).toEqual([50, 49]);
  });

  it("reflects steps that would leave the range", () => {
    const level = CALL_RESPONSE_LEVELS[3];
    // Force root to the top of the root range, then big upward steps: the
    // walk must still stay inside the phrase range.
    let calls = 0;
    const rng = () => {
      calls++;
      if (calls === 1) return 0.999; // root = 69 (A4)
      return 0.999; // biggest step, upward
    };
    const phrase = generatePhrase(level, rng);
    for (const m of phrase) {
      expect(m).toBeLessThanOrEqual(PHRASE_MAX_MIDI);
      expect(m).toBeGreaterThanOrEqual(PHRASE_MIN_MIDI);
    }
  });
});

describe("matchesAt", () => {
  const phrase = ["G3", "B3", "D4"].map((s) => parseNote(s).midi);
  const r = (name: string, cents = 0) => ({
    midi: parseNote(name).midi,
    cents,
  });

  it("matches the indexed note by pitch class in any octave", () => {
    expect(matchesAt(phrase, 0, r("G3"))).toBe(true);
    expect(matchesAt(phrase, 0, r("G5"))).toBe(true);
    expect(matchesAt(phrase, 1, r("B2"))).toBe(true);
  });

  it("rejects wrong pitches and out-of-range indices", () => {
    expect(matchesAt(phrase, 0, r("A3"))).toBe(false);
    expect(matchesAt(phrase, 3, r("G3"))).toBe(false);
  });

  it("forgives out-of-tune notes within a widened tolerance", () => {
    expect(matchesAt(phrase, 0, r("F#3", 40))).toBe(false); // 60c from G
    expect(matchesAt(phrase, 0, r("F#3", 40), 75)).toBe(true);
  });
});

describe("playbackDurationS", () => {
  it("grows with phrase length and covers the last note", () => {
    expect(playbackDurationS(4)).toBeGreaterThan(playbackDurationS(2));
    expect(playbackDurationS(1)).toBeGreaterThan(0);
  });
});
