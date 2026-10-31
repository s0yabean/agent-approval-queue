import type { NextRequest } from "next/server";
import { isAuthorizedAgent } from "@/lib/api-auth";
import { errorResponse, json, noDelete, readJson } from "@/lib/http";
import { reviseDraft } from "@/lib/queue";
import { getStore } from "@/lib/store";
import { parseProposal } from "@/lib/validate";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  try {
    const item = await getStore().get(id);
    return item ? json({ ok: true, item }) : json({ ok: false, error: "Draft not found" }, 404);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Agents revise a pending draft. Only agent-owned fields are accepted. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  if (!isAuthorizedAgent(request)) return json({ ok: false, error: "Unauthorized" }, 401);
  const { id } = await params;

  const parsed = parseProposal(await readJson(request), { partial: true });
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);

  try {
    const item = await reviseDraft(id, parsed.value);
    return item ? json({ ok: true, item }) : json({ ok: false, error: "Draft not found" }, 404);
  } catch (error) {
    return errorResponse(error);
  }
}

export const DELETE = noDelete;
