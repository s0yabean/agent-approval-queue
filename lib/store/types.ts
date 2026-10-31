import type { DraftItem } from "../types";

/** The minimum a backing store has to do. Business rules live in lib/queue.ts. */
export interface QueueStore {
  name: "json" | "supabase";
  list(): Promise<DraftItem[]>;
  get(id: string): Promise<DraftItem | null>;
  /** Insert a new item. Throws DuplicateDraftError if its dedupe key is taken. */
  insert(item: DraftItem, dedupeKey: string | null): Promise<DraftItem>;
  /** Replace an existing item. Returns null if it does not exist. */
  replace(item: DraftItem): Promise<DraftItem | null>;
}
