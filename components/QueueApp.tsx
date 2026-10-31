"use client";

import { CheckCheck, Layers, RefreshCw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import DeckView from "@/components/DeckView";
import DoneView from "@/components/DoneView";
import EditSheet from "@/components/EditSheet";
import { priority, prioritySort } from "@/lib/scoring";
import type { DraftItem, DraftScores, ReviewDecision } from "@/lib/types";

type Tab = "review" | "done";
type SortKey = "priority" | keyof DraftScores;

const SORTS: Array<[SortKey, string]> = [
  ["priority", "Priority"],
  ["urgency", "Urgency"],
  ["confidence", "Confidence"],
  ["risk", "Risk (highest first)"]
];

function sortValue(item: DraftItem, key: SortKey) {
  return key === "priority" ? priority(item.scores) : item.scores[key];
}

export default function QueueApp({ initialItems }: { initialItems: DraftItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [tab, setTab] = useState<Tab>("review");
  const [sort, setSort] = useState<SortKey>("priority");
  const [channel, setChannel] = useState<string>("all");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState("");

  const channels = useMemo(() => Array.from(new Set(items.map((item) => item.channel))).sort(), [items]);
  const pending = useMemo(() => {
    const list = items
      .filter((item) => item.status === "pending" && (channel === "all" || item.channel === channel))
      .sort((a, b) => sortValue(b, sort) - sortValue(a, sort) || prioritySort(a, b));
    const focus = list.find((item) => item.id === focusId);
    return focus ? [focus, ...list.filter((item) => item !== focus)] : list;
  }, [items, sort, channel, focusId]);
  const isSynthetic = items.some((item) => item.tags?.includes("synthetic"));
  const editItem = items.find((item) => item.id === editId) ?? null;

  const replace = (updated: DraftItem) => setItems((cur) => cur.map((i) => (i.id === updated.id ? updated : i)));

  const decide = useCallback(
    async (item: DraftItem, decision: ReviewDecision, extra: { finalText?: string; note?: string } = {}) => {
      // Optimistic: the deck advances at once; the server response then replaces the item.
      if (decision !== "reset") {
        replace({ ...item, status: decision === "approve" ? "approved" : "rejected" });
        setLastId(item.id);
      }
      setBusy(true);
      try {
        const res = await fetch(`/api/queue/${item.id}/approval`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, ...extra })
        });
        const data = (await res.json()) as { ok: boolean; item?: DraftItem; error?: string };
        if (!data.ok || !data.item) throw new Error(data.error || `Save failed (${res.status})`);
        replace(data.item);
      } catch (error) {
        replace(item);
        setToast(error instanceof Error ? error.message : "Save failed");
        window.setTimeout(() => setToast(""), 4000);
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const undo = useCallback(() => {
    const item = items.find((i) => i.id === lastId);
    if (item) decide(item, "reset");
    setFocusId(lastId);
    setLastId(null);
  }, [items, lastId, decide]);

  async function refresh() {
    setRefreshing(true);
    try {
      const data = (await (await fetch("/api/queue")).json()) as { items?: DraftItem[] };
      if (data.items) setItems(data.items);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="app">
      <header className="app-bar">
        <div>
          <p className="eyebrow">{isSynthetic ? "Demo · synthetic data" : "Human in the loop"}</p>
          <h1>Agent Approval Queue</h1>
        </div>
        <button className="icon-btn" onClick={refresh} disabled={refreshing} type="button" aria-label="Refresh">
          <RefreshCw className={refreshing ? "spin" : ""} size={18} />
        </button>
      </header>

      <nav className="tabs" aria-label="Views">
        <button className={tab === "review" ? "active" : ""} onClick={() => setTab("review")} type="button">
          <Layers size={16} /> Review <span className="badge">{items.filter((i) => i.status === "pending").length}</span>
        </button>
        <button className={tab === "done" ? "active" : ""} onClick={() => setTab("done")} type="button">
          <CheckCheck size={16} /> Done <span className="badge">{items.filter((i) => i.status === "approved").length}</span>
        </button>
      </nav>

      {tab === "review" ? (
        <div className="workspace">
          <aside className="rail" aria-label="Pending drafts">
            <div className="rail-controls">
              <select aria-label="Filter by channel" value={channel} onChange={(e) => { setChannel(e.target.value); setFocusId(null); }}>
                <option value="all">All channels</option>
                {channels.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select aria-label="Sort" value={sort} onChange={(e) => { setSort(e.target.value as SortKey); setFocusId(null); }}>
                {SORTS.map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <ul>
              {pending.map((item, index) => (
                <li key={item.id}>
                  <button className={`rail-row ${index === 0 ? "active" : ""}`} onClick={() => setFocusId(item.id)} type="button">
                    <span className="rail-main">
                      <strong>{item.title ?? item.draft.slice(0, 50)}</strong>
                      <small>{item.channel} · {item.agent}</small>
                    </span>
                    <b className="rail-score">{sortValue(item, sort)}</b>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <section className="stage">
            <DeckView
              items={pending}
              busy={busy}
              canUndo={Boolean(lastId)}
              onUndo={undo}
              onEdit={(item) => setEditId(item.id)}
              onDecide={(item, decision) => {
                setFocusId(null);
                decide(item, decision);
              }}
            />
          </section>
        </div>
      ) : (
        <DoneView
          items={items}
          onReopen={(item) => decide(item, "reset")}
          onExported={(ids) => setItems((cur) => cur.map((i) => (ids.includes(i.id) ? { ...i, status: "exported" } : i)))}
        />
      )}

      {editItem ? (
        <EditSheet
          item={editItem}
          onClose={() => setEditId(null)}
          onApprove={(finalText, note) => {
            setEditId(null);
            setFocusId(null);
            decide(editItem, "approve", { finalText, note });
          }}
          onReject={(note) => {
            setEditId(null);
            setFocusId(null);
            decide(editItem, "reject", { note });
          }}
        />
      ) : null}

      {toast ? (
        <div className="toast" role="status" onClick={() => setToast("")}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
