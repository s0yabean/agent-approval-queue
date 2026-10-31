import { dedupeKeyFor } from "./dedupe";
import { clampScores, prioritySort } from "./scoring";
import { getStore } from "./store";
import type { DraftItem, DraftProposal, DraftStatus, ReviewDecision } from "./types";
import { newItem } from "./validate";

/** Thrown when an action does not fit the item's current state. Maps to HTTP 409. */
export class StateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateError";
  }
}

export async function listDrafts(status?: DraftStatus) {
  const items = await getStore().list();
  return items.filter((item) => !status || item.status === status).sort(prioritySort);
}

export async function createDraft(proposal: DraftProposal) {
  const item = newItem(proposal);
  return getStore().insert(item, dedupeKeyFor(item));
}

/**
 * Agents may revise a draft (new text, better scores, more sources) while it
 * is still pending. Once a human has decided, the agent cannot change it.
 */
export async function reviseDraft(id: string, patch: Partial<DraftProposal>) {
  const store = getStore();
  const existing = await store.get(id);
  if (!existing) return null;
  if (existing.status !== "pending") {
    throw new StateError(`Draft is already ${existing.status}; agents can only revise pending drafts`);
  }

  const { scores, dedupeKey: _ignored, ...rest } = patch;
  const updated: DraftItem = {
    ...existing,
    ...rest,
    context: patch.context ? { ...existing.context, ...definedOnly(patch.context) } : existing.context,
    scores: clampScores(scores, existing.scores),
    updatedAt: new Date().toISOString()
  };
  return store.replace(updated);
}

function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** The human decision. `finalText` lets the reviewer edit before approving. */
export async function reviewDraft(
  id: string,
  decision: ReviewDecision,
  options: { finalText?: string; note?: string } = {}
) {
  const store = getStore();
  const item = await store.get(id);
  if (!item) return null;
  const now = new Date().toISOString();

  if (decision === "reset") {
    if (item.status === "exported") throw new StateError("Exported drafts cannot be reopened");
    return store.replace({
      ...item,
      status: "pending",
      updatedAt: now,
      review: { finalText: null, edited: false, note: null, decidedAt: null }
    });
  }

  if (item.status !== "pending") {
    throw new StateError(`Draft is already ${item.status}; reset it first`);
  }

  const finalText = decision === "approve" ? (options.finalText?.trim() || item.draft) : null;
  return store.replace({
    ...item,
    status: decision === "approve" ? "approved" : "rejected",
    updatedAt: now,
    review: {
      finalText,
      edited: finalText !== null && finalText !== item.draft,
      note: options.note?.trim() || null,
      decidedAt: now
    }
  });
}

/**
 * Hand approved drafts to whatever sends them, and retire exactly that batch.
 * Passing explicit IDs means an item approved while the export is running is
 * not swept into it by accident.
 */
export async function exportApproved(ids?: string[]) {
  const store = getStore();
  const wanted = ids ? new Set(ids) : null;
  const batch = (await store.list()).filter(
    (item) => item.status === "approved" && (!wanted || wanted.has(item.id))
  );
  const now = new Date().toISOString();
  const exported: DraftItem[] = [];
  for (const item of batch) {
    const saved = await store.replace({ ...item, status: "exported", updatedAt: now });
    if (saved) exported.push(saved);
  }
  return exported.sort(prioritySort);
}

const CSV_COLUMNS: Array<[string, (item: DraftItem) => string]> = [
  ["id", (i) => i.id],
  ["status", (i) => i.status],
  ["agent", (i) => i.agent],
  ["channel", (i) => i.channel],
  ["action", (i) => i.action],
  ["context_url", (i) => i.context?.url ?? ""],
  ["context_author", (i) => i.context?.author ?? ""],
  ["final_text", (i) => i.review.finalText ?? i.draft],
  ["edited_by_reviewer", (i) => String(i.review.edited)],
  ["review_note", (i) => i.review.note ?? ""],
  ["confidence", (i) => String(i.scores.confidence)],
  ["risk", (i) => String(i.scores.risk)],
  ["approved_at", (i) => i.review.decidedAt ?? ""]
];

export function toCsv(items: DraftItem[]) {
  const escape = (cell: string) => `"${cell.replaceAll('"', '""')}"`;
  const header = CSV_COLUMNS.map(([name]) => name);
  const rows = items.map((item) => CSV_COLUMNS.map(([, get]) => get(item)));
  return [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}
