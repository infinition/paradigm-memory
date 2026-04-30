import assert from "node:assert/strict";
import test from "node:test";
import { createAtlas } from "../packages/memory-core/src/index.mjs";
import { createMemoryService } from "../packages/memory-mcp/src/memory-service.mjs";
import { cleanupTempDataDir, createTempDataDir } from "./helpers.mjs";

async function withService(label, fn) {
  const dataDir = await createTempDataDir(label);
  const service = await createMemoryService({ dataDir });
  try {
    return await fn(service, dataDir);
  } finally {
    service.close();
    await cleanupTempDataDir(dataDir);
  }
}

test("memory.search returns active evidence and excludes deleted items", async () => {
  const dataDir = await createTempDataDir("deleted-search");
  const atlas = await createAtlas({ dataDir });
  try {
    const deleted = atlas.deleteItem("item.paradigm.memory.rule", {
      actor: "test",
      reason: "deleted_search_assertion"
    });
    assert.equal(deleted.id, "item.paradigm.memory.rule");

    const pack = atlas.buildContextPack("LLM node search rerank context budget", { evidenceLimit: 8 });
    assert.ok(!pack.evidence.some((item) => item.id === deleted.id));
  } finally {
    atlas.close();
    await cleanupTempDataDir(dataDir);
  }
});

test("memory.search returns newly written active evidence", async () => {
  await withService("search", async (service) => {
    const written = await service.write({
      node_id: "projects.paradigm.memory",
      content: "Temporary searchable item about audit-only MCP memory.",
      tags: ["temporary", "mcp-test"]
    });

    const readBefore = await service.read({ node_id: "projects.paradigm.memory", include_items: true });
    assert.ok(readBefore.items.some((item) => item.id === written.item.id));

    const result = await service.search({ query: "audit-only MCP memory", limit: 8 });
    assert.ok(result.evidence.length > 0);
    assert.ok(result.evidence.every((item) => item.id));
    assert.ok(result.evidence.some((item) => item.id === written.item.id));
  });
});

test("memory.read rejects unknown nodes", async () => {
  await withService("read-unknown", async (service) => {
    await assert.rejects(
      () => service.read({ node_id: "unknown.node" }),
      /Unknown memory node/
    );
  });
});

test("memory.propose_write stages a 'proposed' item awaiting review", async () => {
  await withService("propose", async (service) => {
    const result = await service.proposeWrite({
      node_id: "projects.paradigm.memory",
      content: "MCP write should be audited for regulated agent memory.",
      tags: ["audit", "mcp"],
      importance: 0.77,
      confidence: 0.91
    });

    assert.equal(result.item.node_id, "projects.paradigm.memory");
    assert.equal(result.item.status, "proposed");
    assert.equal(result.mutation.operation, "propose");
    assert.equal(result.mutation.actor, "mcp");
    assert.equal(result.mutation.item_id, result.item.id);

    const search = await service.search({ query: "regulated agent memory", limit: 8 });
    assert.ok(
      !search.evidence.some((item) => item.id === result.item.id),
      "proposed items must not surface in search"
    );

    const proposed = await service.listProposed({ limit: 50 });
    assert.ok(proposed.items.some((item) => item.id === result.item.id));
  });
});

test("memory.review accept activates a proposed item", async () => {
  await withService("review-accept", async (service) => {
    const proposal = await service.proposeWrite({
      node_id: "projects.paradigm.memory",
      content: "Reviewable propose-then-accept item for memory pipeline.",
      tags: ["review", "accept"]
    });
    assert.equal(proposal.item.status, "proposed");

    const reviewed = await service.review({
      item_id: proposal.item.id,
      action: "accept",
      reason: "test_acceptance"
    });
    assert.equal(reviewed.item.status, "active");
    assert.equal(reviewed.mutation.operation, "accept");

    const search = await service.search({ query: "propose-then-accept memory pipeline", limit: 8 });
    assert.ok(search.evidence.some((item) => item.id === proposal.item.id));
  });
});

