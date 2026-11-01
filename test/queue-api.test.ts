/**
 * The API contract from docs/api.md, exercised against the real route handlers
 * and the JSON store. Each test gets its own temp directory as the working
 * directory, so data/queue.json is created fresh there and never touches the
 * repo's data folder. No server, no network, no Supabase.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftItem } from "@/lib/types";

type Routes = {
  queue: typeof import("@/app/api/queue/route");
  item: typeof import("@/app/api/queue/[id]/route");
  approval: typeof import("@/app/api/queue/[id]/approval/route");
  exporter: typeof import("@/app/api/export/route");
};

const BASE = "http://127.0.0.1:8790";
let tmp: string;
let routes: Routes;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "approval-queue-"));
  vi.spyOn(process, "cwd").mockReturnValue(tmp);
  // Force the JSON store, whatever the developer's shell has set.
  for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VERCEL", "QUEUE_API_SECRET"]) {
    vi.stubEnv(key, "");
  }
  // The store resolves its file path at import time, so load the modules after cwd is stubbed.
  vi.resetModules();
  routes = {
    queue: await import("@/app/api/queue/route"),
    item: await import("@/app/api/queue/[id]/route"),
    approval: await import("@/app/api/queue/[id]/approval/route"),
    exporter: await import("@/app/api/export/route")
  };
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await fs.rm(tmp, { recursive: true, force: true });
});

function req(url: string, init: { method?: string; body?: unknown; rawBody?: string; headers?: Record<string, string> } = {}) {
  const body = init.rawBody ?? (init.body === undefined ? undefined : JSON.stringify(init.body));
  return new NextRequest(`${BASE}${url}`, {
    method: init.method ?? "GET",
    body,
    headers: { "content-type": "application/json", ...init.headers }
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    agent: "support-agent",
    channel: "Email",
    action: "Reply",
    context: { author: "Sam", text: "How do I reset my password?", url: "https://support.example.com/tickets/77" },
    draft: "Hi Sam, use the Forgot password link on the sign-in page.",
    scores: { confidence: 90, relevance: 85, urgency: 40, risk: 5 },
    ...overrides
  };
}

async function submit(overrides: Record<string, unknown> = {}) {
  const res = await routes.queue.POST(req("/api/queue", { method: "POST", body: proposal(overrides) }));
  expect(res.status).toBe(201);
  return ((await res.json()) as { item: DraftItem }).item;
}

async function list(status?: string) {
  const res = await routes.queue.GET(req(`/api/queue${status ? `?status=${status}` : ""}`));
  return { status: res.status, body: (await res.json()) as { ok: boolean; items: DraftItem[]; error?: string } };
}

async function decide(id: string, body: Record<string, unknown>) {
  const res = await routes.approval.POST(req(`/api/queue/${id}/approval`, { method: "POST", body }), ctx(id));
  return { status: res.status, body: (await res.json()) as { ok: boolean; item?: DraftItem; error?: string } };
}

async function storedItems(): Promise<DraftItem[]> {
  return JSON.parse(await fs.readFile(path.join(tmp, "data", "queue.json"), "utf8"));
}

describe("submitting a draft (POST /api/queue)", () => {
  it("creates a pending item with a server id and default review state", async () => {
    const item = await submit();
    expect(item.id).toMatch(/^d_/);
    expect(item.status).toBe("pending");
    expect(item.channel).toBe("email");
    expect(item.action).toBe("reply");
    expect(item.review).toEqual({ finalText: null, edited: false, note: null, decidedAt: null });

    const stored = await storedItems();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(item.id);
  });

  it("ignores id, status and review sent by an agent, so it cannot approve its own work", async () => {
    const item = await submit({
      id: "d_mine",
      status: "approved",
      review: { finalText: "sent", edited: false, note: null, decidedAt: "2026-01-01T00:00:00Z" }
    });
    expect(item.id).not.toBe("d_mine");
    expect(item.status).toBe("pending");
    expect(item.review.decidedAt).toBeNull();
  });

  it("clamps scores to 0-100 and fills missing ones with 50", async () => {
    const item = await submit({ scores: { confidence: 140, risk: -3, relevance: 72.6 } });
    expect(item.scores).toEqual({ confidence: 100, relevance: 73, urgency: 50, risk: 0 });
  });

  it.each([
    ["an array body", { rawBody: "[]" }, /JSON object/],
    ["a body that is not JSON", { rawBody: "not json" }, /JSON object/],
    ["a missing draft", { body: proposal({ draft: "   " }) }, /Missing required field\(s\): draft/],
    ["missing agent and channel", { body: { draft: "hello" } }, /agent, channel/],
    ["a relative context.url", { body: proposal({ context: { url: "/tickets/77" } }) }, /absolute URL/],
    ["scores that are not an object", { body: proposal({ scores: 5 }) }, /scores must be an object/]
  ])("rejects %s with 400 and stores nothing", async (_label, init, message) => {
    const res = await routes.queue.POST(req("/api/queue", { method: "POST", ...init }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(message);
    expect((await list()).body.items).toHaveLength(0);
  });

  it("returns 409 with the existing id for the same source URL, ignoring tracking params and www", async () => {
    const first = await submit({ context: { url: "https://support.example.com/tickets/77" } });
    const res = await routes.queue.POST(
      req("/api/queue", {
        method: "POST",
        body: proposal({ context: { url: "https://WWW.support.example.com/tickets/77/?utm_source=x#top" } })
      })
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { duplicate: { key: string; existingId: string } };
    expect(body.duplicate.existingId).toBe(first.id);
    expect(body.duplicate.key).toBe("url:support.example.com/tickets/77");
  });

  it("uses an explicit dedupeKey over the URL", async () => {
    await submit({ dedupeKey: "ticket-77", context: { url: "https://a.example.com/1" } });
    const res = await routes.queue.POST(
      req("/api/queue", { method: "POST", body: proposal({ dedupeKey: "ticket-77", context: { url: "https://b.example.com/2" } }) })
    );
    expect(res.status).toBe(409);
  });

  it("requires the shared secret header when QUEUE_API_SECRET is set", async () => {
    vi.stubEnv("QUEUE_API_SECRET", "test-secret");
    const denied = await routes.queue.POST(req("/api/queue", { method: "POST", body: proposal() }));
    expect(denied.status).toBe(401);
    const wrong = await routes.queue.POST(
      req("/api/queue", { method: "POST", body: proposal(), headers: { "x-queue-api-secret": "nope" } })
    );
    expect(wrong.status).toBe(401);
    const allowed = await routes.queue.POST(
      req("/api/queue", { method: "POST", body: proposal(), headers: { "x-queue-api-secret": "test-secret" } })
    );
    expect(allowed.status).toBe(201);
  });

  it("does not allow deleting drafts through the API", async () => {
    const res = routes.queue.DELETE();
    expect(res.status).toBe(405);
  });
});

describe("listing (GET /api/queue)", () => {
  it("returns items highest priority first and filters by status", async () => {
    const low = await submit({ dedupeKey: "low", scores: { confidence: 40, relevance: 40, urgency: 10, risk: 60 } });
    const high = await submit({ dedupeKey: "high", scores: { confidence: 95, relevance: 95, urgency: 90, risk: 0 } });
    const mid = await submit({ dedupeKey: "mid", scores: { confidence: 70, relevance: 70, urgency: 50, risk: 20 } });

    const all = await list();
    expect(all.status).toBe(200);
    expect(all.body.items.map((i) => i.id)).toEqual([high.id, mid.id, low.id]);

    await decide(mid.id, { decision: "reject" });
    expect((await list("pending")).body.items.map((i) => i.id)).toEqual([high.id, low.id]);
    expect((await list("rejected")).body.items.map((i) => i.id)).toEqual([mid.id]);
  });

  it("rejects an unknown status filter", async () => {
    const res = await list("sent");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status must be one of/);
  });

  it("returns one item by id, or 404", async () => {
    const item = await submit();
    const found = await routes.item.GET(req(`/api/queue/${item.id}`), ctx(item.id));
    expect(found.status).toBe(200);
    expect(((await found.json()) as { item: DraftItem }).item.draft).toBe(item.draft);
    const missing = await routes.item.GET(req("/api/queue/d_nope"), ctx("d_nope"));
    expect(missing.status).toBe(404);
  });
});

describe("review decisions (POST /api/queue/:id/approval)", () => {
  it("approve as written: finalText is the agent draft and edited is false", async () => {
    const item = await submit();
    const { status, body } = await decide(item.id, { decision: "approve" });
    expect(status).toBe(200);
    expect(body.item?.status).toBe("approved");
    expect(body.item?.review.finalText).toBe(item.draft);
    expect(body.item?.review.edited).toBe(false);
    expect(body.item?.review.decidedAt).toBeTruthy();
  });

  it("approve with edits records the new text, the edit flag and the note", async () => {
    const item = await submit();
    const { body } = await decide(item.id, {
      decision: "approve",
      finalText: "  Hi Sam, click Forgot password; the link lasts 30 minutes.  ",
      note: " lead with the link "
    });
    expect(body.item?.review).toMatchObject({
      finalText: "Hi Sam, click Forgot password; the link lasts 30 minutes.",
      edited: true,
      note: "lead with the link"
    });
    // The agent's original draft is kept for comparison.
    expect(body.item?.draft).toBe(item.draft);
  });

  it("reject clears finalText; a decided item must be reset before deciding again", async () => {
    const item = await submit();
    const rejected = await decide(item.id, { decision: "reject", note: "wrong policy" });
    expect(rejected.body.item?.status).toBe("rejected");
    expect(rejected.body.item?.review).toMatchObject({ finalText: null, edited: false, note: "wrong policy" });

    const again = await decide(item.id, { decision: "approve" });
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/already rejected; reset it first/);

    const reset = await decide(item.id, { decision: "reset" });
    expect(reset.body.item?.status).toBe("pending");
    expect(reset.body.item?.review).toEqual({ finalText: null, edited: false, note: null, decidedAt: null });

    expect((await decide(item.id, { decision: "approve" })).body.item?.status).toBe("approved");
  });

  it("rejects an unknown decision with 400 and an unknown id with 404", async () => {
    const item = await submit();
    expect((await decide(item.id, { decision: "send" })).status).toBe(400);
    expect((await decide(item.id, {})).status).toBe(400);
    expect((await decide("d_nope", { decision: "approve" })).status).toBe(404);
  });
});

describe("agent revisions (PATCH /api/queue/:id)", () => {
  async function patch(id: string, body: unknown) {
    const res = await routes.item.PATCH(req(`/api/queue/${id}`, { method: "PATCH", body }), ctx(id));
    return { status: res.status, body: (await res.json()) as { item?: DraftItem; error?: string } };
  }

  it("merges scores and context into a pending draft and replaces other fields", async () => {
    const item = await submit();
    const { status, body } = await patch(item.id, {
      draft: "Hi Sam, click Forgot password on the sign-in page.",
      scores: { confidence: 94 },
      context: { text: "updated question" },
      status: "approved"
    });
    expect(status).toBe(200);
    expect(body.item?.draft).toBe("Hi Sam, click Forgot password on the sign-in page.");
    expect(body.item?.scores).toEqual({ confidence: 94, relevance: 85, urgency: 40, risk: 5 });
    expect(body.item?.context).toMatchObject({ author: "Sam", url: item.context?.url, text: "updated question" });
    expect(body.item?.status).toBe("pending");
  });

  it("returns 409 once a human has decided, 400 for an empty patch and 404 for an unknown id", async () => {
    const item = await submit();
    expect((await patch(item.id, {})).status).toBe(400);
    expect((await patch("d_nope", { draft: "x" })).status).toBe(404);

    await decide(item.id, { decision: "approve" });
    const late = await patch(item.id, { draft: "sneaky change" });
    expect(late.status).toBe(409);
    const [stored] = await storedItems();
    expect(stored.draft).toBe(item.draft);
  });
});

describe("export (GET / POST /api/export)", () => {
  async function approvedPair() {
    const a = await submit({ dedupeKey: "a", draft: 'She said "hi", then left' });
    const b = await submit({ dedupeKey: "b" });
    const pending = await submit({ dedupeKey: "c" });
    await decide(a.id, { decision: "approve" });
    await decide(b.id, { decision: "approve", finalText: "edited text" });
    return { a, b, pending };
  }

  it("GET peeks at approved items without changing their status", async () => {
    const { a, b } = await approvedPair();
    const res = await routes.exporter.GET(req("/api/export?format=json"));
    const body = (await res.json()) as { count: number; items: DraftItem[] };
    expect(body.count).toBe(2);
    expect(body.items.map((i) => i.id).sort()).toEqual([a.id, b.id].sort());
    expect((await list("approved")).body.items).toHaveLength(2);
    expect((await list("exported")).body.items).toHaveLength(0);
  });

  it("POST exports exactly the requested ids and retires them, so nothing is sent twice", async () => {
    const { a, b } = await approvedPair();
    const res = await routes.exporter.POST(req("/api/export?format=json", { method: "POST", body: { ids: [a.id] } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: DraftItem[] };
    expect(body.items.map((i) => i.id)).toEqual([a.id]);
    expect(body.items[0].status).toBe("exported");

    expect((await list("approved")).body.items.map((i) => i.id)).toEqual([b.id]);

    const rest = await routes.exporter.POST(req("/api/export?format=json", { method: "POST", body: {} }));
    expect(((await rest.json()) as { items: DraftItem[] }).items.map((i) => i.id)).toEqual([b.id]);

    const empty = await routes.exporter.POST(req("/api/export", { method: "POST", body: {} }));
    expect(empty.status).toBe(409);
  });

  it("exported drafts cannot be reopened", async () => {
    const { a } = await approvedPair();
    await routes.exporter.POST(req("/api/export?format=json", { method: "POST", body: { ids: [a.id] } }));
    const reset = await decide(a.id, { decision: "reset" });
    expect(reset.status).toBe(409);
    expect(reset.body.error).toMatch(/cannot be reopened/);
  });

  it("CSV is the default: header row, final (edited) text, quotes escaped", async () => {
    const { a, b } = await approvedPair();
    const res = await routes.exporter.POST(req("/api/export", { method: "POST", body: {} }));
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="approved-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(res.headers.get("x-exported-count")).toBe("2");

    const lines = (await res.text()).split("\n");
    expect(lines[0]).toBe(
      '"id","status","agent","channel","action","context_url","context_author","final_text","edited_by_reviewer","review_note","confidence","risk","approved_at"'
    );
    expect(lines).toHaveLength(3);
    const rowA = lines.find((line) => line.startsWith(`"${a.id}"`))!;
    const rowB = lines.find((line) => line.startsWith(`"${b.id}"`))!;
    expect(rowA).toContain('"She said ""hi"", then left","false"');
    expect(rowB).toContain('"edited text","true"');
  });
});

describe("JSON store seeding", () => {
  it("starts from data/seed.json on first run when one exists", async () => {
    const seed = JSON.parse(await fs.readFile(new URL("../data/seed.json", import.meta.url), "utf8")) as DraftItem[];
    await fs.mkdir(path.join(tmp, "data"), { recursive: true });
    await fs.writeFile(path.join(tmp, "data", "seed.json"), JSON.stringify(seed));

    const { body } = await list();
    expect(body.items).toHaveLength(seed.length);
    expect(await storedItems()).toHaveLength(seed.length);
  });
});
