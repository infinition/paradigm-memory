import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryService } from "../packages/memory-mcp/src/memory-service.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile(values, pct) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[index];
}

function reportSlugFromCasesPath(casesPath) {
  return path.basename(casesPath, path.extname(casesPath))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "cases";
}

function reportVariantSlug() {
  const embeddings = String(process.env.PARADIGM_MEMORY_EMBEDDINGS ?? "off").toLowerCase();
  if (!embeddings || embeddings === "off") return "lexical";
  return `embeddings-${embeddings.replace(/[^a-z0-9]+/g, "-")}`;
}

function hitAt(nodes, expected, k) {
  if (!expected.length) return null;
  const top = nodes.slice(0, k).map((node) => node.id);
  return expected.some((id) => top.includes(id)) ? 1 : 0;
}

function recall(found, expected) {
  if (!expected.length) return null;
  const foundSet = new Set(found);
  return expected.filter((id) => foundSet.has(id)).length / expected.length;
}

async function createEvalDataDir() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "paradigm-eval-memory-"));
  const sourceMemoryDir = process.env.PARADIGM_EVAL_MEMORY_DIR
    ? path.resolve(process.env.PARADIGM_EVAL_MEMORY_DIR)
    : path.join(rootDir, "tests", "fixtures", "memory");
  await cp(sourceMemoryDir, path.join(dataDir, "memory"), {
    recursive: true,
    filter: (source) => !source.endsWith(".sqlite") && !source.endsWith(".sqlite-shm") && !source.endsWith(".sqlite-wal")
  });
  return dataDir;
}

function markdownReport({ generatedAt, casesPath, cases, metrics }) {
  const lines = [
    `# Memory eval report - ${generatedAt.slice(0, 10)} - ${reportSlugFromCasesPath(casesPath)} - ${reportVariantSlug()}`,
    "",
    `Cases file: \`${path.relative(rootDir, casesPath).replaceAll("\\", "/")}\``,
    `Variant: \`${reportVariantSlug()}\``,
    "",
    "## Summary",
    "",
    `- cases: ${metrics.cases}`,
    `- node@1: ${metrics.nodeAt1.toFixed(3)}`,
    `- node@3: ${metrics.nodeAt3.toFixed(3)}`,
    `- item recall@k: ${metrics.itemRecallAtK.toFixed(3)}`,
    `- avg context tokens: ${metrics.avgContextTokens.toFixed(1)}`,
    `- latency p50: ${metrics.latencyP50Ms.toFixed(3)} ms`,
    `- latency p95: ${metrics.latencyP95Ms.toFixed(3)} ms`,
    `- must-not violations: ${metrics.mustNotViolations}`,
    "",
    "## Cases",
    "",
    "| id | node@1 | node@3 | recall | tokens | latency ms | violations |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];

  for (const item of cases) {
    lines.push(`| ${item.id} | ${item.nodeAt1 ?? "n/a"} | ${item.nodeAt3 ?? "n/a"} | ${item.itemRecall ?? "n/a"} | ${item.tokenEstimate} | ${item.latencyMs.toFixed(3)} | ${item.mustNotViolations.length} |`);
  }

  lines.push("");
  return lines.join("\n");
}

async function main() {
  const generatedAt = new Date().toISOString();
  const casesPath = path.resolve(rootDir, process.env.PARADIGM_EVAL_CASES ?? path.join("evals", "cases.json"));
  const evalCases = JSON.parse(await readFile(casesPath, "utf8"));
  const dataDir = await createEvalDataDir();
  const service = await createMemoryService({ dataDir });

  try {
    const results = [];
    for (const evalCase of evalCases) {
      const started = performance.now();
      const output = await service.search({
        query: evalCase.query,
        limit: evalCase.expected_item_ids?.length ? Math.max(8, evalCase.expected_item_ids.length) : 8
      });
      const latencyMs = performance.now() - started;
      const injectedIds = [
        ...output.evidence.map((item) => item.id),
        ...output.context_pack.map((item) => item.id)
      ];
      const injectedText = output.context_pack.map((item) => item.text).join("\n");
      const mustNotViolations = (evalCase.must_not_inject ?? []).filter((needle) =>
        injectedIds.includes(needle) || injectedText.includes(needle)
      );

      results.push({
        id: evalCase.id,
        query: evalCase.query,
        nodeAt1: hitAt(output.nodes, evalCase.expected_node_ids ?? [], 1),
        nodeAt3: hitAt(output.nodes, evalCase.expected_node_ids ?? [], 3),
        itemRecall: recall(output.evidence.map((item) => item.id), evalCase.expected_item_ids ?? []),
        tokenEstimate: output.token_estimate,
        latencyMs,
        mustNotViolations,
        topNodes: output.nodes.slice(0, 3).map((node) => node.id),
        evidence: output.evidence.map((item) => item.id)
      });
    }

    const scoredNode1 = results.filter((item) => item.nodeAt1 !== null);
    const scoredNode3 = results.filter((item) => item.nodeAt3 !== null);
    const scoredRecall = results.filter((item) => item.itemRecall !== null);
    const metrics = {
      cases: results.length,
      nodeAt1: average(scoredNode1.map((item) => item.nodeAt1)),
      nodeAt3: average(scoredNode3.map((item) => item.nodeAt3)),
      itemRecallAtK: average(scoredRecall.map((item) => item.itemRecall)),
      avgContextTokens: average(results.map((item) => item.tokenEstimate)),
      latencyP50Ms: percentile(results.map((item) => item.latencyMs), 50),
      latencyP95Ms: percentile(results.map((item) => item.latencyMs), 95),
      mustNotViolations: results.reduce((sum, item) => sum + item.mustNotViolations.length, 0)
    };

    const reportDir = path.join(rootDir, "evals", "results");
    await mkdir(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `${generatedAt.slice(0, 10)}-${reportSlugFromCasesPath(casesPath)}-${reportVariantSlug()}.md`);
    await writeFile(reportPath, markdownReport({ generatedAt, casesPath, cases: results, metrics }), "utf8");

    console.log(JSON.stringify({ generatedAt, casesPath, reportPath, metrics, cases: results }, null, 2));

    if (metrics.mustNotViolations > 0) process.exitCode = 1;
  } finally {
    service.close();
    await rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
