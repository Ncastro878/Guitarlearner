/**
 * NeckHeatmap — the whole neck coloured by spaced-repetition memory: every
 * position (6 strings × frets 0–12) gets a dot whose colour is its Leitner
 * box, so weak zones jump out at a glance. Unattempted positions stay dim.
 */

import { MAX_BOX, type SrsMemory } from "../lib/srs";
import { Fretboard } from "./Fretboard";

/** Box → colour: missed (rose) through learning (ambers) to solid (emerald). */
const BOX_COLORS = ["#f43f5e", "#fb923c", "#fbbf24", "#a3e635", "#10b981"];
const UNSEEN_COLOR = "#334155";

interface NeckHeatmapProps {
  memory: SrsMemory;
  /** Build the memory key for a position (matches the game's cardId). */
  idFor: (string: number, fret: number) => string;
  maxFret?: number;
}

export function NeckHeatmap({ memory, idFor, maxFret = 12 }: NeckHeatmapProps) {
  const highlights = [];
  for (let s = 1; s <= 6; s++) {
    for (let f = 0; f <= maxFret; f++) {
      const stats = memory[idFor(s, f)];
      const color =
        stats && stats.attempts > 0
          ? BOX_COLORS[Math.max(0, Math.min(MAX_BOX, stats.box))]
          : UNSEEN_COLOR;
      highlights.push({
        string: s,
        fret: f,
        color,
        stroke: "transparent",
        r: 5,
      });
    }
  }

  return (
    <div>
      <Fretboard highlights={highlights} minFrets={maxFret} showStringLabels />
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
        <LegendDot color={BOX_COLORS[0]} label="missed" />
        <LegendDot color={BOX_COLORS[2]} label="learning" />
        <LegendDot color={BOX_COLORS[4]} label="solid" />
        <LegendDot color={UNSEEN_COLOR} label="not seen" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
