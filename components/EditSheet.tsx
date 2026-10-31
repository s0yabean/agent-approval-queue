"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import type { DraftItem } from "@/lib/types";

/** Edit the draft before approving, or reject with a note the agent can learn from. */
export default function EditSheet({
  item,
  onApprove,
  onReject,
  onClose
}: {
  item: DraftItem;
  onApprove: (finalText: string, note: string) => void;
  onReject: (note: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(item.review.finalText ?? item.draft);
  const [note, setNote] = useState("");
  const changed = text.trim() !== item.draft.trim();

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Edit draft">
      <div className="sheet">
        <header className="sheet-head">
          <div>
            <p className="eyebrow">Edit before sending</p>
            <h2>{item.title ?? item.channel}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} type="button" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        {item.context?.text ? (
          <blockquote className="context">
            <header>
              <strong>{item.context.author ?? "Original"}</strong>
            </header>
            <p>{item.context.text}</p>
          </blockquote>
        ) : null}

        <label className="field">
          <span>Final text {changed ? <em>edited</em> : null}</span>
          <textarea value={text} onChange={(event) => setText(event.target.value)} rows={9} autoFocus />
          <small>{text.length} characters</small>
        </label>
        <label className="field">
          <span>Note for the agent (optional)</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. too formal, wrong price, cite the policy"
          />
        </label>

        <div className="sheet-actions">
          <button className="ghost danger" onClick={() => onReject(note)} type="button">
            <X size={15} /> Reject
          </button>
          <button className="primary" disabled={!text.trim()} onClick={() => onApprove(text, note)} type="button">
            <Check size={15} /> {changed ? "Approve edited" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}
