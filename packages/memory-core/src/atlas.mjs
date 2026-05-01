import { createHash } from "node:crypto";
import path from "node:path";
import { ensureDir, readJsonFile, writeJsonFile } from "./storage.mjs";
import { createMemoryStore } from "./sqlite-store.mjs";
import { cosineSimilarity, createEmbeddingProviderFromEnv } from "./embeddings.mjs";

const ACTIVATION_OPEN = 0.75;
const ACTIVATION_LATENT = 0.45;
const TOKEN_CHARS = 4;
const EMBEDDING_LRU_CAPACITY = Number(process.env.PARADIGM_MEMORY_EMBED_LRU ?? 512);

function createLruCache(capacity) {
  const store = new Map();
  return {
    get(key) {
      if (!store.has(key)) return undefined;
      const value = store.get(key);
      store.delete(key);
      store.set(key, value);
      return value;
    },
    set(key, value) {
      if (store.has(key)) store.delete(key);
      store.set(key, value);
      while (store.size > capacity) {
        const oldest = store.keys().next().value;
        store.delete(oldest);
      }
    },
    get size() {
      return store.size;
    }
  };
}

function shortTextHash(text) {
  return createHash("sha1").update(String(text ?? ""), "utf8").digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9._:-]+/g, " ")
    .trim();
}

function terms(text) {
  return normalize(text)
    .split(/\s+/)
    .filter((term) => term.length >= 3);
}

function unique(values) {
  return [...new Set(values)];
}

function nodeDepth(node) {
  return Math.max(0, node.id.split(".").length - 1);
}

function hasAny(queryTerms, candidates) {
  return candidates.some((candidate) => queryTerms.includes(candidate));
}

function estimateTokens(text) {
  return Math.ceil(String(text).length / TOKEN_CHARS);
}

const STEM_PREFIX = 5;

function scoreText(queryTerms, fields) {
  const haystack = normalize(fields.join(" "));
  if (!haystack) return 0;
  const haystackWords = haystack.split(/\s+/).filter(Boolean);
  const hits = queryTerms.filter((term) => {
    if (haystack.includes(term)) return true;
    if (term.length < STEM_PREFIX) return false;
    const termPrefix = term.slice(0, STEM_PREFIX);
    for (const word of haystackWords) {
      if (word.length < STEM_PREFIX) continue;
      if (word.slice(0, STEM_PREFIX) === termPrefix) return true;
    }
    return false;
  }).length;
  return queryTerms.length ? hits / queryTerms.length : 0;
}

function ancestry(node, nodeById) {
  const parts = node.id.split(".");
  const ancestors = [];
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const id = parts.slice(0, index).join(".");
    const ancestor = nodeById.get(id);
    if (ancestor) ancestors.push(ancestor);
  }
  return ancestors;
}

function descendants(node, nodeById, maxDepth = 1) {
  const found = [];
  function visit(current, depth) {
    if (depth > maxDepth) return;
    for (const childId of current.children ?? []) {
      const child = nodeById.get(childId);
      if (!child) continue;
      found.push({ node: child, depth });
      visit(child, depth + 1);
    }
  }
  visit(node, 1);
  return found;
}

function compactNode(node, activation = 0) {
  return {
    id: node.id,
    label: node.label,
    one_liner: node.one_liner,
    summary: node.summary,
    status: node.status,
    importance: node.importance,
    freshness: node.freshness,
    confidence: node.confidence,
    activation,
    children: node.children ?? [],
    links: node.links ?? [],
    sources: node.sources ?? [],
    retrieval_policy: node.retrieval_policy
  };
}

function nodeEmbeddingText(node, relatedItems = []) {
  return [
    node.id,
    node.label,
    node.one_liner,
    node.summary,
    ...(node.keywords ?? []),
    ...relatedItems.map((item) => item.content),
    ...relatedItems.flatMap((item) => item.tags ?? [])
  ].filter(Boolean).join("\n");
}

