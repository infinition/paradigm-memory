import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as z from "zod";
import { createAtlas, createTrace, dream, writeTrace, createReasoner } from "@paradigm-memory/memory-core";

const workspaceField = z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9._-]+$/).optional();

const searchSchema = z.object({
  query: z.string().trim().min(1),
  depth: z.number().int().min(0).max(4).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  workspace: workspaceField
});

const readSchema = z.object({
  node_id: z.string().trim().min(1),
  include_items: z.boolean().optional(),
  include_proposed: z.boolean().optional(),
  workspace: workspaceField
});

const treeSchema = z.object({
  workspace: workspaceField,
  include_items: z.boolean().optional(),
  include_proposed: z.boolean().optional()
});

const writeContentSchema = z.object({
  node_id: z.string().trim().min(1),
  content: z.string().trim().min(1),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
  importance: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  workspace: workspaceField
});

const reviewSchema = z.object({
  item_id: z.string().trim().min(1),
  action: z.enum(["accept", "reject"]),
  reason: z.string().optional(),
  actor: z.string().optional(),
  workspace: workspaceField
});

const listProposedSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  workspace: workspaceField
});

const deleteSchema = z.object({
  item_id: z.string().trim().min(1),
  reason: z.string().optional(),
  actor: z.string().optional(),
  workspace: workspaceField
});

const updateItemSchema = z.object({
  item_id: z.string().trim().min(1),
  content: z.string().trim().min(1),
  tags: z.array(z.string()).optional(),
  workspace: workspaceField
});

const createNodeSchema = z.object({
  id: z.string().trim().min(1).regex(/^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/, "node id must be dotted snake_case"),
  label: z.string().trim().min(1),
  one_liner: z.string().optional(),
  summary: z.string().optional(),
  importance: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  freshness: z.number().min(0).max(1).optional(),
  status: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  links: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  retrieval_policy: z.object({
    default_depth: z.number().int().min(0).max(4).optional(),
    max_tokens: z.number().int().min(1).optional(),
    require_evidence: z.boolean().optional()
  }).partial().optional(),
  workspace: workspaceField
});

const dreamSchema = z.object({
  workspace: workspaceField,
  similarity_threshold: z.number().min(0).max(1).optional(),
  max_age_days: z.number().int().min(1).optional(),
  max_importance: z.number().min(0).max(1).optional(),
  max_items_per_node: z.number().int().min(1).optional()
});

const exportSchema = z.object({
  workspace: workspaceField,
  output_path: z.string().optional(),
  include_mutations: z.boolean().optional(),
  include_deleted: z.boolean().optional()
});

const importSchema = z.object({
  workspace: workspaceField,
  input_path: z.string().optional(),
  data: z.any().optional(),
  mode: z.enum(["merge", "replace"]).optional(),
  reason: z.string().optional()
}).refine((value) => value.input_path || value.data, {
  message: "Either input_path or data must be provided"
});

const snapshotDiffSchema = z.object({
  left_path: z.string().optional(),
  right_path: z.string().optional(),
  left: z.any().optional(),
  right: z.any().optional(),
  workspace: workspaceField
}).refine((value) => (value.left_path || value.left) && (value.right_path || value.right), {
  message: "Provide left_path or left, and right_path or right"
});

const versionSchema = z.object({
  workspace: workspaceField
});

const updateCheckSchema = z.object({
  workspace: workspaceField,
  timeout_ms: z.number().int().min(100).max(5000).optional()
});

const importMarkdownSchema = z.object({
  workspace: workspaceField,
  node_id: z.string().trim().min(1),
  content: z.string().trim().min(1),
  title: z.string().optional(),
  source: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(["active", "proposed"]).optional(),
  chunk_chars: z.number().int().min(500).max(8000).optional()
});

const selfUpdateSchema = z.object({
  dry_run: z.boolean().optional()
});

const doctorSchema = z.object({
  workspace: workspaceField
});

const mutationsSchema = z.object({
  workspace: workspaceField,
  limit: z.number().int().min(1).max(1000).optional()
});

const snapshotsSchema = z.object({
  workspace: workspaceField,
  limit: z.number().int().min(1).max(200).optional(),
  include_hash: z.boolean().optional()
});

const doctorFixSchema = z.object({
  workspace: workspaceField,
  repairs: z.array(z.enum(["rebuild_fts", "mirror_json", "warm_embeddings"])).optional(),
  dry_run: z.boolean().optional()
});

const snapshotRestoreSchema = z.object({
  workspace: workspaceField,
  source_path: z.string().optional(),
  source: z.any().optional(),
  item_ids: z.array(z.string().trim().min(1)).optional(),
  node_ids: z.array(z.string().trim().min(1)).optional(),
  reason: z.string().optional()
}).refine((value) => value.source_path || value.source, {
  message: "Provide source_path or source"
}).refine((value) => (value.item_ids?.length ?? 0) > 0 || (value.node_ids?.length ?? 0) > 0, {
  message: "Provide at least one item_id or node_id"
});

const feedbackSchema = z.object({
  workspace: workspaceField,
  item_id: z.string().trim().min(1),
  signal: z.enum(["useful", "ignored"]),
  reason: z.string().optional()
});

function nowIso() {
  return new Date().toISOString();
}

