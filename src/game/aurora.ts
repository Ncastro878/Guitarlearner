/**
 * aurora.ts — pure logic for the Aurora free-play visualizer: key/degree
 * math, per-degree colour mapping, and the polyrhythmic orbit-ring specs the
 * canvas engine renders. No React, no DOM, so it stays testable.
 *
 * The visual language: one orbit ring per scale degree, each ring's comet
 * revolving at a different integer number of revolutions per minute
 * (3, 4, 5, … — the classic polyrhythm-visualizer ratio). Playing an in-key
 * note fires a burst from that degree's ring; out-of-key notes disturb the
 * whole scene instead.
 */

import {
  SCALE_FORMULAS,
  mod12,
  scalePitchClasses,
  type PitchClass,
  type ScaleName,
} from "../lib/theory";

/** Scales offered in the key picker (all of theory.ts's scales). */
export const AURORA_SCALES: ScaleName[] = [
  "major",
  "naturalMinor",
  "harmonicMinor",
  "majorPentatonic",
  "minorPentatonic",
];

export interface AuroraKey {
  root: PitchClass;
  scale: ScaleName;
}

/** Human label for a key, e.g. "A Minor Pentatonic". */
export function keyLabel(key: AuroraKey, rootName: string): string {
  return `${rootName} ${SCALE_FORMULAS[key.scale].label}`;
}

/**
 * 0-based scale degree of a pitch class within a key, or -1 when the pitch
 * class is not in the key (the "dissonant" case).
 */
export function scaleDegreeOf(pc: PitchClass, key: AuroraKey): number {
  return scalePitchClasses(key.root, key.scale).indexOf(mod12(pc));
}

/** Whether a pitch class belongs to the key. */
export function isInKey(pc: PitchClass, key: AuroraKey): boolean {
  return scaleDegreeOf(pc, key) !== -1;
}

/**
 * Hue (degrees, 0–360) for a scale degree. Degrees sweep ~320° of the colour
 * wheel starting from teal, so the tonic is cool and calm and the palette
 * stays harmonious rather than a full clashing rainbow.
 */
export function hueForDegree(degree: number, degreeCount: number): number {
  const span = 320;
  const start = 200;
  return (start + (degree * span) / Math.max(1, degreeCount)) % 360;
}

export interface OrbitRing {
  /** 0-based scale degree this ring represents. */
  degree: number;
  /** Pitch class of the degree (for labels). */
  pitchClass: PitchClass;
  /** Ring radius as a fraction of the scene radius, (0, 1]. */
  radiusFrac: number;
  /** Angular velocity in radians per second. */
  speed: number;
  /** Base hue for the ring and its bursts. */
  hue: number;
}

/** Innermost / outermost ring radii as fractions of the scene radius. */
const RING_MIN_FRAC = 0.3;
const RING_MAX_FRAC = 0.92;
/** The innermost ring's revolutions per minute; ring k does BASE_RPM + k. */
const BASE_RPM = 3;

/**
 * Build the orbit-ring system for a key: one ring per scale degree, tonic
 * innermost, radii spread evenly, speeds in the integer ratio
 * (3 : 4 : 5 : …) revolutions per minute so the comets drift in and out of
 * alignment the way polyrhythm visualizers do.
 */
export function buildRings(key: AuroraKey): OrbitRing[] {
  const pcs = scalePitchClasses(key.root, key.scale);
  const n = pcs.length;
  return pcs.map((pc, i) => ({
    degree: i,
    pitchClass: pc,
    radiusFrac:
      n === 1
        ? RING_MAX_FRAC
        : RING_MIN_FRAC + ((RING_MAX_FRAC - RING_MIN_FRAC) * i) / (n - 1),
    speed: ((BASE_RPM + i) * 2 * Math.PI) / 60,
    hue: hueForDegree(i, n),
  }));
}

/** MIDI range used to scale burst size (low notes = big, high = fine). */
const BURST_MIDI_LOW = 40; // E2
const BURST_MIDI_HIGH = 88; // E6

/**
 * Visual weight of a note by pitch: low notes get large, slow bursts
 * (~1.35×), high notes tight sparkly ones (~0.65×). Clamped outside the
 * guitar range.
 */
export function burstScaleForMidi(midi: number): number {
  const t = Math.min(
    1,
    Math.max(0, (midi - BURST_MIDI_LOW) / (BURST_MIDI_HIGH - BURST_MIDI_LOW)),
  );
  return 1.35 - 0.7 * t;
}
