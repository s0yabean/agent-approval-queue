import type { NextRequest } from "next/server";
import { isAuthorizedAgent } from "@/lib/api-auth";
import { errorResponse, json, noDelete, readJson } from "@/lib/http";
import { createDraft, listDrafts } from "@/lib/queue";
import type { DraftProposal, DraftStatus } from "@/lib/types";
import { parseProposal } from "@/lib/validate";

export const dynamic = "force-dynamic";

const STATUSES: DraftStatus[] = ["pending", "approved", "rejected", "exported"];

/** List drafts, highest priority first. Optional ?status=pending|approved|rejected|exported */
export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status") as DraftStatus | null;
  if (status && !STATUSES.includes(status)) {
    return json({ ok: false, error: `status must be one of ${STATUSES.join(", ")}` }, 400);
  }
  try {
    return json({ ok: true, items: await listDrafts(status ?? undefined) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Agents submit a new draft. The server assigns the id and starts it as `pending`. */
export async function POST(request: NextRequest) {
  if (!isAuthorizedAgent(request)) return json({ ok: false, error: "Unauthorized" }, 401);

  const parsed = parseProposal(await readJson(request), { partial: false });
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);

  try {
    const item = await createDraft(parsed.value as DraftProposal);
    return json({ ok: true, item }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export const DELETE = noDelete;
