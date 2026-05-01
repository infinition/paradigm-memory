#!/usr/bin/env node
import readline from "node:readline";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryService, memoryServiceError } from "./memory-service.mjs";

export const protocolVersion = "2025-03-26";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function readPackageMeta() {
  try {
    const pkgPath = path.resolve(__dirname, "..", "package.json");
    const raw = await readFile(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    return { name: pkg.name ?? "paradigm-memory-mcp", version: pkg.version ?? "0.0.0" };
  } catch {
    return { name: "paradigm-memory-mcp", version: "0.0.0" };
  }
}

const workspaceProperty = {
  type: "string",
  minLength: 1,
  maxLength: 80,
  pattern: "^[a-zA-Z0-9._-]+$",
  description: "Optional workspace identifier. Each workspace gets an isolated memory under <PARADIGM_MEMORY_DIR>/workspaces/<workspace>/."
};

export const toolDefinitions = [
  {
    name: "memory_version",
    description: "Return server version, protocol version, active data directory, workspace directory, and storage stats. Useful for sanity checks and Memory inspector diagnostics.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_update_check",
    description: "Check GitHub Releases for a newer Paradigm Memory version. Read-only, timeout-bounded, opt-out with PARADIGM_DISABLE_UPDATE_CHECK=1.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        timeout_ms: { type: "integer", minimum: 100, maximum: 5000 },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_self_update",
    description: "Update Paradigm Memory from GitHub Releases by re-running the official installer. Disabled unless PARADIGM_ALLOW_SELF_UPDATE=1. No arbitrary commands are accepted.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        dry_run: { type: "boolean" }
      }
    }
  },
  {
    name: "memory_search",
    description: "Search memory through cognitive-map activation + hybrid retrieval. Returns activated nodes, evidence items and a token-budgeted context pack.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: {
          type: "string",
          minLength: 1,
          description: "Search terms. FTS5 boolean operators (AND, OR, NOT), exact matches (\"\"), modifiers (+, -)."
        },
        depth: { type: "integer", minimum: 0, maximum: 4 },
        limit: { type: "integer", minimum: 1, maximum: 50 },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_read",
    description: "Read one node, its direct children and (optionally) its items. By default includes items with status active+proposed.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["node_id"],
      properties: {
        node_id: { type: "string", minLength: 1 },
        include_items: { type: "boolean" },
        include_proposed: { type: "boolean" },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_tree",
    description: "Return the full cognitive map for visual inspectors: roots, nodes, active item counts, and optionally active/proposed items.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        include_items: { type: "boolean" },
        include_proposed: { type: "boolean" },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_doctor",
    description: "Run a read-only health check over the memory store: SQLite pragmas, orphan items, broken node links, embedding cache coverage and actionable repair hints.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_doctor_fix",
    description: "Apply safe local repairs: rebuild FTS indexes, refresh JSON mirrors from SQLite, and optionally warm embeddings. Does not delete content.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        repairs: {
          type: "array",
          items: { type: "string", enum: ["rebuild_fts", "mirror_json", "warm_embeddings"] }
        },
        dry_run: { type: "boolean" },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_stats",
    description: "Return read-only memory statistics: counts, top nodes, freshness histogram inputs, storage size and mutation count.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_mutations",
    description: "List recent audited mutations for the current workspace.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 1000 },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_snapshots",
    description: "List automatic .brain safety snapshots under <memory-dir>/snapshots/.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 200 },
        include_hash: { type: "boolean" },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_propose_write",
    description: "Stage an item with status='proposed'. Excluded from search until reviewed via memory_review. Audited.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["node_id", "content"],
      properties: {
        node_id: { type: "string", minLength: 1 },
        content: { type: "string", minLength: 1 },
        tags: { type: "array", items: { type: "string" } },
        source: { type: "string" },
        importance: { type: "number", minimum: 0, maximum: 1 },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_write",
    description: "Write an active item directly (skips review). For trusted callers. Audited as 'write'.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["node_id", "content"],
      properties: {
        node_id: { type: "string", minLength: 1 },
        content: { type: "string", minLength: 1 },
        tags: { type: "array", items: { type: "string" } },
        source: { type: "string" },
        importance: { type: "number", minimum: 0, maximum: 1 },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_review",
    description: "Accept (status='active') or reject (soft-delete) a proposed item. Audited.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["item_id", "action"],
      properties: {
        item_id: { type: "string", minLength: 1 },
        action: { type: "string", enum: ["accept", "reject"] },
        reason: { type: "string" },
        actor: { type: "string" },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_list_proposed",
    description: "List items currently in 'proposed' state, awaiting review.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 200 },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_delete",
    description: "Soft-delete an active item. Excluded from search. Kept in store for audit. Audited as 'delete'.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["item_id"],
      properties: {
        item_id: { type: "string", minLength: 1 },
        reason: { type: "string" },
        actor: { type: "string" },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_move_item",
    description: "Move an existing memory item to a different node. Audited.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["item_id", "node_id"],
      properties: {
        item_id: { type: "string", minLength: 1 },
        node_id: { type: "string", minLength: 1 },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_update_node",
    description: "Update an existing memory node's label or metadata. Audited.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string", minLength: 1 },
        label: { type: "string" },
        one_liner: { type: "string" },
        importance: { type: "number", minimum: 0, maximum: 1 },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_delete_node",
    description: "Delete an existing memory node. Sub-nodes and items are moved to the parent node. Audited.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string", minLength: 1 },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_create_node",
    description: "Create a new node in the cognitive map. The id must be dotted snake_case (e.g. 'projects.myapp.auth'). Parent (if any) must exist. Audited as 'create_node'.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id", "label"],
      properties: {
        id: { type: "string", minLength: 1, pattern: "^[a-z0-9_-]+(\\.[a-z0-9_-]+)*$" },
        label: { type: "string", minLength: 1 },
        one_liner: { type: "string" },
        summary: { type: "string" },
        importance: { type: "number", minimum: 0, maximum: 1 },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        freshness: { type: "number", minimum: 0, maximum: 1 },
        status: { type: "string" },
        keywords: { type: "array", items: { type: "string" } },
        links: { type: "array", items: { type: "string" } },
        sources: { type: "array", items: { type: "string" } },
        retrieval_policy: {
          type: "object",
          properties: {
            default_depth: { type: "integer", minimum: 0, maximum: 4 },
            max_tokens: { type: "integer", minimum: 1 },
            require_evidence: { type: "boolean" }
          }
        },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_export",
    description: "Export the current memory snapshot as a portable .brain JSON payload (or write it to disk if output_path is set). Survives reinstall, can be versioned in git, can be re-imported with memory_import.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        output_path: { type: "string", description: "If set, write the snapshot to this absolute path instead of returning it inline." },
        include_mutations: { type: "boolean", description: "Include the full audit log in the snapshot (heavier)." },
        include_deleted: { type: "boolean", description: "Include soft-deleted items (default true)." },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_import",
    description: "Import a paradigm.brain snapshot. Mode 'merge' upserts nodes and items (safe). Mode 'replace' wipes the workspace first (destructive). Audited as 'import'.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        input_path: { type: "string", description: "Absolute path to a .brain JSON file." },
        data: { type: "object", description: "Inline snapshot (alternative to input_path)." },
        mode: { type: "string", enum: ["merge", "replace"], description: "merge (default) or replace." },
        reason: { type: "string" },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_snapshot_diff",
    description: "Compare two paradigm.brain snapshots by node and item id. Accepts inline snapshots or absolute file paths.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        left_path: { type: "string" },
        right_path: { type: "string" },
        left: { type: "object" },
        right: { type: "object" },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_snapshot_restore",
    description: "Restore selected nodes and/or items from a paradigm.brain snapshot using a safe merge. Creates a safety snapshot first.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        source_path: { type: "string" },
        source: { type: "object" },
        item_ids: { type: "array", items: { type: "string", minLength: 1 } },
        node_ids: { type: "array", items: { type: "string", minLength: 1 } },
        reason: { type: "string" },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_feedback",
    description: "Record retrieval feedback for an item and apply a bounded importance/confidence adjustment.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["item_id", "signal"],
      properties: {
        item_id: { type: "string", minLength: 1 },
        signal: { type: "string", enum: ["useful", "ignored"] },
        reason: { type: "string" },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_update_item",
    description: "Update an existing memory item's content or tags. Audited.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["item_id", "content"],
      properties: {
        item_id: { type: "string", minLength: 1 },
        content: { type: "string", minLength: 1 },
        tags: { type: "array", items: { type: "string" } },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_import_markdown",
    description: "Import Markdown/Obsidian content into one memory node. The MCP accepts inline content only; use the paradigm CLI to read files explicitly selected by the user.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["node_id", "content"],
      properties: {
        node_id: { type: "string", minLength: 1 },
        content: { type: "string", minLength: 1 },
        title: { type: "string" },
        source: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        status: { type: "string", enum: ["active", "proposed"] },
        chunk_chars: { type: "integer", minimum: 500, maximum: 8000 },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_dream",
    description: "Offline consolidation pass. Analyses the active store and returns suggested mutations (duplicates to merge, stale items to archive, overloaded nodes to split, orphan items). Never applies anything automatically — call memory_review/memory_delete/memory_propose_write to act on suggestions.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        similarity_threshold: { type: "number", minimum: 0, maximum: 1 },
        max_age_days: { type: "integer", minimum: 1 },
        max_importance: { type: "number", minimum: 0, maximum: 1 },
        max_items_per_node: { type: "integer", minimum: 1 },
        workspace: workspaceProperty
      }
    }
  },
  {
    name: "memory_warm",
    description: "Warm the local embedding cache for current nodes and active items. No-op when embeddings are disabled.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        workspace: workspaceProperty
      }
    }
  }
];

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, payload) {
  write({ jsonrpc: "2.0", id, result: payload });
}

