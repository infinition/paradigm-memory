import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import test from "node:test";
import { cleanupTempDataDir, createTempDataDir, rootDir } from "./helpers.mjs";

function parseToolPayload(response) {
  const text = response.result.content[0].text;
  return JSON.parse(text);
}

test("MCP stdio smoke lists and calls every memory tool end-to-end", async () => {
  const dataDir = await createTempDataDir("mcp");
  const child = spawn(process.execPath, [path.join(rootDir, "packages", "memory-mcp", "src", "server.mjs")], {
    cwd: rootDir,
    env: {
      ...process.env,
      PARADIGM_MEMORY_DIR: dataDir,
      PARADIGM_DISABLE_UPDATE_CHECK: "1"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });

  const responses = [];
  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) responses.push(JSON.parse(line));
    }
  });

  function send(method, params) {
    const id = responses.length + Math.floor(Math.random() * 100000);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        const found = responses.find((message) => message.id === id);
        if (found) {
          clearInterval(timer);
          if (found.error) reject(new Error(found.error.message));
          else resolve(found);
        }
        if (Date.now() - started > 5000) {
          clearInterval(timer);
          reject(new Error(`Timed out waiting for ${method}`));
        }
      }, 10);
    });
  }

  try {
    const init = await send("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "paradigm-test", version: "0.1.0" }
    });
    assert.equal(init.result.serverInfo.name, "paradigm-memory");

    const listed = await send("tools/list", {});
    assert.deepEqual(
      listed.result.tools.map((tool) => tool.name).sort(),
      [
        "memory_create_node",
        "memory_delete",
        "memory_doctor",
        "memory_doctor_fix",
        "memory_dream",
        "memory_export",
        "memory_feedback",
        "memory_import",
        "memory_import_markdown",
        "memory_list_proposed",
        "memory_mutations",
        "memory_propose_write",
        "memory_read",
        "memory_review",
        "memory_search",
        "memory_self_update",
        "memory_snapshot_diff",
        "memory_snapshot_restore",
        "memory_snapshots",
        "memory_stats",
        "memory_tree",
        "memory_update_check",
        "memory_update_item",
        "memory_version",
        "memory_warm",
        "memory_write"
      ]
    );

    const version = await send("tools/call", {
      name: "memory_version",
      arguments: {}
    });
    const versionPayload = parseToolPayload(version);
    assert.equal(versionPayload.package_name, "@paradigm-memory/memory-mcp");
    assert.equal(versionPayload.data_dir, dataDir);

    const updateCheck = await send("tools/call", {
      name: "memory_update_check",
      arguments: {}
    });
    const updatePayload = parseToolPayload(updateCheck);
    assert.equal(updatePayload.enabled, false);

    const selfUpdate = await send("tools/call", {
      name: "memory_self_update",
      arguments: { dry_run: true }
    });
    const selfUpdatePayload = parseToolPayload(selfUpdate);
    assert.equal(selfUpdatePayload.enabled, false);
    assert.equal(selfUpdatePayload.required_env, "PARADIGM_ALLOW_SELF_UPDATE=1");

    const tree = await send("tools/call", {
      name: "memory_tree",
      arguments: { include_items: true }
    });
    const treePayload = parseToolPayload(tree);
    assert.ok(treePayload.nodes.length > 0);
    assert.ok(treePayload.items.length > 0);

    const doctor = await send("tools/call", {
      name: "memory_doctor",
      arguments: {}
    });
    const doctorPayload = parseToolPayload(doctor);
    assert.equal(typeof doctorPayload.score, "number");
    assert.ok(Array.isArray(doctorPayload.checks));

    const doctorFix = await send("tools/call", {
      name: "memory_doctor_fix",
      arguments: { dry_run: true }
    });
    assert.equal(parseToolPayload(doctorFix).dry_run, true);

    const stats = await send("tools/call", {
      name: "memory_stats",
      arguments: {}
    });
    const statsPayload = parseToolPayload(stats);
    assert.ok(statsPayload.counts.nodes > 0);

    const mutationsInitial = await send("tools/call", {
      name: "memory_mutations",
      arguments: { limit: 5 }
    });
    assert.ok(Array.isArray(parseToolPayload(mutationsInitial).mutations));

    const read = await send("tools/call", {
      name: "memory_read",
      arguments: { node_id: "projects.paradigm.memory", include_items: true }
    });
    assert.equal(parseToolPayload(read).node.id, "projects.paradigm.memory");

    const proposed = await send("tools/call", {
      name: "memory_propose_write",
      arguments: {
        node_id: "projects.paradigm.memory",
        content: "MCP smoke proposed audit-only write.",
        tags: ["mcp", "smoke"]
      }
    });
    const proposedPayload = parseToolPayload(proposed);
    assert.equal(proposedPayload.item.status, "proposed");
    assert.equal(proposedPayload.mutation.operation, "propose");
    assert.equal(proposedPayload.mutation.actor, "mcp");

    const list = await send("tools/call", {
      name: "memory_list_proposed",
      arguments: {}
    });
    const listPayload = parseToolPayload(list);
    assert.ok(listPayload.items.some((item) => item.id === proposedPayload.item.id));

    const searchProposed = await send("tools/call", {
      name: "memory_search",
      arguments: { query: "MCP smoke proposed audit-only write", limit: 5 }
    });
    const searchProposedPayload = parseToolPayload(searchProposed);
    assert.ok(Array.isArray(searchProposedPayload.debug.why.evidence));
    assert.ok(
      !searchProposedPayload.evidence.some((item) => item.id === proposedPayload.item.id),
      "proposed items must not surface in memory.search"
    );

    const accepted = await send("tools/call", {
      name: "memory_review",
      arguments: { item_id: proposedPayload.item.id, action: "accept", reason: "smoke_accept" }
    });
    const acceptedPayload = parseToolPayload(accepted);
    assert.equal(acceptedPayload.item.status, "active");
    assert.equal(acceptedPayload.mutation.operation, "accept");

    const searchAfter = await send("tools/call", {
      name: "memory_search",
      arguments: { query: "MCP smoke proposed audit-only write", limit: 5 }
    });
    assert.ok(
      parseToolPayload(searchAfter).evidence.some((item) => item.id === proposedPayload.item.id),
      "accepted items must appear in memory.search"
    );

    const direct = await send("tools/call", {
      name: "memory_write",
      arguments: {
        node_id: "projects.paradigm.memory",
        content: "MCP direct write smoke (active immediately).",
        tags: ["mcp", "direct"]
      }
    });
    const directPayload = parseToolPayload(direct);
    assert.equal(directPayload.item.status, "active");
    assert.equal(directPayload.mutation.operation, "write");

    const feedback = await send("tools/call", {
      name: "memory_feedback",
      arguments: { item_id: directPayload.item.id, signal: "useful" }
    });
    assert.ok(parseToolPayload(feedback).item.tags.includes("feedback:useful"));

    const warm = await send("tools/call", {
      name: "memory_warm",
      arguments: {}
    });
    assert.equal(typeof parseToolPayload(warm).enabled, "boolean");

    const markdown = await send("tools/call", {
      name: "memory_import_markdown",
      arguments: {
        node_id: "projects.paradigm.memory",
        title: "smoke.md",
        content: "# Smoke\n\nMarkdown import smoke for cognitive memory.",
        tags: ["smoke"]
      }
    });
    const markdownPayload = parseToolPayload(markdown);
    assert.equal(markdownPayload.item_count, 1);
    assert.equal(markdownPayload.items[0].status, "active");

    const exported = await send("tools/call", {
      name: "memory_export",
      arguments: { include_deleted: true }
    });
    const exportedPayload = parseToolPayload(exported);
    const changed = await send("tools/call", {
      name: "memory_update_item",
      arguments: { item_id: directPayload.item.id, content: "MCP direct write smoke changed.", tags: ["changed"] }
    });
    assert.equal(parseToolPayload(changed).item.content, "MCP direct write smoke changed.");

    const diff = await send("tools/call", {
      name: "memory_snapshot_diff",
      arguments: { left: exportedPayload.snapshot, right: exportedPayload.snapshot }
    });
    assert.equal(parseToolPayload(diff).summary.items_changed, 0);

    const restored = await send("tools/call", {
      name: "memory_snapshot_restore",
      arguments: { source: exportedPayload.snapshot, item_ids: [directPayload.item.id] }
    });
    assert.equal(parseToolPayload(restored).item_count, 1);

    const snapshots = await send("tools/call", {
      name: "memory_snapshots",
      arguments: { limit: 5 }
    });
    assert.ok(Array.isArray(parseToolPayload(snapshots).snapshots));
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit");
    await cleanupTempDataDir(dataDir);
  }
});
