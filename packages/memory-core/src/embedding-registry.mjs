export const EMBEDDING_MODELS = [
  {
    id: "off",
    backend: "off",
    label: "Lexical only",
    model: null,
    languages: ["any"],
    size_mb: 0,
    quality: "exact keyword / FTS",
    notes: "Fastest and fully offline. No semantic paraphrase matching."
  },
  {
    id: "wasm-minilm",
    backend: "wasm",
    label: "Xenova all-MiniLM-L6-v2",
    model: "Xenova/all-MiniLM-L6-v2",
    languages: ["en", "fr", "multi"],
    size_mb: 90,
    quality: "good general semantic retrieval",
    notes: "Recommended default for out-of-box local use. Downloads ONNX weights once."
  },
  {
    id: "ollama-nomic",
    backend: "ollama",
    label: "nomic-embed-text via Ollama",
    model: "nomic-embed-text:latest",
    languages: ["en", "fr", "multi"],
    size_mb: 274,
    quality: "good local semantic retrieval",
    notes: "Requires Ollama running on localhost:11434."
  },
  {
    id: "keyword-test",
    backend: "keyword",
    label: "Deterministic keyword test vectors",
    model: "keyword-test",
    languages: ["test"],
    size_mb: 0,
    quality: "tests only",
    notes: "Deterministic lightweight vectors for unit tests and CI."
  }
];

export function embeddingModelById(id) {
  return EMBEDDING_MODELS.find((model) => model.id === id) ?? null;
}

export function recommendedEmbeddingModel({ localOnly = true } = {}) {
  if (localOnly) return embeddingModelById("wasm-minilm");
  return embeddingModelById("ollama-nomic") ?? embeddingModelById("wasm-minilm");
}
