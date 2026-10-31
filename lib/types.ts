/**
 * One draft that an agent wants to send, waiting for a human decision.
 *
 * Agents own the "proposal" fields (draft, context, scores, rationale...).
 * The reviewer owns `status` and `review`. The API enforces that split:
 * agents can POST and PATCH proposals but cannot approve their own work.
 */
export type DraftStatus = "pending" | "approved" | "rejected" | "exported";

/** All scores are 0-100. Higher is better, except `risk`. */
export type DraftScores = {
  /** The agent's own confidence that the draft is ready to send as-is. */
  confidence: number;
  /** How well the draft fits the goal / audience. */
  relevance: number;
  /** How time-sensitive it is. */
  urgency: number;
  /** Chance it embarrasses you: wrong facts, tone, sensitive topic. Lower is better. */
  risk: number;
};

export type DraftContext = {
  /** What the draft responds to, if anything: a message, post, ticket. */
  author?: string;
  text?: string;
  url?: string;
};

export type DraftReview = {
  /** The text that will actually go out. Equals `draft` unless the reviewer edited it. */
  finalText: string | null;
  edited: boolean;
  note: string | null;
  decidedAt: string | null;
};

export type DraftItem = {
  id: string;
  status: DraftStatus;
  /** Which agent proposed this, e.g. "support-agent". */
  agent: string;
  /** Where it would be sent: email, x, linkedin, support, chat... Free text. */
  channel: string;
  /** What kind of send: reply, post, email, message... Free text. */
  action: string;
  title?: string;
  context?: DraftContext;
  draft: string;
  /** Why the agent thinks this is worth sending. */
  rationale?: string;
  /** References the agent used to ground the draft (doc names, ticket IDs, URLs). */
  sources?: string[];
  tags?: string[];
  scores: DraftScores;
  /**
   * Optional idempotency key. If omitted, the normalised `context.url` is used.
   * A second POST with the same key returns 409 instead of creating a duplicate.
   */
  dedupeKey?: string;
  createdAt: string;
  updatedAt: string;
  review: DraftReview;
};

/** Fields an agent may send on POST / PATCH. Everything else is server-owned. */
export type DraftProposal = Pick<
  DraftItem,
  | "agent"
  | "channel"
  | "action"
  | "title"
  | "context"
  | "draft"
  | "rationale"
  | "sources"
  | "tags"
  | "dedupeKey"
> & { scores?: Partial<DraftScores> };

export type ReviewDecision = "approve" | "reject" | "reset";
