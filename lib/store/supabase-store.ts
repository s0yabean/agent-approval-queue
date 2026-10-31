import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DuplicateDraftError } from "../dedupe";
import type { DraftItem } from "../types";
import type { QueueStore } from "./types";

const table = process.env.SUPABASE_QUEUE_TABLE || "queue_items";

export function hasSupabaseConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let client: SupabaseClient | null = null;
function db() {
  if (!client) {
    client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return client;
}

/**
 * Supabase store (see docs/supabase.sql). Each row keeps the whole item as
 * jsonb plus a unique `dedupe_key` column, so the database itself rejects a
 * duplicate even when two agents post the same thing at the same moment.
 */
export const supabaseStore: QueueStore = {
  name: "supabase",

  async list() {
    const { data, error } = await db().from(table).select("item").order("created_at", { ascending: false });
    if (error) throw new Error(`Supabase read failed: ${error.message}`);
    return (data ?? []).map((row) => row.item as DraftItem);
  },

  async get(id) {
    const { data, error } = await db().from(table).select("item").eq("id", id).maybeSingle();
    if (error) throw new Error(`Supabase read failed: ${error.message}`);
    return data ? (data.item as DraftItem) : null;
  },

  async insert(item, dedupeKey) {
    const { data, error } = await db()
      .from(table)
      .insert({ id: item.id, dedupe_key: dedupeKey, item })
      .select("item")
      .single();
    if (error) {
      if (error.code === "23505" && dedupeKey) {
        const { data: existing } = await db().from(table).select("id").eq("dedupe_key", dedupeKey).maybeSingle();
        throw new DuplicateDraftError(dedupeKey, existing?.id ?? "unknown");
      }
      throw new Error(`Supabase insert failed: ${error.message}`);
    }
    return data.item as DraftItem;
  },

  async replace(item) {
    const { data, error } = await db()
      .from(table)
      .update({ item })
      .eq("id", item.id)
      .select("item")
      .maybeSingle();
    if (error) throw new Error(`Supabase update failed: ${error.message}`);
    return data ? (data.item as DraftItem) : null;
  }
};
