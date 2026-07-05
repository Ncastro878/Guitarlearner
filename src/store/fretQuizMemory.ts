/**
 * fretQuizMemory.ts — persisted spaced-repetition memory for Fret Quiz,
 * following the settings/progress store pattern. The pure box logic lives in
 * game/fretQuiz.ts; this hook just persists it to localStorage.
 */

import { useCallback, useEffect, useState } from "react";
import {
  applyResult,
  type FretQuizMemory,
  type FretQuizQuestion,
} from "../game/fretQuiz";
import { loadJSON, saveJSON } from "./storage";

const KEY = "guitarlearner.fretquiz.memory.v1";

export function useFretQuizMemory() {
  const [memory, setMemory] = useState<FretQuizMemory>(() =>
    loadJSON(KEY, {}),
  );

  useEffect(() => {
    saveJSON(KEY, memory);
  }, [memory]);

  const record = useCallback((question: FretQuizQuestion, correct: boolean) => {
    setMemory((m) => applyResult(m, question, correct));
  }, []);

  const reset = useCallback(() => setMemory({}), []);

  return { memory, record, reset };
}
