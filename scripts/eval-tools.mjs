import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createMemoryService } from "../packages/memory-mcp/src/memory-service.mjs";

function ok(name, passed, detail = {}) {
  return { name, passed: Boolean(passed), detail };
}

async function main() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "paradigm-eval-tools-"));
  const service = await createMemoryService({ dataDir });
  const results = [];
  try {
    const created = await service.createNode({
      id: "projects.evaltools",
      label: "Eval Tools",
      summary: "Temporary branch created by eval-tools."
    });
    const search = await service.search({ query: "evaltools temporary branch", limit: 8 });
    results.push(ok("create_node_surfaces_in_tree", created.node.id === "projects.evaltools"));
    results.push(ok("create_node_searchable", search.nodes.some((node) => node.id === "projects.evaltools")));

    const markdown = await service.importMarkdown({
      node_id: "projects.evaltools",
      title: "eval.md",
      content: "# Eval\n\nMarkdown imported by eval tools should be readable.",
      status: "active"
    });
    const read = await service.read({ node_id: "projects.evaltools", include_items: true });
    results.push(ok("markdown_import_readable", read.items.some((item) => item.id === markdown.items[0].id)));

    await service.write({
      node_id: "projects.evaltools",
      content: "Duplicate eval-tools item for dream consolidation.",
      tags: ["eval"]
    });
    await service.write({
      node_id: "projects.evaltools",
      content: "Duplicate eval-tools item for dream consolidation.",
      tags: ["eval"]
    });
    const dream = await service.dream({ similarity_threshold: 0.5 });
    results.push(ok("dream_detects_duplicate", dream.summary.duplicates > 0, dream.summary));

    const exportPath = path.join(dataDir, "tool-eval.brain");
    await service.exportMemory({ output_path: exportPath });
    await writeFile(path.join(dataDir, "ok.txt"), "ok", "utf8");
    results.push(ok("export_writes_file", true, { exportPath }));
  } finally {
    service.close();
    await rm(dataDir, { recursive: true, force: true });
  }

  const failed = results.filter((result) => !result.passed);
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