test("memory.review reject soft-deletes a proposed item", async () => {
  await withService("review-reject", async (service) => {
    const proposal = await service.proposeWrite({
      node_id: "projects.paradigm.memory",
      content: "Reviewable propose-then-reject item for memory pipeline.",
      tags: ["review", "reject"]
    });

    const reviewed = await service.review({
      item_id: proposal.item.id,
      action: "reject",
      reason: "test_rejection"
    });
    assert.equal(reviewed.item.status, "deleted");
    assert.equal(reviewed.mutation.operation, "reject");

    const search = await service.search({ query: "propose-then-reject memory pipeline", limit: 8 });
    assert.ok(!search.evidence.some((item) => item.id === proposal.item.id));
  });
});

test("memory.review rejects items not in 'proposed' state", async () => {
  await withService("review-invalid", async (service) => {
    const written = await service.write({
      node_id: "projects.paradigm.memory",
      content: "Already-active item should not be reviewable.",
      tags: ["direct"]
    });
    await assert.rejects(
      () => service.review({ item_id: written.item.id, action: "accept" }),
      /Cannot review item with status/
    );
  });
});

test("memory.write creates an active item directly with audit mutation", async () => {
  await withService("write", async (service) => {
    const result = await service.write({
      node_id: "projects.paradigm.memory",
      content: "MCP direct write for trusted callers (skips review).",
      tags: ["audit", "mcp", "direct"],
      importance: 0.77,
      confidence: 0.91
    });

    assert.equal(result.item.node_id, "projects.paradigm.memory");
    assert.equal(result.item.status, "active");
    assert.equal(result.mutation.operation, "write");
    assert.equal(result.mutation.actor, "mcp");
    assert.equal(result.mutation.item_id, result.item.id);
  });
});

test("separate data dirs do not mix memory", async () => {
  const leftDir = await createTempDataDir("isolation-left");
  const rightDir = await createTempDataDir("isolation-right");
  const left = await createMemoryService({ dataDir: leftDir });
  const right = await createMemoryService({ dataDir: rightDir });
  try {
    const marker = `isolation-marker-${Date.now()}`;
    await left.proposeWrite({
      node_id: "projects.paradigm.memory",
      content: `Only the left memory should contain ${marker}.`,
      tags: ["isolation"]
    });

    const leftRead = await left.read({ node_id: "projects.paradigm.memory", include_items: true });
    const rightRead = await right.read({ node_id: "projects.paradigm.memory", include_items: true });

    assert.ok(leftRead.items.some((item) => item.content.includes(marker)));
    assert.ok(!rightRead.items.some((item) => item.content.includes(marker)));
  } finally {
    left.close();
    right.close();
    await cleanupTempDataDir(leftDir);
    await cleanupTempDataDir(rightDir);
  }
});

test("one MCP service isolates multiple workspaces", async () => {
  await withService("workspace-isolation", async (service) => {
    const marker = `workspace-marker-${Date.now()}`;
    await service.write({
      workspace: "left",
      node_id: "workspace",
      content: `Only workspace left should contain ${marker}.`,
      tags: ["isolation"]
    });

    const left = await service.search({ workspace: "left", query: marker, limit: 5 });
    const right = await service.search({ workspace: "right", query: marker, limit: 5 });
    const root = await service.search({ query: marker, limit: 5 });

    assert.ok(left.evidence.some((item) => item.content.includes(marker)));
    assert.ok(!right.evidence.some((item) => item.content.includes(marker)));
    assert.ok(!root.evidence.some((item) => item.content.includes(marker)));
  });
});

test("memory_export and memory_import round-trip a workspace", async () => {
  await withService("import-export", async (service) => {
    const marker = `brain-roundtrip-${Date.now()}`;
    await service.write({
      workspace: "source",
      node_id: "workspace",
      content: `Portable .brain snapshots preserve ${marker}.`,
      tags: ["brain", "roundtrip"]
    });

    const exported = await service.exportMemory({ workspace: "source", include_mutations: true });
    assert.equal(exported.format, "paradigm.brain");
    assert.ok(exported.snapshot.items.some((item) => item.content.includes(marker)));

    const imported = await service.importMemory({
      workspace: "target",
      data: exported.snapshot,
      mode: "replace",
      reason: "roundtrip_test"
    });
    assert.ok(imported.item_count > 0);

    const target = await service.read({ workspace: "target", node_id: "workspace", include_items: true });
    assert.ok(target.items.some((item) => item.content.includes(marker)));
  });
});

