import { describe, it, expect } from "vitest";
import { parseNote } from "../lib/theory";
import {
  HIT_WINDOW_S,
  LEAD_IN_S,
  SONGS,
  judgeNote,
  noteTimeS,
  noteToTab,
  secondsPerBeat,
  songEndS,
  sweepMisses,
  type NoteState,
} from "./songFlight";

const freshStates = (songIdx: number): NoteState[] =>
  SONGS[songIdx].notes.map(() => "pending");

describe("song catalogue", () => {
  it("ships four songs ordered by difficulty", () => {
    expect(SONGS).toHaveLength(4);
    expect(SONGS[0].title).toMatch(/Mary/);
  });

  it("keeps every note on the guitar and beats non-decreasing", () => {
    for (const song of SONGS) {
      let prevBeat = -Infinity;
      for (const n of song.notes) {
        expect(n.midi).toBeGreaterThanOrEqual(parseNote("E2").midi);
        expect(n.midi).toBeLessThanOrEqual(parseNote("E6").midi);
        expect(n.beat).toBeGreaterThanOrEqual(prevBeat);
        prevBeat = n.beat;
        expect(n.dur).toBeGreaterThan(0);
      }
    }
  });

  it("opens Mary Had a Little Lamb with E D C D", () => {
    const first = SONGS[0].notes.slice(0, 4).map((n) => n.midi);
    expect(first).toEqual(["E4", "D4", "C4", "D4"].map((s) => parseNote(s).midi));
  });
});

describe("timing", () => {
  it("schedules notes at lead-in + beat × seconds-per-beat", () => {
    const song = SONGS[0];
    expect(noteTimeS(song, 0)).toBe(LEAD_IN_S);
    expect(noteTimeS(song, 1)).toBeCloseTo(LEAD_IN_S + secondsPerBeat(song));
    expect(songEndS(song)).toBeGreaterThan(
      noteTimeS(song, song.notes.length - 1),
    );
  });
});

describe("judgeNote", () => {
  it("hits the nearest pending note when the pitch class matches", () => {
    const song = SONGS[0];
    const states = freshStates(0);
    const t0 = noteTimeS(song, 0);
    const j = judgeNote(song, states, t0 + 0.1, parseNote("E4").pitchClass);
    expect(j).toEqual({ kind: "hit", index: 0 });
  });

  it("accepts any octave of the target", () => {
    const song = SONGS[0];
    const j = judgeNote(
      song,
      freshStates(0),
      noteTimeS(song, 0),
      parseNote("E2").pitchClass,
    );
    expect(j.kind).toBe("hit");
  });

  it("flags a wrong pitch against the note in the window", () => {
    const song = SONGS[0];
    const j = judgeNote(
      song,
      freshStates(0),
      noteTimeS(song, 0),
      parseNote("F4").pitchClass,
    );
    expect(j).toEqual({ kind: "wrong", index: 0 });
  });

  it("ignores playing when no note is in the window", () => {
    const song = SONGS[0];
    const j = judgeNote(
      song,
      freshStates(0),
      noteTimeS(song, 0) - HIT_WINDOW_S - 0.2,
      parseNote("E4").pitchClass,
    );
    expect(j).toEqual({ kind: "none" });
  });

  it("skips already-hit notes so repeated pitches advance", () => {
    const song = SONGS[0]; // notes 4,5,6 are all E4
    const states = freshStates(0);
    states[4] = "hit";
    const j = judgeNote(
      song,
      states,
      noteTimeS(song, 5),
      parseNote("E4").pitchClass,
    );
    expect(j).toEqual({ kind: "hit", index: 5 });
  });
});

describe("sweepMisses", () => {
  it("returns pending notes whose window has fully passed, once", () => {
    const song = SONGS[0];
    const states = freshStates(0);
    const t = noteTimeS(song, 1) + HIT_WINDOW_S + 0.01;
    const missed = sweepMisses(song, states, t);
    expect(missed).toEqual([0, 1]);
    missed.forEach((i) => (states[i] = "missed"));
    expect(sweepMisses(song, states, t)).toEqual([]);
  });

  it("does not sweep hit notes or notes still in the window", () => {
    const song = SONGS[0];
    const states = freshStates(0);
    states[0] = "hit";
    expect(sweepMisses(song, states, noteTimeS(song, 1))).toEqual([]);
  });
});

describe("noteToTab", () => {
  it("prefers open strings and low frets in first position", () => {
    expect(noteToTab(parseNote("E4").midi)).toEqual({ string: 1, fret: 0 });
    expect(noteToTab(parseNote("B3").midi)).toEqual({ string: 2, fret: 0 });
    expect(noteToTab(parseNote("C4").midi)).toEqual({ string: 2, fret: 1 });
    expect(noteToTab(parseNote("D4").midi)).toEqual({ string: 2, fret: 3 });
    expect(noteToTab(parseNote("G4").midi)).toEqual({ string: 1, fret: 3 });
    expect(noteToTab(parseNote("E2").midi)).toEqual({ string: 6, fret: 0 });
  });

  it("returns null below the instrument's range", () => {
    expect(noteToTab(parseNote("C2").midi)).toBeNull();
  });

  it("covers every note of every song", () => {
    for (const song of SONGS) {
      for (const n of song.notes) {
        expect(noteToTab(n.midi)).not.toBeNull();
      }
    }
  });
});
