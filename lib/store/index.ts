import { jsonStore } from "./json-store";
import { hasSupabaseConfig, supabaseStore } from "./supabase-store";
import type { QueueStore } from "./types";

export function getStore(): QueueStore {
  if (hasSupabaseConfig()) return supabaseStore;
  if (process.env.VERCEL) {
    throw new Error(
      "The JSON store does not persist on serverless hosts. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  return jsonStore;
}
