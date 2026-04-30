import { EMBEDDING_MODELS, recommendedEmbeddingModel } from "@paradigm-memory/memory-core";

const recommended = recommendedEmbeddingModel();
console.log(JSON.stringify({
  recommended,
  models: EMBEDDING_MODELS
}, null, 2));
