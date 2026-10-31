import { clampScores } from "./scoring";
import type { DraftItem, DraftProposal } from "./types";

const MAX_DRAFT = 10_000;
const MAX_FIELD = 2_000;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function str(value: unknown, max = MAX_FIELD): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function strList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.map((entry) => str(entry, 500)).filter((entry): entry is string => Boolean(entry));
  return list.length ? list.slice(0, 50) : undefined;
}

/**
 * Pull only agent-owned fields out of a request body. Unknown fields, `id`,
 * `status` and `review` are dropped: agents cannot set them.
 */
export function parseProposal(body: unknown, { partial }: { partial: boolean }): Result<Partial<DraftProposal>> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const input = body as Record<string, unknown>;
  const ctx = (input.context && typeof input.context === "object" ? input.context : {}) as Record<string, unknown>;

  const out: Partial<DraftProposal> = {};
  const set = <K extends keyof DraftProposal>(key: K, value: DraftProposal[K] | undefined) => {
    if (value !== undefined) out[key] = value;
  };

  set("agent", str(input.agent, 100));
  set("channel", str(input.channel, 50)?.toLowerCase());
  set("action", str(input.action, 50)?.toLowerCase());
  set("title", str(input.title, 300));
  set("draft", str(input.draft, MAX_DRAFT));
  set("rationale", str(input.rationale));
  set("sources", strList(input.sources));
  set("tags", strList(input.tags));
  set("dedupeKey", str(input.dedupeKey, 500));

  if (input.context !== undefined) {
    const context = { author: str(ctx.author, 200), text: str(ctx.text, MAX_DRAFT), url: str(ctx.url, 2000) };
    if (context.url) {
      try {
        new URL(context.url);
      } catch {
        return { ok: false, error: "context.url must be an absolute URL" };
      }
    }
    set("context", context);
  }

  if (input.scores !== undefined) {
    if (!input.scores || typeof input.scores !== "object") return { ok: false, error: "scores must be an object" };
    out.scores = input.scores as DraftProposal["scores"];
  }

  if (!partial) {
    const missing = (["agent", "channel", "draft"] as const).filter((key) => !out[key]);
    if (missing.length) return { ok: false, error: `Missing required field(s): ${missing.join(", ")}` };
  } else if (Object.keys(out).length === 0) {
    return { ok: false, error: "Nothing to update" };
  }

  return { ok: true, value: out };
}

export function newItem(proposal: DraftProposal, now = new Date().toISOString()): DraftItem {
  return {
    id: `d_${crypto.randomUUID()}`,
    status: "pending",
    agent: proposal.agent,
    channel: proposal.channel,
    action: proposal.action || "message",
    title: proposal.title,
    context: proposal.context,
    draft: proposal.draft,
    rationale: proposal.rationale,
    sources: proposal.sources,
    tags: proposal.tags,
    dedupeKey: proposal.dedupeKey,
    scores: clampScores(proposal.scores),
    createdAt: now,
    updatedAt: now,
    review: { finalText: null, edited: false, note: null, decidedAt: null }
  };
}
