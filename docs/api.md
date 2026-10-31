# API contract

Base URL in local development: `http://127.0.0.1:8790`. All bodies are JSON.

There are two kinds of caller:

| Caller | Endpoints | Auth |
|---|---|---|
| **Agent** (writes drafts) | `POST /api/queue`, `PATCH /api/queue/:id` | `x-queue-api-secret` header, required only when `QUEUE_API_SECRET` is set |
| **Reviewer** (the UI) | `POST /api/queue/:id/approval` | none built in; put the app behind your own auth (see README) |
| **Sender** (picks up approved items) | `GET` / `POST /api/export` | none built in |

Agents own the proposal fields. The reviewer owns `status` and `review`. Any `id`, `status` or `review` an agent sends is ignored, so an agent cannot approve its own draft.

## Item shape

```jsonc
{
  "id": "d_…",                  // server-generated
  "status": "pending",          // pending | approved | rejected | exported
  "agent": "support-agent",     // required on create
  "channel": "email",           // required on create; free text (email, x, linkedin, chat…)
  "action": "reply",            // optional, default "message"
  "title": "SSO login loop",    // optional
  "context": {                  // optional: what the draft responds to
    "author": "Ifeoma A.",
    "text": "After enabling SSO our users…",
    "url": "https://support.example.com/tickets/1051"
  },
  "draft": "Hi Ifeoma, …",       // required on create
  "rationale": "Most common cause per KB.",
  "sources": ["kb/sso-troubleshooting"],
  "tags": ["sso"],
  "scores": { "confidence": 88, "relevance": 92, "urgency": 80, "risk": 12 }, // 0-100, missing = 50
  "dedupeKey": "ticket-1051",   // optional idempotency key
  "createdAt": "…", "updatedAt": "…",
  "review": { "finalText": null, "edited": false, "note": null, "decidedAt": null }
}
```

## Agent endpoints

### Submit a draft: `POST /api/queue`

```bash
curl -s -X POST http://127.0.0.1:8790/api/queue \
  -H "Content-Type: application/json" \
  -H "x-queue-api-secret: $QUEUE_API_SECRET" \
  -d '{
    "agent": "support-agent",
    "channel": "email",
    "action": "reply",
    "context": { "author": "Sam", "text": "How do I reset my password?", "url": "https://support.example.com/tickets/77" },
    "draft": "Hi Sam, use the Forgot password link on the sign-in page.",
    "scores": { "confidence": 90, "relevance": 85, "urgency": 40, "risk": 5 }
  }'
```

| Status | Meaning |
|---|---|
| `201` | `{ ok: true, item }`. Save `item.id` if you want to revise it later. |
| `400` | Missing `agent`, `channel` or `draft`, bad `context.url`, or body is not an object. |
| `401` | Secret configured and header missing or wrong. |
| `409` | Duplicate: `{ ok: false, duplicate: { key, existingId } }`. Treat as "already queued"; do not retry as new. |

The duplicate key is `dedupeKey` if given, otherwise `context.url` normalised (lower-case host, no `www.`, no hash, no `utm_*`/click-tracking params, sorted query, no trailing slash). Items with neither are never treated as duplicates.

### Revise a pending draft: `PATCH /api/queue/:id`

Send any subset of the agent fields. `scores` and `context` merge; other fields replace.

```bash
curl -s -X PATCH http://127.0.0.1:8790/api/queue/$ID \
  -H "Content-Type: application/json" \
  -H "x-queue-api-secret: $QUEUE_API_SECRET" \
  -d '{ "draft": "Hi Sam, click Forgot password on the sign-in page; the link lasts 30 minutes.", "scores": { "confidence": 94 } }'
```

`200` with the item, `404` if unknown, `409` if a human has already decided (agents cannot change decided drafts).

## Reviewer endpoint

### Decide: `POST /api/queue/:id/approval`

```bash
# approve as written
curl -s -X POST http://127.0.0.1:8790/api/queue/$ID/approval -H "Content-Type: application/json" \
  -d '{ "decision": "approve" }'

# approve with edits, and leave a note for whoever tunes the agent
curl -s -X POST http://127.0.0.1:8790/api/queue/$ID/approval -H "Content-Type: application/json" \
  -d '{ "decision": "approve", "finalText": "Hi Sam, …", "note": "lead with the link" }'

# reject
curl -s -X POST http://127.0.0.1:8790/api/queue/$ID/approval -H "Content-Type: application/json" \
  -d '{ "decision": "reject", "note": "wrong policy" }'

# undo / reopen (approved or rejected -> pending)
curl -s -X POST http://127.0.0.1:8790/api/queue/$ID/approval -H "Content-Type: application/json" \
  -d '{ "decision": "reset" }'
```

`approve` and `reject` only work on `pending` items (`409` otherwise). `reset` works on anything except `exported`. On approve, `review.edited` is true when `finalText` differs from the agent's draft, which gives you an edit rate per agent for free.

## Reading and exporting

```bash
# everything, highest priority first; filter with ?status=pending|approved|rejected|exported
curl -s "http://127.0.0.1:8790/api/queue?status=pending"

# one item
curl -s http://127.0.0.1:8790/api/queue/$ID

# peek at approved items without changing anything (CSV by default, or ?format=json)
curl -s "http://127.0.0.1:8790/api/export?format=json"

# export and retire: approved -> exported, so the sender never sees an item twice.
# Pass ids to export an exact batch; omit them to take everything approved.
curl -s -X POST "http://127.0.0.1:8790/api/export?format=json" \
  -H "Content-Type: application/json" -d '{ "ids": ["d_…"] }'
```

`POST /api/export` returns `409` when there is nothing approved to export. CSV columns: `id, status, agent, channel, action, context_url, context_author, final_text, edited_by_reviewer, review_note, confidence, risk, approved_at`.

## Not supported

`DELETE` on any queue route returns `405`. Reject a draft instead, so there is always a record of what an agent proposed.
