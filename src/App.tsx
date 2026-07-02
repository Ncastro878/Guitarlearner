import { useCallback, useRef, useState } from "react";
import { usePitchDetection } from "./hooks/usePitchDetection";
import { useSettings } from "./store/settings";
import { useProgress, type GameModeId } from "./store/progress";
import { warmUpAudio } from "./lib/tones";
import type { DetectedNote } from "./lib/theory";
import { Home } from "./components/Home";
import { NoteHunt } from "./game/NoteHunt";
import { IntervalEcho } from "./game/IntervalEcho";
import { Aurora } from "./game/Aurora";
import { ComingSoon } from "./components/ComingSoon";

export type Screen = "home" | GameModeId;

export default function App() {
  const { settings, update, reset } = useSettings();
  const { progress, recordResult, reset: resetProgress } = useProgress();
  const [screen, setScreen] = useState<Screen>("home");

  // The active game registers a handler here; the pitch engine forwards every
  // stable-note event to it. Using a ref guarantees exactly-once delivery with
  // no missed or duplicated registrations.
  const noteHandlerRef = useRef<((n: DetectedNote) => void) | null>(null);
  const registerNoteHandler = useCallback(
    (cb: ((n: DetectedNote) => void) | null) => {
      noteHandlerRef.current = cb;
    },
    [],
  );

  const pitch = usePitchDetection({
    a4: settings.a4,
    sensitivity: settings.sensitivity,
    onStableNote: (n) => noteHandlerRef.current?.(n),
  });

  const start = useCallback(async () => {
    warmUpAudio();
    await pitch.start();
  }, [pitch]);

  const goHome = useCallback(() => {
    registerNoteHandler(null);
    setScreen("home");
  }, [registerNoteHandler]);

  const pitchProps = {
    currentNote: pitch.currentNote,
    centsOffset: pitch.centsOffset,
    clarity: pitch.clarity,
    frequency: pitch.frequency,
    isListening: pitch.isListening,
    error: pitch.error,
    isSupported: pitch.isSupported,
    start,
    stop: pitch.stop,
    registerNoteHandler,
    useFlats: settings.useFlats,
  };

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-full max-w-2xl flex-col px-4 py-4">
        {screen === "home" && (
          <Home
            pitch={pitchProps}
            progress={progress}
            settings={settings}
            updateSettings={update}
            resetSettings={reset}
            resetProgress={resetProgress}
            onSelectMode={setScreen}
          />
        )}

        {screen === "noteHunt" && (
          <NoteHunt
            pitch={pitchProps}
            soundEffects={settings.soundEffects}
            bestStreak={progress.noteHunt.bestStreak}
            unlockedLevel={progress.noteHunt.unlockedLevel}
            onRecord={(o) => recordResult("noteHunt", o)}
            onExit={goHome}
          />
        )}

        {screen === "intervalEcho" && (
          <IntervalEcho
            pitch={pitchProps}
            soundEffects={settings.soundEffects}
            a4={settings.a4}
            bestStreak={progress.intervalEcho.bestStreak}
            unlockedLevel={progress.intervalEcho.unlockedLevel}
            onRecord={(o) => recordResult("intervalEcho", o)}
            onExit={goHome}
          />
        )}

        {screen === "aurora" && (
          <Aurora
            pitch={pitchProps}
            bestStreak={progress.aurora?.bestStreak ?? 0}
            onRecord={(o) => recordResult("aurora", o)}
            onExit={goHome}
          />
        )}

        {(screen === "arpeggioGauntlet" || screen === "scaleRunner") && (
          <ComingSoon mode={screen} onExit={goHome} />
        )}
      </div>
    </div>
  );
}

/** Shape of the pitch-engine props passed down to screens. */
export interface PitchProps {
  currentNote: DetectedNote | null;
  centsOffset: number;
  clarity: number;
  frequency: number;
  isListening: boolean;
  error: string | null;
  isSupported: boolean;
  start: () => Promise<void>;
  stop: () => void;
  registerNoteHandler: (cb: ((n: DetectedNote) => void) | null) => void;
  useFlats: boolean;
}
