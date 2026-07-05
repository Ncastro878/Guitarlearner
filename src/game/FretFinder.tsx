/**
 * FretFinder — the mic-driven counterpart of Fret Quiz. Pick a neck zone
 * (one string, a string pair, or the whole neck); the game names a note and
 * you must play it *in that zone*. The octave check enforces the zone: "G on
 * the D string" is G3, so grabbing the easy G4 on the high E string comes
 * back as "right note, wrong octave for this zone".
 *
 * Uses the shared Leitner memory (one card per zone + pitch class) so notes
 * you can't find in a zone come back more and more, and a naturals-only
 * toggle for the classic learn-the-letters-first path. Misses reveal the
 * spot(s) on the fretboard diagram.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PitchProps } from "../App";
import { Fretboard } from "../components/Fretboard";
import { GameShell } from "../components/GameShell";
import { isGapCard, masteryCount } from "../lib/srs";
import { useSrsMemory } from "../store/srsMemory";
import {
  formatNote,
  noteFromMidi,
  pitchClassName,
  type DetectedNote,
} from "../lib/theory";
import { playError, playSuccess } from "../lib/tones";
import {
  FINDER_ZONES,
  finderCardId,
  judgeFinderNote,
  nextFinderQuestion,
  zonePitchClasses,
  type FinderQuestion,
  type FinderZone,
} from "./fretFinder";

type Phase = "select" | "playing" | "done";
type Feedback = "idle" | "correct" | "miss";

interface FretFinderProps {
  pitch: PitchProps;
  soundEffects: boolean;
  bestStreak: number;
  onRecord: (o: { streak?: number; correct?: number }) => void;
  onExit: () => void;
}

const MEMORY_KEY = "guitarlearner.fretfinder.memory.v1";
const ROUNDS = 10;
const TIME_LIMIT_S = 12;
const ADVANCE_OK_MS = 1100;
const ADVANCE_MISS_MS = 3400;
const WRONG_HINT_MS = 900;

export function FretFinder({
  pitch,
  soundEffects,
  bestStreak,
  onRecord,
  onExit,
}: FretFinderProps) {
  const [phase, setPhase] = useState<Phase>("select");
  const [zoneIdx, setZoneIdx] = useState(0);
  const [naturalsOnly, setNaturalsOnly] = useState(true);
  const [round, setRound] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [question, setQuestion] = useState<FinderQuestion | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>("idle");
  const [heard, setHeard] = useState<{
    note: DetectedNote;
    octaveOnly: boolean;
  } | null>(null);

  const zone: FinderZone = FINDER_ZONES[zoneIdx];

  const { memory, record, reset: resetMemory } = useSrsMemory(MEMORY_KEY);
  const memoryRef = useRef(memory);
  memoryRef.current = memory;
  const recordRef = useRef(record);
  recordRef.current = record;
  const recentRef = useRef<string[]>([]);

  // Refs for async callbacks (exactly-once under StrictMode, no stale reads).
  const acceptingRef = useRef(false);
  const questionRef = useRef<FinderQuestion | null>(null);
  const roundRef = useRef(0);
  const zoneIdxRef = useRef(0);
  const naturalsRef = useRef(true);
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
    const z = FINDER_ZONES[zoneIdxRef.current];
    const q = nextFinderQuestion(
      z,
      naturalsRef.current,
      memoryRef.current,
      questionRef.current?.pc ?? null,
      recentRef.current,
    );
    questionRef.current = q;
    recentRef.current = [
      finderCardId(z.id, q.pc),
      ...recentRef.current,
    ].slice(0, 2);
    roundRef.current = roundIndex;

    setQuestion(q);
    setRound(roundIndex);
    setFeedback("idle");
    setHeard(null);
    setRemaining(TIME_LIMIT_S);
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
  }, []);

  const scheduleAdvance = useCallback(
    (delayMs: number) => {
      advanceRef.current = setTimeout(() => {
        const next = roundRef.current + 1;
        if (next >= ROUNDS) {
          finishRunRef.current();
        } else {
          beginRound(next);
        }
      }, delayMs);
    },
    [beginRound],
  );

  const handleCorrect = useCallback(() => {
    if (!acceptingRef.current || !questionRef.current) return;
    acceptingRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    const z = FINDER_ZONES[zoneIdxRef.current];
    recordRef.current(finderCardId(z.id, questionRef.current.pc), true);
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
    if (!acceptingRef.current || !questionRef.current) return;
    acceptingRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    const z = FINDER_ZONES[zoneIdxRef.current];
    recordRef.current(finderCardId(z.id, questionRef.current.pc), false);
    streakRef.current = 0;
    setStreak(0);
    setFeedback("miss");
    if (soundRef.current) playError();
    scheduleAdvance(ADVANCE_MISS_MS);
  }, [scheduleAdvance]);

  const handleMissRef = useRef(handleMiss);
  handleMissRef.current = handleMiss;

  const finishRun = useCallback(() => {
    clearTimers();
    acceptingRef.current = false;
    onRecord({ streak: maxStreakRef.current, correct: correctRef.current });
    setPhase("done");
  }, [clearTimers, onRecord]);

  const finishRunRef = useRef(finishRun);
  finishRunRef.current = finishRun;

  const showHeard = useCallback((note: DetectedNote, octaveOnly: boolean) => {
    setHeard({ note, octaveOnly });
    if (wrongRef.current) clearTimeout(wrongRef.current);
    wrongRef.current = setTimeout(() => setHeard(null), WRONG_HINT_MS);
  }, []);

  // --- wire the pitch engine ----------------------------------------------

  useEffect(() => {
    if (phase !== "playing") return;
    pitch.registerNoteHandler((note) => {
      if (!acceptingRef.current || !questionRef.current) return;
      const verdict = judgeFinderNote(questionRef.current, note.midi);
      if (verdict === "hit") handleCorrect();
      else showHeard(note, verdict === "wrongOctave");
    });
    return () => pitch.registerNoteHandler(null);
  }, [phase, pitch, handleCorrect, showHeard]);

  useEffect(() => clearTimers, [clearTimers]);

  // --- actions -----------------------------------------------------------

  const startZone = useCallback(
    async (idx: number) => {
      if (!pitch.isListening) {
        await pitch.start();
      }
      clearTimers();
      zoneIdxRef.current = idx;
      naturalsRef.current = naturalsOnly;
      questionRef.current = null;
      recentRef.current = [];
      streakRef.current = 0;
      maxStreakRef.current = 0;
      correctRef.current = 0;
      setZoneIdx(idx);
      setStreak(0);
      setMaxStreak(0);
      setCorrect(0);
      setPhase("playing");
      beginRound(0);
    },
    [pitch, naturalsOnly, clearTimers, beginRound],
  );

  const quitToSelect = useCallback(() => {
    clearTimers();
    acceptingRef.current = false;
    setPhase("select");
  }, [clearTimers]);

  // --- render ------------------------------------------------------------

  if (phase === "select") {
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
            Fret Finder
          </h1>
          <div className="min-w-[3rem] text-right text-xs text-slate-500">
            {bestStreak > 0 && `best ${bestStreak}`}
          </div>
        </header>

        {!pitch.isListening && (
          <div className="mb-4 rounded-xl border border-amber-700/40 bg-amber-950/30 p-3 text-center text-sm text-amber-200">
            Starting a zone will ask for microphone access.
            {pitch.error && (
              <div className="mt-1 text-rose-300">{pitch.error}</div>
            )}
          </div>
        )}

        <main className="flex flex-1 flex-col gap-3">
          <p className="text-sm text-slate-400">
            Pick a zone, get a note name, play it <em>there</em>. The octave
            is checked, so the easy version elsewhere on the neck won't count.
            Notes you can't find come back more often.
          </p>

          <label className="flex items-center justify-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={naturalsOnly}
              onChange={(e) => setNaturalsOnly(e.target.checked)}
              className="h-4 w-4 accent-emerald-500"
            />
            Naturals only (no sharps/flats)
          </label>

          <div className="grid grid-cols-2 gap-2">
            {FINDER_ZONES.map((z, idx) => {
              const ids = zonePitchClasses(naturalsOnly).map((pc) =>
                finderCardId(z.id, pc),
              );
              const mastery = masteryCount(ids, memory);
              return (
                <button
                  key={z.id}
                  onClick={() => startZone(idx)}
                  className={`rounded-2xl border border-slate-700/60 bg-slate-900/60 p-3 text-left transition hover:border-emerald-500/60 hover:bg-slate-800/60 active:scale-[0.98] ${
                    z.id === "all" ? "col-span-2" : ""
                  }`}
                >
                  <div className="font-bold">{z.name}</div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1 w-16 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-emerald-500/80"
                        style={{
                          width: `${(mastery.solid / Math.max(1, mastery.total)) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {mastery.solid}/{mastery.total} solid
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            onClick={resetMemory}
            className="mt-1 self-center rounded-lg px-3 py-2 text-xs text-slate-600 transition hover:text-slate-400"
          >
            Reset drill memory
          </button>
        </main>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <GameShell title="Fret Finder" pitch={pitch} onExit={onExit}>
        <div className="text-center">
          <div className="text-5xl">{correct === ROUNDS ? "🏆" : "🧭"}</div>
          <h2 className="mt-3 text-2xl font-bold">{zone.name} run complete</h2>
          <p className="mt-2 text-slate-300">
            {correct} / {ROUNDS} found · best streak {maxStreak}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => startZone(zoneIdx)}
              className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 active:scale-95"
            >
              Same zone again
            </button>
            <button
              onClick={quitToSelect}
              className="rounded-xl bg-slate-800 px-6 py-3 font-semibold transition hover:bg-slate-700 active:scale-95"
            >
              Choose zone
            </button>
          </div>
        </div>
      </GameShell>
    );
  }

  // phase === "playing"
  const timeFrac = remaining / TIME_LIMIT_S;
  const bannerClass =
    feedback === "correct"
      ? "ring-emerald-400/70 bg-emerald-500/10"
      : feedback === "miss"
        ? "ring-rose-500/60 bg-rose-500/10"
        : "ring-slate-700/60 bg-slate-900/40";
  const isGap =
    question &&
    isGapCard(memoryRef.current, finderCardId(zone.id, question.pc));

  return (
    <GameShell
      title="Fret Finder"
      pitch={pitch}
      streak={streak}
      bestStreak={bestStreak}
      onExit={quitToSelect}
    >
      <div className="w-full">
        {/* progress + timer */}
        <div className="mb-4 flex items-center justify-between text-xs text-slate-500">
          <span>
            Note {round + 1} / {ROUNDS}
          </span>
          <span className="tabular-nums">{remaining.toFixed(1)}s</span>
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

        {/* target card */}
        <div
          className={`mx-auto flex w-full max-w-sm flex-col items-center justify-center rounded-3xl px-4 py-8 ring-2 transition ${bannerClass}`}
        >
          <span className="text-xs uppercase tracking-widest text-slate-400">
            {feedback === "correct"
              ? "Found it!"
              : feedback === "miss"
                ? "It was here"
                : "Find a"}
          </span>
          <span className="my-1 text-7xl font-black leading-none text-slate-50">
            {question ? pitchClassName(question.pc, pitch.useFlats) : ""}
          </span>
          <span className="text-sm text-slate-300">
            on the{" "}
            <span className="font-semibold text-emerald-300">{zone.name}</span>
            {isGap && (
              <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                🎯 drilling a gap
              </span>
            )}
          </span>

          {/* miss reveal: where it lives in this zone */}
          {feedback === "miss" && question && (
            <div className="mt-5 w-full">
              <Fretboard
                highlights={question.positions.map((p) => ({
                  string: p.string,
                  fret: p.fret,
                  label: formatNote(noteFromMidi(p.midi), pitch.useFlats),
                  color: "#f43f5e",
                  stroke: "#881337",
                  labelColor: "#fff1f2",
                }))}
              />
            </div>
          )}
        </div>

        {/* heard hint — the octave message is the teaching moment */}
        <div className="mt-4 h-6 text-center text-sm">
          {heard && feedback === "idle" && (
            <span
              className={
                heard.octaveOnly ? "text-amber-300" : "text-amber-300/80"
              }
            >
              heard {formatNote(heard.note, pitch.useFlats)}
              {heard.octaveOnly
                ? " — right note, wrong octave for this zone"
                : ""}
            </span>
          )}
          {feedback === "correct" && (
            <span className="font-semibold text-emerald-400">
              That's the one! +1
            </span>
          )}
        </div>

        <div className="mt-2 flex justify-center">
          <button
            onClick={() => handleMiss()}
            disabled={feedback !== "idle"}
            className="rounded-lg px-4 py-2 text-xs text-slate-500 transition hover:text-slate-300 disabled:opacity-40"
          >
            Show me ↷
          </button>
        </div>
      </div>
    </GameShell>
  );
}
