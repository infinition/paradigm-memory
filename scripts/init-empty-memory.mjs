#!/usr/bin/env node
/**
 * Bootstrap a minimal Paradigm memory tree at PARADIGM_MEMORY_DIR or --dir.
 *
 *   node scripts/init-empty-memory.mjs --dir ./.paradigm
 *   node scripts/init-empty-memory.mjs --workspace myproject --label "My project"
 *
 * Idempotent: refuses to overwrite an existing tree unless --force is passed.
 */
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";

function arg(name, fallback) {
  const flag = `--${name}`;
  const found = process.argv.find((value) => value === flag || value.startsWith(`${flag}=`));
  if (!found) return fallback;
  if (found === flag) {
    const idx = process.argv.indexOf(flag);
    return process.argv[idx + 1] ?? fallback;
  }
  return found.slice(flag.length + 1);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const baseDir = path.resolve(
    arg("dir", process.env.PARADIGM_MEMORY_DIR ?? path.join(process.cwd(), "data"))
  );
  const workspace = arg("workspace", "");
  const label = arg("label", workspace || "Workspace");
  const force = process.argv.includes("--force");

  const memoryDir = workspace
    ? path.join(baseDir, "workspaces", workspace, "memory")
    : path.join(baseDir, "memory");
  const treePath = path.join(memoryDir, "tree.json");
  const itemsPath = path.join(memoryDir, "items.json");

  if (!force && (await exists(treePath))) {
    console.error(`tree.json already exists at ${treePath}. Pass --force to overwrite.`);
    process.exit(1);
  }

  await mkdir(memoryDir, { recursive: true });

  const rootId = "workspace";
  const tree = {
    version: 1,
    updatedAt: new Date().toISOString(),
    roots: [rootId],
    nodes: [
      {
        id: rootId,
        label,
        one_liner: `Root node for ${label}.`,
        summary: "Top-level container for everything this workspace knows. " +
          "Create child nodes for projects, decisions, conventions, references.",
        importance: 1,
        freshness: 1,
        confidence: 1,
        status: "active",
        keywords: ["workspace", "root", "paradigm"],
        children: [],
        links: [],
        sources: [],
        retrieval_policy: {
          default_depth: 1,
          max_tokens: 600,
          require_evidence: false
        }
      }
    ]
  };

  const items = [
    {
      id: `item.${rootId}.welcome`,
      node_id: rootId,
      content: "Welcome to your Paradigm memory. Use memory_create_node to add branches, " +
        "memory_propose_write to add items, memory_review to validate them, memory_search to retrieve.",
      tags: ["welcome", "paradigm"],
      source: "scripts/init-empty-memory.mjs",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      importance: 0.5,
      confidence: 1,
      status: "active"
    }
  ];

  await writeFile(treePath, JSON.stringify(tree, null, 2), "utf8");
  await writeFile(itemsPath, JSON.stringify(items, null, 2), "utf8");

  console.log(JSON.stringify({
    ok: true,
    baseDir,
    workspace: workspace || null,
    memoryDir,
    rootId,
    label,
    files: [treePath, itemsPath]
  }, null, 2));
}

main().catch((caught) => {
  console.error(caught.stack ?? caught.message);
  process.exit(1);
});
