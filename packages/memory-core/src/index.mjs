export { createAtlas } from "./atlas.mjs";
export { createMemoryWriter } from "./writer.mjs";
export { appendNdjson, ensureDir, readJsonFile, readNdjson, writeJsonFile } from "./storage.mjs";
export { createTrace, writeTrace } from "./tracing.mjs";
export { createReasoner } from "./reasoner.mjs";
export {
  detectDuplicates,
  detectStale,
  detectOverloaded,
  detectOrphans,
  dream
} from "./consolidator.mjs";
export {
  cosineSimilarity,
  createEmbeddingProviderFromEnv,
  createKeywordEmbeddingProvider,
  createOllamaEmbeddingProvider,
  createWasmEmbeddingProvider
} from "./embeddings.mjs";
export {
  EMBEDDING_MODELS,
  embeddingModelById,
  recommendedEmbeddingModel
} from "./embedding-registry.mjs";
export {
  memoryItemSchema,
  memoryMutationSchema,
  memoryNodeSchema,
  memoryTraceSchema,
  validateMemoryItem,
  validateMemoryMutation,
  validateMemoryNode,
  validateMemoryTrace
} from "./schemas.mjs";
