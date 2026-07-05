/**
 * fretFinder.ts — pure logic for the Fret Finder game mode: the mic-driven
 * counterpart of Fret Quiz. A note name is prompted within a chosen neck
 * zone (one string, a string pair, or the whole neck) and the player must
 * play it there.
 *
 * The mic can't tell which fret produced a pitch, but it CAN tell the
 * octave — and that's the enforcement trick. "G on the D string" is G3;
 * playing the easy G4 up on the high E string is rejected as a wrong
 * octave. Within a single string, each pitch class exists at exactly one
 * octave (the open-string class at two — both on that string, both
 * accepted), so the zone constraint is real, not honor system.
 *
 * Drilling uses the shared Leitner core (lib/srs.ts) with one card per
 * (zone, pitch class): the skill being trained is "find this note in this
 * zone", so misses in a zone make that note come back more there.
 */

import { STANDARD_TUNING } from "../lib/guitar";
import { pickWeighted, type SrsMemory } from "../lib/srs";
import { mod12, parseNote, type PitchClass } from "../lib/theory";

/** Pitch classes of the seven natural notes. */
const NATURALS: PitchClass[] = [0, 2, 4, 5, 7, 9, 11];
const ALL_PCS: PitchClass[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export const FINDER_MAX_FRET = 12;

export interface FinderZone {
  id: string;
  name: string;
  /** String numbers (1 = high E … 6 = low E) in the zone. */
  strings: number[];
}

export const FINDER_ZONES: FinderZone[] = [
  { id: "s6", name: "Low E string", strings: [6] },
  { id: "s5", name: "A string", strings: [5] },
  { id: "s4", name: "D string", strings: [4] },
  { id: "s3", name: "G string", strings: [3] },
  { id: "s2", name: "B string", strings: [2] },
  { id: "s1", name: "High E string", strings: [1] },
  { id: "p65", name: "Low E + A", strings: [6, 5] },
  { id: "p43", name: "D + G", strings: [4, 3] },
  { id: "p21", name: "B + High E", strings: [2, 1] },
  { id: "all", name: "Whole neck", strings: [6, 5, 4, 3, 2, 1] },
];

const OPEN_MIDI_BY_STRING = new Map(
  STANDARD_TUNING.map((s) => [s.number, parseNote(s.openNote).midi]),
);

export interface FinderPosition {
  string: number;
  fret: number;
  midi: number;
}

/** Every place a pitch class lives inside a zone (frets 0–12). */
export function positionsInZone(
  zone: FinderZone,
  pc: PitchClass,
): FinderPosition[] {
  const out: FinderPosition[] = [];
  for (const s of zone.strings) {
    const open = OPEN_MIDI_BY_STRING.get(s);
    if (open === undefined) continue;
    for (let f = 0; f <= FINDER_MAX_FRET; f++) {
      if (mod12(open + f) === mod12(pc)) out.push({ string: s, fret: f, midi: open + f });
    }
  }
  return out;
}

/** The pitch classes a zone can ask about. */
export function zonePitchClasses(naturalsOnly: boolean): PitchClass[] {
  return naturalsOnly ? NATURALS : ALL_PCS;
}

export interface FinderQuestion {
  pc: PitchClass;
  /** All in-zone positions of the pitch class. */
  positions: FinderPosition[];
  /** The exact MIDI notes accepted as answers. */
  validMidis: number[];
}

/** SRS card identity: one card per (zone, pitch class). */
export function finderCardId(zoneId: string, pc: PitchClass): string {
  return `${zoneId}:pc${mod12(pc)}`;
}

/** Build the question for a pitch class in a zone. */
export function buildQuestion(zone: FinderZone, pc: PitchClass): FinderQuestion {
  const positions = positionsInZone(zone, pc);
  return {
    pc: mod12(pc),
    positions,
    validMidis: [...new Set(positions.map((p) => p.midi))],
  };
}

/**
 * Pick the next note to find, weighted by the zone's spaced-repetition
 * memory (see lib/srs.ts) and never repeating the previous pitch class.
 */
export function nextFinderQuestion(
  zone: FinderZone,
  naturalsOnly: boolean,
  memory: SrsMemory,
  previousPc: PitchClass | null,
  recentIds: readonly string[] = [],
  rng: () => number = Math.random,
): FinderQuestion {
  const pc = pickWeighted(
    zonePitchClasses(naturalsOnly),
    (p) => finderCardId(zone.id, p),
    memory,
    previousPc === null ? null : finderCardId(zone.id, previousPc),
    recentIds,
    rng,
  );
  return buildQuestion(zone, pc);
}

export type FinderJudgement = "hit" | "wrongOctave" | "wrong";

/**
 * Judge a detected note against the question. The octave check is what
 * enforces the zone: the right pitch class at a MIDI note the zone can't
 * produce means the player found the note somewhere else on the neck.
 */
export function judgeFinderNote(
  question: FinderQuestion,
  midi: number,
): FinderJudgement {
  if (question.validMidis.includes(midi)) return "hit";
  if (mod12(midi) === question.pc) return "wrongOctave";
  return "wrong";
}