async function bootstrapMemoryIfEmpty({ memoryDir, treePath, itemsPath }) {
  const tree = await readJsonFile(treePath, null);
  if (tree?.nodes?.length) return;

  const timestamp = nowIso();
  const rootId = "workspace";
  const defaultTree = {
    version: 1,
    updatedAt: timestamp,
    roots: [rootId],
    nodes: [
      {
        id: rootId,
        label: "Workspace",
        one_liner: "Root node for this Paradigm memory.",
        summary: "Top-level container for projects, decisions, conventions and references. Create child nodes with memory_create_node.",
        importance: 1,
        freshness: 1,
        confidence: 1,
        status: "active",
        keywords: ["workspace", "root", "paradigm", "memory"],
        children: [],
        links: [],
        sources: ["memory://bootstrap"],
        retrieval_policy: {
          default_depth: 1,
          max_tokens: 600,
          require_evidence: false
        }
      }
    ]
  };
  const defaultItems = [
    {
      id: "item.workspace.welcome",
      node_id: rootId,
      content: "Welcome to your Paradigm memory. Create branches, add items, review proposals, and export snapshots as .brain files.",
      tags: ["welcome", "paradigm", "memory"],
      source: "memory://bootstrap",
      created_at: timestamp,
      updated_at: timestamp,
      importance: 0.5,
      confidence: 1,
      status: "active"
    }
  ];

  await ensureDir(memoryDir);
  await writeJsonFile(treePath, defaultTree);
  await writeJsonFile(itemsPath, defaultItems);
}

