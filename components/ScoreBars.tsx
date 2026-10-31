import type { DraftScores } from "@/lib/types";

const LABELS: Array<[keyof DraftScores, string]> = [
  ["confidence", "Confidence"],
  ["relevance", "Relevance"],
  ["urgency", "Urgency"],
  ["risk", "Risk"]
];

export default function ScoreBars({ scores }: { scores: DraftScores }) {
  return (
    <dl className="scores">
      {LABELS.map(([key, label]) => (
        <div className={`score ${key}`} key={key}>
          <dt>{label}</dt>
          <dd>
            <span className="bar" aria-hidden>
              <span style={{ width: `${scores[key]}%` }} />
            </span>
            <b>{scores[key]}</b>
          </dd>
        </div>
      ))}
    </dl>
  );
}
