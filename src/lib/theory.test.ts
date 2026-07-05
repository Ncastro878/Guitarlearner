import { describe, it, expect } from "vitest";
import {
  centsFromMidi,
  centsFromPitchClass,
  parseNote,
  midiFromParts,
  noteFromMidi,
  midiToFrequency,
  frequencyToMidi,
  frequencyToNote,
  noteFrequency,
  formatNote,
  pitchClassName,
  intervalName,
  intervalSemitones,
  semitoneDistance,
  transpose,
  chordPitchClasses,
  chordSymbol,
  chordNoteNames,
  scalePitchClasses,
  scaleNoteNames,
  scaleNotes,
  mod12,
} from "./theory";

describe("mod12", () => {
  it("wraps into 0–11", () => {
    expect(mod12(0)).toBe(0);
    expect(mod12(12)).toBe(0);
    expect(mod12(-1)).toBe(11);
    expect(mod12(13)).toBe(1);
  });
});

describe("note parsing & MIDI", () => {
  it("parses standard notes", () => {
    expect(parseNote("A4")).toMatchObject({ pitchClass: 9, octave: 4, midi: 69 });
    expect(parseNote("C4")).toMatchObject({ pitchClass: 0, octave: 4, midi: 60 });
    expect(parseNote("C#4").pitchClass).toBe(1);
    expect(parseNote("Db4").pitchClass).toBe(1);
  });

  it("parses low and high guitar range", () => {
    expect(parseNote("E2").midi).toBe(40);
    expect(parseNote("E6").midi).toBe(88);
  });

  it("defaults to octave 4 when omitted", () => {
    expect(parseNote("F#").octave).toBe(4);
  });

  it("handles double sharps and unicode accidentals", () => {
    expect(parseNote("Fx4").pitchClass).toBe(7); // F## = G
    expect(parseNote("C♯4").pitchClass).toBe(1);
    expect(parseNote("D♭4").pitchClass).toBe(1);
  });

  it("throws on garbage", () => {
    expect(() => parseNote("H4")).toThrow();
    expect(() => parseNote("")).toThrow();
  });

  it("round-trips midi <-> parts", () => {
    const n = noteFromMidi(60);
    expect(midiFromParts(n.pitchClass, n.octave)).toBe(60);
  });
});

describe("frequency conversion", () => {
  it("A4 is 440 Hz by default", () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
  });

  it("respects a configurable A4", () => {
    expect(midiToFrequency(69, 432)).toBeCloseTo(432, 6);
  });

  it("low E (E2) is ~82.41 Hz", () => {
    expect(noteFrequency("E2")).toBeCloseTo(82.41, 1);
  });

  it("high E (E4, open high string is E4? no — 4th) sanity", () => {
    expect(noteFrequency("A4")).toBeCloseTo(440, 6);
  });

  it("frequencyToMidi inverts midiToFrequency", () => {
    for (const midi of [40, 55, 69, 88]) {
      const f = midiToFrequency(midi);
      expect(frequencyToMidi(f)).toBeCloseTo(midi, 6);
    }
  });

  it("frequencyToNote reports the nearest note and cents", () => {
    const inTune = frequencyToNote(440);
    expect(inTune.pitchClass).toBe(9);
    expect(inTune.octave).toBe(4);
    expect(inTune.cents).toBe(0);

    // 10 cents sharp of A4
    const sharp = frequencyToNote(440 * Math.pow(2, 10 / 1200));
    expect(sharp.pitchClass).toBe(9);
    expect(sharp.cents).toBe(10);

    // 10 cents flat of A4
    const flat = frequencyToNote(440 * Math.pow(2, -10 / 1200));
    expect(flat.pitchClass).toBe(9);
    expect(flat.cents).toBe(-10);
  });
});

describe("formatting", () => {
  it("formats notes with octave", () => {
    expect(formatNote(parseNote("C#4"))).toBe("C#4");
    expect(formatNote(parseNote("Db4"), true)).toBe("Db4");
  });

  it("names pitch classes with sharps or flats", () => {
    expect(pitchClassName(1)).toBe("C#");
    expect(pitchClassName(1, true)).toBe("Db");
  });
});

