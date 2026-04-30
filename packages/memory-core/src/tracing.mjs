import path from "node:path";
import { randomUUID } from "node:crypto";
import { ensureDir, writeJsonFile } from "./storage.mjs";
import { validateMemoryTrace } from "./schemas.mjs";

export function createTrace({ operation, input, steps = {}, result = {}, error = null }) {
  return validateMemoryTrace({
    id: randomUUID(),
    at: new Date().toISOString(),
    operation,
    input: input ?? {},
    steps,
    result,
    ...(error ? { error } : {})
  });
}

export async function writeTrace(dataDir, trace) {
  const checked = validateMemoryTrace(trace);
  const traceDir = path.join(dataDir, "traces");
  await ensureDir(traceDir);
  await writeJsonFile(path.join(traceDir, `${checked.id}.json`), checked);
  return checked;
}
