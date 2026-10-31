// Reset the local JSON store to the synthetic seed data.
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const seed = fileURLToPath(new URL("../data/seed.json", import.meta.url));
const queue = fileURLToPath(new URL("../data/queue.json", import.meta.url));
copyFileSync(seed, queue);
console.log("data/queue.json reset from data/seed.json");
