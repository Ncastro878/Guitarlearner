/**
 * FretQuiz — fretboard-geography quiz. The only mode that needs no
 * microphone: a fret lights up on the neck diagram and the player names the
 * note against the clock, by tapping a note button or typing on a keyboard.
 *
 * Keyboard input: letters A–G stage a natural (briefly, so a modifier can
 * follow); "#" (or "3") sharpens and submits, "b" flattens and submits
 * ("b" with nothing staged stages B natural); Enter submits immediately;
 * otherwise the staged letter auto-submits after a short beat. One guess
 * per question — a wrong answer or a timeout reveals the note and resets
 * the streak.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Fretboard } from "../components/Fretboard";
import { NeckHeatmap } from "../components/NeckHeatmap";
import { STANDARD_TUNING } from "../lib/guitar";
import { mod12, parseNote, pitchClassName, type PitchClass } from "../lib/theory";
import { playError, playSuccess } from "../lib/tones";
import { useFretQuizMemory } from "../store/fretQuizMemory";
import {
  FRET_QUIZ_LEVELS,
  cardId,
  isCorrectAnswer,
  levelMastery,
  nextQuestionWeighted,
  type FretQuizLevel,
  type FretQuizMemory,
  type FretQuizQuestion,
} from "./fretQuiz";

type Phase = "select" | "playing" | "done";
type Feedback = "idle" | "correct" | "miss";

interface FretQuizProps {
  useFlats: boolean;
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

const ADVANCE_OK_MS = 900;
const ADVANCE_MISS_MS = 2000;
/** How long a typed letter waits for a #/b modifier before auto-submitting. */
const STAGE_MS = 650;
/** Fraction of a level's rounds you must land to unlock the next level. */
const UNLOCK_ACCURACY = 0.6;

const stringLabel = (n: number) =>
  STANDARD_TUNING.find((s) => s.number === n)?.label ?? `string ${n}`;

