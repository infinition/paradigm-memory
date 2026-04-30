/**
 * Reasoner module for Paradigm Memory.
 * Uses a small LLM (Qwen 2.5 0.5B) via @huggingface/transformers (WASM)
 * to perform cognitive tasks like summarization and consolidation.
 */

let generatorPromise = null;

export async function createReasoner(options = {}) {
  const model = options.model ?? "onnx-community/Qwen2.5-1.5B-Instruct";
  const device = options.device ?? "cpu";

  async function getGenerator() {
    if (generatorPromise) return generatorPromise;

    generatorPromise = (async () => {
      let mod;
      try {
        const transformers = await import("@huggingface/transformers");
        mod = transformers;
        // Silence Transformers.js for MCP protocol stability
        mod.env.logLevel = "error";
      } catch (err) {
        throw new Error(
          `@huggingface/transformers is not installed or failed to load: ${err.message}. Run \`npm install @huggingface/transformers\` to enable the local reasoner.`
        );
      }

      const generator = await mod.pipeline("text-generation", model, {
        device,
      });
      return generator;
    })();

    return generatorPromise;
  }

  return {
    async summarize(text, { maxLength = 280, prompt = null } = {}) {
      const gen = await getGenerator();
      const defaultPrompt = `<|im_start|>system
Tu es le module de synthèse de Paradigm. Ton rôle est de compiler TOUTES les informations uniques sans exception.
Si plusieurs noms sont cités (ex: groupes de musique), tu DOIS TOUS les inclure dans ta synthèse.
Ne choisis pas, n'exclus rien. Réponds uniquement par la synthèse.<|im_end|>
<|im_start|>user
Synthétise ces souvenirs en préservant l'intégralité des noms propres et détails cités :

${text}

Synthèse :<|im_end|>
<|im_start|>assistant
`;
      
      const result = await gen(prompt ?? defaultPrompt, {
        max_new_tokens: 128,
        temperature: 0.1,
        do_sample: false,
        return_full_text: false,
        stop_sequence: ["<|im_end|>"],
      });

      let content = result[0].generated_text.trim();
      return content.split("<|im_end|>")[0].trim();
    },

    async consolidate(items, { prompt = null } = {}) {
      const gen = await getGenerator();
      const text = items.map(i => i.content).join("\n---\n");
      const defaultPrompt = `<|im_start|>system
Tu es le module de consolidation de Paradigm. Ton rôle est de fusionner des souvenirs redondants en un seul souvenir dense et riche.
Préserve tous les faits uniques. Réponds uniquement par le texte fusionné.<|im_end|>
<|im_start|>user
Fusionne ces souvenirs pour éliminer les répétitions tout en gardant toutes les informations :

${text}

Version fusionnée :<|im_end|>
<|im_start|>assistant
`;

      const result = await gen(prompt ?? defaultPrompt, {
        max_new_tokens: 256,
        temperature: 0.1,
        do_sample: false,
        return_full_text: false,
        stop_sequence: ["<|im_end|>"],
      });

      let content = result[0].generated_text.trim();
      return content.split("<|im_end|>")[0].trim();
    },

    async close() {
      generatorPromise = null;
    }
  };
}
