/**
 * storage.ts — thin, typed, defensive wrappers over localStorage.
 *
 * Everything degrades gracefully: if localStorage is unavailable (private
 * mode, disabled, quota) reads return the fallback and writes are no-ops, so
 * the game never crashes over persistence.
 */

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return fallback;
  }
}

export function saveJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore — persistence is best-effort */
  }
}