describe("intervals", () => {
  it("names intervals by semitone size", () => {
    expect(intervalName(0).long).toBe("Unison");
    expect(intervalName(7).short).toBe("P5");
    expect(intervalName(8).long).toBe("Minor 6th");
    expect(intervalName(12).long).toBe("Octave");
  });

  it("reduces compound intervals", () => {
    expect(intervalName(19).short).toBe("P5"); // octave + P5
    expect(intervalName(24).long).toBe("Octave");
  });

  it("reverse-looks-up semitones from name", () => {
    expect(intervalSemitones("Minor 6th")).toBe(8);
    expect(intervalSemitones("p5")).toBe(7);
    expect(intervalSemitones("nonsense")).toBeUndefined();
  });

  it("computes semitone distance", () => {
    expect(semitoneDistance(60, 67)).toBe(7);
    expect(semitoneDistance(67, 60)).toBe(7);
  });

  it("transposes notes", () => {
    expect(transpose(parseNote("C4"), 7).midi).toBe(parseNote("G4").midi);
    expect(transpose(parseNote("C4"), -1).midi).toBe(parseNote("B3").midi);
  });
});

describe("chords", () => {
  it("spells triads", () => {
    expect(chordPitchClasses(0, "maj")).toEqual([0, 4, 7]); // C E G
    expect(chordPitchClasses(2, "min")).toEqual([2, 5, 9]); // D F A
    expect(chordPitchClasses(0, "dim")).toEqual([0, 3, 6]);
    expect(chordPitchClasses(0, "aug")).toEqual([0, 4, 8]);
  });

  it("spells seventh chords", () => {
    expect(chordPitchClasses(2, "m7")).toEqual([2, 5, 9, 0]); // D F A C
    expect(chordPitchClasses(0, "maj7")).toEqual([0, 4, 7, 11]);
    expect(chordPitchClasses(7, "dom7")).toEqual([7, 11, 2, 5]); // G B D F
  });

  it("renders chord symbols", () => {
    expect(chordSymbol(2, "m7")).toBe("Dm7");
    expect(chordSymbol(0, "maj")).toBe("C");
    expect(chordSymbol(7, "dom7")).toBe("G7");
    expect(chordSymbol(1, "min", true)).toBe("Dbm");
  });

  it("lists chord note names", () => {
    expect(chordNoteNames(0, "maj")).toEqual(["C", "E", "G"]);
  });
});

describe("scales", () => {
  it("generates the major scale", () => {
    expect(scaleNoteNames(0, "major")).toEqual([
      "C",
      "D",
      "E",
      "F",
      "G",
      "A",
      "B",
    ]);
  });

  it("generates natural and harmonic minor", () => {
    expect(scalePitchClasses(9, "naturalMinor")).toEqual([
      9, 11, 0, 2, 4, 5, 7,
    ]); // A minor
    expect(scalePitchClasses(9, "harmonicMinor")).toEqual([
      9, 11, 0, 2, 4, 5, 8,
    ]); // raised 7th (G#)
  });

  it("generates pentatonics", () => {
    expect(scaleNoteNames(9, "minorPentatonic")).toEqual([
      "A",
      "C",
      "D",
      "E",
      "G",
    ]);
    expect(scaleNoteNames(0, "majorPentatonic")).toEqual([
      "C",
      "D",
      "E",
      "G",
      "A",
    ]);
  });

  it("produces a concrete ascending run capped by the octave", () => {
    const run = scaleNotes(parseNote("C4").midi, "major", 1);
    expect(run.map((n) => formatNote(n))).toEqual([
      "C4",
      "D4",
      "E4",
      "F4",
      "G4",
      "A4",
      "B4",
      "C5",
    ]);
  });
});

describe("pitch tolerance helpers", () => {
  const G3 = parseNote("G3").midi;

  it("centsFromMidi measures fractional distance to an exact note", () => {
    expect(centsFromMidi({ midi: G3, cents: 0 }, G3)).toBe(0);
    expect(centsFromMidi({ midi: G3, cents: -30 }, G3)).toBeCloseTo(30);
    expect(centsFromMidi({ midi: G3 + 1, cents: 20 }, G3)).toBeCloseTo(120);
  });

  it("centsFromPitchClass measures distance to the nearest octave of a class", () => {
    const pcG = parseNote("G").pitchClass;
    expect(centsFromPitchClass({ midi: G3, cents: 0 }, pcG)).toBe(0);
    expect(
      centsFromPitchClass({ midi: parseNote("G5").midi, cents: 15 }, pcG),
    ).toBeCloseTo(15);
    // 40 cents flat of F#3 is 140 from G, wrapping the short way.
    expect(
      centsFromPitchClass({ midi: parseNote("F#3").midi, cents: -40 }, pcG),
    ).toBeCloseTo(140);
    // A perfectly played neighbouring semitone sits at exactly 100.
    expect(
      centsFromPitchClass({ midi: parseNote("F#3").midi, cents: 0 }, pcG),
    ).toBeCloseTo(100);
  });
});
