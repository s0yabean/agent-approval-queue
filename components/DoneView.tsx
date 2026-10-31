"use client";

import { ArrowDownToLine, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { DraftItem } from "@/lib/types";

/** Approved drafts waiting for export, plus rejected and exported history. */
export default function DoneView({
  items,
  onReopen,
  onExported
}: {
  items: DraftItem[];
  onReopen: (item: DraftItem) => void;
  onExported: (ids: string[]) => void;
}) {
  const approved = items.filter((item) => item.status === "approved");
  const rejected = items.filter((item) => item.status === "rejected");
  const exported = items.filter((item) => item.status === "exported");
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    const ids = approved.map((item) => item.id);
    setExporting(true);
    setError("");
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids })
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || `Export failed (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "approved.csv";
      a.click();
      URL.revokeObjectURL(url);
      onExported(ids);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="done">
      <div className="done-head">
        <div>
          <h3>Approved</h3>
          <p>{approved.length} ready to send</p>
        </div>
        <button className="primary" disabled={!approved.length || exporting} onClick={exportCsv} type="button">
          <ArrowDownToLine size={16} /> {exporting ? "Exporting..." : `Export ${approved.length} as CSV`}
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}

      <List items={approved} empty="Nothing approved yet." render={(item) => (
        <>
          <span className="chip good">{item.review.edited ? "approved, edited" : "approved"}</span>
          <Row item={item} />
          <button className="link" onClick={() => onReopen(item)} type="button"><RotateCcw size={13} /> Reopen</button>
        </>
      )} />

      <h4>Rejected ({rejected.length})</h4>
      <List items={rejected} empty="Nothing rejected." render={(item) => (
        <>
          <span className="chip bad">rejected</span>
          <Row item={item} />
          <button className="link" onClick={() => onReopen(item)} type="button"><RotateCcw size={13} /> Reopen</button>
        </>
      )} />

      <h4>Exported ({exported.length})</h4>
      <List items={exported} empty="No exports yet." render={(item) => (
        <>
          <span className="chip muted">exported</span>
          <Row item={item} />
        </>
      )} />
    </div>
  );
}

function Row({ item }: { item: DraftItem }) {
  return (
    <div className="row-main">
      <strong>{item.title ?? item.draft.slice(0, 60)}</strong>
      <span>
        {item.channel} · {item.agent}
        {item.review.note ? ` · "${item.review.note}"` : ""}
      </span>
    </div>
  );
}

function List({ items, empty, render }: { items: DraftItem[]; empty: string; render: (item: DraftItem) => React.ReactNode }) {
  if (!items.length) return <p className="muted-text">{empty}</p>;
  return (
    <ul className="rows">
      {items.map((item) => (
        <li className="row" key={item.id}>
          {render(item)}
        </li>
      ))}
    </ul>
  );
}
