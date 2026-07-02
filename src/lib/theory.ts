/**
 * theory.ts — a small, pure, dependency-free music-theory library.
 *
 * Everything here is framework-agnostic and side-effect free so it can be
 * unit-tested in isolation and reused across game modes. No DOM, no React,
 * no Web Audio.
 *
 * Conventions
 * -----------
 * - Pitch classes are integers 0–11 where 0 = C, 1 = C#, … 11 = B.
 * - MIDI note numbers follow the standard: C-1 = 0, so A4 = 69.
 * - Concert pitch A4 defaults to 440 Hz but is configurable everywhere it
 *   matters (players may retune, and some game settings expose it).
 */

/** Canonical (sharp) note names, indexed by pitch class 0–11. */
export const NOTE_NAMES_SHARP = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

/** Flat spellings, indexed by pitch class 0–11 (used for display only). */
export const NOTE_NAMES_FLAT = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

export type PitchClass = number; // 0–11

export interface Note {
  /** Pitch class 0–11 (0 = C). */
  pitchClass: PitchClass;
  /** Octave in scientific pitch notation (A4 = octave 4). */
  octave: number;
  /** Standard MIDI note number (A4 = 69). */
  midi: number;
}

/** Default concert pitch for A4, in Hz. */
export const DEFAULT_A4 = 440;

/**
 * Letter → semitone offset from C, used when parsing note strings.
 */
const LETTER_TO_PC: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** Normalise any integer into the 0–11 pitch-class range. */
export function mod12(n: number): PitchClass {
  return ((n % 12) + 12) % 12;
}

// ---------------------------------------------------------------------------
// Note ↔ MIDI ↔ frequency
// ---------------------------------------------------------------------------

/** Build a MIDI note number from a pitch class and octave. */
export function midiFromParts(pitchClass: PitchClass, octave: number): number {
  return (octave + 1) * 12 + mod12(pitchClass);
}

/** Decompose a MIDI note number into a {@link Note}. */
export function noteFromMidi(midi: number): Note {
  const rounded = Math.round(midi);
  return {
    midi: rounded,
    pitchClass: mod12(rounded),
    octave: Math.floor(rounded / 12) - 1,
  };
}

/**
 * Parse a note string such as "C#4", "Bb2", "A4" or (octave-less) "F#".
 * When no octave is supplied, octave 4 is assumed.
 *
 * @throws if the string is not a recognisable note name.
 */
