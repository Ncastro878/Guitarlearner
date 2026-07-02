/**
 * guitar.ts — constants describing a standard-tuned 6-string guitar and the
 * pitch range the detector should trust.
 */

import { parseNote, type Note } from "./theory";

export interface GuitarString {
  /** 1 = high E (thinnest), 6 = low E (thickest). */
  number: number;
  /** Open-string note in scientific pitch notation. */
  openNote: string;
  /** Friendly label, e.g. "Low E", "A", "D". */
  label: string;
}

/**
 * Standard tuning, ordered from thickest (low E, string 6) to thinnest
 * (high E, string 1).
 */
export const STANDARD_TUNING: GuitarString[] = [
  { number: 6, openNote: "E2", label: "Low E" },
  { number: 5, openNote: "A2", label: "A" },
  { number: 4, openNote: "D3", label: "D" },
  { number: 3, openNote: "G3", label: "G" },
  { number: 2, openNote: "B3", label: "B" },
  { number: 1, openNote: "E4", label: "High E" },
];

/** Open-string notes as parsed {@link Note}s. */
export const OPEN_STRING_NOTES: Note[] = STANDARD_TUNING.map((s) =>
  parseNote(s.openNote),
);

/**
 * Trusted detection range. Low E on a guitar is ~82.4 Hz; we allow a little
 * headroom below (down-tuning / detuned strings) and extend well above the
 * highest fretted notes so the tuner stays useful across the whole neck.
 */
export const MIN_GUITAR_FREQUENCY = 70; // a hair below E2 (82.4 Hz)
export const MAX_GUITAR_FREQUENCY = 1400; // ~F6, above the 24th-fret high E

/** Lowest / highest MIDI notes we consider "on a guitar". */
export const MIN_GUITAR_MIDI = parseNote("E2").midi; // 40
export const MAX_GUITAR_MIDI = parseNote("E6").midi; // 88