/**
 * Default data dir, OpenAI-claude-style: lives in the user profile so it
 * survives a project reinstall / accidental wipe.
 *   Linux/macOS: $HOME/.paradigm
 *   Windows:     %USERPROFILE%\.paradigm
 * Override with PARADIGM_MEMORY_DIR for project-local storage.
 */
export function defaultDataDir() {
  if (process.env.PARADIGM_MEMORY_DIR) return path.resolve(process.env.PARADIGM_MEMORY_DIR);
  return path.join(os.homedir(), ".paradigm");
}

function normalizeError(error) {
  if (error instanceof z.ZodError) {
    return {
      code: "invalid_input",
      message: "Input validation failed",
      issues: error.issues
    };
  }
  return {
    code: error.code ?? "memory_error",
    message: error.message
  };
}

function workspaceDir(baseDir, workspace) {
  if (!workspace) return baseDir;
  return path.join(baseDir, "workspaces", workspace);
}

function safeStamp() {
  return nowIso().replace(/[:.]/g, "-");
}

function slug(value) {
  return String(value ?? "import")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "import";
}

function compareSemver(left, right) {
  const parse = (value) => String(value ?? "0.0.0")
    .replace(/^[^\d]*/, "")
    .split(/[.-]/)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return 1;
    if (a[index] < b[index]) return -1;
  }
  return 0;
}

function runProcess(command, args, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ ok: false, code: null, stdout, stderr: `${stderr}\nTimed out after ${timeoutMs}ms`.trim() });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, code: null, stdout, stderr: error.message });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function explainSearch(pack) {
  return {
    intent: pack.intent,
    semantic_error: pack.semanticError,
    activation: pack.nodes.map((node) => ({
      id: node.id,
      activation: node.activation,
      reason: node.reason ?? null
    })),
    evidence: pack.evidence.map((item) => ({
      id: item.id,
      node_id: item.node_id,
      score: item.score,
      node_activation: item.node_activation,
      was_activated: item.was_activated,
      fts_score: item.fts_score ?? 0,
      importance: item.importance,
      confidence: item.confidence
    }))
  };
}

function indexSnapshot(snapshot) {
  const nodes = new Map((snapshot?.tree?.nodes ?? []).map((node) => [node.id, node]));
  const items = new Map((snapshot?.items ?? []).map((item) => [item.id, item]));
  return { nodes, items };
}

