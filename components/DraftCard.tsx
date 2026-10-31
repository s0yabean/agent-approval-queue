import { ExternalLink } from "lucide-react";
import ScoreBars from "@/components/ScoreBars";
import { priority, readiness, readinessLabel } from "@/lib/scoring";
import type { DraftItem } from "@/lib/types";

/** What the reviewer reads: what came in, what the agent wants to send, and why. */
export default function DraftCard({ item, compact = false }: { item: DraftItem; compact?: boolean }) {
  const ready = readiness(item.scores);
  const text = item.review.finalText ?? item.draft;

  return (
    <article className="card">
      <header className="card-head">
        <span className="chip channel">{item.channel}</span>
        <span className="chip">{item.action}</span>
        <span className={`chip ready ${ready}`}>{readinessLabel[ready]}</span>
        <span className="card-priority" title="Priority (from scores)">
          {priority(item.scores)}
        </span>
      </header>

      {item.title ? <h2 className="card-title">{item.title}</h2> : null}
      <p className="card-agent">from {item.agent}</p>

      {item.context?.text ? (
        <blockquote className="context">
          <header>
            <strong>{item.context.author ?? "Original"}</strong>
            {item.context.url ? (
              <a href={item.context.url} target="_blank" rel="noreferrer" aria-label="Open original">
                <ExternalLink size={13} />
              </a>
            ) : null}
          </header>
          <p>{item.context.text}</p>
        </blockquote>
      ) : null}

      <section className="draft">
        <p className="label">{item.review.edited ? "Draft (edited by reviewer)" : "Draft"}</p>
        <p className="draft-text">{text}</p>
      </section>

      {!compact ? (
        <>
          {item.rationale ? (
            <section className="why">
              <p className="label">Why the agent wants to send it</p>
              <p>{item.rationale}</p>
            </section>
          ) : null}
          <ScoreBars scores={item.scores} />
          {item.sources?.length ? (
            <p className="sources">
              <span className="label">Sources</span>
              {item.sources.map((source) => (
                <code key={source}>{source}</code>
              ))}
            </p>
          ) : (
            <p className="sources none">No sources cited</p>
          )}
        </>
      ) : null}
    </article>
  );
}
