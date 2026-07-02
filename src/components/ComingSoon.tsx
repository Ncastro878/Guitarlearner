/**
 * ComingSoon — placeholder for the game modes that are architected but not yet
 * implemented (Arpeggio Gauntlet, Scale Runner).
 */

/** The modes that still show the placeholder. */
export type ComingSoonMode = "arpeggioGauntlet" | "scaleRunner";

const MODE_INFO: Record<
  ComingSoonMode,
  { title: string; blurb: string; emoji: string }
> = {
  arpeggioGauntlet: {
    title: "Arpeggio Gauntlet",
    emoji: "🎸",
    blurb:
      "A chord symbol appears (e.g. Dm7). Play each chord tone one at a time, in any order or position, and watch them light up.",
  },
  scaleRunner: {
    title: "Scale Runner",
    emoji: "🏃",
    blurb:
      "Run a scale ascending as fast and cleanly as you can. One wrong note resets the streak.",
  },
};

export function ComingSoon({
  mode,
  onExit,
}: {
  mode: ComingSoonMode;
  onExit: () => void;
}) {
  const info = MODE_INFO[mode];
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mb-4">
        <button
          onClick={onExit}
          className="rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 active:scale-95"
        >
          ← Menu
        </button>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="text-6xl">{info.emoji}</div>
        <h1 className="text-3xl font-bold">{info.title}</h1>
        <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-300">
          Coming soon
        </span>
        <p className="max-w-sm text-slate-400">{info.blurb}</p>
        <button
          onClick={onExit}
          className="mt-4 rounded-xl bg-slate-800 px-6 py-3 font-semibold transition hover:bg-slate-700 active:scale-95"
        >
          Back to menu
        </button>
      </main>
    </div>
  );
}