function protocolError(id, code, message, data) {
  write({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data ? { data } : {})
    }
  });
}

export function textContent(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

export async function callTool(service, name, args) {
  if (name === "memory_version") return service.version(args ?? {});
  if (name === "memory_update_check") return service.updateCheck(args ?? {});
  if (name === "memory_self_update") return service.selfUpdate(args ?? {});
  if (name === "memory_search") return service.search(args ?? {});
  if (name === "memory_read") return service.read(args ?? {});
  if (name === "memory_tree") return service.tree(args ?? {});
  if (name === "memory_doctor") return service.doctor(args ?? {});
  if (name === "memory_doctor_fix") return service.doctorFix(args ?? {});
  if (name === "memory_stats") return service.stats(args ?? {});
  if (name === "memory_mutations") return service.mutations(args ?? {});
  if (name === "memory_snapshots") return service.snapshots(args ?? {});
  if (name === "memory_propose_write") return service.proposeWrite(args ?? {});
  if (name === "memory_write") return service.write(args ?? {});
  if (name === "memory_review") return service.review(args ?? {});
  if (name === "memory_list_proposed") return service.listProposed(args ?? {});
  if (name === "memory_update_item") return service.updateItem(args ?? {});
  if (name === "memory_move_item") return service.moveItem(args ?? {});
  if (name === "memory_delete") return service.deleteItem(args ?? {});
  if (name === "memory_create_node") return service.createNode(args ?? {});
  if (name === "memory_update_node") return service.updateNode(args ?? {});
  if (name === "memory_delete_node") return service.deleteNode(args ?? {});
  if (name === "memory_export") return service.exportMemory(args ?? {});
  if (name === "memory_import") return service.importMemory(args ?? {});
  if (name === "memory_snapshot_diff") return service.snapshotDiff(args ?? {});
  if (name === "memory_snapshot_restore") return service.snapshotRestore(args ?? {});
  if (name === "memory_feedback") return service.feedback(args ?? {});
  if (name === "memory_import_markdown") return service.importMarkdown(args ?? {});
  if (name === "memory_dream") return service.dream(args ?? {});
  if (name === "memory_warm") return service.warm(args ?? {});
  const error = new Error(`Unknown tool: ${name}`);
  error.code = "unknown_tool";
  throw error;
}

async function handleCli() {
  const meta = await readPackageMeta();
  if (process.argv.includes("--version") || process.argv.includes("-v")) {
    process.stdout.write(`${meta.name} ${meta.version}\n`);
    process.exit(0);
  }
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    process.stdout.write([
      `${meta.name} ${meta.version}`,
      "",
      "MCP stdio server — local-first cognitive map memory for coding agents.",
      "",
      "Usage:",
      "  paradigm-memory-mcp                     start the stdio server",
      "  paradigm-memory-mcp --version           print version",
      "  paradigm-memory-mcp --help              this help",
      "",
      "Environment:",
      "  PARADIGM_MEMORY_DIR                     base data dir (default: ./data)",
      "  PARADIGM_MEMORY_EMBEDDINGS              ollama | wasm | keyword | off (default: off)",
      "  PARADIGM_OLLAMA_URL                     default http://localhost:11434",
      "  PARADIGM_OLLAMA_EMBED_MODEL             default nomic-embed-text:latest",
      "  PARADIGM_WASM_EMBED_MODEL               default Xenova/all-MiniLM-L6-v2",
      "  PARADIGM_MEMORY_AUTOWARM                0 to disable boot-time embedding warm",
      "  PARADIGM_DISABLE_UPDATE_CHECK           1 to disable GitHub release checks",
      "",
      `Tools exposed: ${toolDefinitions.map((tool) => tool.name).join(", ")}.`,
      ""
    ].join("\n"));
    process.exit(0);
  }
  return meta;
}

