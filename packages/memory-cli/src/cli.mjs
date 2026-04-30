#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryService, defaultDataDir } from "@paradigm-memory/memory-mcp";

const VERSION = "0.1.0";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rl = createInterface({ input, output });

function usage() {
  console.log(`paradigm ${VERSION}

Usage:
  paradigm                 launch Memory Studio when run from the repo
  paradigm studio          launch Memory Studio
  paradigm update          update packages / reinstall deps
  paradigm uninstall       unregister MCP clients, keep memory by default
  paradigm export [file]   export a .brain snapshot
  paradigm import [file]   import a .brain snapshot
  paradigm ingest <path>   import Markdown/YAML/text files into a node
  paradigm warm            force-compute embeddings for every node and item
  paradigm doctor          report items missing embeddings (read-only)
  paradigm serve           start local HTTP/SSE bridge
  paradigm dream           run consolidation analysis
  paradigm version         print version and active memory dir

Options:
  --workspace <name>       target workspace
  --dir <path>             memory dir (default: ~/.paradigm)
  --purge-memory           with uninstall, delete memory dir (dangerous)
  --node <id>              target node for ingest (default: workspace)
  --proposed               ingest Markdown as proposed items
  --warm                   with ingest, warm embeddings after ingestion
`);
}

function arg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}
function has(name) { return process.argv.includes(name); }
function memoryDir() { return path.resolve(arg("--dir") ?? process.env.PARADIGM_MEMORY_DIR ?? defaultDataDir()); }
function workspaceArgs() { const ws = arg("--workspace"); return ws ? { workspace: ws } : {}; }
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const quotedCmd = (process.platform === "win32" && cmd.includes(" ")) ? `"${cmd}"` : cmd;
    const child = spawn(quotedCmd, args, { stdio: "inherit", shell: process.platform === "win32", ...opts });
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
  });
}
function findRepoRoot() {
  let cur = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(path.join(cur, "packages", "memory-studio", "package.json"))) return cur;
    const next = path.dirname(cur);
    if (next === cur) break;
    cur = next;
  }
  let cur2 = path.resolve(__dirname, "..", "..", "..");
  if (existsSync(path.join(cur2, "packages", "memory-studio", "package.json"))) return cur2;
  return null;
}
async function withService(fn) {
  const service = await createMemoryService({
    dataDir: memoryDir(),
    packageMeta: { name: "@paradigm-memory/memory-cli", version: VERSION },
    toolCount: 16
  });
  try { return await fn(service); } finally { service.close(); }
}
async function commandStudio() {
  const root = findRepoRoot();
  if (!root) {
    console.log("Memory Studio is available from a source checkout for now.");
    console.log("Run: git clone https://github.com/Infinition/paradigm-memory && cd paradigm-memory && npm run studio:dev");
    return;
  }
  await run("npm", ["run", "studio:dev"], { cwd: root, env: { ...process.env, PARADIGM_MEMORY_DIR: memoryDir() } });
}
async function commandUpdate() {
  const root = findRepoRoot();
  if (root) await run("npm", ["install", "--no-fund", "--no-audit"], { cwd: root });
  else await run("npm", ["update", "-g", "@paradigm-memory/memory-core", "@paradigm-memory/memory-mcp", "@paradigm-memory/memory-cli"]);
  console.log("[paradigm] Updated. Memory data was not touched.");
}
async function commandUninstall() {
  for (const [bin, args] of [["claude", ["mcp", "remove", "paradigm-memory"]], ["codex", ["mcp", "remove", "paradigm-memory"]], ["gemini", ["mcp", "remove", "paradigm-memory"]]]) {
    try { await run(bin, args); } catch { /* client absent or not registered */ }
  }
  if (has("--purge-memory")) {
    const ok = (await rl.question(`Delete memory dir ${memoryDir()} ? Type DELETE: `)).trim();
    if (ok === "DELETE") await run(process.platform === "win32" ? "powershell" : "rm", process.platform === "win32" ? ["-NoProfile", "-Command", `Remove-Item -Recurse -Force -LiteralPath '${memoryDir().replaceAll("'", "''")}'`] : ["-rf", memoryDir()]);
  }
  console.log("[paradigm] Unregistered where possible. Memory kept unless --purge-memory was confirmed.");
}
async function commandExport() {
  const file = process.argv[3]?.startsWith("--") ? null : process.argv[3];
  const target = path.resolve(file || await rl.question("Export .brain to path: "));
  await mkdir(path.dirname(target), { recursive: true });
  await withService((s) => s.exportMemory({ ...workspaceArgs(), output_path: target, include_mutations: true, include_deleted: true }));
  console.log(`[paradigm] Exported ${target}`);
}
async function commandImport() {
  const file = process.argv[3]?.startsWith("--") ? null : process.argv[3];
  const source = path.resolve(file || await rl.question("Import .brain from path: "));
  const mode = (arg("--mode") || await rl.question("Mode merge/replace [merge]: ") || "merge").trim();
  await withService((s) => s.importMemory({ ...workspaceArgs(), input_path: source, mode: mode === "replace" ? "replace" : "merge", reason: "cli_import" }));
  console.log(`[paradigm] Imported ${source}`);
}
async function commandDream() {
  const maxItems = Number(arg("--max-items-per-node") ?? 30);
  const threshold = Number(arg("--threshold") ?? 0.55);
  await withService(async (s) => {
    const report = await s.dream({ 
      ...workspaceArgs(),
      max_items_per_node: maxItems,
      similarity_threshold: threshold
    });
    console.log(JSON.stringify(report.summary, null, 2));
    for (const p of report.proposals.slice(0, 20)) {
      console.log(`- ${p.kind}: ${p.rationale}`);
      if (p.suggested_summary) {
        console.log(`  > Suggested Summary: ${p.suggested_summary}`);
      }
    }
  });
}
async function collectMarkdownFiles(target) {
  const resolved = path.resolve(target);
  const info = await stat(resolved);
  const supported = [".md", ".markdown", ".txt", ".yaml", ".yml"];
  const isSupported = (file) => supported.includes(path.extname(file).toLowerCase());
  if (info.isFile()) return isSupported(resolved) ? [resolved] : [];
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", ".git", "dist", "target"].includes(entry.name)) await walk(full);
      } else if (entry.isFile() && isSupported(full)) {
        files.push(full);
      }
    }
  }
  await walk(resolved);
  return files;
}
async function commandIngest() {
  const target = process.argv[3]?.startsWith("--") ? null : process.argv[3];
  const source = target || await rl.question("Markdown file or folder to ingest: ");
  const nodeId = arg("--node") ?? "workspace";
  const files = await collectMarkdownFiles(source);
  if (!files.length) {
    console.log("[paradigm] No supported .md/.markdown/.txt/.yaml/.yml files found.");
    return;
  }
  await withService(async (s) => {
    for (const file of files) {
      const content = await readFile(file, "utf8");
      await s.importMarkdown({
        ...workspaceArgs(),
        node_id: nodeId,
        content,
        title: path.basename(file),
        source: `file://${file}`,
        tags: [path.extname(file).toLowerCase().replace(".", "") || "text", "import"],
        status: has("--proposed") ? "proposed" : "active"
      });
    }
    if (has("--warm")) {
      const warmed = await s.warm(workspaceArgs());
      if (warmed.enabled) {
        console.log(`[paradigm] Warmed ${warmed.nodes} nodes + ${warmed.items} items in ${warmed.elapsed_ms}ms (${warmed.model}).`);
      } else {
        console.log("[paradigm] No embedding provider configured; skipped warm. Set PARADIGM_MEMORY_EMBEDDINGS=wasm or ollama.");
      }
    }
  });
  console.log(`[paradigm] Ingested ${files.length} file(s) into ${nodeId}.`);
}
async function commandWarm() {
  await withService(async (s) => {
    const warmed = await s.warm(workspaceArgs());
    console.log(JSON.stringify(warmed, null, 2));
    if (!warmed.enabled) process.exitCode = 1;
  });
}
async function commandDoctor() {
  await withService(async (s) => {
    const tree = await s.tree({ ...workspaceArgs(), include_items: true, include_proposed: true });
    const stats = (await s.version(workspaceArgs())).stats ?? {};
    const items = tree.items ?? [];
    const orphans = items.filter((it) => !tree.nodes.some((n) => n.id === it.node_id));
    const totalItems = items.length;
    const cachedEmbeddings = stats.embeddingCacheSize ?? stats.embeddingCount ?? null;
    const report = {
      workspace: tree.workspace,
      node_count: tree.nodes.length,
      item_count: totalItems,
      orphan_items: orphans.map((it) => ({ id: it.id, node_id: it.node_id })),
      cached_embeddings: cachedEmbeddings,
      embeddings_missing_estimate: cachedEmbeddings == null
        ? null
        : Math.max(0, totalItems + tree.nodes.length - cachedEmbeddings),
      hint: cachedEmbeddings == null
        ? "Embedding stats unavailable; run `paradigm warm` to (re)build the cache."
        : "Run `paradigm warm` to refresh missing embeddings."
    };
    console.log(JSON.stringify(report, null, 2));
  });
}
async function commandServe() {
  const root = findRepoRoot();
  const server = root
    ? path.join(root, "packages", "memory-mcp", "src", "http-server.mjs")
    : "paradigm-memory-http";
  const port = arg("--port") ?? process.env.PARADIGM_HTTP_PORT ?? "8765";
  const host = arg("--host") ?? process.env.PARADIGM_HTTP_HOST ?? "127.0.0.1";
  if (root) await run(process.execPath, [server, "--host", host, "--port", port], { env: { ...process.env, PARADIGM_MEMORY_DIR: memoryDir() } });
  else await run(server, ["--host", host, "--port", port], { env: { ...process.env, PARADIGM_MEMORY_DIR: memoryDir() } });
}
async function commandVersion() {
  await withService(async (s) => console.log(JSON.stringify(await s.version(workspaceArgs()), null, 2)));
}

try {
  const cmd = process.argv[2] ?? "studio";
  if (["-h", "--help", "help"].includes(cmd)) usage();
  else if (["studio", "open", "launch"].includes(cmd)) await commandStudio();
  else if (cmd === "update") await commandUpdate();
  else if (cmd === "uninstall") await commandUninstall();
  else if (cmd === "export") await commandExport();
  else if (cmd === "import") await commandImport();
  else if (cmd === "ingest") await commandIngest();
  else if (cmd === "warm") await commandWarm();
  else if (cmd === "doctor") await commandDoctor();
  else if (cmd === "serve") await commandServe();
  else if (cmd === "dream") await commandDream();
  else if (["version", "--version", "-v"].includes(cmd)) await commandVersion();
  else { usage(); process.exitCode = 1; }
} finally {
  rl.close();
}
