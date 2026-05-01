import { cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function createTempDataDir(label = "test") {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), `paradigm-${label}-`));
  await cp(path.join(rootDir, "tests", "fixtures", "memory"), path.join(tempRoot, "memory"), {
    recursive: true,
    filter: (source) => !source.endsWith(".sqlite") && !source.endsWith(".sqlite-shm") && !source.endsWith(".sqlite-wal")
  });
  return tempRoot;
}

export async function cleanupTempDataDir(dataDir) {
  await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
