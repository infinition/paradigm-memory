#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryService, defaultDataDir } from "@paradigm-memory/memory-mcp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
const VERSION = packageJson.version;
const rl = createInterface({ input, output });

function usage() {
  console.log(`paradigm ${VERSION}

Usage:
  paradigm                 print this help
  paradigm memory          launch Paradigm Memory from a source checkout
  paradigm app             same (alias)
  paradigm update          show update instructions
  paradigm uninstall       unregister MCP clients, keep memory by default
  paradigm export [file]   export a .brain snapshot
  paradigm import [file]   import a .brain snapshot
  paradigm ingest <path>   import Markdown/YAML/text files into a node
  paradigm warm            force-compute embeddings for every node and item
  paradigm doctor [--fix]  report health checks, optionally apply safe repairs
  paradigm stats           print workspace counts and storage statistics
  paradigm diff A B         compare two .brain snapshots
  paradigm snapshots        list automatic safety snapshots
  paradigm rollback FILE   replace current memory with a .brain snapshot
  paradigm restore FILE    restore selected --item/--node ids from a snapshot
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
    if (existsSync(path.join(cur, "packages", "memory", "package.json"))) return cur;
    const next = path.dirname(cur);
    if (next === cur) break;
    cur = next;
  }
  let cur2 = path.resolve(__dirname, "..", "..", "..");
  if (existsSync(path.join(cur2, "packages", "memory", "package.json"))) return cur2;
  return null;
}
async function withService(fn) {
  const service = await createMemoryService({
    dataDir: memoryDir(),
    packageMeta: { name: "@paradigm-memory/memory-cli", version: VERSION },
    toolCount: 26
  });
  try { return await fn(service); } finally { service.close(); }
}
async function commandMemory() {
  const root = findRepoRoot();
  if (!root) {
    console.log("Install or update Paradigm Memory from GitHub Releases:");
    console.log("  Windows: irm https://raw.githubusercontent.com/infinition/paradigm-memory/main/scripts/installer/install.ps1 | iex");
    console.log("  Linux/macOS: curl -fsSL https://raw.githubusercontent.com/infinition/paradigm-memory/main/scripts/installer/install.sh | bash");
    return;
  }
  await run("npm", ["run", "app:dev"], { cwd: root, env: { ...process.env, PARADIGM_MEMORY_DIR: memoryDir() } });
}
async function commandUpdate() {
  const root = findRepoRoot();
  if (root) await run("npm", ["install", "--no-fund", "--no-audit"], { cwd: root });
  else {
    console.log("[paradigm] Re-run the GitHub Releases installer to update. Memory data will not be touched.");
    console.log("Windows: irm https://raw.githubusercontent.com/infinition/paradigm-memory/main/scripts/installer/install.ps1 | iex");
    console.log("Linux/macOS: curl -fsSL https://raw.githubusercontent.com/infinition/paradigm-memory/main/scripts/installer/install.sh | bash");
    return;
  }
  console.log("[paradigm] Dependencies refreshed. Memory data was not touched.");
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
    const result = has("--fix")
      ? await s.doctorFix({ ...workspaceArgs(), repairs: has("--warm") ? ["rebuild_fts", "mirror_json", "warm_embeddings"] : undefined })
      : await s.doctor(workspaceArgs());
    console.log(JSON.stringify(result, null, 2));
  });
}
async function commandStats() {
  await withService(async (s) => {
    console.log(JSON.stringify(await s.stats(workspaceArgs()), null, 2));
  });
}
async function commandDiff() {
  const left = process.argv[3];
  const right = process.argv[4];
  if (!left || !right) {
    console.log("Usage: paradigm diff left.brain right.brain");
    process.exitCode = 1;
    return;
  }
  await withService(async (s) => {
    console.log(JSON.stringify(await s.snapshotDiff({
      left_path: path.resolve(left),
      right_path: path.resolve(right),
      ...workspaceArgs()
    }), null, 2));
  });
}
async function commandSnapshots() {
  await withService(async (s) => {
    console.log(JSON.stringify(await s.snapshots({
      ...workspaceArgs(),
      limit: Number(arg("--limit") ?? 50),
      include_hash: has("--hash")
    }), null, 2));
  });
}
async function commandRollback() {
  const source = process.argv[3];
  if (!source || source.startsWith("--")) {
    console.log("Usage: paradigm rollback snapshot.brain");
    process.exitCode = 1;
    return;
  }
  const ok = (await rl.question(`Replace ${workspaceArgs().workspace ?? "default"} memory from ${source}? Type ROLLBACK: `)).trim();
  if (ok !== "ROLLBACK") {
    console.log("[paradigm] Rollback cancelled.");
    return;
  }
  await withService((s) => s.importMemory({
    ...workspaceArgs(),
    input_path: path.resolve(source),
    mode: "replace",
    reason: "cli_rollback"
  }));
  console.log(`[paradigm] Rolled back from ${path.resolve(source)}`);
}
function argsAll(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) values.push(process.argv[index + 1]);
  }
  return values;
}
async function commandRestore() {
  const source = process.argv[3];
  const itemIds = argsAll("--item");
  const nodeIds = argsAll("--node");
  if (!source || source.startsWith("--") || (!itemIds.length && !nodeIds.length)) {
    console.log("Usage: paradigm restore snapshot.brain --item item.id [--node node.id]");
    process.exitCode = 1;
    return;
  }
  await withService(async (s) => {
    const result = await s.snapshotRestore({
      ...workspaceArgs(),
      source_path: path.resolve(source),
      item_ids: itemIds,
      node_ids: nodeIds,
      reason: "cli_selective_restore"
    });
    console.log(JSON.stringify(result, null, 2));
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
  const cmd = process.argv[2] ?? "help";
  if (["-h", "--help", "help"].includes(cmd)) usage();
  else if (["app", "memory", "open", "launch"].includes(cmd)) await commandMemory();
  else if (cmd === "update") await commandUpdate();
  else if (cmd === "uninstall") await commandUninstall();
  else if (cmd === "export") await commandExport();
  else if (cmd === "import") await commandImport();
  else if (cmd === "ingest") await commandIngest();
  else if (cmd === "warm") await commandWarm();
  else if (cmd === "doctor") await commandDoctor();
  else if (cmd === "stats") await commandStats();
  else if (cmd === "diff") await commandDiff();
  else if (cmd === "snapshots") await commandSnapshots();
  else if (cmd === "rollback") await commandRollback();
  else if (cmd === "restore") await commandRestore();
  else if (cmd === "serve") await commandServe();
  else if (cmd === "dream") await commandDream();
  else if (["version", "--version", "-v"].includes(cmd)) await commandVersion();
  else { usage(); process.exitCode = 1; }
} finally {
  rl.close();
}
