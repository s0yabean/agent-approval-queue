"use client";

import { Check, Pencil, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import DraftCard from "@/components/DraftCard";
import { useSwipe, type SwipeDirection } from "@/lib/useSwipe";
import type { DraftItem } from "@/lib/types";

/**
 * One card at a time with the next one peeking behind.
 * Swipe or arrow keys: right = approve, left = reject, up / E = edit, U = undo.
 */
export default function DeckView({
  items,
  onDecide,
  onEdit,
  onUndo,
  canUndo,
  busy
}: {
  items: DraftItem[];
  onDecide: (item: DraftItem, decision: "approve" | "reject") => void;
  onEdit: (item: DraftItem) => void;
  onUndo: () => void;
  canUndo: boolean;
  busy: boolean;
}) {
  const [leaving, setLeaving] = useState<{ item: DraftItem; dir: "left" | "right" } | null>(null);
  const top = items[0];
  const next = items[1];

  function commit(dir: "left" | "right") {
    if (!top || leaving) return;
    setLeaving({ item: top, dir });
    onDecide(top, dir === "right" ? "approve" : "reject");
    window.setTimeout(() => setLeaving(null), 260);
  }

  const onSwipe = (dir: SwipeDirection) => {
    if (!top) return;
    if (dir === "up") onEdit(top);
    else commit(dir);
  };

  const { handlers, dx, dy, active } = useSwipe({ disabled: !top || busy || Boolean(leaving), onSwipe });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [role=dialog]")) return;
      if (event.key === "ArrowRight") commit("right");
      else if (event.key === "ArrowLeft") commit("left");
      else if (event.key === "e" || event.key === "ArrowUp") top && onEdit(top);
      else if (event.key === "u" && canUndo) onUndo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const stamp = useMemo(() => (dx > 40 ? "approve" : dx < -40 ? "reject" : null), [dx]);
  const rotation = Math.max(-12, Math.min(12, dx / 14));
  const topStyle = {
    transform: `translate(${dx}px, ${dy}px) rotate(${rotation}deg)`,
    transition: active ? "none" : "transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)"
  };

  if (!top && !leaving) {
    return (
      <div className="empty">
        <Check size={28} />
        <h3>Queue cleared</h3>
        <p>Nothing waiting for review. New drafts from agents land here.</p>
        {canUndo ? (
          <button className="ghost" onClick={onUndo} type="button">
            <RotateCcw size={15} /> Undo last decision
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="deck">
      <div className="deck-stage">
        {next ? (
          <div className="deck-card behind" aria-hidden>
            <DraftCard item={next} compact />
          </div>
        ) : null}
        {top ? (
          <div className="deck-card front" style={topStyle} {...handlers}>
            {stamp ? <div className={`stamp ${stamp}`}>{stamp}</div> : null}
            <DraftCard item={top} />
          </div>
        ) : null}
        {leaving ? (
          <div
            className="deck-card leaving"
            aria-hidden
            style={{
              transform: `translate(${leaving.dir === "right" ? 640 : -640}px, 60px) rotate(${leaving.dir === "right" ? 18 : -18}deg)`,
              opacity: 0
            }}
          >
            <DraftCard item={leaving.item} />
          </div>
        ) : null}
      </div>

      <div className="deck-actions">
        <button className="round reject" onClick={() => commit("left")} disabled={busy || !top} type="button" aria-label="Reject">
          <X size={24} />
        </button>
        <button className="round edit" onClick={() => top && onEdit(top)} disabled={!top} type="button" aria-label="Edit">
          <Pencil size={20} />
        </button>
        <button className="round approve" onClick={() => commit("right")} disabled={busy || !top} type="button" aria-label="Approve">
          <Check size={26} />
        </button>
      </div>
      <p className="hint">
        Swipe or use arrow keys: <kbd>→</kbd> approve · <kbd>←</kbd> reject · <kbd>E</kbd> edit
        {canUndo ? (
          <>
            {" "}
            · <button className="link" onClick={onUndo} type="button"><kbd>U</kbd> undo</button>
          </>
        ) : null}
      </p>
    </div>
  );
}
