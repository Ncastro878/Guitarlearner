/**
 * srsMemory.ts — generic persisted spaced-repetition memory hook. Each mode
 * that drills with lib/srs.ts gets its own localStorage key.
 */

import { useCallback, useEffect, useState } from "react";
import { recordAnswer, type SrsMemory } from "../lib/srs";
import { loadJSON, saveJSON } from "./storage";

export function useSrsMemory(key: string) {
  const [memory, setMemory] = useState<SrsMemory>(() => loadJSON(key, {}));

  useEffect(() => {
    saveJSON(key, memory);
  }, [key, memory]);

  const record = useCallback((id: string, correct: boolean) => {
    setMemory((m) => recordAnswer(m, id, correct));
  }, []);

  const reset = useCallback(() => setMemory({}), []);

  return { memory, record, reset };
}
