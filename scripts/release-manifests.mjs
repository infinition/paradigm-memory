#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const cliPackagePath = path.join(root, "packages", "memory-cli", "package.json");
const brewPath = path.join(root, "packaging", "homebrew", "paradigm-memory.rb");
const scoopPath = path.join(root, "packaging", "scoop", "paradigm-memory.json");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const cliPackage = JSON.parse(await readFile(cliPackagePath, "utf8"));
  const version = arg("--version") ?? cliPackage.version;
  const packageName = cliPackage.name;
  const encoded = packageName.replace("/", "%2f");
  const metadataUrl = `https://registry.npmjs.org/${encoded}/${version}`;
  const metadata = JSON.parse((await fetchBytes(metadataUrl)).toString("utf8"));
  const tarballUrl = metadata.dist?.tarball ?? `https://registry.npmjs.org/@paradigm-memory/memory-cli/-/memory-cli-${version}.tgz`;
  const tarball = await fetchBytes(tarballUrl);
  const sha256 = createHash("sha256").update(tarball).digest("hex");

  let brew = await readFile(brewPath, "utf8");
  brew = brew
    .replace(/url ".*memory-cli-.*\.tgz"/, `url "${tarballUrl}"`)
    .replace(/sha256 "[a-f0-9A-Z_]+"/, `sha256 "${sha256}"`);
  await writeFile(brewPath, brew, "utf8");

  const scoop = JSON.parse(await readFile(scoopPath, "utf8"));
  scoop.version = version;
  scoop.url = tarballUrl;
  scoop.hash = sha256;
  scoop.autoupdate = {
    url: "https://registry.npmjs.org/@paradigm-memory/memory-cli/-/memory-cli-$version.tgz"
  };
  await writeFile(scoopPath, `${JSON.stringify(scoop, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    package: packageName,
    version,
    tarball: tarballUrl,
    sha256,
    updated: [brewPath, scoopPath]
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});
