export function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    magA += a[index] * a[index];
    magB += b[index] * b[index];
  }
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function createOllamaEmbeddingProvider({
  baseUrl = process.env.PARADIGM_OLLAMA_URL ?? "http://localhost:11434",
  model = process.env.PARADIGM_OLLAMA_EMBED_MODEL ?? "nomic-embed-text:latest",
  timeoutMs = Number(process.env.PARADIGM_OLLAMA_EMBED_TIMEOUT_MS ?? 15000)
} = {}) {
  return {
    name: "ollama",
    model,
    async embed(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${baseUrl}/api/embed`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            input,
            truncate: true
          })
        });
        if (!response.ok) {
          throw new Error(`Ollama embed error ${response.status}: ${await response.text()}`);
        }
        const payload = await response.json();
        const vector = payload.embeddings?.[0];
        if (!Array.isArray(vector) || !vector.length) {
          throw new Error("Ollama returned an empty embedding");
        }
        return vector;
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

export function createKeywordEmbeddingProvider({ model = "keyword-test", dimensions = 64 } = {}) {
  function hash(text) {
    let value = 2166136261;
    for (const char of text) {
      value ^= char.charCodeAt(0);
      value = Math.imul(value, 16777619);
    }
    return Math.abs(value >>> 0);
  }

  return {
    name: "keyword",
    model,
    async embed(input) {
      const vector = Array.from({ length: dimensions }, () => 0);
      for (const term of String(input).toLowerCase().split(/[^a-z0-9._:-]+/).filter(Boolean)) {
        vector[hash(term) % dimensions] += 1;
      }
      return vector;
    }
  };
}

/**
 * In-process WASM embeddings via @huggingface/transformers (ONNX Runtime).
 * Lazily imported so the package keeps working when the optional dep is absent.
 */
export function createWasmEmbeddingProvider({
  model = process.env.PARADIGM_WASM_EMBED_MODEL ?? "Xenova/all-MiniLM-L6-v2"
} = {}) {
  let pipelinePromise = null;

  async function getPipeline() {
    if (!pipelinePromise) {
      pipelinePromise = (async () => {
        let mod;
        try {
          mod = await import("@huggingface/transformers");
        } catch {
          throw new Error(
            "@huggingface/transformers is not installed. Run `npm install @huggingface/transformers` " +
            "to enable WASM embeddings."
          );
        }
        if (mod.env) {
          mod.env.allowLocalModels = false;
          mod.env.useBrowserCache = false;
        }
        return await mod.pipeline("feature-extraction", model);
      })();
    }
    return pipelinePromise;
  }

  return {
    name: "wasm",
    model,
    async embed(input) {
      const extractor = await getPipeline();
      const output = await extractor(String(input ?? ""), {
        pooling: "mean",
        normalize: true
      });
      return Array.from(output.data);
    }
  };
}

export function createEmbeddingProviderFromEnv() {
  const backend = String(process.env.PARADIGM_MEMORY_EMBEDDINGS ?? "off").toLowerCase();
  if (backend === "ollama") return createOllamaEmbeddingProvider();
  if (backend === "wasm" || backend === "xenova" || backend === "transformers") {
    return createWasmEmbeddingProvider();
  }
  if (backend === "keyword") return createKeywordEmbeddingProvider();
  return null;
}
