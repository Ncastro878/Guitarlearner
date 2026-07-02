/**
 * Home — mode select, microphone permission / explainer, live tuner, and a
 * settings entry point.
 */

import { useState } from "react";
import type { PitchProps, Screen } from "../App";
import type { Settings } from "../store/settings";
import type { GameModeId, Progress } from "../store/progress";
import { TunerStrip } from "./TunerStrip";
import { SettingsPanel } from "./SettingsPanel";

interface ModeCard {
  id: GameModeId;
  title: string;
  emoji: string;
  blurb: string;
  ready: boolean;
}

const MODES: ModeCard[] = [
  {
    id: "noteHunt",
    title: "Note Hunt",
    emoji: "🎯",
    blurb: "Find named notes anywhere on the neck against the clock.",
    ready: true,
  },
  {
    id: "intervalEcho",
    title: "Interval Echo",
    emoji: "🎵",
    blurb: "Hear a root, play the interval above it.",
    ready: true,
  },
  {
    id: "arpeggioGauntlet",
    title: "Arpeggio Gauntlet",
    emoji: "🎸",
    blurb: "Play every tone of a chord, any order.",
    ready: false,
  },
  {
    id: "scaleRunner",
    title: "Scale Runner",
    emoji: "🏃",
    blurb: "Run a scale cleanly — one slip resets the streak.",
    ready: false,
  },
];

interface HomeProps {
  pitch: PitchProps;
  progress: Progress;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  resetSettings: () => void;
  resetProgress: () => void;
  onSelectMode: (screen: Screen) => void;
}

export function Home({
  pitch,
  progress,
  settings,
  updateSettings,
  resetSettings,
  resetProgress,
  onSelectMode,
}: HomeProps) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="flex flex-1 flex-col">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">
            Fretboard Trainer
          </h1>
          <p className="text-sm text-slate-400">
            Learn the neck by ear — it listens to your real guitar.
          </p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
          className="rounded-xl bg-slate-800 px-3 py-2 text-lg transition hover:bg-slate-700 active:scale-95"
        >
          ⚙️
        </button>
      </header>

      {/* Microphone gate / status */}
      <MicSection pitch={pitch} useFlats={settings.useFlats} />

      {/* Mode grid */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {MODES.map((m) => {
          const best = progress[m.id]?.bestStreak ?? 0;
          return (
            <button
              key={m.id}
              onClick={() => onSelectMode(m.id)}
              className="group relative flex flex-col items-start gap-1 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4 text-left transition hover:border-emerald-500/60 hover:bg-slate-800/60 active:scale-[0.98]"
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-2xl">{m.emoji}</span>
                {m.ready ? (
                  best > 0 && (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                      best {best}
                    </span>
                  )
                ) : (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                    soon
                  </span>
                )}
              </div>
              <span className="text-lg font-bold">{m.title}</span>
              <span className="text-xs text-slate-400">{m.blurb}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs text-slate-600">
        Best on a quiet room. Audio never leaves your device.
      </p>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          update={updateSettings}
          resetSettings={resetSettings}
          resetProgress={resetProgress}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function MicSection({
  pitch,
  useFlats,
}: {
  pitch: PitchProps;
  useFlats: boolean;
}) {
  if (!pitch.isSupported) {
    return (
      <div className="rounded-2xl border border-rose-800/50 bg-rose-950/40 p-4 text-sm text-rose-200">
        This browser doesn't support microphone input via the Web Audio API.
        Try a recent version of Chrome, Edge, Firefox or Safari.
      </div>
    );
  }

  if (pitch.isListening) {
    return (
      <div className="space-y-2">
        <TunerStrip
          currentNote={pitch.currentNote}
          centsOffset={pitch.centsOffset}
          clarity={pitch.clarity}
          frequency={pitch.frequency}
          isListening={pitch.isListening}
          useFlats={useFlats}
        />
        <p className="text-center text-xs text-slate-500">
          Mic is live — pluck a string to check it, then pick a mode.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5 text-center">
      <div className="mb-2 text-4xl">🎤</div>
      <h2 className="mb-1 text-lg font-bold">Turn on your microphone</h2>
      <p className="mx-auto mb-4 max-w-sm text-sm text-slate-400">
        The game listens to your guitar to check the notes you play. Audio is
        processed entirely on your device and is never recorded or uploaded.
      </p>
      {pitch.error && (
        <p className="mb-3 rounded-lg bg-rose-950/50 px-3 py-2 text-sm text-rose-300">
          {pitch.error}
        </p>
      )}
      <button
        onClick={() => void pitch.start()}
        className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 active:scale-95"
      >
        Enable microphone
      </button>
    </div>
  );
}