export async function createAtlas({
  dataDir,
  embeddingProvider = createEmbeddingProviderFromEnv(),
  semanticWeight = Number(process.env.PARADIGM_MEMORY_SEMANTIC_WEIGHT ?? 0.24),
  autoWarm = String(process.env.PARADIGM_MEMORY_AUTOWARM ?? "1") !== "0"
}) {
  const memoryDir = path.join(dataDir, "memory");
  const treePath = path.join(memoryDir, "tree.json");
  const itemsPath = path.join(memoryDir, "items.json");

  await bootstrapMemoryIfEmpty({ memoryDir, treePath, itemsPath });
  let tree = await readJsonFile(treePath, { version: 1, roots: [], nodes: [] });
  let items = await readJsonFile(itemsPath, []);
  const store = await createMemoryStore({ dataDir });
  store.syncFromSeed(tree, items);
  const embeddingLru = createLruCache(EMBEDDING_LRU_CAPACITY);
  let lastActivation = {
    at: null,
    query: "",
    intent: "unknown",
    nodes: [],
    evidence: [],
    contextPack: []
  };

  async function hydrateFromStore() {
    const nodes = store.listNodes();
    tree.nodes = nodes;
    tree.roots = nodes.filter((node) => !node.parent_id).map((node) => node.id);
    tree.updatedAt = nowIso();
    items = store.listItems({ limit: 100000, includeDeleted: true });
    await writeJsonFile(treePath, tree);
    await writeJsonFile(itemsPath, items);
  }

  await hydrateFromStore();

  function nodeById() {
    return new Map(tree.nodes.map((node) => [node.id, node]));
  }

  function classifyIntent(query) {
    const text = normalize(query);
    if (/\b(recette|cuisine|tarte|pommes|gateau|ingredient|cuisson)\b/.test(text)) return "off_domain";
    if (/\b(episodic|episodique|evenement|evenements|session|sessions|historique|journal append)\b/.test(text)) return "episodic";
    if (/\b(suite|roadmap|backlog|next|prochaine|quoi faire)\b/.test(text)) return "planning";
    if (/\b(interface|ui|visuel|onglet|web|cockpit|tamagotchi|journal|surface|tableau de bord|controle|marketing)\b/.test(text)) return "ui";
    if (/\b(path|chemin|stock|fichier|data)\b/.test(text)) return "memory_location";
    if (/\b(memoire|boussole|rappel|entrepot|prompt|mcp|gating|attention|mind|map|retrieval|rag|vector|fts|sqlite|branche|node|noeud|arborescence|recherche|document|documents|preuve|preuves|rerank|reranker|ecrire|supprimer|audit|mutation|import|export|markdown|yaml|archive)\b/.test(text)) return "memory_architecture";
    if (/\b(conscience|conscient|pretend|pretendre|entite|identite|substrat|agir seul|maintenir|autonomie)\b/.test(text)) return "identity";
    if (/\b(pourquoi|bug|erreur|freeze|cass|bloqu|debug)\b/.test(text)) return "debug";
    if (/\b(ollama|llama|model|modele|cortex|qwen|gemma|cerveau|langage|essais rapides)\b/.test(text)) return "llm";
    if (/\b(interface|ui|visuel|onglet|web)\b/.test(text)) return "ui";
    return "conversation";
  }

  function scoreNode(queryTerms, intent, node, semanticScore = 0) {
    const textScore = scoreText(queryTerms, [
      node.id,
      node.label,
      node.one_liner,
      node.summary,
      ...(node.keywords ?? [])
    ]);
    const structural = (node.importance ?? 0.5) * 0.12 + (node.freshness ?? 0.5) * 0.06 + (node.confidence ?? 0.5) * 0.05;
    const intentBoost = scoreIntent(intent, node, queryTerms);
    const specificityBoost = textScore > 0 || intentBoost > 0 || semanticScore > 0.62 ? Math.min(0.16, nodeDepth(node) * 0.055) : 0;
    const broadPenalty = nodeDepth(node) === 0 && textScore < 0.75 ? 0.08 : 0;
    const intentPenalty = intent === "episodic" && node.id.includes("ui") ? 0.18 : 0;
    const lexicalWeight = semanticScore > 0 ? Math.max(0.48, 0.72 - semanticWeight) : 0.72;
    const rawActivation = textScore * lexicalWeight + semanticScore * semanticWeight + structural + intentBoost + specificityBoost - broadPenalty - intentPenalty;
    return {
      node,
      activation: clamp(rawActivation),
      rawActivation,
      reason: {
        textScore,
        semanticScore,
        structural,
        intentBoost,
        specificityBoost,
        broadPenalty,
        intentPenalty,
        intent
      }
    };
  }

  function gateScored(scored, byId, intent, options = {}) {
    const top = scored
      .filter((entry) => entry.activation >= 0.28)
      .sort((a, b) => (b.rawActivation ?? b.activation) - (a.rawActivation ?? a.activation))
      .slice(0, options.maxNodes ?? 8);

    const withAncestors = new Map();
    for (const entry of top) {
      withAncestors.set(entry.node.id, entry);
      for (const ancestor of ancestry(entry.node, byId)) {
        const inherited = Math.max(0.28, entry.activation * 0.72);
        const existing = withAncestors.get(ancestor.id);
        if (!existing || existing.activation < inherited) {
          withAncestors.set(ancestor.id, {
            node: ancestor,
            activation: inherited,
            rawActivation: inherited,
            reason: { inheritedFrom: entry.node.id, intent }
          });
        }
      }
    }

    const gated = [...withAncestors.values()]
      .sort((a, b) => (b.rawActivation ?? b.activation) - (a.rawActivation ?? a.activation))
      .slice(0, options.maxGated ?? 7);

    return {
      gated,
      openNodes: gated.filter((entry) => entry.activation >= ACTIVATION_OPEN),
      latentNodes: gated.filter((entry) => entry.activation >= ACTIVATION_LATENT && entry.activation < ACTIVATION_OPEN)
    };
  }

  function emptyActivation(query, intent) {
    return {
      at: nowIso(),
      query,
      intent,
      openNodes: [],
      latentNodes: [],
      ignoredCount: tree.nodes.length,
      nodes: []
    };
  }

  function activate(query, options = {}) {
    const queryTerms = unique(terms(query));
    const byId = nodeById();
    const intent = options.intent ?? classifyIntent(query);

    if (intent === "off_domain") {
      return emptyActivation(query, intent);
    }

    const scored = tree.nodes.map((node) => scoreNode(queryTerms, intent, node));
    const { gated, openNodes, latentNodes } = gateScored(scored, byId, intent, options);

    return {
      at: nowIso(),
      query,
      intent,
      openNodes,
      latentNodes,
      ignoredCount: Math.max(0, tree.nodes.length - gated.length),
      nodes: gated
    };
  }

  async function cachedEmbedding(cacheKey, text) {
    if (!embeddingProvider) return null;
    const lruKey = `${embeddingProvider.model}:${cacheKey}:${shortTextHash(text)}`;
    const memo = embeddingLru.get(lruKey);
    if (memo) return memo;
    const cached = store.getCachedEmbedding({
      cacheKey,
      model: embeddingProvider.model,
      text
    });
    if (cached) {
      embeddingLru.set(lruKey, cached);
      return cached;
    }
    const vector = await embeddingProvider.embed(text);
    const stored = store.upsertCachedEmbedding({
      cacheKey,
      model: embeddingProvider.model,
      text,
      vector
    });
    embeddingLru.set(lruKey, stored);
    return stored;
  }

  async function warmEmbeddings(options = {}) {
    if (!embeddingProvider) {
      return {
        enabled: false,
        model: null,
        nodes: 0,
        items: 0,
        total: 0,
        elapsedMs: 0
      };
    }

    const started = performance.now();
    let nodeCount = 0;
    let itemCount = 0;
    const limit = options.limit ?? Infinity;

    for (const node of tree.nodes) {
      if (nodeCount + itemCount >= limit) break;
      const relatedItems = items.filter((item) => item.node_id === node.id && item.status !== "deleted" && !item.deleted_at);
      await cachedEmbedding(`node:${node.id}`, nodeEmbeddingText(node, relatedItems));
      nodeCount += 1;
    }

    for (const item of items.filter((candidate) => candidate.status !== "deleted" && !candidate.deleted_at)) {
      if (nodeCount + itemCount >= limit) break;
      await cachedEmbedding(`item:${item.id}`, [
        item.id,
        item.node_id,
        item.content,
        ...(item.tags ?? []),
        item.source
      ].filter(Boolean).join("\n"));
      itemCount += 1;
    }

    return {
      enabled: true,
      provider: embeddingProvider.name,
      model: embeddingProvider.model,
      nodes: nodeCount,
      items: itemCount,
      total: nodeCount + itemCount,
      elapsedMs: Math.round((performance.now() - started) * 1000) / 1000,
      cacheSize: store.stats().embeddingCount
    };
  }

  async function activateAsync(query, options = {}) {
    const queryTerms = unique(terms(query));
    const byId = nodeById();
    const intent = options.intent ?? classifyIntent(query);

    if (intent === "off_domain") {
      return emptyActivation(query, intent);
    }

    if (!embeddingProvider || options.useSemantic === false) return activate(query, options);

    try {
      const queryVector = await cachedEmbedding(`query:${query}`, query);
      const semanticRows = [];
      for (const node of tree.nodes) {
        const relatedItems = items.filter((item) => item.node_id === node.id && item.status !== "deleted" && !item.deleted_at);
        const text = nodeEmbeddingText(node, relatedItems);
        const nodeVector = await cachedEmbedding(`node:${node.id}`, text);
        semanticRows.push({
          node,
          rawSemanticScore: cosineSimilarity(queryVector, nodeVector)
        });
      }
      const semanticValues = semanticRows.map((row) => row.rawSemanticScore);
      const semanticMin = Math.min(...semanticValues);
      const semanticMax = Math.max(...semanticValues);
      const semanticRange = semanticMax - semanticMin;

      // STRICTER: If the best match is still very poor (absolute score < 0.35),
      // we consider there are no semantic matches at all.
      const isMeaningful = semanticMax > 0.35;

      const scored = semanticRows.map((row) => {
        const semanticScore = (isMeaningful && semanticRange > 0.0001)
          ? (row.rawSemanticScore - semanticMin) / semanticRange
          : 0;
        
        // Final guard: even if normalized, the raw score must be decent
        const finalSemantic = row.rawSemanticScore > 0.25 ? semanticScore : 0;
        
        const entry = scoreNode(queryTerms, intent, row.node, finalSemantic);
        entry.reason.rawSemanticScore = row.rawSemanticScore;
        return entry;
      });
      const { gated, openNodes, latentNodes } = gateScored(scored, byId, intent, options);
      return {
        at: nowIso(),
        query,
        intent,
        openNodes,
        latentNodes,
        ignoredCount: Math.max(0, tree.nodes.length - gated.length),
        nodes: gated
      };
    } catch (error) {
      const fallback = activate(query, options);
      fallback.semanticError = error.message;
      return fallback;
    }
  }

  function scoreIntent(intent, node, queryTerms = []) {
    const id = node.id;
    const keywords = new Set(node.keywords ?? []);
    const inParadigm = id.startsWith("projects.paradigm");
    const inBjorn = id.startsWith("projects.bjorn");
    if (hasAny(queryTerms, ["entite", "identite", "substrat"]) && id === "identity") return 0.42;
    if (hasAny(queryTerms, ["entite", "identite", "substrat"]) && id.startsWith("identity.")) return 0.12;
    if (hasAny(queryTerms, ["bjorn"]) && hasAny(queryTerms, ["web", "ui", "interface"]) && id === "projects.bjorn.webui") return 0.42;
    if (hasAny(queryTerms, ["bjorn"]) && inBjorn) return id === "projects.bjorn" ? 0.08 : 0.24;
    if (hasAny(queryTerms, ["mcp", "import", "export", "markdown", "yaml", "archive"]) && id === "projects.paradigm.memory") return 0.34;
    if (hasAny(queryTerms, ["qwen", "ollama", "llama", "llamacpp", "cortex", "modele", "backend"]) && id === "projects.paradigm.llm") return 0.34;
    if (hasAny(queryTerms, ["cockpit", "tamagotchi", "visuel", "interface", "journal", "onglet"]) && id.endsWith(".ui")) return 0.34;
    if (hasAny(queryTerms, ["conscience", "conscient", "pretend", "pretendre"]) && (id === "identity.persona" || id === "identity.ethics")) return 0.34;
    if (hasAny(queryTerms, ["entite", "identite", "substrat"]) && id === "identity") return 0.26;
    if (intent === "memory_location" && (id === "environment.paths" || id.includes("memory") || id === "episodic" || keywords.has("storage"))) return 0.22;
    if (intent === "memory_architecture" && (id.includes("memory") || keywords.has("gating") || keywords.has("retrieval") || keywords.has("atlas"))) return 0.24;
    if (intent === "debug" && (id.startsWith("projects") || keywords.has("debug") || keywords.has("freeze"))) return 0.16;
    if (intent === "planning" && id === "projects") return 0.34;
    if (intent === "planning" && (id.startsWith("projects.paradigm") || keywords.has("roadmap"))) return 0.08;
    if (intent === "episodic" && id === "episodic") return 0.46;
    if (intent === "episodic" && id.startsWith("episodic.")) return 0.18;
    if (intent === "llm" && (id.includes("llm") || id.includes("ollama") || keywords.has("ollama"))) return 0.22;
    if (intent === "ui" && (id.includes("ui") || keywords.has("interface"))) return inParadigm || inBjorn ? 0.24 : 0.2;
    if (intent === "identity" && id.startsWith("identity")) return id === "identity" ? 0.18 : 0.24;
    return 0;
  }

  function retrieveLocal(query, activated, options = {}) {
    const queryTerms = unique(terms(query));
    const byId = nodeById();

    // Activated set is used to *boost*, not to *filter*. Items whose parent
    // node was not activated by the query (because the node label/keywords
    // did not match) are still allowed through if FTS finds them — otherwise
    // any content stored under a poorly-keyworded node becomes invisible.
    const activatedIds = new Set();
    for (const entry of activated.nodes) {
      activatedIds.add(entry.node.id);
      if (entry.activation >= ACTIVATION_OPEN) {
        for (const child of descendants(entry.node, byId, 1)) activatedIds.add(child.node.id);
      }
    }
    const activationByNode = new Map(activated.nodes.map((entry) => [entry.node.id, entry.activation]));

    const trimmed = query.trim();
    // Only short-circuit when the intent classifier explicitly says
    // off_domain (e.g. "tarte aux pommes"). A query that simply fails to
    // activate any node — because the user's branches are poorly
    // keyworded — must still hit FTS, otherwise content stored under cold
    // branches becomes invisible (the original RAG bug).
    const offDomain = trimmed && activated.intent === "off_domain";
    const ftsHits = (trimmed && !offDomain) ? store.searchItems({
      query,
      nodeIds: undefined,
      limit: Math.max(options.limit ?? 8, 24)
    }) : [];

    // Browsing mode (no query): keep the legacy behaviour — list items inside
    // activated branches only.
    const sourceItems = trimmed
      ? ftsHits
      : items.filter((item) =>
          activatedIds.has(item.node_id)
          && (item.status ?? "active") === "active"
          && !item.deleted_at
        );

    const evidence = sourceItems
      .filter((item) => (item.status ?? "active") === "active" && !item.deleted_at)
      .map((item) => {
        const keyword = scoreText(queryTerms, [item.content, ...(item.tags ?? []), item.source ?? ""]);
        const wasActivated = activatedIds.has(item.node_id);
        // Floor non-activated parents at 0.15 so FTS hits in cold branches
        // can still beat the 0.28 retention threshold via the FTS weight.
        const nodeActivation = activationByNode.get(item.node_id) ?? (wasActivated ? 0.5 : 0.15);
        const importance = item.importance ?? 0.5;
        const confidence = item.confidence ?? 0.8;
        const fts = Math.min(1, Math.max(0, item.fts_score ?? 0));
        let score = fts * 0.40
                  + keyword * 0.20
                  + nodeActivation * 0.18
                  + importance * 0.14
                  + confidence * 0.08;

        // Substring boost — exact phrase appearing anywhere in content wins.
        const qLower = trimmed.toLowerCase();
        if (qLower && item.content.toLowerCase().includes(qLower)) {
          score = Math.max(score, 0.45);
        }

        return { ...item, score, node_activation: nodeActivation, was_activated: wasActivated };
      })
      .filter((it) => !trimmed || it.score >= 0.28)
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit ?? 8);

    return evidence;
  }

  function buildContextPack(query, options = {}) {
    const activated = activate(query, options);
    const evidence = retrieveLocal(query, activated, { limit: options.evidenceLimit ?? 8 });
    const budget = options.maxTokens ?? 1500;
    const contextPack = [];
    let used = 0;

    for (const entry of activated.nodes) {
      const node = compactNode(entry.node, entry.activation);
      const line = `[node:${node.id} act=${node.activation.toFixed(2)}] ${node.one_liner} ${node.summary}`;
      const cost = estimateTokens(line);
      if (used + cost > budget) continue;
      contextPack.push({
        type: entry.activation >= ACTIVATION_OPEN ? "open_node" : "latent_node",
        id: node.id,
        activation: entry.activation,
        text: line,
        sources: node.sources
      });
      used += cost;
    }

    for (const item of evidence) {
      const line = `[evidence:${item.id} score=${item.score.toFixed(2)} source=${item.source}] ${item.content}`;
      const cost = estimateTokens(line);
      if (used + cost > budget) continue;
      contextPack.push({
        type: "evidence",
        id: item.id,
        node_id: item.node_id,
        score: item.score,
        text: line,
        source: item.source
      });
      used += cost;
    }

    lastActivation = {
      at: activated.at,
      query: activated.query,
      intent: activated.intent,
      ignoredCount: activated.ignoredCount,
      openNodes: activated.openNodes.map((entry) => ({
        ...compactNode(entry.node, entry.activation),
        reason: entry.reason
      })),
      latentNodes: activated.latentNodes.map((entry) => ({
        ...compactNode(entry.node, entry.activation),
        reason: entry.reason
      })),
      nodes: activated.nodes.map((entry) => ({
        ...compactNode(entry.node, entry.activation),
        reason: entry.reason
      })),
      evidence,
      contextPack,
      tokenEstimate: used
    };

    return lastActivation;
  }

  async function buildContextPackAsync(query, options = {}) {
    const activated = await activateAsync(query, options);
    const evidence = retrieveLocal(query, activated, { limit: options.evidenceLimit ?? 8 });
    const budget = options.maxTokens ?? 1500;
    const contextPack = [];
    let used = 0;

    for (const entry of activated.nodes) {
      const node = compactNode(entry.node, entry.activation);
      const line = `[node:${node.id} act=${node.activation.toFixed(2)}] ${node.one_liner} ${node.summary}`;
      const cost = estimateTokens(line);
      if (used + cost > budget) continue;
      contextPack.push({
        type: entry.activation >= ACTIVATION_OPEN ? "open_node" : "latent_node",
        id: node.id,
        activation: entry.activation,
        text: line,
        sources: node.sources
      });
      used += cost;
    }

    for (const item of evidence) {
      const line = `[evidence:${item.id} score=${item.score.toFixed(2)} source=${item.source}] ${item.content}`;
      const cost = estimateTokens(line);
      if (used + cost > budget) continue;
      contextPack.push({
        type: "evidence",
        id: item.id,
        node_id: item.node_id,
        score: item.score,
        text: line,
        source: item.source
      });
      used += cost;
    }

    lastActivation = {
      at: activated.at,
      query: activated.query,
      intent: activated.intent,
      semanticError: activated.semanticError,
      ignoredCount: activated.ignoredCount,
      openNodes: activated.openNodes.map((entry) => ({
        ...compactNode(entry.node, entry.activation),
        reason: entry.reason
      })),
      latentNodes: activated.latentNodes.map((entry) => ({
        ...compactNode(entry.node, entry.activation),
        reason: entry.reason
      })),
      nodes: activated.nodes.map((entry) => ({
        ...compactNode(entry.node, entry.activation),
        reason: entry.reason
      })),
      evidence,
      contextPack,
      tokenEstimate: used
    };

    return lastActivation;
  }

  async function reinforce(activation) {
    const byId = nodeById();
    for (const entry of activation.nodes ?? []) {
      const node = byId.get(entry.id);
      if (!node) continue;
      node.stats ??= { activationCount: 0, lastActivatedAt: null };
      node.stats.activationCount += 1;
      node.stats.lastActivatedAt = activation.at ?? nowIso();
      node.freshness = clamp((node.freshness ?? 0.5) * 0.92 + 0.08);
    }
    tree.updatedAt = nowIso();
    await writeJsonFile(treePath, tree);
  }

  if (autoWarm && embeddingProvider) {
    try {
      await warmEmbeddings();
    } catch (caught) {
      lastActivation.warmupError = caught.message;
    }
  }

  return {
    hydrateFromStore,
    get tree() {
      return tree;
    },
    get items() {
      return items;
    },
    get lastActivation() {
      return lastActivation;
    },
    embeddingStats() {
      return {
        provider: embeddingProvider?.name ?? null,
        model: embeddingProvider?.model ?? null,
        lruSize: embeddingLru.size,
        lruCapacity: EMBEDDING_LRU_CAPACITY,
        sqliteEmbeddings: store.stats().embeddingCount
      };
    },
    classifyIntent,
    activate,
    activateAsync,
    retrieveLocal,
    buildContextPack,
    buildContextPackAsync,
    warmEmbeddings,
    reinforce,
    writeItem(item, options) {
      const written = store.upsertItem(item, options);
      const existingIndex = items.findIndex((candidate) => candidate.id === written.id);
      if (existingIndex >= 0) items[existingIndex] = written;
      else items.push(written);
      writeJsonFile(itemsPath, items).catch((err) => process.stderr.write(`[atlas] items.json mirror write failed: ${err?.message ?? err}\n`));
      return written;
    },
    deleteItem(id, options) {
      const deleted = store.deleteItem(id, options);
      if (deleted) {
        const existingIndex = items.findIndex((candidate) => candidate.id === id);
        if (existingIndex >= 0) items[existingIndex] = { ...items[existingIndex], status: "deleted", deleted_at: deleted.deleted_at };
        writeJsonFile(itemsPath, items).catch((err) => process.stderr.write(`[atlas] items.json mirror write failed: ${err?.message ?? err}\n`));
      }
      return deleted;
    },
    reviewItem(id, options) {
      const reviewed = store.reviewItem(id, options);
      if (reviewed) {
        const existingIndex = items.findIndex((candidate) => candidate.id === id);
        if (existingIndex >= 0) items[existingIndex] = reviewed;
        else items.push(reviewed);
        writeJsonFile(itemsPath, items).catch((err) => process.stderr.write(`[atlas] items.json mirror write failed: ${err?.message ?? err}\n`));
      }
      return reviewed;
    },
    createNode(node, options) {
      const created = store.createNode(node, options);
      if (!tree.nodes.find((candidate) => candidate.id === created.id)) {
        tree.nodes.push(created);
      }
      const parts = created.id.split(".");
      if (parts.length > 1) {
        const parentId = parts.slice(0, -1).join(".");
        const parent = tree.nodes.find((candidate) => candidate.id === parentId);
        if (parent) {
          parent.children = parent.children ?? [];
          if (!parent.children.includes(created.id)) parent.children.push(created.id);
        }
      } else if (!tree.roots?.includes(created.id)) {
        tree.roots = [...(tree.roots ?? []), created.id];
      }
      tree.updatedAt = nowIso();
      writeJsonFile(treePath, tree).catch((err) => process.stderr.write(`[atlas] tree.json mirror write failed: ${err?.message ?? err}\n`));
      return created;
    },
    moveItem(itemId, newNodeId, options) {
      const moved = store.moveItem(itemId, newNodeId, options);
      if (moved) {
        const existingIndex = items.findIndex((candidate) => candidate.id === itemId);
        if (existingIndex >= 0) {
          items[existingIndex].node_id = newNodeId;
          writeJsonFile(itemsPath, items).catch((err) => process.stderr.write(`[atlas] items.json mirror write failed: ${err?.message ?? err}\n`));
        }
      }
      return moved;
    },
    updateNode(node, options) {
      const updated = store.updateNode(node, options);
      const existingIndex = tree.nodes.findIndex((candidate) => candidate.id === node.id);
      if (existingIndex >= 0) {
        tree.nodes[existingIndex] = { ...tree.nodes[existingIndex], ...updated };
        tree.updatedAt = nowIso();
        writeJsonFile(treePath, tree).catch((err) => process.stderr.write(`[atlas] tree.json mirror write failed: ${err?.message ?? err}\n`));
      }
      return updated;
    },
    deleteNode(id, options) {
      const deleted = store.deleteNode(id, options);
      if (deleted) {
        // Need full reload to catch all parent/child/item reassignments correctly
        hydrateFromStore().catch((err) => process.stderr.write(`[atlas] hydrate failed after deleteNode: ${err?.message ?? err}\n`));
      }
      return deleted;
    },
    listItems(options) {
      return store.listItems(options);
    },
    listMutations(limit) {
      return store.listMutations(limit);
    },
    exportSnapshot(options) {
      return store.exportSnapshot(options);
    },
    async importSnapshot(snapshot, options) {
      const result = store.importSnapshot(snapshot, options);
      await hydrateFromStore();
      return result;
    },
    rebuildIndexes() {
      store.rebuildFts();
    },
    memoryStats() {
      return store.stats();
    },
    async reload() {
      await hydrateFromStore();
    },
    close() {
      store.close();
    }
  };
}
