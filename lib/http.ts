import { DuplicateDraftError } from "./dedupe";
import { StateError } from "./queue";

export function json(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, { status, headers });
}

export function errorResponse(error: unknown) {
  if (error instanceof DuplicateDraftError) {
    return json({ ok: false, error: error.message, duplicate: { key: error.key, existingId: error.existingId } }, 409);
  }
  if (error instanceof StateError) {
    return json({ ok: false, error: error.message }, 409);
  }
  return json({ ok: false, error: error instanceof Error ? error.message : "Unexpected error" }, 500);
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export const noDelete = () =>
  json({ ok: false, error: "Drafts cannot be deleted through the API. Reject them instead." }, 405);
