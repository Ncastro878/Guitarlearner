/**
 * srs.ts — the shared spaced-repetition core (Leitner boxes, adapted for
 * in-session drilling). Pure and generic: cards are just string ids, so any
 * mode can drill any skill with it. Fret Quiz drills fret positions;
 * Fret Finder drills "find pitch class X in neck zone Y".
 *
 * Every card has a box 0–4. A correct answer promotes it one box; a wrong
 * answer drops it to box 0. Selection samples cards weighted by box —
 * box-0 cards are drawn ~16× as often as box-4 cards, unseen cards land in
 * between so new material keeps flowing in — which concentrates the drill
 * on the player's gaps and lets mastered cards recede. Weight-based rather
 * than calendar-based (Anki's day intervals don't fit a timed round).
 */

export interface CardStats {
  /** Leitner box 0 (weakest) – 4 (mastered). */
  box: number;
  /** Lifetime attempts at this card. */
  attempts: number;
  /** Lifetime correct answers. */
  correct: number;
}

/** Memory across all cards, keyed by card id. */
export type SrsMemory = Record<string, CardStats>;

export const MAX_BOX = 4;
/** Box at or above which a card counts as "solid" for mastery stats. */
export const MASTERY_BOX = 3;
/** Selection weight per box — box 0 is asked 16× as often as box 4. */
const BOX_WEIGHTS = [8, 4, 2, 1, 0.5];
/** Unseen cards sit between "wrong" and "learning" so new material flows in. */
const NEW_WEIGHT = 5;
/** Damping for cards asked in the last few questions (no ping-pong). */
const RECENT_DAMP = 0.2;

/** Fold one answer into the memory (immutably). */
export function recordAnswer(
  memory: SrsMemory,
  id: string,
  correct: boolean,
): SrsMemory {
  const cur = memory[id];
  return {
    ...memory,
    [id]: {
      box: correct ? Math.min(MAX_BOX, (cur?.box ?? 0) + 1) : 0,
      attempts: (cur?.attempts ?? 0) + 1,
      correct: (cur?.correct ?? 0) + (correct ? 1 : 0),
    },
  };
}

/** Selection weight of a card given its stats (unseen = NEW_WEIGHT). */
export function weightFor(stats: CardStats | undefined): number {
  if (!stats) return NEW_WEIGHT;
  return BOX_WEIGHTS[Math.max(0, Math.min(MAX_BOX, stats.box))];
}

/**
 * Pick an item with gap-focused weighting: items are sampled in proportion
 * to their card's weakness, `excludeId` (usually the previous question) is
 * skipped, and anything in `recentIds` is heavily damped.
 */
export function pickWeighted<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  memory: SrsMemory,
  excludeId: string | null = null,
  recentIds: readonly string[] = [],
  rng: () => number = Math.random,
): T {
  let pool = items;
  if (excludeId !== null && items.length > 1) {
    pool = items.filter((it) => idOf(it) !== excludeId);
  }
  const weights = pool.map((it) => {
    const w = weightFor(memory[idOf(it)]);
    return recentIds.includes(idOf(it)) ? w * RECENT_DAMP : w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** How many of the given cards are solid (box ≥ MASTERY_BOX). */
export function masteryCount(
  ids: readonly string[],
  memory: SrsMemory,
): { solid: number; total: number } {
  const solid = ids.filter(
    (id) => (memory[id]?.box ?? 0) >= MASTERY_BOX,
  ).length;
  return { solid, total: ids.length };
}

/** A card the player has attempted before and is still on box 0. */
export function isGapCard(memory: SrsMemory, id: string): boolean {
  const stats = memory[id];
  return !!stats && stats.box === 0 && stats.attempts > 0;
}