function diffMaps(left, right) {
  const added = [];
  const removed = [];
  const changed = [];
  for (const [id, value] of right.entries()) {
    if (!left.has(id)) added.push(id);
    else if (sha256Json(left.get(id)) !== sha256Json(value)) changed.push(id);
  }
  for (const id of left.keys()) {
    if (!right.has(id)) removed.push(id);
  }
  return { added, removed, changed };
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function snapshotSelection(snapshot, { itemIds = [], nodeIds = [] }) {
  const indexed = indexSnapshot(snapshot);
  const selectedItems = itemIds.map((id) => indexed.items.get(id)).filter(Boolean);
  const selectedNodeIds = new Set(nodeIds);
  for (const item of selectedItems) selectedNodeIds.add(item.node_id);

  const includeAncestors = (nodeId) => {
    const parts = nodeId.split(".");
    for (let index = 1; index <= parts.length; index += 1) {
      const id = parts.slice(0, index).join(".");
      if (indexed.nodes.has(id)) selectedNodeIds.add(id);
    }
  };
  for (const id of [...selectedNodeIds]) includeAncestors(id);

  const selectedNodes = [...selectedNodeIds].map((id) => indexed.nodes.get(id)).filter(Boolean);
  return {
    format: "paradigm.brain",
    format_version: snapshot.format_version ?? 1,
    exported_at: snapshot.exported_at ?? nowIso(),
    tree: {
      version: snapshot.tree?.version ?? 1,
      roots: selectedNodes.filter((node) => !node.parent_id).map((node) => node.id),
      nodes: selectedNodes
    },
    items: selectedItems
  };
}

export async function createMemoryService({
  dataDir = defaultDataDir(),
  packageMeta = { name: "@paradigm-memory/memory-mcp", version: "0.0.0" },
  protocolVersion = "2025-03-26",
  toolCount = null
} = {}) {
  const baseDir = dataDir;
  const atlasPool = new Map();          // workspace -> atlas
  const traceDirs = new Map();          // workspace -> dataDir for traces
  let reasoner = null;

  async function getReasoner() {
    if (reasoner) return reasoner;
    reasoner = await createReasoner({
      model: "onnx-community/Qwen2.5-1.5B-Instruct",
      device: "cpu" // Safe default for Node
    });
    return reasoner;
  }

  async function getAtlas(workspace) {
    const key = workspace ?? "";
    if (atlasPool.has(key)) return atlasPool.get(key);
    const wsDir = workspaceDir(baseDir, workspace);
    const atlas = await createAtlas({ dataDir: wsDir });
    atlasPool.set(key, atlas);
    traceDirs.set(key, wsDir);
    return atlas;
  }

  function findNode(atlas, id) {
    return atlas.tree.nodes.find((node) => node.id === id) ?? null;
  }

  function childrenFor(atlas, node) {
    const ids = new Set(node.children ?? []);
    return atlas.tree.nodes.filter((candidate) => ids.has(candidate.id));
  }

  async function logTrace(workspace, payload) {
    const dir = traceDirs.get(workspace ?? "") ?? baseDir;
    await writeTrace(dir, createTrace(payload));
  }

  async function writeAutoSnapshot(atlas, workspace, reason) {
    const snapshot = atlas.exportSnapshot({ includeMutations: true, includeDeleted: true });
    const filename = `${workspace ? `${slug(workspace)}-` : ""}${safeStamp()}-${slug(reason)}.brain`;
    const dir = path.join(baseDir, "snapshots");
    const fullPath = path.join(dir, filename);
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, JSON.stringify(snapshot, null, 2), "utf8");
    return fullPath;
  }

  function markdownChunks(markdown, maxChars) {
    const normalized = markdown.replace(/\r\n/g, "\n").trim();
    const sections = normalized.split(/\n(?=#{1,6}\s+)/g).map((part) => part.trim()).filter(Boolean);
    const chunks = [];
    for (const section of sections.length ? sections : [normalized]) {
      if (section.length <= maxChars) {
        chunks.push(section);
        continue;
      }
      const paragraphs = section.split(/\n{2,}/g).map((part) => part.trim()).filter(Boolean);
      let current = "";
      for (const paragraph of paragraphs) {
        if ((current + "\n\n" + paragraph).length > maxChars && current) {
          chunks.push(current);
          current = paragraph;
        } else {
          current = current ? `${current}\n\n${paragraph}` : paragraph;
        }
      }
      if (current) chunks.push(current);
    }
    return chunks;
  }

  return {
    dataDir: baseDir,

    async version(input) {
      const args = versionSchema.parse(input ?? {});
      const atlas = await getAtlas(args.workspace);
      const stats = atlas.memoryStats();
      return {
        package_name: packageMeta.name,
        canary: "HELLO_FROM_SOURCE",
        version: packageMeta.version,
        protocol_version: protocolVersion,
        tool_count: toolCount,
        data_dir: baseDir,
        workspace: args.workspace ?? null,
        workspace_dir: workspaceDir(baseDir, args.workspace),
        storage: "sqlite",
        profile_default: defaultDataDir(),
        update_check_disabled: process.env.PARADIGM_DISABLE_UPDATE_CHECK === "1",
        stats
      };
    },

    async updateCheck(input) {
      const args = updateCheckSchema.parse(input ?? {});
      const current = packageMeta.version ?? "0.0.0";
      if (process.env.PARADIGM_DISABLE_UPDATE_CHECK === "1") {
        return {
          enabled: false,
          package_name: packageMeta.name,
          current,
          latest: null,
          update_available: false,
          reason: "disabled_by_env"
        };
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), args.timeout_ms ?? 1200);
      try {
        const encoded = encodeURIComponent(packageMeta.name);
        const response = await fetch(`https://registry.npmjs.org/${encoded}/latest`, {
          signal: controller.signal,
          headers: { "accept": "application/json" }
        });
        if (!response.ok) {
          return {
            enabled: true,
            package_name: packageMeta.name,
            current,
            latest: null,
            update_available: false,
            checked_at: nowIso(),
            error: `npm_registry_${response.status}`
          };
        }
        const payload = await response.json();
        const latest = payload.version ?? null;
        return {
          enabled: true,
          package_name: packageMeta.name,
          current,
          latest,
          update_available: latest ? compareSemver(latest, current) > 0 : false,
          checked_at: nowIso()
        };
      } catch (caught) {
        return {
          enabled: true,
          package_name: packageMeta.name,
          current,
          latest: null,
          update_available: false,
          checked_at: nowIso(),
          error: caught.name === "AbortError" ? "timeout" : caught.message
        };
      } finally {
        clearTimeout(timeout);
      }
    },

    async selfUpdate(input) {
      const args = selfUpdateSchema.parse(input ?? {});
      const enabled = process.env.PARADIGM_ALLOW_SELF_UPDATE === "1";
      const command = process.platform === "win32" ? "npm.cmd" : "npm";
      const packages = ["@paradigm-memory/memory-core", "@paradigm-memory/memory-mcp", "@paradigm-memory/memory-cli"];
      if (!enabled) {
        return {
          enabled: false,
          ok: false,
          reason: "disabled_by_default",
          required_env: "PARADIGM_ALLOW_SELF_UPDATE=1",
          command,
          args: ["update", "-g", ...packages]
        };
      }
      if (args.dry_run) {
        return {
          enabled: true,
          ok: true,
          dry_run: true,
          command,
          args: ["update", "-g", ...packages]
        };
      }
      const result = await runProcess(command, ["update", "-g", ...packages]);
      return {
        enabled: true,
        ok: result.ok,
        code: result.code,
        command,
        args: ["update", "-g", ...packages],
        stdout: result.stdout.slice(-8000),
        stderr: result.stderr.slice(-8000)
      };
    },

    async search(input) {
      const args = searchSchema.parse(input);
      const atlas = await getAtlas(args.workspace);
      await atlas.hydrateFromStore();
      const started = performance.now();
      const pack = await atlas.buildContextPackAsync(args.query, {
        maxTokens: 1200,
        evidenceLimit: args.limit ?? 8,
        maxGated: args.depth ? Math.max(3, args.depth + 3) : 7
      });
      const result = {
        query: args.query,
        workspace: args.workspace ?? null,
        intent: pack.intent,
        debug: {
          token_estimate: pack.tokenEstimate,
          node_ids_activated: pack.nodes.map(n => n.id),
          evidence_count: pack.evidence.length,
          why: explainSearch(pack)
        },
        latency_ms: Math.round((performance.now() - started) * 1000) / 1000,
        token_estimate: pack.tokenEstimate,
        nodes: pack.nodes.map((node) => ({
          id: node.id,
          label: node.label,
          activation: node.activation,
          status: node.status,
          one_liner: node.one_liner
        })),
        evidence: pack.evidence.map((item) => ({
          id: item.id,
          node_id: item.node_id,
          content: item.content,
          tags: item.tags ?? [],
          source: item.source,
          score: item.score,
          importance: item.importance,
          confidence: item.confidence
        })),
        context_pack: pack.contextPack.map((item) => ({
          type: item.type,
          id: item.id,
          node_id: item.node_id,
          activation: item.activation,
          score: item.score,
          text: item.text,
          source: item.source,
          sources: item.sources
        }))
      };
      await logTrace(args.workspace, {
        operation: "mcp.memory.search",
        input: args,
        steps: {
          intent: pack.intent,
          semantic_error: pack.semanticError,
          activation: result.nodes,
          retrieval: result.debug.why.evidence,
          context_pack: result.context_pack.map((item) => ({ type: item.type, id: item.id, node_id: item.node_id }))
        },
        result: {
          token_estimate: result.token_estimate,
          latency_ms: result.latency_ms
        }
      });
      return result;
    },

    async doctor(input) {
      const args = doctorSchema.parse(input ?? {});
      const atlas = await getAtlas(args.workspace);
      const nodes = atlas.tree.nodes;
      const nodeIds = new Set(nodes.map((node) => node.id));
      const activeItems = atlas.listItems({ limit: 100000, statuses: ["active"] });
      const proposedItems = atlas.listItems({ limit: 100000, statuses: ["proposed"] });
      const allVisibleItems = [...activeItems, ...proposedItems];
      const stats = atlas.memoryStats();
      const orphanItems = allVisibleItems.filter((item) => !nodeIds.has(item.node_id));
      const brokenChildren = [];

      for (const node of nodes) {
        for (const child of node.children ?? []) {
          if (!nodeIds.has(child)) brokenChildren.push({ node_id: node.id, missing_child_id: child });
        }
      }

      const expectedEmbeddings = nodes.length + allVisibleItems.length;
      const embeddingGap = Math.max(0, expectedEmbeddings - (stats.embeddingCount ?? 0));
      const checks = [
        { id: "sqlite_wal", ok: stats.journalMode === "wal", detail: `journal_mode=${stats.journalMode ?? "unknown"}` },
        { id: "sqlite_busy_timeout", ok: (stats.busyTimeoutMs ?? 0) >= 5000, detail: `busy_timeout=${stats.busyTimeoutMs ?? "unknown"}ms` },
        { id: "orphan_items", ok: orphanItems.length === 0, detail: `${orphanItems.length} orphan item(s)` },
        { id: "broken_children", ok: brokenChildren.length === 0, detail: `${brokenChildren.length} broken child link(s)` },
        { id: "embedding_cache", ok: embeddingGap === 0, detail: `${embeddingGap} missing embedding(s) estimate` }
      ];
      const score = Math.round((checks.filter((check) => check.ok).length / checks.length) * 100);

      return {
        workspace: args.workspace ?? null,
        data_dir: baseDir,
        workspace_dir: workspaceDir(baseDir, args.workspace),
        score,
        ok: checks.every((check) => check.ok),
        checks,
        stats,
        orphan_items: orphanItems.map((item) => ({ id: item.id, node_id: item.node_id })),
        broken_children: brokenChildren,
        suggestions: [
          ...(embeddingGap ? ["Run `paradigm warm` or call memory_warm after bulk imports."] : []),
          ...(orphanItems.length ? ["Move or delete orphan items; they cannot be reached from the cognitive map."] : []),
          ...(brokenChildren.length ? ["Repair node children arrays or recreate the missing nodes."] : [])
        ]
      };
    },

    async doctorFix(input) {
      const args = doctorFixSchema.parse(input ?? {});
      const atlas = await getAtlas(args.workspace);
      const repairs = args.repairs?.length ? args.repairs : ["rebuild_fts", "mirror_json"];
      const before = await this.doctor({ workspace: args.workspace });
      const applied = [];

      if (!args.dry_run) {
        if (repairs.includes("rebuild_fts")) {
          atlas.rebuildIndexes();
          applied.push("rebuild_fts");
        }
        if (repairs.includes("mirror_json")) {
          await atlas.reload();
          applied.push("mirror_json");
        }
        if (repairs.includes("warm_embeddings")) {
          await atlas.warmEmbeddings({});
          applied.push("warm_embeddings");
        }
        await logTrace(args.workspace, {
          operation: "mcp.memory.doctor_fix",
          input: args,
          steps: { repairs },
          result: { applied }
        });
      }

      return {
        workspace: args.workspace ?? null,
        dry_run: Boolean(args.dry_run),
        requested: repairs,
        applied: args.dry_run ? [] : applied,
        before,
        after: args.dry_run ? before : await this.doctor({ workspace: args.workspace })
      };
    },

    async stats(input) {
      const args = doctorSchema.parse(input ?? {});
      const atlas = await getAtlas(args.workspace);
      const nodes = atlas.tree.nodes;
      const activeItems = atlas.listItems({ limit: 100000, statuses: ["active"] });
      const proposedItems = atlas.listItems({ limit: 100000, statuses: ["proposed"] });
      const mutations = atlas.listMutations(100000);
      const itemCountsByNode = {};
      for (const item of activeItems) itemCountsByNode[item.node_id] = (itemCountsByNode[item.node_id] ?? 0) + 1;
      const topNodes = Object.entries(itemCountsByNode)
        .map(([node_id, item_count]) => ({ node_id, item_count }))
        .sort((a, b) => b.item_count - a.item_count)
        .slice(0, 10);
      return {
        workspace: args.workspace ?? null,
        data_dir: baseDir,
        workspace_dir: workspaceDir(baseDir, args.workspace),
        storage: atlas.memoryStats(),
        counts: {
          nodes: nodes.length,
          active_items: activeItems.length,
          proposed_items: proposedItems.length,
          mutations: mutations.length
        },
        top_nodes: topNodes,
        freshness: {
          min: Math.min(...nodes.map((node) => node.freshness ?? 0)),
          max: Math.max(...nodes.map((node) => node.freshness ?? 0)),
          avg: nodes.length ? nodes.reduce((sum, node) => sum + (node.freshness ?? 0), 0) / nodes.length : 0
        }
      };
    },

    async mutations(input) {
      const args = mutationsSchema.parse(input ?? {});
      const atlas = await getAtlas(args.workspace);
      await atlas.hydrateFromStore();
      const limit = args.limit ?? 200;
      const mutations = atlas.listMutations(limit);
      return {
        workspace: args.workspace ?? null,
        count: mutations.length,
        mutations
      };
    },

    async snapshots(input) {
      const args = snapshotsSchema.parse(input ?? {});
      const dir = path.join(baseDir, "snapshots");
      const workspacePrefix = args.workspace ? `${slug(args.workspace)}-` : null;
      let entries = [];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return {
          workspace: args.workspace ?? null,
          directory: dir,
          count: 0,
          snapshots: []
        };
      }

      const rows = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".brain")) continue;
        if (workspacePrefix && !entry.name.startsWith(workspacePrefix)) continue;
        const fullPath = path.join(dir, entry.name);
        const info = await stat(fullPath);
        const row = {
          name: entry.name,
          path: fullPath,
          bytes: info.size,
          modified_at: info.mtime.toISOString(),
          reason: entry.name.replace(/\.brain$/, "").replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-?/, "")
        };
        if (args.include_hash) {
          row.sha256 = createHash("sha256").update(await readFile(fullPath)).digest("hex");
        }
        rows.push(row);
      }

      rows.sort((a, b) => b.modified_at.localeCompare(a.modified_at));
      return {
        workspace: args.workspace ?? null,
        directory: dir,
        count: rows.length,
        snapshots: rows.slice(0, args.limit ?? 50)
      };
    },

    async read(input) {
      const args = readSchema.parse(input);
      const atlas = await getAtlas(args.workspace);
      await atlas.hydrateFromStore();
      const node = findNode(atlas, args.node_id);
      if (!node) {
        const error = new Error(`Unknown memory node: ${args.node_id}`);
        error.code = "unknown_node";
        throw error;
      }
      const includeProposed = args.include_proposed ?? true;
      const items = args.include_items
        ? atlas.listItems({
            limit: 1000,
            statuses: includeProposed ? ["active", "proposed"] : ["active"]
          }).filter((item) => item.node_id === node.id)
        : [];
      const result = {
        node,
        children: childrenFor(atlas, node),
        items
      };
      await logTrace(args.workspace, {
        operation: "mcp.memory.read",
        input: args,
        steps: {
          node_id: node.id,
          child_count: result.children.length,
          include_items: Boolean(args.include_items)
        },
        result: { item_count: result.items.length }
      });
      return result;
    },

    async tree(input) {
      const args = treeSchema.parse(input ?? {});
      const atlas = await getAtlas(args.workspace);
      await atlas.hydrateFromStore();
      const includeItems = args.include_items ?? false;
      const statuses = args.include_proposed ? ["active", "proposed"] : ["active"];
      const items = includeItems
        ? atlas.listItems({ limit: 100000, statuses })
        : [];
      const counts = {};
      for (const item of atlas.listItems({ limit: 100000, statuses: ["active"] })) {
        counts[item.node_id] = (counts[item.node_id] ?? 0) + 1;
      }
      const result = {
        workspace: args.workspace ?? null,
        roots: atlas.tree.roots ?? atlas.tree.nodes.filter((node) => !node.parent_id).map((node) => node.id),
        nodes: atlas.tree.nodes,
        items,
        item_counts: counts,
        stats: atlas.memoryStats()
      };
      await logTrace(args.workspace, {
        operation: "mcp.memory.tree",
        input: args,
        steps: {
          node_count: result.nodes.length,
          include_items: includeItems
        },
        result: {
          node_count: result.nodes.length,
          item_count: items.length
        }
      });
      return result;
    },

    async proposeWrite(input) {
      const args = writeContentSchema.parse(input);
      const atlas = await getAtlas(args.workspace);
      const node = findNode(atlas, args.node_id);
      if (!node) {
        const error = new Error(`Unknown memory node: ${args.node_id}`);
        error.code = "unknown_node";
        throw error;
      }
      const timestamp = nowIso();
      const item = atlas.writeItem({
        id: `mem.mcp.${args.node_id}.${Date.now().toString(36)}.${randomUUID().slice(0, 8)}`,
        node_id: args.node_id,
        content: args.content,
        tags: args.tags ?? ["mcp"],
        source: args.source ?? "mcp://propose_write",
        created_at: timestamp,
        updated_at: timestamp,
        importance: args.importance ?? 0.6,
        confidence: args.confidence ?? 0.8,
        status: "proposed"
      }, { actor: "mcp", reason: "propose_write" });

      const result = { item, mutation: atlas.listMutations(1)[0] ?? null };
      await logTrace(args.workspace, {
        operation: "mcp.memory.propose_write",
        input: { node_id: args.node_id, content_length: args.content.length, tags: args.tags ?? ["mcp"] },
        steps: { validation: "accepted", audit_actor: "mcp", status: "proposed" },
        result: { item_id: result.item.id, mutation_id: result.mutation?.id }
      });
      return result;
    },

    async write(input) {
      const args = writeContentSchema.parse(input);
      const atlas = await getAtlas(args.workspace);
      const node = findNode(atlas, args.node_id);
      if (!node) {
        const error = new Error(`Unknown memory node: ${args.node_id}`);
        error.code = "unknown_node";
        throw error;
      }
      const timestamp = nowIso();
      const item = atlas.writeItem({
        id: `mem.mcp.${args.node_id}.${Date.now().toString(36)}.${randomUUID().slice(0, 8)}`,
        node_id: args.node_id,
        content: args.content,
        tags: args.tags ?? ["mcp"],
        source: args.source ?? "mcp://write",
        created_at: timestamp,
        updated_at: timestamp,
        importance: args.importance ?? 0.6,
        confidence: args.confidence ?? 0.8,
        status: "active"
      }, { actor: "mcp", reason: "direct_write" });

      const result = { item, mutation: atlas.listMutations(1)[0] ?? null };
      await logTrace(args.workspace, {
        operation: "mcp.memory.write",
        input: { node_id: args.node_id, content_length: args.content.length, tags: args.tags ?? ["mcp"] },
        steps: { validation: "accepted", audit_actor: "mcp", status: "active" },
        result: { item_id: result.item.id, mutation_id: result.mutation?.id }
      });
      return result;
    },

    async review(input) {
      const args = reviewSchema.parse(input);
      const atlas = await getAtlas(args.workspace);
      const reviewed = atlas.reviewItem(args.item_id, {
        action: args.action,
        actor: args.actor ?? "mcp",
        reason: args.reason ?? `${args.action}_via_mcp`
      });
      if (!reviewed) {
        const error = new Error(`Unknown memory item: ${args.item_id}`);
        error.code = "unknown_item";
        throw error;
      }
      const result = { item: reviewed, mutation: atlas.listMutations(1)[0] ?? null };
      await logTrace(args.workspace, {
        operation: "mcp.memory.review",
        input: { item_id: args.item_id, action: args.action },
        steps: { audit_actor: args.actor ?? "mcp", new_status: reviewed.status },
        result: { item_id: reviewed.id, mutation_id: result.mutation?.id }
      });
      return result;
    },

    async listProposed(input) {
      const args = listProposedSchema.parse(input ?? {});
      const atlas = await getAtlas(args.workspace);
      const limit = args.limit ?? 50;
      const proposed = atlas.listItems({ limit, statuses: ["proposed"] });
      return { count: proposed.length, items: proposed };
    },

    async deleteItem(input) {
      const args = deleteSchema.parse(input);
      const atlas = await getAtlas(args.workspace);
      const snapshotPath = await writeAutoSnapshot(atlas, args.workspace, "before-delete");
      const deleted = atlas.deleteItem(args.item_id, {
        actor: args.actor ?? "mcp",
        reason: args.reason ?? "delete_via_mcp"
      });
      if (!deleted) {
        const error = new Error(`Unknown memory item: ${args.item_id}`);
        error.code = "unknown_item";
        throw error;
      }
      const result = { item: deleted, mutation: atlas.listMutations(1)[0] ?? null, snapshot_path: snapshotPath };
      await logTrace(args.workspace, {
        operation: "mcp.memory.delete",
        input: { item_id: args.item_id },
        steps: { audit_actor: args.actor ?? "mcp", new_status: "deleted" },
        result: { item_id: deleted.id, mutation_id: result.mutation?.id }
      });
      return result;
    },

    async updateItem(input) {
      const args = updateItemSchema.parse(input);
      const atlas = await getAtlas(args.workspace);
      const existing = atlas.items.find((i) => i.id === args.item_id);
      if (!existing) {
        const error = new Error(`Unknown memory item: ${args.item_id}`);
        error.code = "unknown_item";
        throw error;
      }
      const timestamp = nowIso();
      const updated = atlas.writeItem({
        ...existing,
        content: args.content,
        tags: args.tags ?? existing.tags,
        updated_at: timestamp
      }, { actor: "mcp", reason: "update_via_studio" });

      const result = { item: updated, mutation: atlas.listMutations(1)[0] ?? null };
      await logTrace(args.workspace, {
        operation: "mcp.memory.update_item",
        input: { item_id: args.item_id, content_length: args.content.length },
        steps: { audit_actor: "mcp" },
        result: { item_id: updated.id, mutation_id: result.mutation?.id }
      });
      return result;
    },

    async createNode(input) {
      const args = createNodeSchema.parse(input);
      const atlas = await getAtlas(args.workspace);
      const node = atlas.createNode({
        id: args.id,
        label: args.label,
        one_liner: args.one_liner ?? "",
        summary: args.summary ?? "",
        importance: args.importance ?? 0.5,
        confidence: args.confidence ?? 0.7,
        freshness: args.freshness ?? 0.8,
        status: args.status ?? "active",
        keywords: args.keywords ?? [],
        children: [],
        links: args.links ?? [],
        sources: args.sources ?? [],
        retrieval_policy: args.retrieval_policy ?? {
          default_depth: 1,
          max_tokens: 400,
          require_evidence: false
        }
      }, { actor: "mcp", reason: "create_node_via_mcp" });

      const result = { node, mutation: atlas.listMutations(1)[0] ?? null };
      await logTrace(args.workspace, {
        operation: "mcp.memory.create_node",
        input: { id: args.id, label: args.label },
        steps: { audit_actor: "mcp" },
        result: { node_id: node.id, mutation_id: result.mutation?.id }
      });
      return result;
    },

    async exportMemory(input) {
      const args = exportSchema.parse(input ?? {});
      const atlas = await getAtlas(args.workspace);
      const snapshot = atlas.exportSnapshot({
        includeMutations: args.include_mutations ?? false,
        includeDeleted: args.include_deleted ?? true
      });
      const snapshotHash = sha256Json(snapshot);
      let writtenPath = null;
      if (args.output_path) {
        const resolved = path.resolve(args.output_path);
        await mkdir(path.dirname(resolved), { recursive: true });
        await writeFile(resolved, JSON.stringify(snapshot, null, 2), "utf8");
        writtenPath = resolved;
      }
      const result = {
        format: snapshot.format,
        format_version: snapshot.format_version,
        exported_at: snapshot.exported_at,
        stats: snapshot.stats,
        sha256: snapshotHash,
        output_path: writtenPath,
        snapshot: writtenPath ? null : snapshot
      };
      await logTrace(args.workspace, {
        operation: "mcp.memory.export",
        input: { output_path: writtenPath, include_mutations: args.include_mutations ?? false },
        steps: { node_count: snapshot.stats.node_count, item_count: snapshot.stats.item_count },
        result: { output_path: writtenPath, sha256: snapshotHash }
      });
      return result;
    },

    async importMemory(input) {
      const args = importSchema.parse(input ?? {});
      const atlas = await getAtlas(args.workspace);
      let payload = args.data;
      let sourcePath = null;
      if (args.input_path) {
        sourcePath = path.resolve(args.input_path);
        const raw = await readFile(sourcePath, "utf8");
        payload = JSON.parse(raw);
      }
      const snapshotPath = (args.mode ?? "merge") === "replace"
        ? await writeAutoSnapshot(atlas, args.workspace, "before-import-replace")
        : null;
      const result = await atlas.importSnapshot(payload, {
        mode: args.mode ?? "merge",
        actor: "mcp",
        reason: args.reason ?? (sourcePath ? `import_from:${sourcePath}` : "import_inline")
      });
      await logTrace(args.workspace, {
        operation: "mcp.memory.import",
        input: { input_path: sourcePath, mode: args.mode ?? "merge" },
        steps: result,
        result
      });
      return {
        ...result,
        node_count: result.importedNodes,
        item_count: result.importedItems,
        source_path: sourcePath,
        snapshot_path: snapshotPath
      };
    },

    async snapshotDiff(input) {
      const args = snapshotDiffSchema.parse(input ?? {});
      const load = async (inline, filePath) => {
        if (inline) return inline;
        const raw = await readFile(path.resolve(filePath), "utf8");
        return JSON.parse(raw);
      };
      const left = await load(args.left, args.left_path);
      const right = await load(args.right, args.right_path);
      const leftIndex = indexSnapshot(left);
      const rightIndex = indexSnapshot(right);
      const nodeDiff = diffMaps(leftIndex.nodes, rightIndex.nodes);
      const itemDiff = diffMaps(leftIndex.items, rightIndex.items);
      return {
        left: {
          exported_at: left.exported_at ?? null,
          sha256: sha256Json(left),
          stats: left.stats ?? null
        },
        right: {
          exported_at: right.exported_at ?? null,
          sha256: sha256Json(right),
          stats: right.stats ?? null
        },
        nodes: nodeDiff,
        items: itemDiff,
        summary: {
          nodes_added: nodeDiff.added.length,
          nodes_removed: nodeDiff.removed.length,
          nodes_changed: nodeDiff.changed.length,
          items_added: itemDiff.added.length,
          items_removed: itemDiff.removed.length,
          items_changed: itemDiff.changed.length
        }
      };
    },

    async snapshotRestore(input) {
      const args = snapshotRestoreSchema.parse(input ?? {});
      const atlas = await getAtlas(args.workspace);
      let source = args.source;
      let sourcePath = null;
      if (args.source_path) {
        sourcePath = path.resolve(args.source_path);
        const raw = await readFile(sourcePath, "utf8");
        source = JSON.parse(raw);
      }
      const selection = snapshotSelection(source, {
        itemIds: args.item_ids ?? [],
        nodeIds: args.node_ids ?? []
      });
      const snapshotPath = await writeAutoSnapshot(atlas, args.workspace, "before-selective-restore");
      const result = await atlas.importSnapshot(selection, {
        mode: "merge",
        actor: "mcp",
        reason: args.reason ?? "selective_snapshot_restore"
      });
      await logTrace(args.workspace, {
        operation: "mcp.memory.snapshot_restore",
        input: {
          source_path: sourcePath,
          item_ids: args.item_ids ?? [],
          node_ids: args.node_ids ?? []
        },
        steps: result,
        result
      });
      return {
        ...result,
        node_count: result.importedNodes,
        item_count: result.importedItems,
        source_path: sourcePath,
        snapshot_path: snapshotPath
      };
    },

    async feedback(input) {
      const args = feedbackSchema.parse(input ?? {});
      const atlas = await getAtlas(args.workspace);
      const existing = atlas.items.find((item) => item.id === args.item_id);
      if (!existing) {
        const error = new Error(`Unknown memory item: ${args.item_id}`);
        error.code = "unknown_item";
        throw error;
      }
      const useful = args.signal === "useful";
      const tags = new Set(existing.tags ?? []);
      tags.delete("feedback:useful");
      tags.delete("feedback:ignored");
      tags.add(`feedback:${args.signal}`);
      const updated = atlas.writeItem({
        ...existing,
        tags: [...tags],
        importance: clamp((existing.importance ?? 0.5) + (useful ? 0.06 : -0.04)),
        confidence: clamp((existing.confidence ?? 0.8) + (useful ? 0.03 : -0.03)),
        updated_at: nowIso()
      }, {
        actor: "mcp",
        reason: args.reason ?? `feedback_${args.signal}`,
        operation: "update"
      });
      await logTrace(args.workspace, {
        operation: "mcp.memory.feedback",
        input: args,
        steps: {
          previous_importance: existing.importance,
          previous_confidence: existing.confidence
        },
        result: {
          item_id: updated.id,
          importance: updated.importance,
          confidence: updated.confidence
        }
      });
      return { item: updated, mutation: atlas.listMutations(1)[0] ?? null };
    },

    async importMarkdown(input) {
      const args = importMarkdownSchema.parse(input ?? {});
      const atlas = await getAtlas(args.workspace);
      const node = findNode(atlas, args.node_id);
      if (!node) {
        const error = new Error(`Unknown memory node: ${args.node_id}`);
        error.code = "unknown_node";
        throw error;
      }
      const chunks = markdownChunks(args.content, args.chunk_chars ?? 2400);
      const timestamp = nowIso();
      const status = args.status ?? "active";
      const written = [];
      for (let index = 0; index < chunks.length; index += 1) {
        const title = args.title ? `${args.title}${chunks.length > 1 ? ` #${index + 1}` : ""}` : `markdown import #${index + 1}`;
        const item = atlas.writeItem({
          id: `mem.markdown.${args.node_id}.${Date.now().toString(36)}.${index}.${randomUUID().slice(0, 8)}`,
          node_id: args.node_id,
          content: `${title}\n\n${chunks[index]}`,
          tags: [...new Set([...(args.tags ?? []), "markdown", "import"])],
          source: args.source ?? "markdown://inline",
          created_at: timestamp,
          updated_at: timestamp,
          importance: 0.55,
          confidence: 0.75,
          status
        }, {
          actor: "mcp",
          reason: status === "proposed" ? "markdown_import_propose" : "markdown_import"
        });
        written.push(item);
      }
      await logTrace(args.workspace, {
        operation: "mcp.memory.import_markdown",
        input: { node_id: args.node_id, source: args.source, chunk_count: chunks.length, status },
        steps: { chunk_chars: args.chunk_chars ?? 2400 },
        result: { item_count: written.length }
      });
      return {
        node_id: args.node_id,
        status,
        item_count: written.length,
        items: written,
        mutations: atlas.listMutations(written.length)
      };
    },

    async dream(input) {
      const args = dreamSchema.parse(input ?? {});
      const atlas = await getAtlas(args.workspace);
      const snapshot = {
        items: atlas.listItems({ limit: 100000, statuses: ["active"] }),
        nodes: atlas.tree.nodes
      };
      const activeReasoner = process.env.PARADIGM_DREAM_REASONER === "1"
        ? await getReasoner().catch(() => null)
        : null;
      const report = await dream(snapshot, {
        reasoner: activeReasoner,
        duplicates: { similarityThreshold: args.similarity_threshold ?? 0.55 },
        stale: {
          maxAgeDays: args.max_age_days ?? 90,
          maxImportance: args.max_importance ?? 0.4
        },
        overloaded: { maxItemsPerNode: args.max_items_per_node ?? 30 }
      });
      await logTrace(args.workspace, {
        operation: "mcp.memory.dream",
        input: args,
        steps: { totals: report.summary, elapsed_ms: report.elapsed_ms },
        result: { proposal_count: report.summary.total }
      });
      return report;
    },

    async warm(input) {
      const args = versionSchema.parse(input ?? {});
      const atlas = await getAtlas(args.workspace);
      const started = performance.now();
      const result = await atlas.warmEmbeddings({});
      const elapsed_ms = Math.round((performance.now() - started) * 1000) / 1000;
      await logTrace(args.workspace, {
        operation: "mcp.memory.warm",
        input: args,
        steps: { enabled: result.enabled, model: result.model },
        result: { ...result, elapsed_ms }
      });
      return { ...result, workspace: args.workspace ?? null, elapsed_ms };
    },

    close() {
      for (const atlas of atlasPool.values()) {
        try { atlas.close(); } catch { /* swallow */ }
      }
      atlasPool.clear();
    }
  };
}

export function memoryServiceError(error) {
  return normalizeError(error);
}
