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

const strict = process.argv.includes("--strict");

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

const brew = await readFile(path.join(root, "packaging", "homebrew", "paradigm-memory.rb"), "utf8");
const scoop = JSON.parse(await readFile(path.join(root, "packaging", "scoop", "paradigm-memory.json"), "utf8"));
assertEqual(scoop.version, rootVersion, "scoop version");
if (!brew.includes(`memory-cli-${rootVersion}.tgz`)) fail("Homebrew formula URL does not match package version");
if (strict && (/REPLACE_WITH/.test(brew) || /REPLACE_WITH/.test(JSON.stringify(scoop)))) {
  fail("Packaging manifests still contain placeholder hashes");
} else if (/REPLACE_WITH/.test(brew) || /REPLACE_WITH/.test(JSON.stringify(scoop))) {
  console.warn("[release-check] packaging hashes are placeholders; run npm run release:manifests after the npm package is published");
}

if (!process.exitCode) console.log(`[release-check] ok for ${rootVersion}`);
