import type { NextRequest } from "next/server";

/**
 * Agent writes (POST /api/queue, PATCH /api/queue/:id) need the shared secret
 * when QUEUE_API_SECRET is set. With no secret configured (local dev) they are open.
 */
export function isAuthorizedAgent(request: NextRequest) {
  const secret = process.env.QUEUE_API_SECRET;
  return !secret || request.headers.get("x-queue-api-secret") === secret;
}
