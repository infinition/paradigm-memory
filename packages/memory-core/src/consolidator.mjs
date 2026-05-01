/**
 * Memory consolidator — the "dream" pass.
 *
 * Runs offline analysis over the active memory and proposes mutations
 * (merges, archives, splits). Never applies anything automatically.
 * The caller (UI, agent, cron) decides what to act on.
 *
 * v0.1 strategies are deliberately heuristic and LLM-free, so the pass
 * runs locally in milliseconds with zero external dependencies.
 */

const STOPWORDS = new Set([
  "le", "la", "les", "un", "une", "des", "de", "du", "et", "ou", "que", "qui", "quoi",
  "dans", "pour", "par", "sur", "avec", "sans", "est", "sont", "etre", "ete",
  "the", "a", "an", "of", "to", "and", "or", "in", "on", "for", "with", "without",
  "is", "are", "was", "were", "be", "been", "being", "this", "that", "these", "those"
]);

function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9._:-]+/g, " ")
    .trim();
}

function tokens(text) {
  return normalize(text)
    .split(/\s+/)
    .filter((term) => term.length >= 4 && !STOPWORDS.has(term));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union ? intersection / union : 0;
}

function ageInDays(item, now) {
  const updated = item.updated_at ?? item.created_at;
  if (!updated) return 0;
  const ts = Date.parse(updated);
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, (now - ts) / 86400000);
}

export function detectDuplicates(items, { similarityThreshold = 0.55 } = {}) {
  const proposals = [];
  const byNode = new Map();
  for (const item of items) {
    if ((item.status ?? "active") !== "active") continue;
    if (!byNode.has(item.node_id)) byNode.set(item.node_id, []);
    byNode.get(item.node_id).push({ item, set: new Set(tokens(item.content)) });
  }
  for (const [nodeId, entries] of byNode) {
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const score = jaccard(entries[i].set, entries[j].set);
        if (score >= similarityThreshold) {
          const [keep, drop] = (entries[i].item.importance ?? 0.5) >= (entries[j].item.importance ?? 0.5)
            ? [entries[i].item, entries[j].item]
            : [entries[j].item, entries[i].item];
          proposals.push({
            kind: "duplicate",
            node_id: nodeId,
            keep_id: keep.id,
            drop_id: drop.id,
            similarity: Math.round(score * 1000) / 1000,
            rationale: `${Math.round(score * 100)}% token overlap with a more important sibling.`
          });
        }
      }
    }
  }
  return proposals;
}

export function detectStale(items, { maxAgeDays = 90, maxImportance = 0.4, now = Date.now() } = {}) {
  const proposals = [];
  for (const item of items) {
    if ((item.status ?? "active") !== "active") continue;
    const age = ageInDays(item, now);
    const importance = item.importance ?? 0.5;
    if (age >= maxAgeDays && importance <= maxImportance) {
      proposals.push({
        kind: "stale",
        item_id: item.id,
        node_id: item.node_id,
        age_days: Math.round(age),
        importance,
        rationale: `Inactive ${Math.round(age)}d, importance ${importance}; archive candidate.`
      });
    }
  }
  return proposals;
}

export function detectOverloaded(items, nodes, { maxItemsPerNode = 30 } = {}) {
  const proposals = [];
  const byNode = new Map();
  for (const item of items) {
    if ((item.status ?? "active") !== "active") continue;
    byNode.set(item.node_id, (byNode.get(item.node_id) ?? 0) + 1);
  }
  for (const [nodeId, count] of byNode) {
    if (count > maxItemsPerNode) {
      const node = nodes.find((candidate) => candidate.id === nodeId);
      proposals.push({
        kind: "overloaded",
        node_id: nodeId,
        item_count: count,
        threshold: maxItemsPerNode,
        rationale: `${count} active items on ${node?.label ?? nodeId} > ${maxItemsPerNode}; consider splitting into sub-nodes.`
      });
    }
  }
  return proposals;
}

export function detectOrphans(items, nodes) {
  const known = new Set(nodes.map((node) => node.id));
  return items
    .filter((item) => (item.status ?? "active") === "active" && !known.has(item.node_id))
    .map((item) => ({
      kind: "orphan",
      item_id: item.id,
      missing_node_id: item.node_id,
      rationale: `Node ${item.missing_node_id ?? item.node_id} no longer exists; reattach or archive.`
    }));
}

export async function dream(snapshot, options = {}) {
  const { items = [], nodes = [] } = snapshot;
  const startedAt = performance.now();
  const { reasoner = null } = options;

  const proposals = [
    ...detectDuplicates(items, options.duplicates),
    ...detectStale(items, options.stale),
    ...detectOverloaded(items, nodes, options.overloaded),
    ...detectOrphans(items, nodes)
  ];

  // If a reasoner is provided, add some "cognitive" proposals
  if (reasoner) {
    const overloaded = proposals.filter(p => p.kind === "overloaded");
    for (const p of overloaded) {
      const nodeItems = items.filter(i => i.node_id === p.node_id && (i.status ?? "active") === "active");
      const summaryText = nodeItems.map(i => i.content).join("\n");
      try {
        const newSummary = await reasoner.summarize(summaryText);
        p.suggested_summary = newSummary;
        p.rationale += ` Reasoner suggested a new summary.`;
      } catch (err) {
        // stderr only — stdio MCP servers must keep stdout JSON-RPC clean.
        process.stderr.write(`[dream] Reasoner failed for node ${p.node_id}: ${err?.message ?? err}\n`);
      }
    }
  }

  const elapsedMs = Math.round((performance.now() - startedAt) * 1000) / 1000;
  return {
    generated_at: new Date().toISOString(),
    elapsed_ms: elapsedMs,
    proposals,
    summary: {
      total: proposals.length,
      duplicates: proposals.filter((p) => p.kind === "duplicate").length,
      stale: proposals.filter((p) => p.kind === "stale").length,
      overloaded: proposals.filter((p) => p.kind === "overloaded").length,
      orphans: proposals.filter((p) => p.kind === "orphan").length
    }
  };
}
