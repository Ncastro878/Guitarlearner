/**
 * CallResponse — ear-training game mode.
 *
 * Flow: pick a level → for each round the app plays a short phrase through
 * the speakers, then the player echoes it back note by note (matched by
 * pitch class, any octave / position). The first note's name is shown as an
 * anchor; each note lights up its dot (with its name) as it lands. The
 * phrase can be replayed any time (input is gated while tones play so the
 * mic never hears the speakers as an answer). A timeout or give-up reveals
 * the phrase — names plus first-position spots on a fretboard diagram —
 * before moving on.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PitchProps } from "../App";
import { Fretboard } from "../components/Fretboard";
import { GameShell } from "../components/GameShell";
import { noteToTab } from "../lib/guitar";
import {
  formatNote,
  midiToFrequency,
  noteFromMidi,
  pitchClassName,
  type DetectedNote,
} from "../lib/theory";
import { playError, playSuccess, playTone } from "../lib/tones";
import {
  CALL_RESPONSE_LEVELS,
  NOTE_SPACING_S,
  generatePhrase,
  matchesAt,
  playbackDurationS,
  type CallResponseLevel,
} from "./callResponse";

type Phase = "select" | "playing" | "done";
type Feedback = "idle" | "correct" | "miss";

interface CallResponseProps {
  pitch: PitchProps;
  soundEffects: boolean;
  /** Concert pitch for phrase playback, from settings. */
  a4: number;
  bestStreak: number;
  unlockedLevel: number;
  onRecord: (o: {
    streak?: number;
    correct?: number;
    reachedLevel?: number;
  }) => void;
  onExit: () => void;
}

const ADVANCE_OK_MS = 1300;
/** Longer pause after a miss so the reveal (names + fretboard) can be read. */
const ADVANCE_MISS_MS = 3600;
const WRONG_HINT_MS = 800;
/** Extra input-gate time after the last playback tone rings out. */
const PLAYBACK_TAIL_MS = 350;
/** Fraction of a level's rounds you must land to unlock the next level. */
const UNLOCK_ACCURACY = 0.6;

