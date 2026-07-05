import { describe, it, expect } from "vitest";
import { parseNote } from "./theory";
import { parseSpokenNote } from "./speechNotes";

const pc = (s: string) => parseNote(s).pitchClass;

describe("parseSpokenNote", () => {
  it("parses plain letters", () => {
    expect(parseSpokenNote("a")).toBe(pc("A"));
    expect(parseSpokenNote("G")).toBe(pc("G"));
  });

  it("parses common recogniser homophones", () => {
    expect(parseSpokenNote("see")).toBe(pc("C"));
    expect(parseSpokenNote("sea")).toBe(pc("C"));
    expect(parseSpokenNote("be")).toBe(pc("B"));
    expect(parseSpokenNote("bee")).toBe(pc("B"));
    expect(parseSpokenNote("dee")).toBe(pc("D"));
    expect(parseSpokenNote("gee")).toBe(pc("G"));
    expect(parseSpokenNote("hey")).toBe(pc("A"));
    expect(parseSpokenNote("eff")).toBe(pc("F"));
  });

  it("applies sharp and flat modifiers", () => {
    expect(parseSpokenNote("c sharp")).toBe(pc("C#"));
    expect(parseSpokenNote("see sharp")).toBe(pc("C#"));
    expect(parseSpokenNote("b flat")).toBe(pc("Bb"));
    expect(parseSpokenNote("a flat")).toBe(pc("Ab"));
  });

  it("handles joined and symbol spellings", () => {
    expect(parseSpokenNote("c-sharp")).toBe(pc("C#"));
    expect(parseSpokenNote("F#")).toBe(pc("F#"));
    expect(parseSpokenNote("B♭")).toBe(pc("Bb"));
  });

  it("takes the last note named when the speaker corrects themselves", () => {
    expect(parseSpokenNote("a no wait d sharp")).toBe(pc("D#"));
    expect(parseSpokenNote("c c c e")).toBe(pc("E"));
  });

  it("ignores transcripts with no note in them", () => {
    expect(parseSpokenNote("")).toBeNull();
    expect(parseSpokenNote("hello there")).toBeNull();
    expect(parseSpokenNote("sharp")).toBeNull();
  });

  it("does not let filler words break the letter+modifier pairing", () => {
    // modifier must directly follow the letter; a detached "sharp" is ignored
    expect(parseSpokenNote("d um sharp")).toBe(pc("D"));
  });
});
