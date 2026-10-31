import type { DraftItem } from "./types";

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "spm",
  "twclid"
]);

export class DuplicateDraftError extends Error {
  constructor(
    public key: string,
    public existingId: string
  ) {
    super(`A draft already exists for ${key}`);
    this.name = "DuplicateDraftError";
  }
}

/** The key two drafts must not share. Explicit dedupeKey wins over the context URL. */
export function dedupeKeyFor(item: Pick<DraftItem, "dedupeKey" | "context">): string | null {
  if (item.dedupeKey?.trim()) return `key:${item.dedupeKey.trim()}`;
  const link = canonicalUrl(item.context?.url);
  return link ? `url:${link}` : null;
}

export function findDuplicate(
  candidate: Pick<DraftItem, "dedupeKey" | "context">,
  existing: DraftItem[]
): { key: string; existingId: string } | null {
  const key = dedupeKeyFor(candidate);
  if (!key) return null;
  const match = existing.find((item) => dedupeKeyFor(item) === key);
  return match ? { key, existingId: match.id } : null;
}

/**
 * Normalise a URL so trivially different links count as the same thing:
 * lower-case host, no www, no hash, no tracking params, sorted query, no trailing slash.
 */
export function canonicalUrl(rawUrl: string | undefined | null) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;

    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (key.startsWith("utm_") || TRACKING_PARAMS.has(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();

    const query = url.searchParams.toString();
    const pathname = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
    return `${host}${pathname}${query ? `?${query}` : ""}`;
  } catch {
    return null;
  }
}
