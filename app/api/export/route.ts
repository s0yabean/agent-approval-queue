import type { NextRequest } from "next/server";
import { errorResponse, json, readJson } from "@/lib/http";
import { exportApproved, listDrafts, toCsv } from "@/lib/queue";
import type { DraftItem } from "@/lib/types";

export const dynamic = "force-dynamic";

function respond(items: DraftItem[], format: string | null) {
  if (format === "json") return json({ ok: true, count: items.length, items });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(items), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="approved-${date}.csv"`,
      "X-Exported-Count": String(items.length)
    }
  });
}

/** Read-only peek at what is approved and not yet exported. ?format=csv (default) | json */
export async function GET(request: NextRequest) {
  try {
    return respond(await listDrafts("approved"), request.nextUrl.searchParams.get("format"));
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Export and retire a batch: approved -> exported. The sender (a script, a
 * cron job, a person) runs this, sends what comes back, and never sees the
 * same item twice. Body: { ids?: string[] } (omit to export everything approved).
 */
export async function POST(request: NextRequest) {
  const body = (await readJson(request)) as { ids?: unknown } | undefined;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string") : undefined;
  try {
    const items = await exportApproved(ids);
    if (items.length === 0) return json({ ok: false, error: "No approved drafts to export" }, 409);
    return respond(items, request.nextUrl.searchParams.get("format"));
  } catch (error) {
    return errorResponse(error);
  }
}
