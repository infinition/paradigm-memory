import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readdir } from "node:fs/promises";
import { createAtlas, createKeywordEmbeddingProvider, createMemoryWriter, appendNdjson, readJsonFile, readNdjson, writeJsonFile } from "../packages/memory-core/src/index.mjs";
import { cleanupTempDataDir, createTempDataDir } from "./helpers.mjs";

test("storage reads and writes JSON and NDJSON", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "paradigm-storage-"));
  try {
    const jsonPath = path.join(dir, "value.json");
    const ndjsonPath = path.join(dir, "events.ndjson");
    await writeJsonFile(jsonPath, { ok: true });
    assert.deepEqual(await readJsonFile(jsonPath, null), { ok: true });

    await appendNdjson(ndjsonPath, { id: 1 });
    await appendNdjson(ndjsonPath, { id: 2 });
    assert.deepEqual(await readNdjson(ndjsonPath, 1), [{ id: 2 }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("atlas builds a context pack with activated nodes and evidence", async () => {
  const dataDir = await createTempDataDir("atlas");
  const atlas = await createAtlas({ dataDir });
  try {
    const pack = atlas.buildContextPack("gating retrieval memory context", { evidenceLimit: 5 });
    assert.equal(pack.intent, "memory_architecture");
    assert.ok(pack.nodes.some((node) => node.id === "projects.paradigm.memory"));
    assert.ok(pack.evidence.some((item) => item.id === "item.paradigm.memory.thesis"));
  } finally {
    atlas.close();
    await cleanupTempDataDir(dataDir);
  }
});

test("atlas async context pack can add cached semantic scores", async () => {
  const dataDir = await createTempDataDir("atlas-semantic");
  const atlas = await createAtlas({
    dataDir,
    embeddingProvider: createKeywordEmbeddingProvider(),
    semanticWeight: 0.18
  });
  try {
    const pack = await atlas.buildContextPackAsync("gating retrieval memory context", { evidenceLimit: 5 });
    assert.equal(pack.intent, "memory_architecture");
    assert.ok(pack.nodes.some((node) => node.reason?.semanticScore > 0));
    const stats = atlas.memoryStats();
    assert.ok(stats.embeddingCount > 0);
  } finally {
    atlas.close();
    await cleanupTempDataDir(dataDir);
  }
});

test("atlas can warm semantic cache without a user search", async () => {
  const dataDir = await createTempDataDir("atlas-warm");
  const atlas = await createAtlas({
    dataDir,
    embeddingProvider: createKeywordEmbeddingProvider(),
    semanticWeight: 0.18,
    autoWarm: false
  });
  try {
    const before = atlas.memoryStats().embeddingCount;
    const warmed = await atlas.warmEmbeddings();
    const after = atlas.memoryStats().embeddingCount;
    assert.equal(warmed.enabled, true);
    assert.ok(warmed.nodes > 0);
    assert.ok(warmed.items > 0);
    assert.ok(after > before);
  } finally {
    atlas.close();
    await cleanupTempDataDir(dataDir);
  }
});

test("atlas auto-warm pre-populates embedding cache and LRU", async () => {
  const dataDir = await createTempDataDir("atlas-autowarm");
  const atlas = await createAtlas({
    dataDir,
    embeddingProvider: createKeywordEmbeddingProvider(),
    semanticWeight: 0.18,
    autoWarm: true
  });
  try {
    const stats = atlas.embeddingStats();
    assert.equal(stats.provider, "keyword");
    assert.ok(stats.sqliteEmbeddings > 0, "expected sqlite embeddings populated by autoWarm");
    assert.ok(stats.lruSize > 0, "expected LRU populated by autoWarm");
  } finally {
    atlas.close();
    await cleanupTempDataDir(dataDir);
  }
});

test("memory writer proposes deterministic writes when configured", async () => {
  const dataDir = await createTempDataDir("writer");
  const atlas = await createAtlas({ dataDir });
  try {
    const writer = createMemoryWriter({
      atlas,
      now: () => "2026-04-29T00:00:00.000Z",
      idSuffix: () => "fixed"
    });
    const result = writer.processInteraction({
      userText: "Decision: la memoire doit rester auditable et locale.",
      sourceEventId: "test://writer"
    });
    assert.equal(result.applied.length, 1);
    assert.ok(result.applied[0].item.id.endsWith(".fixed"));
    assert.equal(result.applied[0].item.created_at, "2026-04-29T00:00:00.000Z");
  } finally {
    atlas.close();
    await cleanupTempDataDir(dataDir);
  }
});

/*
test("entity receive uses memory and writes a trace with mock cortex", async () => {
  const previousBackend = process.env.PARADIGM_LLM_BACKEND;
  process.env.PARADIGM_LLM_BACKEND = "mock";
  const dataDir = await createTempDataDir("entity");
  const entity = await createParadigmEntity({ dataDir });
  try {
    const response = await entity.receive("Explique le gating memory retrieval de Paradigm.");
    assert.equal(response.reply.role, "entity");
    assert.equal(response.snapshot.cortex.backend, "mock");
    const traces = await readdir(path.join(dataDir, "traces"));
    assert.ok(traces.length >= 1);
  } finally {
    await entity.shutdown();
    await cleanupTempDataDir(dataDir);
    if (previousBackend === undefined) delete process.env.PARADIGM_LLM_BACKEND;
    else process.env.PARADIGM_LLM_BACKEND = previousBackend;
  }
});
*/
