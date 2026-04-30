function nowIso() {
  return new Date().toISOString();
}

function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9._:-]+/g, " ")
    .trim();
}

function compact(text, max = 420) {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function slug(text) {
  return normalize(text).split(/\s+/).filter(Boolean).slice(0, 8).join("_") || "memory";
}

function estimateImportance(text, kind) {
  const normalized = normalize(text);
  let score = 0.45;
  if (kind === "decision") score += 0.25;
  if (kind === "preference") score += 0.2;
  if (kind === "architecture") score += 0.22;
  if (/\b(important|primordial|crucial|toujours|jamais|ne pas|go|decision|décision)\b/.test(normalized)) score += 0.14;
  if (text.length > 220) score += 0.06;
  return Math.min(0.96, score);
}

function targetNodeFor(text, kind) {
  const normalized = normalize(text);
  if (/\b(git|local|preference|prefere|veux|ne pas|toujours|jamais)\b/.test(normalized)) return "relationships.style";
  if (/\b(ollama|llama|gemma|qwen|cortex|modele|model)\b/.test(normalized)) return "projects.paradigm.llm";
  if (/\b(ui|interface|web|onglet|visuel)\b/.test(normalized)) return "projects.paradigm.ui";
  if (/\b(memoire|memory|gating|attention|mind|map|retrieval|sqlite|fts|vector|rerank|node|branche)\b/.test(normalized)) return "projects.paradigm.memory";
  if (kind === "decision") return "episodic.decisions";
  return "projects.paradigm";
}

function classifyKind(text) {
  const normalized = normalize(text);
  if (/\b(ne touche pas|ne pas|je veux|je prefere|j'aimerais|appelle|toujours|jamais)\b/.test(normalized)) return "preference";
  if (/\b(on continue|go|decision|décision|validé|valide|prochaine étape|la suite|il manque|il faut)\b/.test(normalized)) return "decision";
  if (/\b(memoire|memory|gating|mind map|retrieval|sqlite|fts|vector|rerank|contexte|atlas)\b/.test(normalized)) return "architecture";
  return "observation";
}

function shouldRemember(text, kind) {
  const normalized = normalize(text);
  if (text.length < 24) return false;
  if (/^(test|ok|oui|non|go|merci)[.!?\s]*$/i.test(text)) return false;
  if (kind === "observation" && text.length < 120) return false;
  if (/\b(test file|réponds avec|reponds avec)\b/.test(normalized)) return false;
  return true;
}

function candidateFromUserText(text, sourceEventId, options = {}) {
  const content = compact(text);
  const kind = classifyKind(content);
  if (!shouldRemember(content, kind)) return null;

  const node_id = targetNodeFor(content, kind);
  const idSuffix = options.idSuffix
    ? options.idSuffix({ content, kind, node_id, sourceEventId })
    : Date.now().toString(36);
  const timestamp = options.now ? options.now() : nowIso();
  const id = `mem.${node_id}.${slug(content)}.${idSuffix}`;
  const importance = estimateImportance(content, kind);

  return {
    id,
    node_id,
    content,
    tags: ["auto", kind, ...node_id.split(".").slice(0, 3)],
    source: sourceEventId ? `event://${sourceEventId}` : "memory-writer://interaction",
    created_at: timestamp,
    updated_at: timestamp,
    importance,
    confidence: kind === "preference" ? 0.78 : kind === "architecture" ? 0.74 : 0.66,
    status: "active",
    kind
  };
}

function detectDeletionRequest(text) {
  const normalized = normalize(text);
  if (!/\b(oublie|supprime|efface|retire|delete|forget)\b/.test(normalized)) return null;
  const quoted = String(text).match(/"([^"]+)"/)?.[1] ?? String(text).match(/'([^']+)'/)?.[1];
  return {
    query: quoted ? compact(quoted, 160) : compact(text, 220),
    reason: compact(text, 260)
  };
}

export function createMemoryWriter({ atlas, now, idSuffix } = {}) {
  function propose({ userText, sourceEventId }) {
    const candidates = [];
    const deletion = detectDeletionRequest(userText);
    const write = candidateFromUserText(userText, sourceEventId, { now, idSuffix });
    if (write) candidates.push({ operation: "write", item: write, reason: `auto_${write.kind}` });
    if (deletion) candidates.push({ operation: "delete_request", deletion, reason: "user_requested_deletion" });
    return candidates;
  }

  function applyCandidates(candidates) {
    const applied = [];

    for (const candidate of candidates) {
      if (candidate.operation === "write") {
        const item = atlas.writeItem(candidate.item, {
          actor: "memory-writer",
          reason: candidate.reason
        });
        applied.push({ operation: "write", item });
      }

      if (candidate.operation === "delete_request") {
        const preview = atlas.buildContextPack(candidate.deletion.query, { maxTokens: 600, evidenceLimit: 5 });
        const target = preview.evidence?.[0];
        if (target && target.score >= 0.45) {
          const item = atlas.deleteItem(target.id, {
            actor: "memory-writer",
            reason: candidate.deletion.reason
          });
          applied.push({ operation: "delete", item, matchedScore: target.score });
        } else {
          applied.push({ operation: "delete_skipped", reason: "no_confident_match", query: candidate.deletion.query });
        }
      }
    }

    return applied;
  }

  return {
    propose,
    applyCandidates,
    processInteraction(input) {
      const candidates = propose(input);
      const applied = applyCandidates(candidates);
      return { candidates, applied };
    }
  };
}
