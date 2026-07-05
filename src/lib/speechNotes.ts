/**
 * speechNotes.ts — pure parsing of spoken note names from speech-recognition
 * transcripts. Recognisers often mishear bare letters ("C" → "see",
 * "B" → "be"), so each letter carries a homophone list. The LAST note named
 * in a transcript wins ("no wait, D sharp" → D#), and a sharp/flat word
 * immediately after the letter modifies it.
 */

import { mod12, type PitchClass } from "./theory";

const LETTER_WORDS: Record<string, number> = {
  // A
  a: 9, ay: 9, eh: 9, hey: 9,
  // B
  b: 11, be: 11, bee: 11,
  // C
  c: 0, see: 0, sea: 0, si: 0,
  // D
  d: 2, de: 2, dee: 2,
  // E
  e: 4, ee: 4,
  // F
  f: 5, ef: 5, eff: 5,
  // G
  g: 7, ge: 7, gee: 7,
};

const SHARP_WORDS = new Set(["sharp", "sharps"]);
const FLAT_WORDS = new Set(["flat", "flats"]);

/**
 * Parse a transcript into a pitch class, or null when no note was named.
 * Handles homophones, "c-sharp"/"B♭" style joins, and multiple attempts in
 * one utterance (last one wins).
 */
export function parseSpokenNote(transcript: string): PitchClass | null {
  const tokens = transcript
    .toLowerCase()
    .replace(/[♯#]/g, " sharp ")
    .replace(/[♭]/g, " flat ")
    .replace(/[-_.,!?']/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  let result: PitchClass | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const letter = LETTER_WORDS[tokens[i]];
    if (letter === undefined) continue;
    let pc = letter;
    const next = tokens[i + 1];
    if (next && SHARP_WORDS.has(next)) pc = mod12(pc + 1);
    else if (next && FLAT_WORDS.has(next)) pc = mod12(pc - 1);
    result = pc; // keep scanning — the last note named wins
  }
  return result;
}
