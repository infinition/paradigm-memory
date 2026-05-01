#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const packageFiles = [
  "package.json",
  "packages/memory-core/package.json",
  "packages/memory-mcp/package.json",
  "packages/memory-cli/package.json",
  "packages/memory/package.json"
];

function fail(message) {
  console.error(`[release-check] ${message}`);
  process.exitCode = 1;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label}: expected ${expected}, got ${actual}`);
}

const packages = new Map();
for (const file of packageFiles) {
  const fullPath = path.join(root, file);
  const pkg = JSON.parse(await readFile(fullPath, "utf8"));
  packages.set(pkg.name, { ...pkg, file });
}

const rootVersion = packages.get("paradigm-memory-workspace")?.version;
for (const pkg of packages.values()) {
  assertEqual(pkg.version, rootVersion, `${pkg.file} version`);
}

const gitTag = process.env.GITHUB_REF_NAME ?? "";
if (gitTag.startsWith("v")) {
  assertEqual(gitTag, `v${rootVersion}`, "git tag");
}

const mcp = packages.get("@paradigm-memory/memory-mcp");
const cli = packages.get("@paradigm-memory/memory-cli");
assertEqual(mcp.dependencies["@paradigm-memory/memory-core"], rootVersion, "memory-mcp core dependency");
assertEqual(cli.dependencies["@paradigm-memory/memory-mcp"], rootVersion, "memory-cli mcp dependency");

const tauri = JSON.parse(await readFile(path.join(root, "packages", "memory", "src-tauri", "tauri.conf.json"), "utf8"));
assertEqual(tauri.version, rootVersion, "tauri.conf.json version");

const cargoToml = await readFile(path.join(root, "packages", "memory", "src-tauri", "Cargo.toml"), "utf8");
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? null;
assertEqual(cargoVersion, rootVersion, "Cargo.toml version");

const releaseWorkflow = await readFile(path.join(root, ".github", "workflows", "release.yml"), "utf8");
if (/registry-url:\s*['"]https:\/\/registry\.npmjs\.org['"]/.test(releaseWorkflow)) {
  fail("release workflow must not publish to npm");
}
if (/NPM_TOKEN|npm publish|release:publish/.test(releaseWorkflow)) {
  fail("release workflow still references npm publishing");
}

if (!process.exitCode) console.log(`[release-check] ok for ${rootVersion}`);
