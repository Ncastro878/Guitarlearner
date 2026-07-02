/**
 * SettingsPanel — a modal for concert pitch (A4), input sensitivity, sound
 * effects, note spelling, and destructive resets.
 */

import type { Settings } from "../store/settings";

interface SettingsPanelProps {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  resetSettings: () => void;
  resetProgress: () => void;
  onClose: () => void;
}

export function SettingsPanel({
  settings,
  update,
  resetSettings,
  resetProgress,
  onClose,
}: SettingsPanelProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-slate-900 p-6 shadow-2xl ring-1 ring-slate-700 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold">Settings</h2>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-slate-400 transition hover:bg-slate-800"
          >
            Done
          </button>
        </div>

        <div className="space-y-6">
          {/* A4 reference pitch */}
          <label className="block">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium">Reference pitch (A4)</span>
              <span className="tabular-nums text-slate-400">
                {settings.a4} Hz
              </span>
            </div>
            <input
              type="range"
              min={430}
              max={446}
              step={1}
              value={settings.a4}
              onChange={(e) => update({ a4: Number(e.target.value) })}
              className="w-full accent-emerald-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              Standard is 440 Hz. Change only if you tune to a different
              reference.
            </p>
          </label>

          {/* Sensitivity */}
          <label className="block">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium">Input sensitivity</span>
              <span className="tabular-nums text-slate-400">
                {settings.sensitivity}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={settings.sensitivity}
              onChange={(e) => update({ sensitivity: Number(e.target.value) })}
              className="w-full accent-emerald-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              Higher picks up quieter / noisier signals but may register false
              notes. Lower demands a clean, loud pluck.
            </p>
          </label>

          {/* Toggles */}
          <div className="flex items-center justify-between">
            <span className="font-medium">Sound effects</span>
            <Toggle
              on={settings.soundEffects}
              onChange={(v) => update({ soundEffects: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="font-medium">Prefer flats (♭)</span>
            <Toggle
              on={settings.useFlats}
              onChange={(v) => update({ useFlats: v })}
            />
          </div>

          {/* Resets */}
          <div className="flex gap-3 border-t border-slate-800 pt-4">
            <button
              onClick={resetSettings}
              className="flex-1 rounded-xl bg-slate-800 px-4 py-2 text-sm transition hover:bg-slate-700"
            >
              Reset settings
            </button>
            <button
              onClick={() => {
                if (
                  confirm(
                    "Erase all saved progress, streaks and level unlocks?",
                  )
                )
                  resetProgress();
              }}
              className="flex-1 rounded-xl bg-rose-900/40 px-4 py-2 text-sm text-rose-300 transition hover:bg-rose-900/60"
            >
              Reset progress
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 rounded-full transition ${
        on ? "bg-emerald-500" : "bg-slate-700"
      }`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
          on ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}
