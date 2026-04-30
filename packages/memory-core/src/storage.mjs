import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

export async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function appendNdjson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

export async function readNdjson(filePath, limit = 50) {
  try {
    const raw = await readFile(filePath, "utf8");
    const lines = raw.trim().split(/\r?\n/).filter(Boolean);
    return lines.slice(-limit).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