export function CallResponse({
  pitch,
  soundEffects,
  a4,
  bestStreak,
  unlockedLevel,
  onRecord,
  onExit,
}: CallResponseProps) {
  const [phase, setPhase] = useState<Phase>("select");
  const [levelIdx, setLevelIdx] = useState(0);
  const [round, setRound] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [phrase, setPhrase] = useState<number[]>([]);
  const [matched, setMatched] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [listening, setListening] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>("idle");
  const [wrongNote, setWrongNote] = useState<DetectedNote | null>(null);

  const level: CallResponseLevel = CALL_RESPONSE_LEVELS[levelIdx];

  // Refs the async callbacks/timers read so they never see stale values
  // (same pattern as the other modes — exactly-once under StrictMode).
  const acceptingRef = useRef(false);
  const roundActiveRef = useRef(false);
  const phraseRef = useRef<number[]>([]);
  const idxRef = useRef(0);
  const roundRef = useRef(0);
  const levelIdxRef = useRef(0);
  const streakRef = useRef(0);
  const maxStreakRef = useRef(0);
  const correctRef = useRef(0);
  const soundRef = useRef(soundEffects);
  soundRef.current = soundEffects;
  const a4Ref = useRef(a4);
  a4Ref.current = a4;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrongRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (playbackRef.current) clearTimeout(playbackRef.current);
    if (advanceRef.current) clearTimeout(advanceRef.current);
    if (wrongRef.current) clearTimeout(wrongRef.current);
    timerRef.current = null;
    playbackRef.current = null;
    advanceRef.current = null;
    wrongRef.current = null;
  }, []);

  const playPhrase = useCallback((midis: number[]) => {
    midis.forEach((m, i) => {
      playTone({
        frequency: midiToFrequency(m, a4Ref.current),
        duration: 0.5,
        type: "sine",
        gain: 0.22,
        when: i * NOTE_SPACING_S,
      });
    });
  }, []);

  // --- round lifecycle ---------------------------------------------------

  const beginRound = useCallback(
    (roundIndex: number) => {
      const lvl = CALL_RESPONSE_LEVELS[levelIdxRef.current];
      const p = generatePhrase(lvl);
      phraseRef.current = p;
      idxRef.current = 0;
      roundRef.current = roundIndex;
      roundActiveRef.current = false;
      acceptingRef.current = false;

      setPhrase(p);
      setMatched(0);
      setRound(roundIndex);
      setFeedback("idle");
      setWrongNote(null);
      setRemaining(lvl.timeLimit);
      setListening(true);

      playPhrase(p);

      if (playbackRef.current) clearTimeout(playbackRef.current);
      playbackRef.current = setTimeout(
        () => {
          setListening(false);
          roundActiveRef.current = true;
          acceptingRef.current = true;
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = setInterval(() => {
            setRemaining((r) => {
              const nr = Math.max(0, Math.round((r - 0.1) * 10) / 10);
              if (nr <= 0) {
                handleMissRef.current();
              }
              return nr;
            });
          }, 100);
        },
        playbackDurationS(p.length) * 1000 + PLAYBACK_TAIL_MS,
      );
    },
    [playPhrase],
  );

  const scheduleAdvance = useCallback(
    (delayMs: number) => {
      advanceRef.current = setTimeout(() => {
        const next = roundRef.current + 1;
        const lvl = CALL_RESPONSE_LEVELS[levelIdxRef.current];
        if (next >= lvl.rounds) {
          finishLevelRef.current();
        } else {
          beginRound(next);
        }
      }, delayMs);
    },
    [beginRound],
  );

  const handleSuccess = useCallback(() => {
    if (!roundActiveRef.current) return;
    roundActiveRef.current = false;
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
    scheduleAdvance(ADVANCE_OK_MS);
  }, [scheduleAdvance]);

  const handleMiss = useCallback(() => {
    if (!roundActiveRef.current) return;
    roundActiveRef.current = false;
    acceptingRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    streakRef.current = 0;
    setStreak(0);
    setFeedback("miss");
    if (soundRef.current) playError();
    scheduleAdvance(ADVANCE_MISS_MS);
  }, [scheduleAdvance]);

  // Stable indirection so the countdown always calls the latest handler.
  const handleMissRef = useRef(handleMiss);
  handleMissRef.current = handleMiss;

  const finishLevel = useCallback(() => {
    clearTimers();
    roundActiveRef.current = false;
    acceptingRef.current = false;
    const lvl = CALL_RESPONSE_LEVELS[levelIdxRef.current];
    const unlocked =
      correctRef.current >= Math.ceil(lvl.rounds * UNLOCK_ACCURACY) &&
      levelIdxRef.current + 1 < CALL_RESPONSE_LEVELS.length;
    onRecord({
      streak: maxStreakRef.current,
      correct: correctRef.current,
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
      if (!acceptingRef.current || !roundActiveRef.current) return;
      if (matchesAt(phraseRef.current, idxRef.current, note.pitchClass)) {
        idxRef.current += 1;
        setMatched(idxRef.current);
        setWrongNote(null);
        if (idxRef.current >= phraseRef.current.length) handleSuccess();
      } else {
        handleWrong(note);
      }
    });
    return () => pitch.registerNoteHandler(null);
  }, [phase, pitch, handleSuccess, handleWrong]);

  useEffect(() => clearTimers, [clearTimers]);

  // --- actions -----------------------------------------------------------

  const startLevel = useCallback(
    async (idx: number) => {
      if (!pitch.isListening) {
        await pitch.start();
      }
      clearTimers();
      levelIdxRef.current = idx;
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
    roundActiveRef.current = false;
    acceptingRef.current = false;
    setPhase("select");
  }, [clearTimers]);

  /** Replay the phrase; input is gated while the tones ring. */
  const replayPhrase = useCallback(() => {
    const p = phraseRef.current;
    if (!p.length) return;
    acceptingRef.current = false;
    playPhrase(p);
    if (playbackRef.current) clearTimeout(playbackRef.current);
    playbackRef.current = setTimeout(
      () => {
        acceptingRef.current = roundActiveRef.current;
      },
      playbackDurationS(p.length) * 1000 + PLAYBACK_TAIL_MS,
    );
  }, [playPhrase]);

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
      levelIdx + 1 < CALL_RESPONSE_LEVELS.length;
    return (
      <GameShell title="Call & Response" pitch={pitch} onExit={onExit}>
        <div className="text-center">
          <div className="text-5xl">{correct === total ? "🏆" : "👂"}</div>
          <h2 className="mt-3 text-2xl font-bold">{level.name} complete</h2>
          <p className="mt-2 text-slate-300">
            {correct} / {total} phrases · best streak {maxStreak}
          </p>
          {unlocked && (
            <p className="mt-2 font-semibold text-emerald-400">
              🔓 Unlocked: {CALL_RESPONSE_LEVELS[levelIdx + 1].name}
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
  const anchor = phrase.length ? noteFromMidi(phrase[0]) : null;

  return (
    <GameShell
      title="Call & Response"
      pitch={pitch}
      streak={streak}
      bestStreak={bestStreak}
      onExit={quitToSelect}
    >
      <div className="w-full">
        {/* progress + timer */}
        <div className="mb-4 flex items-center justify-between text-xs text-slate-500">
          <span>
            Phrase {round + 1} / {level.rounds}
          </span>
          <span className="tabular-nums">
            {listening ? "listen…" : `${remaining.toFixed(1)}s`}
          </span>
        </div>
        <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
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

        {/* phrase card */}
        <div
          className={`mx-auto flex w-full max-w-sm flex-col items-center justify-center rounded-3xl px-4 py-8 ring-2 transition ${bannerClass}`}
        >
          <span className="text-xs uppercase tracking-widest text-slate-400">
            {listening
              ? "Listen…"
              : feedback === "correct"
                ? "Nailed it!"
                : feedback === "miss"
                  ? "It was"
                  : "Play it back"}
          </span>

          {/* note dots — matched notes reveal their names */}
          <div className="mt-5 flex items-center gap-3">
            {phrase.map((m, i) => {
              const revealed = i < matched || feedback === "miss";
              const isNext =
                i === matched && feedback === "idle" && !listening;
              return (
                <div
                  key={i}
                  className={`flex h-14 w-14 items-center justify-center rounded-full text-sm font-bold transition ${
                    i < matched
                      ? "bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-400/60"
                      : feedback === "miss"
                        ? "bg-rose-500/10 text-rose-300 ring-2 ring-rose-500/40"
                        : isNext
                          ? "animate-pulse bg-slate-800 text-slate-500 ring-2 ring-slate-500"
                          : "bg-slate-800/70 text-slate-600 ring-2 ring-slate-700/60"
                  }`}
                >
                  {revealed
                    ? formatNote(noteFromMidi(m), pitch.useFlats)
                    : i === 0 && anchor
                      ? formatNote(anchor, pitch.useFlats)
                      : "?"}
                </div>
              );
            })}
          </div>

          {feedback === "idle" && !listening && anchor && (
            <p className="mt-4 text-xs text-slate-400">
              starts on{" "}
              <span className="font-semibold text-emerald-300">
                {formatNote(anchor, pitch.useFlats)}
              </span>
            </p>
          )}

          {/* miss reveal: where the phrase lives in first position */}
          {feedback === "miss" && (
            <div className="mt-5 w-full">
              <Fretboard
                highlights={phrase.flatMap((m, i) => {
                  const tab = noteToTab(m);
                  return tab ? [{ ...tab, label: String(i + 1) }] : [];
                })}
              />
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={replayPhrase}
              disabled={listening || feedback !== "idle"}
              className="rounded-lg bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-700 active:scale-95 disabled:opacity-40"
            >
              🔊 Replay
            </button>
            <button
              onClick={() => handleMiss()}
              disabled={listening || feedback !== "idle"}
              className="rounded-lg px-3 py-1.5 text-xs text-slate-500 transition hover:text-slate-300 disabled:opacity-40"
            >
              Reveal ↷
            </button>
          </div>
        </div>

        {/* wrong-note hint */}
        <div className="mt-4 h-6 text-center text-sm">
          {wrongNote && feedback === "idle" && !listening && (
            <span className="text-amber-300/80">
              heard {pitchClassName(wrongNote.pitchClass, pitch.useFlats)}
              {wrongNote.octave} — try again from note {matched + 1}
            </span>
          )}
          {feedback === "correct" && (
            <span className="font-semibold text-emerald-400">
              Perfect echo! +1
            </span>
          )}
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
          Call & Response
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
          The app plays a phrase; echo it back note by note. The first note's
          name is shown — the rest is your ear. Clear ~60% to unlock the next
          level.
        </p>
        {CALL_RESPONSE_LEVELS.map((lvl, idx) => {
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
                {lvl.rounds} phrases
                <br />
                {lvl.phraseLen} notes each
              </div>
            </button>
          );
        })}
      </main>
    </div>
  );
}
