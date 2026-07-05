/**
 * SongFlight ("Fret Bird") — flappy-bird-style song mode.
 *
 * Flow: pick a song → the melody scrolls in as pipe gates, each labelled
 * with the note to play (note name or a mini tab stave, toggleable) → play
 * each note as its gap reaches the bird to flap through it → results screen.
 * Hits grow the streak; a gate that scrolls past unplayed is a miss and
 * resets it. Hitting ~60% of a song's notes unlocks the next song.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PitchProps } from "../App";
import { GameShell } from "../components/GameShell";
import { pitchClassName, type DetectedNote } from "../lib/theory";
import { playError, playSuccess } from "../lib/tones";
import { loadJSON, saveJSON } from "../store/storage";
import {
  SONGS,
  UNLOCK_ACCURACY,
  type Song,
} from "./songFlight";
import { SongFlightEngine, type SongDisplayMode } from "./songFlightEngine";

type Phase = "select" | "playing" | "done";

const METRONOME_KEY = "guitarlearner.songflight.metronome.v1";

interface SongFlightProps {
  pitch: PitchProps;
  soundEffects: boolean;
  bestStreak: number;
  unlockedLevel: number;
  onRecord: (o: {
    streak?: number;
    correct?: number;
    reachedLevel?: number;
  }) => void;
  onExit: () => void;
}

export function SongFlight({
  pitch,
  soundEffects,
  bestStreak,
  unlockedLevel,
  onRecord,
  onExit,
}: SongFlightProps) {
  const [phase, setPhase] = useState<Phase>("select");
  const [songIdx, setSongIdx] = useState(0);
  const [displayMode, setDisplayMode] = useState<SongDisplayMode>("note");
  const [metronome, setMetronome] = useState(
    () => loadJSON<{ on: boolean }>(METRONOME_KEY, { on: true }).on,
  );

  const toggleMetronome = useCallback(() => {
    setMetronome((on) => {
      saveJSON(METRONOME_KEY, { on: !on });
      return !on;
    });
  }, []);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [wrongNote, setWrongNote] = useState<DetectedNote | null>(null);

  const song: Song = SONGS[songIdx];

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<SongFlightEngine | null>(null);
  const songIdxRef = useRef(0);
  const hitsRef = useRef(0);
  const streakRef = useRef(0);
  const maxStreakRef = useRef(0);
  const endedRef = useRef(false);
  const soundRef = useRef(soundEffects);
  soundRef.current = soundEffects;
  const wrongTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finishSong = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    const lvl = SONGS[songIdxRef.current];
    const unlocked =
      hitsRef.current >= Math.ceil(lvl.notes.length * UNLOCK_ACCURACY) &&
      songIdxRef.current + 1 < SONGS.length;
    onRecord({
      streak: maxStreakRef.current,
      correct: hitsRef.current,
      reachedLevel: unlocked ? songIdxRef.current + 1 : undefined,
    });
    setPhase("done");
  }, [onRecord]);
  const finishSongRef = useRef(finishSong);
  finishSongRef.current = finishSong;

  // Build (and tear down) the engine whenever a run starts.
  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new SongFlightEngine(
      canvas,
      SONGS[songIdxRef.current],
      displayMode,
      pitch.useFlats,
      metronome,
      pitch.toleranceCents,
      {
        onHit: () => {
          hitsRef.current += 1;
          setHits(hitsRef.current);
          streakRef.current += 1;
          setStreak(streakRef.current);
          if (streakRef.current > maxStreakRef.current) {
            maxStreakRef.current = streakRef.current;
            setMaxStreak(maxStreakRef.current);
          }
          if (soundRef.current) playSuccess();
        },
        onMiss: () => {
          setMisses((m) => m + 1);
          streakRef.current = 0;
          setStreak(0);
          if (soundRef.current) playError();
        },
        onWrong: (note) => {
          setWrongNote(note);
          if (wrongTimerRef.current) clearTimeout(wrongTimerRef.current);
          wrongTimerRef.current = setTimeout(() => setWrongNote(null), 700);
        },
        onEnd: () => finishSongRef.current(),
      },
    );
    engineRef.current = engine;
    engine.start();

    const ro = new ResizeObserver(() => engine.resize());
    ro.observe(canvas);

    return () => {
      ro.disconnect();
      engine.stop();
      engineRef.current = null;
      if (wrongTimerRef.current) clearTimeout(wrongTimerRef.current);
    };
    // displayMode changes are pushed via setDisplayMode below, not a rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Keep the engine's label style and pulse in sync with the toggles mid-run.
  useEffect(() => {
    engineRef.current?.setDisplayMode(displayMode);
  }, [displayMode]);
  useEffect(() => {
    engineRef.current?.setMetronome(metronome);
  }, [metronome]);

  // Route detected notes into the engine while playing.
  useEffect(() => {
    if (phase !== "playing") return;
    pitch.registerNoteHandler((note) => engineRef.current?.handlePitch(note));
    return () => pitch.registerNoteHandler(null);
  }, [phase, pitch]);

  const startSong = useCallback(
    async (idx: number) => {
      if (!pitch.isListening) {
        const ok = await pitch.start();
        if (!ok) return; // stay on the song select, where the error shows
      }
      songIdxRef.current = idx;
      hitsRef.current = 0;
      streakRef.current = 0;
      maxStreakRef.current = 0;
      endedRef.current = false;
      setSongIdx(idx);
      setHits(0);
      setMisses(0);
      setStreak(0);
      setMaxStreak(0);
      setWrongNote(null);
      setPhase("playing");
    },
    [pitch],
  );

  const quitToSelect = useCallback(() => setPhase("select"), []);

  // --- render ------------------------------------------------------------

  if (phase === "select") {
    return (
      <SongSelect
        pitch={pitch}
        unlockedLevel={unlockedLevel}
        bestStreak={bestStreak}
        displayMode={displayMode}
        onToggleDisplay={() =>
          setDisplayMode((m) => (m === "note" ? "tab" : "note"))
        }
        onPick={startSong}
        onExit={onExit}
      />
    );
  }

  if (phase === "done") {
    const total = song.notes.length;
    const unlocked =
      hits >= Math.ceil(total * UNLOCK_ACCURACY) && songIdx + 1 < SONGS.length;
    return (
      <GameShell title="Fret Bird" pitch={pitch} onExit={onExit}>
        <div className="text-center">
          <div className="text-5xl">{hits === total ? "🏆" : "🐦"}</div>
          <h2 className="mt-3 text-2xl font-bold">{song.title}</h2>
          <p className="mt-2 text-slate-300">
            {hits} / {total} notes · best streak {maxStreak}
          </p>
          {unlocked && (
            <p className="mt-2 font-semibold text-emerald-400">
              🔓 Unlocked: {SONGS[songIdx + 1].title}
            </p>
          )}
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => startSong(songIdx)}
              className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 active:scale-95"
            >
              Fly again
            </button>
            <button
              onClick={quitToSelect}
              className="rounded-xl bg-slate-800 px-6 py-3 font-semibold transition hover:bg-slate-700 active:scale-95"
            >
              Choose song
            </button>
          </div>
        </div>
      </GameShell>
    );
  }

  // phase === "playing"
  return (
    <GameShell
      title="Fret Bird"
      pitch={pitch}
      streak={streak}
      bestStreak={bestStreak}
      onExit={quitToSelect}
    >
      <div className="flex w-full flex-1 flex-col">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
          <span>{song.title}</span>
          <div className="flex items-center gap-3">
            <span className="text-emerald-400">{hits} hit</span>
            <span className="text-rose-400">{misses} missed</span>
            <button
              onClick={toggleMetronome}
              className={`rounded-md px-2 py-1 font-semibold transition ${
                metronome
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-slate-800 text-slate-500 hover:bg-slate-700"
              }`}
              title="Metronome pulse at the song's tempo"
            >
              ♩ {song.bpm}
            </button>
            <button
              onClick={() =>
                setDisplayMode((m) => (m === "note" ? "tab" : "note"))
              }
              className="rounded-md bg-slate-800 px-2 py-1 font-semibold text-slate-300 transition hover:bg-slate-700"
            >
              {displayMode === "note" ? "Notes" : "Tab"} ⇄
            </button>
          </div>
        </div>

        <div className="relative min-h-[46vh] flex-1 overflow-hidden rounded-2xl border border-slate-800">
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          {wrongNote && (
            <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300">
              heard {pitchClassName(wrongNote.pitchClass, pitch.useFlats)}
              {wrongNote.octave}
            </div>
          )}
        </div>
      </div>
    </GameShell>
  );
}

// ---------------------------------------------------------------------------

function SongSelect({
  pitch,
  unlockedLevel,
  bestStreak,
  displayMode,
  onToggleDisplay,
  onPick,
  onExit,
}: {
  pitch: PitchProps;
  unlockedLevel: number;
  bestStreak: number;
  displayMode: SongDisplayMode;
  onToggleDisplay: () => void;
  onPick: (idx: number) => void;
  onExit: () => void;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mb-4 flex items-center justify-between">
        <button
          onClick={onExit}
          className="rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 active:scale-95"
        >
          ← Menu
        </button>
        <h1 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Fret Bird
        </h1>
        <div className="min-w-[3rem] text-right text-xs text-slate-500">
          {bestStreak > 0 && `best ${bestStreak}`}
        </div>
      </header>

      {!pitch.isListening && (
        <div className="mb-4 rounded-xl border border-amber-700/40 bg-amber-950/30 p-3 text-center text-sm text-amber-200">
          Starting a song will ask for microphone access.
          {pitch.error && (
            <div className="mt-1 text-rose-300">{pitch.error}</div>
          )}
        </div>
      )}

      <main className="flex flex-1 flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">
            Play each note as its gate reaches the bird. Hit ~60% to unlock
            the next song.
          </p>
          <button
            onClick={onToggleDisplay}
            className="ml-3 shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-700 active:scale-95"
          >
            {displayMode === "note" ? "🅰 Note names" : "🎼 Tab"} ⇄
          </button>
        </div>
        {SONGS.map((s, idx) => {
          const locked = idx > unlockedLevel;
          return (
            <button
              key={s.id}
              disabled={locked}
              onClick={() => onPick(idx)}
              className={`flex items-center justify-between rounded-2xl border p-4 text-left transition active:scale-[0.98] ${
                locked
                  ? "cursor-not-allowed border-slate-800 bg-slate-900/40 opacity-50"
                  : "border-slate-700/60 bg-slate-900/60 hover:border-emerald-500/60 hover:bg-slate-800/60"
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">
                    {idx + 1}
                  </span>
                  <span className="font-bold">{s.title}</span>
                  {locked && <span className="text-sm">🔒</span>}
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {s.difficulty} · {s.bpm} bpm
                </p>
              </div>
              <div className="ml-3 shrink-0 text-right text-[10px] text-slate-500">
                {s.notes.length} notes
              </div>
            </button>
          );
        })}
      </main>
    </div>
  );
}