export function parseNote(input: string): Note {
  const match = input.trim().match(/^([A-Ga-g])([#b♯♭x]*)(-?\d+)?$/);
  if (!match) throw new Error(`Unrecognised note: "${input}"`);

  const letter = match[1].toUpperCase();
  const accidentals = match[2];
  const octave = match[3] === undefined ? 4 : parseInt(match[3], 10);

  let pc = LETTER_TO_PC[letter];
  for (const ch of accidentals) {
    if (ch === "#" || ch === "♯") pc += 1;
    else if (ch === "b" || ch === "♭") pc -= 1;
    else if (ch === "x") pc += 2; // double sharp
  }

  return {
    pitchClass: mod12(pc),
    octave,
    midi: midiFromParts(pc, octave),
  };
}

/** Convert a MIDI note number to a frequency in Hz. */
export function midiToFrequency(midi: number, a4 = DEFAULT_A4): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/** Convert a frequency in Hz to a (fractional) MIDI note number. */
export function frequencyToMidi(frequency: number, a4 = DEFAULT_A4): number {
  return 69 + 12 * Math.log2(frequency / a4);
}

/** Convenience: frequency of a parsed note string, e.g. `noteFrequency("E2")`. */
export function noteFrequency(input: string, a4 = DEFAULT_A4): number {
  return midiToFrequency(parseNote(input).midi, a4);
}

export interface DetectedNote extends Note {
  /**
   * Signed offset from the nearest equal-tempered note, in cents.
   * Range roughly (-50, +50]. Positive = sharp, negative = flat.
   */
  cents: number;
}

/**
 * Given a raw detected frequency, find the nearest note and how far off (in
 * cents) the frequency is from that note's ideal pitch.
 */
export function frequencyToNote(
  frequency: number,
  a4 = DEFAULT_A4,
): DetectedNote {
  const fractionalMidi = frequencyToMidi(frequency, a4);
  const midi = Math.round(fractionalMidi);
  const cents = Math.round((fractionalMidi - midi) * 100);
  return {
    midi,
    pitchClass: mod12(midi),
    octave: Math.floor(midi / 12) - 1,
    cents,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Human-readable pitch-class name (defaults to sharp spelling). */
export function pitchClassName(pc: PitchClass, useFlats = false): string {
  return (useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[mod12(pc)];
}

/** Format a note with its octave, e.g. "C#4". */
export function formatNote(note: Note, useFlats = false): string {
  return `${pitchClassName(note.pitchClass, useFlats)}${note.octave}`;
}

// ---------------------------------------------------------------------------
// Intervals
// ---------------------------------------------------------------------------

export interface IntervalName {
  short: string;
  long: string;
}

/** Interval names indexed by semitone distance 0–12. */
export const INTERVALS: readonly IntervalName[] = [
  { short: "P1", long: "Unison" },
  { short: "m2", long: "Minor 2nd" },
  { short: "M2", long: "Major 2nd" },
  { short: "m3", long: "Minor 3rd" },
  { short: "M3", long: "Major 3rd" },
  { short: "P4", long: "Perfect 4th" },
  { short: "TT", long: "Tritone" },
  { short: "P5", long: "Perfect 5th" },
  { short: "m6", long: "Minor 6th" },
  { short: "M6", long: "Major 6th" },
  { short: "m7", long: "Minor 7th" },
  { short: "M7", long: "Major 7th" },
  { short: "P8", long: "Octave" },
];

/** Semitone distance between two MIDI notes (absolute). */
export function semitoneDistance(a: number, b: number): number {
  return Math.abs(a - b);
}

/**
 * Name an interval given its size in semitones. Sizes larger than an octave
 * are reduced to their simple form (compound intervals collapse to 0–12),
 * except a pure multiple of 12 which is reported as an octave.
 */
export function intervalName(semitones: number): IntervalName {
  const s = Math.abs(Math.round(semitones));
  if (s === 0) return INTERVALS[0];
  const reduced = s % 12 === 0 ? 12 : s % 12;
  return INTERVALS[reduced];
}

/**
 * Reverse lookup: number of semitones for an interval name (short or long,
 * case-insensitive). Returns `undefined` if not recognised.
 */
export function intervalSemitones(name: string): number | undefined {
  const needle = name.trim().toLowerCase();
  const idx = INTERVALS.findIndex(
    (i) => i.short.toLowerCase() === needle || i.long.toLowerCase() === needle,
  );
  return idx === -1 ? undefined : idx;
}

/** Transpose a note by a number of semitones (can be negative). */
export function transpose(note: Note, semitones: number): Note {
  return noteFromMidi(note.midi + semitones);
}

// ---------------------------------------------------------------------------
// Chords
// ---------------------------------------------------------------------------

export type ChordQuality =
  | "maj"
  | "min"
  | "dom7"
  | "maj7"
  | "m7"
  | "dim"
  | "aug";

interface ChordSpec {
  /** Semitone offsets from the root. */
  intervals: number[];
  /** Suffix appended to the root when rendering a chord symbol. */
  symbol: string;
  /** Human label. */
  label: string;
}

export const CHORD_FORMULAS: Record<ChordQuality, ChordSpec> = {
  maj: { intervals: [0, 4, 7], symbol: "", label: "Major" },
  min: { intervals: [0, 3, 7], symbol: "m", label: "Minor" },
  dom7: { intervals: [0, 4, 7, 10], symbol: "7", label: "Dominant 7th" },
  maj7: { intervals: [0, 4, 7, 11], symbol: "maj7", label: "Major 7th" },
  m7: { intervals: [0, 3, 7, 10], symbol: "m7", label: "Minor 7th" },
  dim: { intervals: [0, 3, 6], symbol: "dim", label: "Diminished" },
  aug: { intervals: [0, 4, 8], symbol: "aug", label: "Augmented" },
};

/**
 * Spell a chord as an ordered list of pitch classes (root first).
 */
export function chordPitchClasses(
  root: PitchClass,
  quality: ChordQuality,
): PitchClass[] {
  return CHORD_FORMULAS[quality].intervals.map((i) => mod12(root + i));
}

/** Render a chord symbol, e.g. `chordSymbol(2, "m7") === "Dm7"`. */
export function chordSymbol(
  root: PitchClass,
  quality: ChordQuality,
  useFlats = false,
): string {
  return `${pitchClassName(root, useFlats)}${CHORD_FORMULAS[quality].symbol}`;
}

/** Chord tones as note names (no octave). */
export function chordNoteNames(
  root: PitchClass,
  quality: ChordQuality,
  useFlats = false,
): string[] {
  return chordPitchClasses(root, quality).map((pc) =>
    pitchClassName(pc, useFlats),
  );
}

// ---------------------------------------------------------------------------
// Scales
// ---------------------------------------------------------------------------

export type ScaleName =
  | "major"
  | "naturalMinor"
  | "harmonicMinor"
  | "majorPentatonic"
  | "minorPentatonic";

interface ScaleSpec {
  /** Semitone offsets from the tonic (ascending, within one octave). */
  intervals: number[];
  label: string;
}

export const SCALE_FORMULAS: Record<ScaleName, ScaleSpec> = {
  major: { intervals: [0, 2, 4, 5, 7, 9, 11], label: "Major" },
  naturalMinor: { intervals: [0, 2, 3, 5, 7, 8, 10], label: "Natural Minor" },
  harmonicMinor: {
    intervals: [0, 2, 3, 5, 7, 8, 11],
    label: "Harmonic Minor",
  },
  majorPentatonic: {
    intervals: [0, 2, 4, 7, 9],
    label: "Major Pentatonic",
  },
  minorPentatonic: {
    intervals: [0, 3, 5, 7, 10],
    label: "Minor Pentatonic",
  },
};

/**
 * Scale as an ordered list of pitch classes, tonic first, one octave.
 */
export function scalePitchClasses(
  tonic: PitchClass,
  scale: ScaleName,
): PitchClass[] {
  return SCALE_FORMULAS[scale].intervals.map((i) => mod12(tonic + i));
}

/** Scale degrees as note names (no octave), tonic first. */
export function scaleNoteNames(
  tonic: PitchClass,
  scale: ScaleName,
  useFlats = false,
): string[] {
  return scalePitchClasses(tonic, scale).map((pc) =>
    pitchClassName(pc, useFlats),
  );
}

/**
 * Generate the concrete ascending notes of a scale starting from a given
 * MIDI root, spanning `octaves` octaves and ending on the tonic one octave up
 * (so a one-octave run reads C D E F G A B C).
 */
export function scaleNotes(
  rootMidi: number,
  scale: ScaleName,
  octaves = 1,
): Note[] {
  const intervals = SCALE_FORMULAS[scale].intervals;
  const notes: Note[] = [];
  for (let o = 0; o < octaves; o++) {
    for (const i of intervals) {
      notes.push(noteFromMidi(rootMidi + o * 12 + i));
    }
  }
  // Cap the run with the tonic an octave above the last full octave.
  notes.push(noteFromMidi(rootMidi + octaves * 12));
  return notes;
}
