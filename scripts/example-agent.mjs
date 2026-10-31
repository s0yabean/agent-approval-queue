#!/usr/bin/env node
/**
 * A stand-in for a real agent. It "drafts" replies to a few synthetic inbound
 * messages (templated, no LLM call), submits them to the queue, and then shows
 * what a sender would pick up after a human approves them.
 *
 *   node scripts/example-agent.mjs            # submit 3 synthetic drafts
 *   node scripts/example-agent.mjs --count 5  # submit 5
 *   node scripts/example-agent.mjs --collect  # export + print approved drafts
 *
 * Env: QUEUE_URL (default http://127.0.0.1:8790), QUEUE_API_SECRET (optional)
 */
const BASE = process.env.QUEUE_URL || "http://127.0.0.1:8790";
const headers = { "Content-Type": "application/json" };
if (process.env.QUEUE_API_SECRET) headers["x-queue-api-secret"] = process.env.QUEUE_API_SECRET;

const args = process.argv.slice(2);
const count = Number(args[args.indexOf("--count") + 1]) || 3;

// Synthetic inbound messages the "agent" is responding to.
const INBOX = [
  { author: "Alex P.", text: "Can I invite a contractor without giving them access to billing?", topic: "permissions" },
  { author: "Morgan L.", text: "Is there an API endpoint to list all projects?", topic: "api" },
  { author: "Riley S.", text: "We were charged twice this month.", topic: "billing" },
  { author: "Jamie Q.", text: "How do I turn off the weekly digest email?", topic: "notifications" },
  { author: "Casey D.", text: "Does the import support Excel files or only CSV?", topic: "import" }
];

const ANSWERS = {
  permissions: "Yes. Invite them with the Member role; only Owners and Admins can see billing.",
  api: "Yes: GET /v1/projects returns them, 100 per page, with a `next` cursor.",
  billing: "Sorry about that. I can see two charges and I've refunded the duplicate; it shows in 5 to 10 business days.",
  notifications: "Settings > Notifications > Weekly digest. Untick it and it stops from next week.",
  import: "Both. .xlsx works as long as the data is on the first sheet."
};

/** Pretend model call: deterministic, free, offline. */
function draftReply(message) {
  const risky = message.topic === "billing";
  return {
    agent: "example-agent",
    channel: "email",
    action: "reply",
    title: message.text.slice(0, 60),
    context: {
      author: message.author,
      text: message.text,
      url: `https://support.example.com/tickets/synthetic-${message.topic}`
    },
    draft: `Hi ${message.author.split(" ")[0]},\n\n${ANSWERS[message.topic]}`,
    rationale: risky ? "Money involved; refund not yet confirmed in billing." : "Answer is in the help centre.",
    sources: [`kb/${message.topic}`],
    tags: ["synthetic", message.topic],
    scores: { confidence: risky ? 70 : 90, relevance: 90, urgency: risky ? 85 : 40, risk: risky ? 55 : 10 }
  };
}

async function submit() {
  for (const message of INBOX.slice(0, count)) {
    const res = await fetch(`${BASE}/api/queue`, {
      method: "POST",
      headers,
      body: JSON.stringify(draftReply(message))
    });
    const body = await res.json();
    if (res.status === 201) console.log(`queued   ${body.item.id}  ${message.topic}`);
    else if (res.status === 409) console.log(`skipped  already queued (${body.duplicate?.existingId})  ${message.topic}`);
    else console.log(`error    ${res.status} ${body.error}`);
  }
  console.log(`\nOpen ${BASE} to review. Then run with --collect to pick up approved drafts.`);
}

async function collect() {
  const res = await fetch(`${BASE}/api/export?format=json`, { method: "POST", headers, body: "{}" });
  if (res.status === 409) return console.log("Nothing approved yet.");
  const { items } = await res.json();
  for (const item of items) {
    // A real sender would call the email / social / chat API here.
    console.log(`send via ${item.channel} -> ${item.context?.author ?? "(no recipient)"}${item.review.edited ? "  [edited by reviewer]" : ""}`);
    console.log(`  ${item.review.finalText.replaceAll("\n", "\n  ")}\n`);
  }
  console.log(`${items.length} approved draft(s) exported and retired from the queue.`);
}

(args.includes("--collect") ? collect() : submit()).catch((error) => {
  console.error(`Could not reach ${BASE}. Is \`npm run dev\` running?\n${error.message}`);
  process.exit(1);
});
