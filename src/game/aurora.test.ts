import { describe, it, expect } from "vitest";
import { scalePitchClasses } from "../lib/theory";
import {
  AURORA_SCALES,
  buildRings,
  burstScaleForMidi,
  hueForDegree,
  isInKey,
  scaleDegreeOf,
  type AuroraKey,
} from "./aurora";

const A_MINOR_PENT: AuroraKey = { root: 9, scale: "minorPentatonic" };
const C_MAJOR: AuroraKey = { root: 0, scale: "major" };

describe("scaleDegreeOf / isInKey", () => {
  it("finds degrees of A minor pentatonic (A C D E G)", () => {
    expect(scaleDegreeOf(9, A_MINOR_PENT)).toBe(0); // A = tonic
    expect(scaleDegreeOf(0, A_MINOR_PENT)).toBe(1); // C
    expect(scaleDegreeOf(7, A_MINOR_PENT)).toBe(4); // G
  });

  it("flags out-of-key pitch classes with -1", () => {
    expect(scaleDegreeOf(10, A_MINOR_PENT)).toBe(-1); // Bb
    expect(isInKey(10, A_MINOR_PENT)).toBe(false);
    expect(isInKey(4, A_MINOR_PENT)).toBe(true); // E
  });

  it("accepts every degree of C major and rejects the rest", () => {
    const inKey = scalePitchClasses(0, "major");
    for (let pc = 0; pc < 12; pc++) {
      expect(isInKey(pc, C_MAJOR)).toBe(inKey.includes(pc));
    }
  });
});

describe("hueForDegree", () => {
  it("stays within 0–360 and gives distinct hues per degree", () => {
    const hues = Array.from({ length: 7 }, (_, i) => hueForDegree(i, 7));
    for (const h of hues) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
    expect(new Set(hues.map((h) => Math.round(h))).size).toBe(7);
  });
});

describe("buildRings", () => {
  it("builds one ring per scale degree for every offered scale", () => {
    for (const scale of AURORA_SCALES) {
      const rings = buildRings({ root: 4, scale });
      expect(rings).toHaveLength(scalePitchClasses(4, scale).length);
    }
  });

  it("puts the tonic innermost and speeds in an increasing integer ratio", () => {
    const rings = buildRings(A_MINOR_PENT);
    expect(rings[0].pitchClass).toBe(9);
    for (let i = 1; i < rings.length; i++) {
      expect(rings[i].radiusFrac).toBeGreaterThan(rings[i - 1].radiusFrac);
      expect(rings[i].speed).toBeGreaterThan(rings[i - 1].speed);
    }
    // Polyrhythm ratio: consecutive speeds differ by exactly one rev/min.
    const rpm = rings.map((r) => (r.speed * 60) / (2 * Math.PI));
    for (let i = 1; i < rpm.length; i++) {
      expect(rpm[i] - rpm[i - 1]).toBeCloseTo(1, 6);
    }
    expect(rings.every((r) => r.radiusFrac > 0 && r.radiusFrac <= 1)).toBe(
      true,
    );
  });
});

describe("burstScaleForMidi", () => {
  it("makes low notes big and high notes small, clamped at the edges", () => {
    expect(burstScaleForMidi(40)).toBeGreaterThan(burstScaleForMidi(64));
    expect(burstScaleForMidi(64)).toBeGreaterThan(burstScaleForMidi(88));
    expect(burstScaleForMidi(20)).toBe(burstScaleForMidi(40));
    expect(burstScaleForMidi(120)).toBe(burstScaleForMidi(88));
  });
});
