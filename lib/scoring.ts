import type { DraftItem, DraftScores } from "./types";

/**
 * One number to order the deck by. Confidence and relevance carry most of the
 * weight, urgency breaks ties, risk pulls an item down.
 */
export function priority(scores: DraftScores) {
  return Math.round(
    scores.confidence * 0.35 + scores.relevance * 0.35 + scores.urgency * 0.3 - scores.risk * 0.4
  );
}

export type Readiness = "ready" | "polish" | "hold";

/**
 * Quality gate shown on each card. A low-confidence or risky draft still shows
 * up (the human decides), but it is flagged so it gets read closely.
 */
export function readiness(scores: DraftScores): Readiness {
  if (scores.risk >= 50 || scores.confidence < 70) return "hold";
  if (scores.confidence >= 85 && scores.risk <= 20) return "ready";
  return "polish";
}

export const readinessLabel: Record<Readiness, string> = {
  ready: "Ready",
  polish: "Needs polish",
  hold: "Read closely"
};

export function prioritySort(a: DraftItem, b: DraftItem) {
  const diff = priority(b.scores) - priority(a.scores);
  if (diff !== 0) return diff;
  return a.createdAt.localeCompare(b.createdAt);
}

export const DEFAULT_SCORES: DraftScores = {
  confidence: 50,
  relevance: 50,
  urgency: 50,
  risk: 50
};

export function clampScores(input: Partial<DraftScores> | undefined, base = DEFAULT_SCORES): DraftScores {
  const out = { ...base };
  for (const key of Object.keys(base) as Array<keyof DraftScores>) {
    const value = input?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = Math.max(0, Math.min(100, Math.round(value)));
    }
  }
  return out;
}