export function FretQuiz({
  useFlats,
  soundEffects,
  bestStreak,
  unlockedLevel,
  onRecord,
  onExit,
}: FretQuizProps) {
  const [phase, setPhase] = useState<Phase>("select");
  const [levelIdx, setLevelIdx] = useState(0);
  const [round, setRound] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [question, setQuestion] = useState<FretQuizQuestion | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>("idle");
  const [staged, setStaged] = useState<PitchClass | null>(null);
  const [answered, setAnswered] = useState<PitchClass | null>(null);

  const level: FretQuizLevel = FRET_QUIZ_LEVELS[levelIdx];

  // Spaced-repetition memory: every position is a Leitner card; misses drop
  // it to box 0 (asked often), correct answers promote it (asked rarely).
  const { memory, record, reset: resetMemory } = useFretQuizMemory();
  const memoryRef = useRef(memory);
  memoryRef.current = memory;
  const recordRef = useRef(record);
  recordRef.current = record;
  /** Card ids of the last few questions, damped to avoid ping-ponging. */
  const recentRef = useRef<string[]>([]);

  // Refs the async callbacks/timers read so they never see stale values.
  const acceptingRef = useRef(false);
  const questionRef = useRef<FretQuizQuestion | null>(null);
  const roundRef = useRef(0);
  const levelIdxRef = useRef(0);
  const streakRef = useRef(0);
  const maxStreakRef = useRef(0);
  const correctRef = useRef(0);
  const stagedRef = useRef<PitchClass | null>(null);
  const soundRef = useRef(soundEffects);
  soundRef.current = soundEffects;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (advanceRef.current) clearTimeout(advanceRef.current);
    if (stageRef.current) clearTimeout(stageRef.current);
    timerRef.current = null;
    advanceRef.current = null;
    stageRef.current = null;
  }, []);

  const clearStaged = useCallback(() => {
    if (stageRef.current) clearTimeout(stageRef.current);
    stageRef.current = null;
    stagedRef.current = null;
    setStaged(null);
  }, []);

  // --- round lifecycle ---------------------------------------------------

  const beginRound = useCallback(
    (roundIndex: number) => {
      const lvl = FRET_QUIZ_LEVELS[levelIdxRef.current];
      const q = nextQuestionWeighted(
        lvl,
        memoryRef.current,
        questionRef.current,
        recentRef.current,
      );
      questionRef.current = q;
      recentRef.current = [cardId(q), ...recentRef.current].slice(0, 3);
      roundRef.current = roundIndex;

      setQuestion(q);
      setRound(roundIndex);
      setFeedback("idle");
      setAnswered(null);
      setRemaining(lvl.timeLimit);
      clearStaged();
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
    },
    [clearStaged],
  );

  const scheduleAdvance = useCallback(
    (delayMs: number) => {
      advanceRef.current = setTimeout(() => {
        const next = roundRef.current + 1;
        const lvl = FRET_QUIZ_LEVELS[levelIdxRef.current];
        if (next >= lvl.rounds) {
          finishLevelRef.current();
        } else {
          beginRound(next);
        }
      }, delayMs);
    },
    [beginRound],
  );

  const submitAnswer = useCallback(
    (pc: PitchClass) => {
      if (!acceptingRef.current || !questionRef.current) return;
      acceptingRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      clearStaged();
      setAnswered(mod12(pc));
      recordRef.current(
        questionRef.current,
        isCorrectAnswer(questionRef.current, pc),
      );

      if (isCorrectAnswer(questionRef.current, pc)) {
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
      } else {
        streakRef.current = 0;
        setStreak(0);
        setFeedback("miss");
        if (soundRef.current) playError();
        scheduleAdvance(ADVANCE_MISS_MS);
      }
    },
    [clearStaged, scheduleAdvance],
  );

  const handleTimeout = useCallback(() => {
    if (!acceptingRef.current) return;
    acceptingRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    clearStaged();
    setAnswered(null);
    if (questionRef.current) recordRef.current(questionRef.current, false);
    streakRef.current = 0;
    setStreak(0);
    setFeedback("miss");
    if (soundRef.current) playError();
    scheduleAdvance(ADVANCE_MISS_MS);
  }, [clearStaged, scheduleAdvance]);

  const handleTimeoutRef = useRef(handleTimeout);
  handleTimeoutRef.current = handleTimeout;

  const finishLevel = useCallback(() => {
    clearTimers();
    acceptingRef.current = false;
    const lvl = FRET_QUIZ_LEVELS[levelIdxRef.current];
    const unlocked =
      correctRef.current >= Math.ceil(lvl.rounds * UNLOCK_ACCURACY) &&
      levelIdxRef.current + 1 < FRET_QUIZ_LEVELS.length;
    onRecord({
      streak: maxStreakRef.current,
      correct: correctRef.current,
      reachedLevel: unlocked ? levelIdxRef.current + 1 : undefined,
    });
    setPhase("done");
  }, [clearTimers, onRecord]);

  const finishLevelRef = useRef(finishLevel);
  finishLevelRef.current = finishLevel;

  // --- typed input ---------------------------------------------------------

  const stageLetter = useCallback(
    (pc: PitchClass) => {
      stagedRef.current = mod12(pc);
      setStaged(mod12(pc));
      if (stageRef.current) clearTimeout(stageRef.current);
      stageRef.current = setTimeout(() => {
        if (stagedRef.current !== null) submitAnswer(stagedRef.current);
      }, STAGE_MS);
    },
    [submitAnswer],
  );

  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (!acceptingRef.current) return;
      const k = e.key.toLowerCase();
      if (k === "b" && stagedRef.current !== null) {
        submitAnswer(stagedRef.current - 1); // flat modifier
      } else if (k >= "a" && k <= "g" && k.length === 1) {
        stageLetter(parseNote(k).pitchClass);
      } else if ((k === "#" || k === "3") && stagedRef.current !== null) {
        submitAnswer(stagedRef.current + 1); // sharp modifier
      } else if (k === "enter" && stagedRef.current !== null) {
        submitAnswer(stagedRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, stageLetter, submitAnswer]);

  useEffect(() => clearTimers, [clearTimers]);

  // --- actions -----------------------------------------------------------

  const startLevel = useCallback(
    (idx: number) => {
      clearTimers();
      levelIdxRef.current = idx;
      questionRef.current = null;
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
    [clearTimers, beginRound],
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
        <Header bestStreak={bestStreak} onExit={onExit} />
        <main className="flex flex-1 flex-col gap-3">
          <p className="text-sm text-slate-400">
            A fret lights up — name the note before the clock runs out. Tap a
            note or type A–G (add # or b). No guitar or mic needed. Clear ~60%
            to unlock the next level.
          </p>
          <p className="text-xs text-slate-500">
            The quiz remembers every position: ones you miss come back much
            more often, ones you nail fade away.
          </p>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">
            <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Your neck memory
            </p>
            <NeckHeatmap
              memory={memory}
              idFor={(s, f) => cardId({ string: s, fret: f })}
            />
          </div>
          {FRET_QUIZ_LEVELS.map((lvl, idx) => {
            const locked = idx > unlockedLevel;
            const mastery = levelMastery(lvl, memory);
            return (
              <button
                key={lvl.id}
                disabled={locked}
                onClick={() => startLevel(idx)}
                className={`flex items-center justify-between rounded-2xl border p-4 text-left transition active:scale-[0.98] ${
                  locked
                    ? "cursor-not-allowed border-slate-800 bg-slate-900/40 opacity-50"
                    : "border-slate-700/60 bg-slate-900/60 hover:border-emerald-500/60 hover:bg-slate-800/60"
                }`}
              >
                <div className="min-w-0 flex-1">
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
                  {!locked && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1 w-24 overflow-hidden rounded-full bg-slate-800">
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
                  )}
                </div>
                <div className="ml-3 shrink-0 text-right text-[10px] text-slate-500">
                  {lvl.rounds} frets
                  <br />
                  {lvl.timeLimit}s each
                </div>
              </button>
            );
          })}
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
    const total = level.rounds;
    const unlocked =
      correct >= Math.ceil(total * UNLOCK_ACCURACY) &&
      levelIdx + 1 < FRET_QUIZ_LEVELS.length;
    return (
      <div className="flex min-h-full flex-1 flex-col">
        <Header bestStreak={bestStreak} onExit={onExit} />
        <main className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="text-5xl">{correct === total ? "🏆" : "🧠"}</div>
          <h2 className="mt-3 text-2xl font-bold">{level.name} complete</h2>
          <p className="mt-2 text-slate-300">
            {correct} / {total} named · best streak {maxStreak}
          </p>
          {unlocked && (
            <p className="mt-2 font-semibold text-emerald-400">
              🔓 Unlocked: {FRET_QUIZ_LEVELS[levelIdx + 1].name}
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
        </main>
      </div>
    );
  }

  // phase === "playing"
  const timeFrac = level.timeLimit > 0 ? remaining / level.timeLimit : 0;
  const answerName = question
    ? pitchClassName(mod12(question.midi), useFlats)
    : "";
  const highlight = question
    ? [
        feedback === "idle"
          ? {
              string: question.string,
              fret: question.fret,
              label: "?",
              color: "#f59e0b",
              stroke: "#92400e",
            }
          : {
              string: question.string,
              fret: question.fret,
              label: answerName,
              color: feedback === "correct" ? "#10b981" : "#f43f5e",
              stroke: feedback === "correct" ? "#065f46" : "#881337",
            },
      ]
    : [];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mb-4 flex items-center justify-between">
        <button
          onClick={quitToSelect}
          className="rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 active:scale-95"
        >
          ← Menu
        </button>
        <h1 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Fret Quiz
        </h1>
        <div className="min-w-[4.5rem] text-right text-sm">
          <span className="text-lg font-bold text-emerald-400 tabular-nums">
            {streak}
          </span>
          <span className="text-slate-500"> streak</span>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* progress + timer */}
        <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
          <span>
            Fret {round + 1} / {level.rounds}
          </span>
          <span className="tabular-nums">{remaining.toFixed(1)}s</span>
        </div>
        <div className="mb-5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
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

        {/* the neck */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">
          <Fretboard highlights={highlight} minFrets={level.maxFret} />
          <p className="mt-1 text-center text-xs text-slate-500">
            {question && (
              <>
                <span className="font-semibold text-slate-300">
                  {stringLabel(question.string)}
                </span>{" "}
                string ·{" "}
                {question.fret === 0 ? "open" : `fret ${question.fret}`}
                {isGap(memory, question) && (
                  <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                    🎯 drilling a gap
                  </span>
                )}
              </>
            )}
          </p>
        </div>

        {/* feedback line */}
        <div className="mt-3 h-6 text-center text-sm">
          {feedback === "correct" && (
            <span className="font-semibold text-emerald-400">
              Correct — {answerName}! +1
            </span>
          )}
          {feedback === "miss" && (
            <span className="text-rose-400">
              It was {answerName}
              {answered !== null &&
                ` — you said ${pitchClassName(answered, useFlats)}`}
            </span>
          )}
          {feedback === "idle" && staged !== null && (
            <span className="text-slate-300">
              {pitchClassName(staged, useFlats)}… (# / b / Enter)
            </span>
          )}
        </div>

        {/* answer pad */}
        <div className="mt-2 grid grid-cols-6 gap-2">
          {Array.from({ length: 12 }, (_, pc) => (
            <button
              key={pc}
              disabled={feedback !== "idle"}
              onClick={() => submitAnswer(pc)}
              className="rounded-xl bg-slate-800 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-700 active:scale-95 disabled:opacity-40"
            >
              {pitchClassName(pc, useFlats)}
            </button>
          ))}
        </div>
        <p className="mt-2 text-center text-[10px] text-slate-600">
          keyboard: A–G, then # or b · Enter to send
        </p>
      </main>
    </div>
  );
}

/** A position the player has attempted before and is still on box 0. */
function isGap(memory: FretQuizMemory, q: FretQuizQuestion): boolean {
  const stats = memory[cardId(q)];
  return !!stats && stats.box === 0 && stats.attempts > 0;
}

function Header({
  bestStreak,
  onExit,
}: {
  bestStreak: number;
  onExit: () => void;
}) {
  return (
    <header className="mb-4 flex items-center justify-between">
      <button
        onClick={onExit}
        className="rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 active:scale-95"
      >
        ← Menu
      </button>
      <h1 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
        Fret Quiz
      </h1>
      <div className="min-w-[3rem] text-right text-xs text-slate-500">
        {bestStreak > 0 && `best ${bestStreak}`}
      </div>
    </header>
  );
}