export async function main() {
  const meta = await handleCli();
  const service = await createMemoryService({
    packageMeta: meta,
    protocolVersion,
    toolCount: toolDefinitions.length
  });
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  });

  async function handle(message) {
    if (!message || message.jsonrpc !== "2.0") return;
    const { id, method, params } = message;

    if (!method) return;
    if (method === "notifications/initialized") return;

    try {
      if (method === "initialize") {
        result(id, {
          protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "paradigm-memory", version: meta.version }
        });
        return;
      }

      if (method === "ping") {
        result(id, {});
        return;
      }

      if (method === "tools/list") {
        result(id, { tools: toolDefinitions });
        return;
      }

      if (method === "tools/call") {
        const payload = await callTool(service, params?.name, params?.arguments ?? {});
        result(id, textContent(payload));
        return;
      }

      protocolError(id, -32601, `Method not found: ${method}`);
    } catch (caught) {
      const normalized = memoryServiceError(caught);
      protocolError(id, -32000, normalized.message, normalized);
    }
  }

  rl.on("line", (line) => {
    if (!line.trim()) return;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (caught) {
      protocolError(null, -32700, "Parse error", { message: caught.message });
      return;
    }

    if (Array.isArray(parsed)) {
      for (const message of parsed) {
        handle(message).catch((caught) => {
          protocolError(message?.id ?? null, -32603, caught.message);
        });
      }
      return;
    }

    handle(parsed).catch((caught) => {
      protocolError(parsed?.id ?? null, -32603, caught.message);
    });
  });

  const close = () => {
    service.close();
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}

if (path.resolve(process.argv[1] ?? "") === __filename) {
  main().catch((caught) => {
    process.stderr.write(`paradigm-memory MCP failed: ${caught.stack ?? caught.message}\n`);
    process.exit(1);
  });
}
