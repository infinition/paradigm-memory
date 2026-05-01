#!/usr/bin/env node
import { chmod, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function platformName() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "macos";
  if (process.platform === "linux") return "linux";
  return process.platform;
}

function archName() {
  if (process.arch === "x64") return "x64";
  if (process.arch === "arm64") return "arm64";
  return process.arch;
}

const rootPackage = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const version = arg("--version", rootPackage.version);
const platform = arg("--platform", platformName());
const arch = arg("--arch", archName());
const outRoot = path.resolve(arg("--out", path.join(root, "dist", "release")));
const name = `paradigm-memory-cli-v${version}-${platform}-${arch}`;
const outDir = path.join(outRoot, name);

const workspacePackages = [
  "packages/memory-core",
  "packages/memory-mcp",
  "packages/memory-cli"
];

async function copyIfExists(from, to) {
  try {
    await cp(from, to, {
      recursive: true,
      dereference: true,
      filter(source) {
        const normalized = source.replaceAll("\\", "/");
        return !normalized.includes("/node_modules/")
          && !normalized.includes("/dist/")
          && !normalized.includes("/target/")
          && !normalized.includes("/.git/");
      }
    });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await mkdir(path.join(outDir, "packages"), { recursive: true });
await mkdir(path.join(outDir, "bin"), { recursive: true });

await copyIfExists(path.join(root, "node_modules"), path.join(outDir, "node_modules"));
await rm(path.join(outDir, "node_modules", ".cache"), { recursive: true, force: true });

for (const workspace of workspacePackages) {
  await copyIfExists(path.join(root, workspace), path.join(outDir, workspace));
}

for (const file of ["README.md", "LICENSE", "NOTICE"]) {
  await copyIfExists(path.join(root, file), path.join(outDir, file));
}

await writeFile(path.join(outDir, "package.json"), `${JSON.stringify({
  name: "paradigm-memory-cli-release",
  version,
  private: true,
  type: "module"
}, null, 2)}\n`);

const sh = `#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/packages/memory-cli/src/cli.mjs" "$@"
`;
await writeFile(path.join(outDir, "bin", "paradigm"), sh, "utf8");
await chmod(path.join(outDir, "bin", "paradigm"), 0o755);

const mcpSh = `#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/packages/memory-mcp/src/server.mjs" "$@"
`;
await writeFile(path.join(outDir, "bin", "paradigm-memory-mcp"), mcpSh, "utf8");
await chmod(path.join(outDir, "bin", "paradigm-memory-mcp"), 0o755);

const httpSh = `#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/packages/memory-mcp/src/http-server.mjs" "$@"
`;
await writeFile(path.join(outDir, "bin", "paradigm-memory-http"), httpSh, "utf8");
await chmod(path.join(outDir, "bin", "paradigm-memory-http"), 0o755);

const cmd = `@echo off\r
set "ROOT=%~dp0.."\r
node "%ROOT%\\packages\\memory-cli\\src\\cli.mjs" %*\r
`;
await writeFile(path.join(outDir, "bin", "paradigm.cmd"), cmd, "utf8");

const mcpCmd = `@echo off\r
set "ROOT=%~dp0.."\r
node "%ROOT%\\packages\\memory-mcp\\src\\server.mjs" %*\r
`;
await writeFile(path.join(outDir, "bin", "paradigm-memory-mcp.cmd"), mcpCmd, "utf8");

const httpCmd = `@echo off\r
set "ROOT=%~dp0.."\r
node "%ROOT%\\packages\\memory-mcp\\src\\http-server.mjs" %*\r
`;
await writeFile(path.join(outDir, "bin", "paradigm-memory-http.cmd"), httpCmd, "utf8");

await writeFile(path.join(outDir, "RELEASE.json"), `${JSON.stringify({
  name,
  version,
  platform,
  arch,
  entrypoints: {
    cli: "bin/paradigm",
    mcp: "bin/paradigm-memory-mcp",
    http: "bin/paradigm-memory-http"
  }
}, null, 2)}\n`);

console.log(JSON.stringify({ name, outDir }, null, 2));
