#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const workspaces = [
  "@paradigm-memory/memory-core",
  "@paradigm-memory/memory-mcp",
  "@paradigm-memory/memory-cli"
];
const dryRun = process.argv.includes("--dry-run");

function run(command, args, { allowFailure = false } = {}) {
  const executable = process.platform === "win32" && command === "npm" ? "cmd.exe" : command;
  const finalArgs = process.platform === "win32" && command === "npm"
    ? ["/d", "/s", "/c", "npm", ...args]
    : args;
  const result = spawnSync(executable, finalArgs, {
    cwd: root,
    env: process.env,
    shell: false,
    stdio: allowFailure ? "pipe" : "inherit",
    encoding: "utf8"
  });
  if (!allowFailure && result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result;
}

async function packageVersion(workspace) {
  const packageJson = JSON.parse(await readFile(path.join(root, "packages", workspace.split("/").pop().replace("memory-", "memory-"), "package.json"), "utf8"));
  return packageJson.version;
}

function existsOnNpm(spec) {
  const result = run("npm", ["view", spec, "version"], { allowFailure: true });
  return result.status === 0;
}

for (const workspace of workspaces) {
  const version = await packageVersion(workspace);
  const spec = `${workspace}@${version}`;
  if (existsOnNpm(spec)) {
    console.log(`[publish-npm] ${spec} already exists; skipping.`);
    continue;
  }
  if (dryRun) {
    console.log(`[publish-npm] ${spec} is missing; would publish.`);
    continue;
  }
  console.log(`[publish-npm] publishing ${spec} ...`);
  const publishArgs = [
    "publish",
    "--workspace",
    workspace,
    "--access",
    "public"
  ];
  if (process.env.GITHUB_ACTIONS === "true") {
    publishArgs.push("--provenance");
  }
  run("npm", publishArgs);
}
