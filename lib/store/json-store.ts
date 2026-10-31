import { promises as fs } from "node:fs";
import path from "node:path";
import { DuplicateDraftError, findDuplicate } from "../dedupe";
import type { DraftItem } from "../types";
import type { QueueStore } from "./types";

const dataDir = path.join(process.cwd(), "data");
const queuePath = path.join(dataDir, "queue.json");
const seedPath = path.join(dataDir, "seed.json");

/**
 * File-backed store for local use. Writes go through a single promise chain so
 * two requests in the same process cannot interleave a read-modify-write and
 * lose an update. Not meant for serverless hosts, where the file system is
 * read-only or not shared between instances: use Supabase there.
 */
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

async function readAll(): Promise<DraftItem[]> {
  try {
    return JSON.parse(await fs.readFile(queuePath, "utf8")) as DraftItem[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // First run: start from the synthetic seed so the UI has something to show.
    try {
      const seed = JSON.parse(await fs.readFile(seedPath, "utf8")) as DraftItem[];
      await writeAll(seed);
      return seed;
    } catch {
      return [];
    }
  }
}

async function writeAll(items: DraftItem[]) {
  await fs.mkdir(dataDir, { recursive: true });
  const tmp = `${queuePath}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(items, null, 2)}\n`);
  await fs.rename(tmp, queuePath);
}

export const jsonStore: QueueStore = {
  name: "json",

  list: () => locked(readAll),

  get: (id) => locked(async () => (await readAll()).find((item) => item.id === id) ?? null),

  insert: (item) =>
    locked(async () => {
      const items = await readAll();
      const duplicate = findDuplicate(item, items);
      if (duplicate) throw new DuplicateDraftError(duplicate.key, duplicate.existingId);
      await writeAll([item, ...items]);
      return item;
    }),

  replace: (item) =>
    locked(async () => {
      const items = await readAll();
      const index = items.findIndex((existing) => existing.id === item.id);
      if (index < 0) return null;
      items[index] = item;
      await writeAll(items);
      return item;
    })
};