test("memory_dream detects near-duplicate items", async () => {
  await withService("dream-duplicates", async (service) => {
    await service.write({
      workspace: "dream",
      node_id: "workspace",
      content: "Duplicate memory about MCP audit trail and local SQLite storage.",
      tags: ["dream"]
    });
    await service.write({
      workspace: "dream",
      node_id: "workspace",
      content: "Duplicate memory about MCP audit trail and local SQLite storage.",
      tags: ["dream"]
    });

    const report = await service.dream({ workspace: "dream", similarity_threshold: 0.5 });
    assert.ok(report.summary.duplicates > 0);
    assert.ok(report.summary.total > 0);
  });
});

test("memory_import_markdown chunks markdown into audited items", async () => {
  await withService("markdown-import", async (service) => {
    const result = await service.importMarkdown({
      workspace: "docs",
      node_id: "workspace",
      title: "notes.md",
      content: "# Notes\n\nParadigm markdown importer keeps Obsidian notes searchable.",
      tags: ["docs"],
      status: "active"
    });

    assert.equal(result.item_count, 1);
    assert.equal(result.items[0].node_id, "workspace");
    assert.equal(result.items[0].status, "active");
    assert.ok(result.mutations.some((mutation) => mutation.operation === "write"));

    const read = await service.read({ workspace: "docs", node_id: "workspace", include_items: true });
    assert.ok(read.items.some((item) => item.content.includes("Obsidian notes searchable")));
  });
});

test("memory_delete and replace import create safety snapshots", async () => {
  await withService("safety-snapshots", async (service, dataDir) => {
    const written = await service.write({
      node_id: "projects.paradigm.memory",
      content: "Snapshot safety item before delete.",
      tags: ["snapshot"]
    });
    const deleted = await service.deleteItem({ item_id: written.item.id, reason: "snapshot_test" });
    assert.ok(deleted.snapshot_path.startsWith(dataDir));
    assert.match(deleted.snapshot_path, /before-delete/);

    const exported = await service.exportMemory({ include_deleted: true });
    const imported = await service.importMemory({ data: exported.snapshot, mode: "replace", reason: "snapshot_replace" });
    assert.ok(imported.snapshot_path.startsWith(dataDir));
    assert.match(imported.snapshot_path, /before-import-replace/);
  });
});

test("fixture search latency stays below 100ms p95 on small local dataset", async () => {
  await withService("latency", async (service) => {
    const samples = [];
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      await service.search({ query: "memory gating retrieval context", limit: 8 });
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95) - 1];
    assert.ok(p95 < 100, `expected p95 < 100ms, got ${p95.toFixed(2)}ms`);
  });
});

test("off-domain search does not inject unrelated memory", async () => {
  await withService("off-domain", async (service) => {
    const result = await service.search({
      query: "Recette de cuisine pour une tarte aux pommes sans rapport avec Paradigm.",
      limit: 8
    });

    assert.equal(result.intent, "off_domain");
    assert.equal(result.nodes.length, 0);
    assert.equal(result.evidence.length, 0);
    assert.equal(result.context_pack.length, 0);
  });
});

test("activation rerank prefers specific leaf nodes over broad parents", async () => {
  await withService("rerank", async (service) => {
    const cases = [
      ["Quel modele sert aux smoke tests rapides ?", "projects.paradigm.llm"],
      ["Paradigm ne doit pas pretendre etre conscient.", "identity.persona"],
      ["La web UI de Bjorn est une branche exemple.", "projects.bjorn.webui"],
      ["Le journal episodique append-only garde les evenements.", "episodic"]
    ];

    for (const [query, expected] of cases) {
      const result = await service.search({ query, limit: 5 });
      assert.equal(result.nodes[0]?.id, expected);
    }
  });
});
