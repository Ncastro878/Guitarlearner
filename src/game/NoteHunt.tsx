/**
 * NoteHunt — the MVP game mode.
 *
 * Flow: pick a level → play a run of N targets → results screen. For each
 * target the game shows a note to find; the player has a time limit to play
 * it (matched by pitch class, any octave / string / position). Playing the
 * right note scores a point and grows the streak; a timeout resets the streak.
 * Wrong notes give a gentle "heard X" hint without penalty so the player can
 * keep hunting.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PitchProps } from "../App";
import { GameShell } from "../components/GameShell";
import { pitchClassName, type DetectedNote } from "../lib/theory";
import { playError, playSuccess } from "../lib/tones";
import {
  NOTE_HUNT_LEVELS,
  isCorrectGuess,
  nextTarget,
  type NoteHuntLevel,
  type NoteHuntTarget,
} from "./noteHunt";

type Phase = "select" | "playing" | "done";
type Feedback = "idle" | "correct" | "miss";

interface NoteHuntProps {
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

const ADVANCE_DELAY_MS = 900;
const WRONG_HINT_MS = 650;
/** Fraction of a level's rounds you must land to unlock the next level. */
const UNLOCK_ACCURACY = 0.6;

export function NoteHunt({
  pitch,
  soundEffects,
  bestStreak,
  unlockedLevel,
  onRecord,
  onExit,
}: NoteHuntProps) {
  const [phase, setPhase] = useState<Phase>("select");
  const [levelIdx, setLevelIdx] = useState(0);
  const [round, setRound] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [target, setTarget] = useState<NoteHuntTarget | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>("idle");
  const [wrongNote, setWrongNote] = useState<DetectedNote | null>(null);

  const level: NoteHuntLevel = NOTE_HUNT_LEVELS[levelIdx];

  // Refs the async callbacks/timers read so they never see stale values.
  // Score tallies live in refs (not just state) so timers and the
  // end-of-level record fire exactly once, even under StrictMode double-invoke.
  const acceptingRef = useRef(false);
  const targetRef = useRef<NoteHuntTarget | null>(null);
  const roundRef = useRef(0);
  const levelIdxRef = useRef(0);
  const streakRef = useRef(0);
  const maxStreakRef = useRef(0);
  const correctRef = useRef(0);
  const soundRef = useRef(soundEffects);
  soundRef.current = soundEffects;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrongRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (advanceRef.current) clearTimeout(advanceRef.current);
    if (wrongRef.current) clearTimeout(wrongRef.current);
    timerRef.current = null;
    advanceRef.current = null;
    wrongRef.current = null;
  }, []);

  // --- round lifecycle ---------------------------------------------------

  const beginRound = useCallback((roundIndex: number) => {
    const lvl = NOTE_HUNT_LEVELS[levelIdxRef.current];
    const t = nextTarget(lvl, targetRef.current);
    targetRef.current = t;
    roundRef.current = roundIndex;

    setTarget(t);
    setRound(roundIndex);
    setFeedback("idle");
    setWrongNote(null);
    setRemaining(lvl.timeLimit);
    acceptingRef.current = true;

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        const nr = Math.max(0, Math.round((r - 0.1) * 10) / 10);
        if (nr <= 0) {
          handleTimeoutRef.current();
        }
        return nr;
      });
    }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleAdvance = useCallback(() => {
    advanceRef.current = setTimeout(() => {
      const next = roundRef.current + 1;
      const lvl = NOTE_HUNT_LEVELS[levelIdxRef.current];
      if (next >= lvl.rounds) {
        finishLevelRef.current();
      } else {
        beginRound(next);
      }
    }, ADVANCE_DELAY_MS);
  }, [beginRound]);

  const handleCorrect = useCallback(() => {
    if (!acceptingRef.current) return;
    acceptingRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    const ns = streakRef.current + 1;
    streakRef.current = ns;
    setStreak(ns);
    if (ns > maxStreakRef.current) {
      maxStreakRef.current = ns;
      setMaxStreak(ns);
    }
    correctRef.current += 1;
    setCorrect(correctRef.current);
    setFeedback("correct");
    if (soundRef.current) playSuccess();
    scheduleAdvance();
  }, [scheduleAdvance]);

  const handleTimeout = useCallback(() => {
    if (!acceptingRef.current) return;
    acceptingRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    streakRef.current = 0;
    setStreak(0);
    setFeedback("miss");
    if (soundRef.current) playError();
    scheduleAdvance();
  }, [scheduleAdvance]);

  // Stable indirection so the interval always calls the latest handler.
  const handleTimeoutRef = useRef(handleTimeout);
  handleTimeoutRef.current = handleTimeout;

  const finishLevel = useCallback(() => {
    clearTimers();
    acceptingRef.current = false;
    const lvl = NOTE_HUNT_LEVELS[levelIdxRef.current];
    const finalCorrect = correctRef.current;
    const finalMax = maxStreakRef.current;
    const unlocked =
      finalCorrect >= Math.ceil(lvl.rounds * UNLOCK_ACCURACY) &&
      levelIdxRef.current + 1 < NOTE_HUNT_LEVELS.length;
    onRecord({
      streak: finalMax,
      correct: finalCorrect,
      reachedLevel: unlocked ? levelIdxRef.current + 1 : undefined,
    });
    setPhase("done");
  }, [clearTimers, onRecord]);

  const finishLevelRef = useRef(finishLevel);
  finishLevelRef.current = finishLevel;

  const handleWrong = useCallback((note: DetectedNote) => {
    setWrongNote(note);
    if (wrongRef.current) clearTimeout(wrongRef.current);
    wrongRef.current = setTimeout(() => setWrongNote(null), WRONG_HINT_MS);
  }, []);

  // --- wire the pitch engine to the round while playing ------------------

  useEffect(() => {
    if (phase !== "playing") return;
    pitch.registerNoteHandler((note) => {
      if (!acceptingRef.current || !targetRef.current) return;
      if (isCorrectGuess(targetRef.current, note, pitch.toleranceCents))
        handleCorrect();
      else handleWrong(note);
    });
    return () => pitch.registerNoteHandler(null);
  }, [phase, pitch, handleCorrect, handleWrong]);

  // Clean up any timers if we leave the mode mid-run.
  useEffect(() => clearTimers, [clearTimers]);

  // --- actions -----------------------------------------------------------

  const startLevel = useCallback(
    async (idx: number) => {
      if (!pitch.isListening) {
        const ok = await pitch.start();
        if (!ok) return; // stay on the level select, where the error shows
      }
      clearTimers();
      levelIdxRef.current = idx;
      targetRef.current = null;
      streakRef.current = 0;
      maxStreakRef.current = 0;
      correctRef.current = 0;
      setLevelIdx(idx);
      setStreak(0);
      setMaxStreak(0);
      setCorrect(0);
      setPhase("playing");
      beginRound(0);
    },
    [pitch, clearTimers, beginRound],
  );

  const quitToSelect = useCallback(() => {
    clearTimers();
    acceptingRef.current = false;
    setPhase("select");
  }, [clearTimers]);

  // --- render ------------------------------------------------------------

  if (phase === "select") {
    return (
      <LevelSelect
        pitch={pitch}
        unlockedLevel={unlockedLevel}
        bestStreak={bestStreak}
        onPick={startLevel}
        onExit={onExit}
      />
    );
  }

  if (phase === "done") {
    const total = level.rounds;
    const unlocked =
      correct >= Math.ceil(total * UNLOCK_ACCURACY) &&
      levelIdx + 1 < NOTE_HUNT_LEVELS.length;
    return (
      <GameShell title="Note Hunt" pitch={pitch} onExit={onExit}>
        <div className="text-center">
          <div className="text-5xl">{correct === total ? "🏆" : "✅"}</div>
          <h2 className="mt-3 text-2xl font-bold">{level.name} complete</h2>
          <p className="mt-2 text-slate-300">
            {correct} / {total} correct · best streak {maxStreak}
          </p>
          {unlocked && (
            <p className="mt-2 font-semibold text-emerald-400">
              🔓 Unlocked: {NOTE_HUNT_LEVELS[levelIdx + 1].name}
            </p>
          )}
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => startLevel(levelIdx)}
              className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 active:scale-95"
            >
              Play again
            </button>
            <button
              onClick={quitToSelect}
              className="rounded-xl bg-slate-800 px-6 py-3 font-semibold transition hover:bg-slate-700 active:scale-95"
            >
              Choose level
            </button>
          </div>
        </div>
      </GameShell>
    );
  }

  // phase === "playing"
  const timeFrac = level.timeLimit > 0 ? remaining / level.timeLimit : 0;
  const bannerClass =
    feedback === "correct"
      ? "ring-emerald-400/70 bg-emerald-500/10"
      : feedback === "miss"
        ? "ring-rose-500/60 bg-rose-500/10"
        : "ring-slate-700/60 bg-slate-900/40";

  return (
    <GameShell
      title="Note Hunt"
      pitch={pitch}
      streak={streak}
      bestStreak={bestStreak}
      onExit={quitToSelect}
    >
      <div className="w-full">
        {/* progress + timer */}
        <div className="mb-4 flex items-center justify-between text-xs text-slate-500">
          <span>
            Round {round + 1} / {level.rounds}
          </span>
          <span className="tabular-nums">{remaining.toFixed(1)}s</span>
        </div>
        <div className="mb-8 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full transition-[width] duration-100 ease-linear ${
              timeFrac > 0.33
                ? "bg-emerald-500"
                : timeFrac > 0.15
                  ? "bg-amber-500"
                  : "bg-rose-500"
            }`}
            style={{ width: `${timeFrac * 100}%` }}
          />
        </div>

        {/* target */}
        <div
          className={`mx-auto flex aspect-square max-h-[42vh] w-full max-w-xs flex-col items-center justify-center rounded-3xl ring-2 transition ${bannerClass} ${
            feedback === "correct" ? "scale-105" : ""
          }`}
        >
          <span className="text-xs uppercase tracking-widest text-slate-400">
            {feedback === "correct"
              ? "Nice!"
              : feedback === "miss"
                ? "Too slow"
                : "Play a"}
          </span>
          <span className="my-1 text-8xl font-black leading-none text-slate-50">
            {target ? pitchClassName(target.pitchClass, pitch.useFlats) : ""}
          </span>
          {target?.stringLabel && (
            <span className="text-sm text-slate-300">
              on the{" "}
              <span className="font-semibold text-emerald-300">
                {target.stringLabel}
              </span>{" "}
              string
            </span>
          )}
        </div>

        {/* wrong-note hint */}
        <div className="mt-4 h-6 text-center text-sm">
          {wrongNote && feedback === "idle" && (
            <span className="text-amber-300/80">
              heard {pitchClassName(wrongNote.pitchClass, pitch.useFlats)}
              {wrongNote.octave} — keep hunting
            </span>
          )}
          {feedback === "correct" && (
            <span className="font-semibold text-emerald-400">Correct! +1</span>
          )}
          {feedback === "miss" && (
            <span className="text-rose-400">
              It was{" "}
              {target ? pitchClassName(target.pitchClass, pitch.useFlats) : ""}
            </span>
          )}
        </div>

        <div className="mt-2 flex justify-center">
          <button
            onClick={() => handleTimeout()}
            disabled={feedback !== "idle"}
            className="rounded-lg px-4 py-2 text-xs text-slate-500 transition hover:text-slate-300 disabled:opacity-40"
          >
            Skip ↷
          </button>
        </div>
      </div>
    </GameShell>
  );
}

// ---------------------------------------------------------------------------

function LevelSelect({
  pitch,
  unlockedLevel,
  bestStreak,
  onPick,
  onExit,
}: {
  pitch: PitchProps;
  unlockedLevel: number;
  bestStreak: number;
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
          Note Hunt
        </h1>
        <div className="min-w-[3rem] text-right text-xs text-slate-500">
          {bestStreak > 0 && `best ${bestStreak}`}
        </div>
      </header>

      {!pitch.isListening && (
        <div className="mb-4 rounded-xl border border-amber-700/40 bg-amber-950/30 p-3 text-center text-sm text-amber-200">
          Starting a level will ask for microphone access.
          {pitch.error && (
            <div className="mt-1 text-rose-300">{pitch.error}</div>
          )}
        </div>
      )}

      <main className="flex flex-1 flex-col gap-3">
        <p className="text-sm text-slate-400">
          Pick a level. Clear ~60% to unlock the next.
        </p>
        {NOTE_HUNT_LEVELS.map((lvl, idx) => {
          const locked = idx > unlockedLevel;
          return (
            <button
              key={lvl.id}
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
                    L{idx + 1}
                  </span>
                  <span className="font-bold">{lvl.name}</span>
                  {locked && <span className="text-sm">🔒</span>}
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {lvl.description}
                </p>
              </div>
              <div className="ml-3 shrink-0 text-right text-[10px] text-slate-500">
                {lvl.rounds} rounds
                <br />
                {lvl.timeLimit}s each
              </div>
            </button>
          );
        })}
      </main>
    </div>
  );
}
