/**
 * songFlight.ts — pure song data, timing and judging logic for the Fret Bird
 * game mode (flappy-bird-style: song notes approach as pipe gates and you
 * must play each note as it reaches the bird). No React, no canvas.
 *
 * Timing model: a song has a BPM and each note a beat position. Note i's hit
 * time is LEAD_IN_S + beat_i * (60 / bpm). A played note counts as a hit if
 * its pitch class matches the nearest pending note within ±HIT_WINDOW_S; a
 * note whose window passes unplayed becomes a miss. Octaves are ignored
 * (matched by pitch class), consistent with the other modes.
 */

import {
  mod12,
  parseNote,
  type PitchClass,
} from "../lib/theory";

// Tab mapping lives in lib/guitar (shared with the Fretboard component);
// re-exported here for the engine and existing imports.
export { noteToTab, type TabPosition } from "../lib/guitar";

/** Seconds of runway before the first beat. */
export const LEAD_IN_S = 3;
/** A note may be hit within ± this many seconds of its ideal time. */
export const HIT_WINDOW_S = 0.45;
/** Fraction of a song's notes you must hit to unlock the next song. */
export const UNLOCK_ACCURACY = 0.6;

export interface SongNote {
  /** MIDI note number. */
  midi: number;
  /** Beat position from the start of the song (quarter note = 1). */
  beat: number;
  /** Duration in beats (display only — hits are judged at onset). */
  dur: number;
}

export interface Song {
  id: number;
  title: string;
  difficulty: string;
  bpm: number;
  notes: SongNote[];
}

/** Compact builder: [noteName, beat, dur?][] → SongNote[]. */
function melody(rows: [string, number, number?][]): SongNote[] {
  return rows.map(([name, beat, dur]) => ({
    midi: parseNote(name).midi,
    beat,
    dur: dur ?? 1,
  }));
}

export const SONGS: Song[] = [
  {
    id: 0,
    title: "Mary Had a Little Lamb",
    difficulty: "Easy",
    bpm: 72,
    notes: melody([
      ["E4", 0], ["D4", 1], ["C4", 2], ["D4", 3],
      ["E4", 4], ["E4", 5], ["E4", 6, 2],
      ["D4", 8], ["D4", 9], ["D4", 10, 2],
      ["E4", 12], ["G4", 13], ["G4", 14, 2],
      ["E4", 16], ["D4", 17], ["C4", 18], ["D4", 19],
      ["E4", 20], ["E4", 21], ["E4", 22], ["E4", 23],
      ["D4", 24], ["D4", 25], ["E4", 26], ["D4", 27],
      ["C4", 28, 4],
    ]),
  },
  {
    id: 1,
    title: "Twinkle Twinkle Little Star",
    difficulty: "Easy",
    bpm: 76,
    notes: melody([
      ["C4", 0], ["C4", 1], ["G4", 2], ["G4", 3],
      ["A4", 4], ["A4", 5], ["G4", 6, 2],
      ["F4", 8], ["F4", 9], ["E4", 10], ["E4", 11],
      ["D4", 12], ["D4", 13], ["C4", 14, 2],
      ["G4", 16], ["G4", 17], ["F4", 18], ["F4", 19],
      ["E4", 20], ["E4", 21], ["D4", 22, 2],
      ["C4", 24], ["C4", 25], ["G4", 26], ["G4", 27],
      ["A4", 28], ["A4", 29], ["G4", 30, 2],
      ["F4", 32], ["F4", 33], ["E4", 34], ["E4", 35],
      ["D4", 36], ["D4", 37], ["C4", 38, 2],
    ]),
  },
  {
    id: 2,
    title: "Ode to Joy",
    difficulty: "Medium",
    bpm: 84,
    notes: melody([
      ["E4", 0], ["E4", 1], ["F4", 2], ["G4", 3],
      ["G4", 4], ["F4", 5], ["E4", 6], ["D4", 7],
      ["C4", 8], ["C4", 9], ["D4", 10], ["E4", 11],
      ["E4", 12, 1.5], ["D4", 13.5, 0.5], ["D4", 14, 2],
      ["E4", 16], ["E4", 17], ["F4", 18], ["G4", 19],
      ["G4", 20], ["F4", 21], ["E4", 22], ["D4", 23],
      ["C4", 24], ["C4", 25], ["D4", 26], ["E4", 27],
      ["D4", 28, 1.5], ["C4", 29.5, 0.5], ["C4", 30, 2],
    ]),
  },
  {
    id: 3,
    title: "Happy Birthday",
    difficulty: "Hard",
    bpm: 80,
    notes: melody([
      ["C4", 0, 0.5], ["C4", 0.5, 0.5], ["D4", 1], ["C4", 2], ["F4", 3], ["E4", 4, 2],
      ["C4", 6, 0.5], ["C4", 6.5, 0.5], ["D4", 7], ["C4", 8], ["G4", 9], ["F4", 10, 2],
      ["C4", 12, 0.5], ["C4", 12.5, 0.5], ["C5", 13], ["A4", 14], ["F4", 15], ["E4", 16], ["D4", 17, 2],
      ["Bb4", 19, 0.5], ["Bb4", 19.5, 0.5], ["A4", 20], ["F4", 21], ["G4", 22], ["F4", 23, 2],
    ]),
  },
];

/** Seconds per beat for a song. */
export function secondsPerBeat(song: Song): number {
  return 60 / song.bpm;
}

/** Ideal hit time (seconds from song start) of note i. */
export function noteTimeS(song: Song, i: number): number {
  return LEAD_IN_S + song.notes[i].beat * secondsPerBeat(song);
}

/** When the run is over: last note's time plus a beat of tail. */
export function songEndS(song: Song): number {
  return noteTimeS(song, song.notes.length - 1) + 1.5;
}

export type NoteState = "pending" | "hit" | "missed";

export type Judgement =
  | { kind: "hit"; index: number }
  | { kind: "wrong"; index: number }
  | { kind: "none" };

/**
 * Judge a played pitch class against the song at a moment in time. The
 * nearest pending note within the hit window is the candidate: matching
 * pitch class = hit, otherwise wrong. With no candidate the play is ignored
 * (noodling between notes is free, like the other modes).
 */
export function judgeNote(
  song: Song,
  states: NoteState[],
  elapsedS: number,
  pc: PitchClass,
): Judgement {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < song.notes.length; i++) {
    if (states[i] !== "pending") continue;
    const t = noteTimeS(song, i);
    if (t - elapsedS > HIT_WINDOW_S) break; // sorted by time — nothing later can match
    const d = Math.abs(t - elapsedS);
    if (d <= HIT_WINDOW_S && d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  if (best === -1) return { kind: "none" };
  if (mod12(song.notes[best].midi) === mod12(pc)) {
    return { kind: "hit", index: best };
  }
  return { kind: "wrong", index: best };
}

/**
 * Indices of pending notes whose hit window has fully passed — call every
 * frame and mark the returned indices as missed.
 */
export function sweepMisses(
  song: Song,
  states: NoteState[],
  elapsedS: number,
): number[] {
  const missed: number[] = [];
  for (let i = 0; i < song.notes.length; i++) {
    if (states[i] !== "pending") continue;
    const t = noteTimeS(song, i);
    if (t + HIT_WINDOW_S < elapsedS) missed.push(i);
    else if (t - elapsedS > HIT_WINDOW_S) break;
  }
  return missed;
}
