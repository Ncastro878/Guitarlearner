/**
 * Fretboard — a reusable SVG neck diagram that highlights positions.
 *
 * Horizontal neck, high E string on top (like tab). Highlights are
 * string/fret spots with an optional small label (e.g. the order of notes
 * in a phrase). Open strings render just left of the nut. The diagram
 * trims itself to the highest highlighted fret so short positions stay big
 * and readable.
 */

import type { TabPosition } from "../lib/guitar";

export interface FretboardHighlight extends TabPosition {
  label?: string;
  /** Circle fill (default emerald). */
  color?: string;
  /** Circle outline (default dark emerald). */
  stroke?: string;
  /** Label text colour (default near-black, readable on light fills). */
  labelColor?: string;
  /** Circle radius (default 8.5; heatmaps use smaller dots). */
  r?: number;
}

interface FretboardProps {
  highlights: FretboardHighlight[];
  /** Minimum number of frets to draw (grows to fit highlights). */
  minFrets?: number;
  /** Show open-string names (E A D G B e) along the left edge. */
  showStringLabels?: boolean;
  /** Emphasize this string's line (amber) so it's obvious which is in play. */
  activeString?: number;
}

const NUT_X = 30;
const FRET_W = 46;
const STRING_GAP = 19;
const TOP = 12;
const INLAY_FRETS = [3, 5, 7, 9];
/** Open-string names by string number (1 = high E … 6 = low E). */
const STRING_NAMES = ["", "e", "B", "G", "D", "A", "E"];

export function Fretboard({
  highlights,
  minFrets = 5,
  showStringLabels = false,
  activeString,
}: FretboardProps) {
  const maxHighlightFret = highlights.reduce((m, h) => Math.max(m, h.fret), 0);
  const frets = Math.min(12, Math.max(minFrets, maxHighlightFret + 1));
  const labelW = showStringLabels ? 20 : 0;
  const width = labelW + NUT_X + frets * FRET_W + 8;
  const boardBottom = TOP + 5 * STRING_GAP;
  const height = boardBottom + 26;

  const fretX = (f: number) => labelW + NUT_X + f * FRET_W;
  const spotX = (f: number) =>
    f === 0 ? labelW + NUT_X - 14 : labelW + NUT_X + (f - 0.5) * FRET_W;
  const stringY = (s: number) => TOP + (s - 1) * STRING_GAP;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Fretboard diagram"
    >
      {/* string name labels */}
      {showStringLabels &&
        Array.from({ length: 6 }, (_, i) => i + 1).map((s) => (
          <text
            key={`sl${s}`}
            x={labelW - 7}
            y={stringY(s) + 3.5}
            textAnchor="end"
            fontSize={11}
            fontWeight={s === activeString ? 800 : 500}
            fill={s === activeString ? "#fbbf24" : "#64748b"}
          >
            {STRING_NAMES[s]}
          </text>
        ))}
      {/* nut */}
      <rect
        x={labelW + NUT_X - 3}
        y={TOP - 1}
        width={4}
        height={boardBottom - TOP + 2}
        fill="#cbd5e1"
        rx={1}
      />

      {/* frets */}
      {Array.from({ length: frets }, (_, i) => (
        <line
          key={`f${i + 1}`}
          x1={fretX(i + 1)}
          y1={TOP}
          x2={fretX(i + 1)}
          y2={boardBottom}
          stroke="#475569"
          strokeWidth={1.5}
        />
      ))}

      {/* inlays */}
      {INLAY_FRETS.filter((f) => f <= frets).map((f) => (
        <circle
          key={`i${f}`}
          cx={spotX(f)}
          cy={(TOP + boardBottom) / 2}
          r={4}
          fill="#334155"
        />
      ))}
      {frets >= 12 && (
        <>
          <circle cx={spotX(12)} cy={stringY(2.5)} r={4} fill="#334155" />
          <circle cx={spotX(12)} cy={stringY(4.5)} r={4} fill="#334155" />
        </>
      )}

      {/* strings (string 1 / high E on top, drawn thin → thick); the active
          string is drawn amber and heavier so it's unmistakable */}
      {Array.from({ length: 6 }, (_, i) => {
        const s = i + 1;
        const active = s === activeString;
        return (
          <line
            key={`s${s}`}
            x1={labelW + NUT_X - 3}
            y1={stringY(s)}
            x2={width - 6}
            y2={stringY(s)}
            stroke={active ? "#fbbf24" : "#94a3b8"}
            strokeOpacity={activeString !== undefined && !active ? 0.45 : 1}
            strokeWidth={(0.75 + i * 0.35) + (active ? 1.2 : 0)}
          />
        );
      })}

      {/* fret numbers */}
      {[...INLAY_FRETS, 12]
        .filter((f) => f <= frets)
        .map((f) => (
          <text
            key={`n${f}`}
            x={spotX(f)}
            y={boardBottom + 16}
            textAnchor="middle"
            fontSize={10}
            fill="#64748b"
          >
            {f}
          </text>
        ))}

      {/* highlights */}
      {highlights.map((h, i) => (
        <g key={i}>
          <circle
            cx={spotX(h.fret)}
            cy={stringY(h.string)}
            r={h.r ?? 8.5}
            fill={h.color ?? "#10b981"}
            stroke={h.stroke ?? "#065f46"}
            strokeWidth={1.5}
          />
          {h.label && (
            <text
              x={spotX(h.fret)}
              y={stringY(h.string) + 3.5}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fill={h.labelColor ?? "#022c22"}
            >
              {h.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
