import { describe, it, expect } from "vitest";
import { recordAnswer, type SrsMemory } from "../lib/srs";
import { parseNote } from "../lib/theory";
import {
  FINDER_ZONES,
  buildQuestion,
  finderCardId,
  judgeFinderNote,
  nextFinderQuestion,
  positionsInZone,
  zonePitchClasses,
} from "./fretFinder";

const zone = (id: string) => {
  const z = FINDER_ZONES.find((z) => z.id === id);
  if (!z) throw new Error(`no zone ${id}`);
  return z;
};

describe("zones", () => {
  it("offers each string, the three pairs, and the whole neck", () => {
    expect(FINDER_ZONES).toHaveLength(10);
    expect(FINDER_ZONES.filter((z) => z.strings.length === 1)).toHaveLength(6);
    expect(zone("all").strings).toHaveLength(6);
  });
});

describe("positionsInZone", () => {
  it("finds one octave per pitch class on a single string (two for the open class)", () => {
    const d = zone("s4"); // D string: D3..D4
    expect(positionsInZone(d, parseNote("G").pitchClass)).toEqual([
      { string: 4, fret: 5, midi: parseNote("G3").midi },
    ]);
    // The open-string class exists at fret 0 and fret 12.
    const dPositions = positionsInZone(d, parseNote("D").pitchClass);
    expect(dPositions.map((p) => p.fret)).toEqual([0, 12]);
  });

  it("finds duplicated pitches across a string pair", () => {
    // A2 = low E fret 5 = A string open.
    const p = positionsInZone(zone("p65"), parseNote("A").pitchClass);
    expect(p.map((x) => `${x.string}:${x.fret}`)).toContain("6:5");
    expect(p.map((x) => `${x.string}:${x.fret}`)).toContain("5:0");
  });
});

describe("buildQuestion / judgeFinderNote", () => {
  const r = (name: string, cents = 0) => ({
    midi: parseNote(name).midi,
    cents,
  });

  it("accepts only the zone's octave of the pitch class", () => {
    const q = buildQuestion(zone("s4"), parseNote("G").pitchClass);
    expect(judgeFinderNote(q, r("G3"))).toBe("hit");
    // The "easy G" on the high E string is G4 — right name, wrong zone.
    expect(judgeFinderNote(q, r("G4"))).toBe("wrongOctave");
    expect(judgeFinderNote(q, r("G2"))).toBe("wrongOctave");
    expect(judgeFinderNote(q, r("A3"))).toBe("wrong");
  });

  it("accepts every valid spot in a pair zone", () => {
    const q = buildQuestion(zone("p65"), parseNote("A").pitchClass);
    expect(judgeFinderNote(q, r("A2"))).toBe("hit"); // fret 5 / open
    expect(judgeFinderNote(q, r("A3"))).toBe("hit"); // A string fret 12
  });

  it("forgives poor intonation within a widened tolerance", () => {
    const q = buildQuestion(zone("s4"), parseNote("G").pitchClass);
    const sharpG = r("G3", 55); // intonation drifting sharp up the neck
    expect(judgeFinderNote(q, sharpG)).toBe("wrong"); // default ±50
    expect(judgeFinderNote(q, sharpG, 80)).toBe("hit");
  });
});

describe("zonePitchClasses", () => {
  it("filters to naturals when asked", () => {
    expect(zonePitchClasses(true)).toHaveLength(7);
    expect(zonePitchClasses(false)).toHaveLength(12);
  });
});

describe("nextFinderQuestion", () => {
  const z = zone("s4");

  it("never repeats the previous pitch class and always has positions", () => {
    let prev = nextFinderQuestion(z, true, {}, null);
    for (let i = 0; i < 40; i++) {
      const q = nextFinderQuestion(z, true, {}, prev.pc);
      expect(q.pc).not.toBe(prev.pc);
      expect(q.positions.length).toBeGreaterThan(0);
      expect(q.validMidis.length).toBeGreaterThan(0);
      prev = q;
    }
  });

  it("drills a missed note in the zone far more than mastered ones", () => {
    let memory: SrsMemory = {};
    const weakPc = parseNote("F").pitchClass;
    for (const pc of zonePitchClasses(true)) {
      const id = finderCardId(z.id, pc);
      for (let i = 0; i < 5; i++) {
        memory = recordAnswer(memory, id, pc !== weakPc);
      }
    }
    let weakHits = 0;
    const draws = 600;
    for (let i = 0; i < draws; i++) {
      if (nextFinderQuestion(z, true, memory, null).pc === weakPc) weakHits++;
    }
    // Weight 8 vs 6 × 0.5 → ~73%; uniform would be ~14%. Wide margin.
    expect(weakHits / draws).toBeGreaterThan(0.4);
  });

  it("keys cards per zone so memory in one zone doesn't bleed into another", () => {
    expect(finderCardId("s4", 7)).not.toBe(finderCardId("s5", 7));
  });
});
