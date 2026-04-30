import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createMemoryService } from "../packages/memory-mcp/src/memory-service.mjs";
import { validateMemoryItem, validateMemoryTrace } from "../packages/memory-core/src/schemas.mjs";
import { cleanupTempDataDir, createTempDataDir } from "./helpers.mjs";

test("memory item schema rejects malformed writes before storage", () => {
  assert.throws(
    () => validateMemoryItem({ id: "bad", node_id: "projects.paradigm.memory", content: "", importance: 2 }),
    /memory_item.content is required/
  );
});

test("memory trace schema requires operation and steps", () => {
  assert.throws(
    () => validateMemoryTrace({ id: "trace", at: new Date().toISOString(), input: {} }),
    /memory_trace.operation is required/
  );
});

test("memory service writes a JSON trace for search", async () => {
  const dataDir = await createTempDataDir("trace");
  const service = await createMemoryService({ dataDir });
  try {
    await service.search({ query: "memory gating retrieval", limit: 5 });
    const traceDir = path.join(dataDir, "traces");
    const files = await readdir(traceDir);
    assert.ok(files.length >= 1);
    const trace = JSON.parse(await readFile(path.join(traceDir, files[0]), "utf8"));
    assert.equal(trace.operation, "mcp.memory.search");
    assert.equal(trace.steps.intent, "memory_architecture");
    assert.ok(Array.isArray(trace.steps.activation));
  } finally {
    service.close();
    await cleanupTempDataDir(dataDir);
  }
});
