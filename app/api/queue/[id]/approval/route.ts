import type { NextRequest } from "next/server";
import { errorResponse, json, readJson } from "@/lib/http";
import { reviewDraft } from "@/lib/queue";
import type { ReviewDecision } from "@/lib/types";

const DECISIONS: ReviewDecision[] = ["approve", "reject", "reset"];

/**
 * The reviewer's decision. Used by the UI, not by agents.
 * Body: { decision: "approve" | "reject" | "reset", finalText?: string, note?: string }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await readJson(request)) as { decision?: unknown; finalText?: unknown; note?: unknown } | undefined;
  const decision = body?.decision as ReviewDecision;
  if (!DECISIONS.includes(decision)) {
    return json({ ok: false, error: `decision must be one of ${DECISIONS.join(", ")}` }, 400);
  }

  try {
    const item = await reviewDraft(id, decision, {
      finalText: typeof body?.finalText === "string" ? body.finalText : undefined,
      note: typeof body?.note === "string" ? body.note : undefined
    });
    return item ? json({ ok: true, item }) : json({ ok: false, error: "Draft not found" }, 404);
  } catch (error) {
    return errorResponse(error);
  }
}
