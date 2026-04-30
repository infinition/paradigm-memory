import assert from "node:assert/strict";
import test from "node:test";
import { startHttpServer } from "../packages/memory-mcp/src/http-server.mjs";
import { cleanupTempDataDir, createTempDataDir } from "./helpers.mjs";

async function post(port, payload) {
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.equal(response.status, 200);
  return await response.json();
}

test("HTTP bridge exposes health, tools and JSON-RPC MCP calls", async () => {
  const dataDir = await createTempDataDir("http");
  const previousDir = process.env.PARADIGM_MEMORY_DIR;
  const previousDisable = process.env.PARADIGM_DISABLE_UPDATE_CHECK;
  process.env.PARADIGM_MEMORY_DIR = dataDir;
  process.env.PARADIGM_DISABLE_UPDATE_CHECK = "1";
  const port = 19000 + Math.floor(Math.random() * 1000);
  const { server, service } = await startHttpServer({ host: "127.0.0.1", port });
  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);

    const tools = await fetch(`http://127.0.0.1:${port}/api/tools`);
    const toolNames = (await tools.json()).tools.map((tool) => tool.name);
    assert.ok(toolNames.includes("memory_search"));
    assert.ok(toolNames.includes("memory_import_markdown"));

    const init = await post(port, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {} }
    });
    assert.equal(init.result.serverInfo.name, "paradigm-memory");

    const tree = await post(port, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "memory_tree", arguments: { include_items: true } }
    });
    const payload = JSON.parse(tree.result.content[0].text);
    assert.ok(payload.nodes.length > 0);
    assert.ok(payload.items.length > 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    service.close();
    if (previousDir === undefined) delete process.env.PARADIGM_MEMORY_DIR;
    else process.env.PARADIGM_MEMORY_DIR = previousDir;
    if (previousDisable === undefined) delete process.env.PARADIGM_DISABLE_UPDATE_CHECK;
    else process.env.PARADIGM_DISABLE_UPDATE_CHECK = previousDisable;
    await cleanupTempDataDir(dataDir);
  }
});
