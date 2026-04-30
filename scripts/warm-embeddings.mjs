import { createAtlas } from "@paradigm-memory/memory-core";
import path from "node:path";

function dataDirFromEnv() {
  return path.resolve(process.env.PARADIGM_MEMORY_DIR ?? path.join(process.cwd(), "data"));
}

async function main() {
  const dataDir = dataDirFromEnv();
  const atlas = await createAtlas({ dataDir });
  try {
    const result = await atlas.warmEmbeddings({
      limit: process.env.PARADIGM_MEMORY_WARM_LIMIT
        ? Number(process.env.PARADIGM_MEMORY_WARM_LIMIT)
        : undefined
    });
    console.log(JSON.stringify({ dataDir, ...result }, null, 2));
    if (!result.enabled) {
      console.error("No embedding provider configured. Set PARADIGM_MEMORY_EMBEDDINGS=ollama or keyword.");
      process.exitCode = 1;
    }
  } finally {
    atlas.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
