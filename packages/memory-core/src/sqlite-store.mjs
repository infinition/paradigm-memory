import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { ensureDir } from "./storage.mjs";
import { validateMemoryItem, validateMemoryMutation, validateMemoryNode } from "./schemas.mjs";

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

function rawSearchTokens(query) {
  return String(query ?? "").match(/"[^"]+"|\(|\)|\bAND\b|\bOR\b|\bNOT\b|[+-]?[^\s()"]+/gi) ?? [];
}

function unique(values) {
  return [...new Set(values)];
}

function escapeFtsTerm(term) {
  return term.replaceAll('"', "").trim();
}

function ftsOrQuery(query) {
  const safeTerms = unique(terms(query))
    .slice(0, 12)
    .map(escapeFtsTerm)
    .filter(Boolean);
  if (!safeTerms.length) return "";
  return safeTerms.map((term) => `"${term}"`).join(" OR ");
}

function hasBooleanSyntax(query) {
  return /(^|\s)(AND|OR|NOT)(\s|$)|["()+-]/i.test(String(query ?? ""));
}

function ftsAdvancedQuery(query) {
  const tokens = rawSearchTokens(query);
  const output = [];

  for (const token of tokens) {
    const upper = token.toUpperCase();
    if (upper === "AND" || upper === "OR" || upper === "NOT" || token === "(" || token === ")") {
      output.push(upper);
      continue;
    }

    if (token.startsWith("+")) {
      const term = escapeFtsTerm(token.slice(1));
      if (term) output.push("AND", `"${term}"`);
      continue;
    }

    if (token.startsWith("-")) {
      const term = escapeFtsTerm(token.slice(1));
      if (term) output.push("NOT", `"${term}"`);
      continue;
    }

    if (token.startsWith('"') && token.endsWith('"')) {
      const phrase = escapeFtsTerm(token.slice(1, -1));
      if (phrase) output.push(`"${phrase}"`);
      continue;
    }

    const cleanTerms = terms(token).map(escapeFtsTerm).filter(Boolean);
    for (const term of cleanTerms) output.push(`"${term}"`);
  }

  return output.join(" ").replace(/^(AND|OR)\s+/i, "").trim();
}

function ftsQuery(query) {
  if (hasBooleanSyntax(query)) {
    const advanced = ftsAdvancedQuery(query);
    if (advanced) return advanced;
  }
  return ftsOrQuery(query);
}

function json(value) {
  return JSON.stringify(value ?? null);
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function textHash(text) {
  return createHash("sha256").update(String(text ?? ""), "utf8").digest("hex");
}

function rowToNode(row) {
  return {
    id: row.id,
    parent_id: row.parent_id,
    label: row.label,
    summary: row.summary,
    one_liner: row.one_liner,
    node_type: row.node_type,
    status: row.status,
    importance: row.importance,
    activation: row.activation,
    confidence: row.confidence,
    freshness: row.freshness,
    last_touched: row.last_touched,
    retrieval_policy: parseJson(row.retrieval_policy, null),
    keywords: parseJson(row.keywords, []),
    children: parseJson(row.children, []),
    links: parseJson(row.links, []),
    sources: parseJson(row.sources, []),
    stats: parseJson(row.stats, {})
  };
}

function rowToItem(row) {
  return {
    id: row.id,
    node_id: row.node_id,
    content: row.content,
    tags: parseJson(row.tags, []),
    source: row.source,
    created_at: row.created_at,
    updated_at: row.updated_at,
    importance: row.importance,
    confidence: row.confidence,
    expires_at: row.expires_at,
    status: row.status ?? "active",
    deleted_at: row.deleted_at,
    supersedes: row.supersedes
  };
}

export async function createMemoryStore({ dataDir }) {
  const memoryDir = path.join(dataDir, "memory");
  await ensureDir(memoryDir);

  const dbPath = path.join(memoryDir, "paradigm.sqlite");
  const db = new DatabaseSync(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS memory_nodes (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      label TEXT NOT NULL,
      summary TEXT,
      one_liner TEXT,
      node_type TEXT,
      status TEXT,
      importance REAL DEFAULT 0.5,
      activation REAL DEFAULT 0.0,
      confidence REAL DEFAULT 0.8,
      freshness REAL DEFAULT 0.5,
      last_touched TEXT,
      retrieval_policy TEXT,
      keywords TEXT,
      children TEXT,
      links TEXT,
      sources TEXT,
      stats TEXT
    );

    CREATE TABLE IF NOT EXISTS memory_items (
      id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT,
      source TEXT,
      created_at TEXT,
      updated_at TEXT,
      importance REAL DEFAULT 0.5,
      confidence REAL DEFAULT 0.8,
      expires_at TEXT,
      status TEXT DEFAULT 'active',
      deleted_at TEXT,
      supersedes TEXT,
      FOREIGN KEY(node_id) REFERENCES memory_nodes(id)
    );

    CREATE TABLE IF NOT EXISTS memory_mutations (
      id TEXT PRIMARY KEY,
      at TEXT NOT NULL,
      operation TEXT NOT NULL,
      item_id TEXT,
      node_id TEXT,
      reason TEXT,
      actor TEXT,
      payload TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memory_items_fts
    USING fts5(content, tags, source, content='memory_items', content_rowid='rowid');

    CREATE TABLE IF NOT EXISTS memory_embeddings (
      cache_key TEXT NOT NULL,
      model TEXT NOT NULL,
      text_hash TEXT NOT NULL,
      vector TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(cache_key, model)
    );
  `);

  for (const statement of [
    "ALTER TABLE memory_items ADD COLUMN status TEXT DEFAULT 'active'",
    "ALTER TABLE memory_items ADD COLUMN deleted_at TEXT",
    "ALTER TABLE memory_items ADD COLUMN supersedes TEXT"
  ]) {
    try {
      db.exec(statement);
    } catch {
      // Column already exists.
    }
  }

  const insertNode = db.prepare(`
    INSERT INTO memory_nodes (
      id, parent_id, label, summary, one_liner, node_type, status,
      importance, activation, confidence, freshness, last_touched,
      retrieval_policy, keywords, children, links, sources, stats
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      parent_id=excluded.parent_id,
      label=excluded.label,
      summary=excluded.summary,
      one_liner=excluded.one_liner,
      node_type=excluded.node_type,
      status=excluded.status,
      importance=excluded.importance,
      confidence=excluded.confidence,
      freshness=excluded.freshness,
      retrieval_policy=excluded.retrieval_policy,
      keywords=excluded.keywords,
      children=excluded.children,
      links=excluded.links,
      sources=excluded.sources,
      stats=excluded.stats
  `);

  const insertItem = db.prepare(`
    INSERT INTO memory_items (
      id, node_id, content, tags, source, created_at, updated_at,
      importance, confidence, expires_at, status, deleted_at, supersedes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      node_id=excluded.node_id,
      content=excluded.content,
      tags=excluded.tags,
      source=excluded.source,
      updated_at=excluded.updated_at,
      importance=excluded.importance,
      confidence=excluded.confidence,
      expires_at=excluded.expires_at,
      status=excluded.status,
      deleted_at=excluded.deleted_at,
      supersedes=excluded.supersedes
  `);

  const insertMutation = db.prepare(`
    INSERT INTO memory_mutations (id, at, operation, item_id, node_id, reason, actor, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const getEmbeddingStatement = db.prepare(`
    SELECT vector
    FROM memory_embeddings
    WHERE cache_key = ?
      AND model = ?
      AND text_hash = ?
  `);

  const upsertEmbeddingStatement = db.prepare(`
    INSERT INTO memory_embeddings (cache_key, model, text_hash, vector, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(cache_key, model) DO UPDATE SET
      text_hash=excluded.text_hash,
      vector=excluded.vector,
      updated_at=excluded.updated_at
  `);

  function parentIdFor(node) {
    const parts = node.id.split(".");
    return parts.length > 1 ? parts.slice(0, -1).join(".") : null;
  }

  function syncFromSeed(tree, items) {
    db.exec("BEGIN");
    try {
      for (const node of tree.nodes ?? []) {
        validateMemoryNode(node);
        insertNode.run(
          node.id,
          parentIdFor(node),
          node.label,
          node.summary ?? "",
          node.one_liner ?? "",
          node.node_type ?? "node",
          node.status ?? "active",
          node.importance ?? 0.5,
          node.activation ?? 0,
          node.confidence ?? 0.8,
          node.freshness ?? 0.5,
          node.stats?.lastActivatedAt ?? null,
          json(node.retrieval_policy ?? null),
          json(node.keywords ?? []),
          json(node.children ?? []),
          json(node.links ?? []),
          json(node.sources ?? []),
          json(node.stats ?? {})
        );
      }

      for (const item of items ?? []) {
        validateMemoryItem(item);
        insertItem.run(
          item.id,
          item.node_id,
          item.content,
          json(item.tags ?? []),
          item.source ?? "",
          item.created_at ?? null,
          item.updated_at ?? null,
          item.importance ?? 0.5,
          item.confidence ?? 0.8,
          item.expires_at ?? null,
          item.status ?? "active",
          item.deleted_at ?? null,
          item.supersedes ?? null
        );
      }

      db.exec(`
        INSERT INTO memory_items_fts(memory_items_fts) VALUES('rebuild');
      `);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function searchItems({ query, nodeIds, limit = 8 }) {
    const hasNodes = nodeIds?.length > 0;
    const params = { limit };
    let nodeFilter = "";

    if (hasNodes) {
      const placeholders = nodeIds.map((id, index) => {
        params[`node${index}`] = id;
        return `$node${index}`;
      });
      nodeFilter = `AND mi.node_id IN (${placeholders.join(",")})`;
    }

    const match = ftsQuery(query);
    let ftsRows = [];
    if (match) {
      try {
        ftsRows = db.prepare(`
          SELECT
            mi.*,
            1.0 AS fts_score
          FROM memory_items_fts
          JOIN memory_items mi ON mi.rowid = memory_items_fts.rowid
          WHERE memory_items_fts MATCH $match
            ${nodeFilter}
          ORDER BY rank
          LIMIT $limit
        `).all({ ...params, match });
      } catch {
        const fallbackMatch = ftsOrQuery(query);
        if (fallbackMatch && fallbackMatch !== match) {
          ftsRows = db.prepare(`
            SELECT
              mi.*,
              -bm25(memory_items_fts) AS fts_score
            FROM memory_items_fts
            JOIN memory_items mi ON mi.rowid = memory_items_fts.rowid
            WHERE memory_items_fts MATCH $match
              ${nodeFilter}
              AND COALESCE(mi.status, 'active') = 'active'
              AND mi.deleted_at IS NULL
            ORDER BY rank
            LIMIT $limit
          `).all({ ...params, match: fallbackMatch });
        }
      }
    }

    // Normalise bm25 scores into [0, 1] within this batch so downstream
    // weighting works regardless of corpus size.
    if (ftsRows.length) {
      let maxScore = 0;
      for (const row of ftsRows) {
        if (row.fts_score > maxScore) maxScore = row.fts_score;
      }
      const denom = maxScore > 0 ? maxScore : 1;
      for (const row of ftsRows) {
        row.fts_score = Math.max(0, Math.min(1, (row.fts_score ?? 0) / denom));
      }
    }

    let exactRows = [];
    if (!hasBooleanSyntax(query)) {
      exactRows = db.prepare(`
        SELECT mi.*, 0 AS fts_score
        FROM memory_items mi
        WHERE 1=1
          ${nodeFilter}
          AND COALESCE(mi.status, 'active') != 'deleted'
          AND mi.deleted_at IS NULL
        ORDER BY mi.importance DESC, mi.confidence DESC, mi.updated_at DESC
        LIMIT $limit
      `).all(params);
    }

    const merged = new Map();
    const useStrictFiltering = hasBooleanSyntax(query);

    if (useStrictFiltering) {
      // In strict mode, only items that passed the FTS filter are allowed.
      for (const row of ftsRows) {
        merged.set(row.id, row);
      }
    } else {
      // In hybrid mode, merge exact matches (baseline) and FTS hits.
      for (const row of [...exactRows, ...ftsRows]) {
        const current = merged.get(row.id);
        if (!current || (row.fts_score ?? 0) > (current.fts_score ?? 0)) {
          merged.set(row.id, row);
        }
      }
    }

    return [...merged.values()].map((row) => ({
      ...rowToItem(row),
      fts_score: row.fts_score ?? 0
    }));
  }

  function rebuildFts() {
    db.exec("INSERT INTO memory_items_fts(memory_items_fts) VALUES('rebuild')");
  }

  function writeMutation({ operation, item_id, node_id, reason, actor = "substrate", payload = {} }) {
    validateMemoryMutation({ operation, item_id, node_id, reason, actor, payload });
    insertMutation.run(
      randomUUID(),
      new Date().toISOString(),
      operation,
      item_id ?? null,
      node_id ?? null,
      reason ?? "",
      actor,
      json(payload)
    );
  }

  function upsertItem(item, { actor = "memory-writer", reason = "upsert", operation } = {}) {
    validateMemoryItem(item);
    const status = item.status ?? "active";
    const resolvedOperation = operation ?? (status === "proposed" ? "propose" : item.supersedes ? "update" : "write");
    db.exec("BEGIN");
    try {
      insertItem.run(
        item.id,
        item.node_id,
        item.content,
        json(item.tags ?? []),
        item.source ?? "",
        item.created_at ?? new Date().toISOString(),
        item.updated_at ?? new Date().toISOString(),
        item.importance ?? 0.5,
        item.confidence ?? 0.8,
        item.expires_at ?? null,
        status,
        item.deleted_at ?? null,
        item.supersedes ?? null
      );
      writeMutation({
        operation: resolvedOperation,
        item_id: item.id,
        node_id: item.node_id,
        reason,
        actor,
        payload: item
      });
      rebuildFts();
      db.exec("COMMIT");
      return item;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function deleteItem(id, { reason = "soft_delete", actor = "substrate" } = {}) {
    const existing = db.prepare("SELECT * FROM memory_items WHERE id = ?").get(id);
    if (!existing) return null;
    const deletedAt = new Date().toISOString();
    db.exec("BEGIN");
    try {
      db.prepare("UPDATE memory_items SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?").run(deletedAt, deletedAt, id);
      writeMutation({
        operation: "delete",
        item_id: id,
        node_id: existing.node_id,
        reason,
        actor,
        payload: rowToItem({ ...existing, status: "deleted", deleted_at: deletedAt })
      });
      rebuildFts();
      db.exec("COMMIT");
      return rowToItem({ ...existing, status: "deleted", deleted_at: deletedAt });
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function listMutations(limit = 50) {
    return db.prepare(`
      SELECT *
      FROM memory_mutations
      ORDER BY at DESC
      LIMIT ?
    `).all(limit).map((row) => ({
      ...row,
      payload: parseJson(row.payload, {})
    }));
  }

  function stats() {
    const nodeCount = db.prepare("SELECT count(*) AS count FROM memory_nodes").get().count;
    const itemCount = db.prepare("SELECT count(*) AS count FROM memory_items").get().count;
    const activeItemCount = db.prepare("SELECT count(*) AS count FROM memory_items WHERE COALESCE(status, 'active') = 'active' AND deleted_at IS NULL").get().count;
    const proposedItemCount = db.prepare("SELECT count(*) AS count FROM memory_items WHERE COALESCE(status, 'active') = 'proposed' AND deleted_at IS NULL").get().count;
    const deletedItemCount = db.prepare("SELECT count(*) AS count FROM memory_items WHERE COALESCE(status, 'active') = 'deleted' OR deleted_at IS NOT NULL").get().count;
    const dbInfo = db.prepare("PRAGMA page_count").get();
    const pageSize = db.prepare("PRAGMA page_size").get();
    const journalMode = db.prepare("PRAGMA journal_mode").get();
    const busyTimeout = db.prepare("PRAGMA busy_timeout").get();
    return {
      path: dbPath,
      nodeCount,
      itemCount,
      activeItemCount,
      proposedItemCount,
      deletedItemCount,
      embeddingCount: db.prepare("SELECT count(*) AS count FROM memory_embeddings").get().count,
      pageCount: dbInfo.page_count,
      pageSize: pageSize.page_size,
      approximateBytes: dbInfo.page_count * pageSize.page_size,
      journalMode: journalMode.journal_mode,
      busyTimeoutMs: busyTimeout.timeout,
      fts: true
    };
  }

  function getCachedEmbedding({ cacheKey, model, text }) {
    const row = getEmbeddingStatement.get(cacheKey, model, textHash(text));
    return row ? parseJson(row.vector, null) : null;
  }

  function upsertCachedEmbedding({ cacheKey, model, text, vector }) {
    upsertEmbeddingStatement.run(
      cacheKey,
      model,
      textHash(text),
      json(vector),
      new Date().toISOString()
    );
    return vector;
  }

  function listNodes() {
    return db.prepare("SELECT * FROM memory_nodes ORDER BY id").all().map(rowToNode);
  }

  function exportSnapshot({ includeMutations = false, includeDeleted = true } = {}) {
    const nodes = listNodes();
    const itemRows = db.prepare(`
      SELECT * FROM memory_items
      ${includeDeleted ? "" : "WHERE COALESCE(status, 'active') != 'deleted' AND deleted_at IS NULL"}
      ORDER BY created_at ASC, id ASC
    `).all();
    const snapshot = {
      format: "paradigm.brain",
      format_version: 1,
      exported_at: new Date().toISOString(),
      stats: {
        node_count: nodes.length,
        item_count: itemRows.length
      },
      tree: { version: 1, roots: nodes.filter((node) => !node.parent_id).map((node) => node.id), nodes },
      items: itemRows.map(rowToItem)
    };
    if (includeMutations) {
      snapshot.mutations = db.prepare("SELECT * FROM memory_mutations ORDER BY at ASC").all()
        .map((row) => ({ ...row, payload: parseJson(row.payload, {}) }));
    }
    return snapshot;
  }

  function importSnapshot(snapshot, { mode = "merge", actor = "import", reason = "brain_import" } = {}) {
    if (!snapshot || snapshot.format !== "paradigm.brain") {
      const error = new Error("Snapshot is not a paradigm.brain payload");
      error.code = "invalid_snapshot";
      throw error;
    }
    if (mode !== "merge" && mode !== "replace") {
      const error = new Error(`Unsupported import mode: ${mode}`);
      error.code = "invalid_mode";
      throw error;
    }
    const nodes = snapshot.tree?.nodes ?? [];
    const items = snapshot.items ?? [];
    let importedNodes = 0;
    let importedItems = 0;

    db.exec("BEGIN");
    try {
      if (mode === "replace") {
        db.exec(`
          DELETE FROM memory_items_fts;
          DELETE FROM memory_items;
          DELETE FROM memory_nodes;
        `);
      }

      for (const node of nodes) {
        validateMemoryNode(node);
        insertNode.run(
          node.id,
          parentIdFor(node),
          node.label,
          node.summary ?? "",
          node.one_liner ?? "",
          node.node_type ?? "node",
          node.status ?? "active",
          node.importance ?? 0.5,
          node.activation ?? 0,
          node.confidence ?? 0.8,
          node.freshness ?? 0.5,
          node.stats?.lastActivatedAt ?? null,
          json(node.retrieval_policy ?? null),
          json(node.keywords ?? []),
          json(node.children ?? []),
          json(node.links ?? []),
          json(node.sources ?? []),
          json(node.stats ?? {})
        );
        importedNodes += 1;
      }

      for (const item of items) {
        validateMemoryItem(item);
        insertItem.run(
          item.id,
          item.node_id,
          item.content,
          json(item.tags ?? []),
          item.source ?? "",
          item.created_at ?? new Date().toISOString(),
          item.updated_at ?? new Date().toISOString(),
          item.importance ?? 0.5,
          item.confidence ?? 0.8,
          item.expires_at ?? null,
          item.status ?? "active",
          item.deleted_at ?? null,
          item.supersedes ?? null
        );
        importedItems += 1;
      }

      db.exec("INSERT INTO memory_items_fts(memory_items_fts) VALUES('rebuild')");

      writeMutation({
        operation: "import",
        item_id: null,
        node_id: null,
        reason,
        actor,
        payload: {
          mode,
          format_version: snapshot.format_version,
          source_exported_at: snapshot.exported_at,
          imported_nodes: importedNodes,
          imported_items: importedItems
        }
      });

      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return { mode, importedNodes, importedItems };
  }

  function createNode(node, { actor = "agent", reason = "create_node" } = {}) {
    validateMemoryNode(node);
    const existing = db.prepare("SELECT id FROM memory_nodes WHERE id = ?").get(node.id);
    if (existing) {
      const error = new Error(`Node ${node.id} already exists`);
      error.code = "node_exists";
      throw error;
    }

    const parentId = parentIdFor(node);
    if (parentId) {
      const parent = db.prepare("SELECT id, children FROM memory_nodes WHERE id = ?").get(parentId);
      if (!parent) {
        const error = new Error(`Parent node ${parentId} does not exist`);
        error.code = "missing_parent";
        throw error;
      }
    }

    db.exec("BEGIN");
    try {
      insertNode.run(
        node.id,
        parentId,
        node.label,
        node.summary ?? "",
        node.one_liner ?? "",
        node.node_type ?? "node",
        node.status ?? "active",
        node.importance ?? 0.5,
        node.activation ?? 0,
        node.confidence ?? 0.8,
        node.freshness ?? 0.5,
        new Date().toISOString(),
        json(node.retrieval_policy ?? null),
        json(node.keywords ?? []),
        json(node.children ?? []),
        json(node.links ?? []),
        json(node.sources ?? []),
        json(node.stats ?? { activationCount: 0, lastActivatedAt: null })
      );

      if (parentId) {
        const parent = db.prepare("SELECT children FROM memory_nodes WHERE id = ?").get(parentId);
        const children = parseJson(parent?.children, []);
        if (!children.includes(node.id)) {
          children.push(node.id);
          db.prepare("UPDATE memory_nodes SET children = ? WHERE id = ?").run(json(children), parentId);
        }
      }

      writeMutation({
        operation: "create_node",
        item_id: null,
        node_id: node.id,
        reason,
        actor,
        payload: node
      });
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return node;
  }

  function listItems({ limit = 50, includeDeleted = false, statuses } = {}) {
    let where = "";
    if (statuses && statuses.length) {
      const list = statuses.map((status) => `'${String(status).replace(/'/g, "''")}'`).join(",");
      where = `WHERE COALESCE(status, 'active') IN (${list}) AND deleted_at IS NULL`;
    } else if (!includeDeleted) {
      where = "WHERE COALESCE(status, 'active') = 'active' AND deleted_at IS NULL";
    }
    return db.prepare(`
      SELECT *
      FROM memory_items
      ${where}
      ORDER BY updated_at DESC, created_at DESC
      LIMIT ?
    `).all(limit).map(rowToItem);
  }

  function reviewItem(id, { action, actor = "reviewer", reason = "" } = {}) {
    if (action !== "accept" && action !== "reject") {
      throw new Error(`Unsupported review action: ${action}`);
    }
    const existing = db.prepare("SELECT * FROM memory_items WHERE id = ?").get(id);
    if (!existing) return null;
    const currentStatus = existing.status ?? "active";
    if (currentStatus !== "proposed") {
      const error = new Error(`Cannot review item with status '${currentStatus}'`);
      error.code = "invalid_review_status";
      throw error;
    }
    const timestamp = new Date().toISOString();
    db.exec("BEGIN");
    try {
      if (action === "accept") {
        db.prepare("UPDATE memory_items SET status = 'active', updated_at = ? WHERE id = ?").run(timestamp, id);
        writeMutation({
          operation: "accept",
          item_id: id,
          node_id: existing.node_id,
          reason,
          actor,
          payload: rowToItem({ ...existing, status: "active", updated_at: timestamp })
        });
      } else {
        db.prepare("UPDATE memory_items SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?").run(timestamp, timestamp, id);
        writeMutation({
          operation: "reject",
          item_id: id,
          node_id: existing.node_id,
          reason,
          actor,
          payload: rowToItem({ ...existing, status: "deleted", deleted_at: timestamp })
        });
      }
      rebuildFts();
      db.exec("COMMIT");
      const refreshed = db.prepare("SELECT * FROM memory_items WHERE id = ?").get(id);
      return rowToItem(refreshed);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function close() {
    try {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
      // Another connection may still be alive; closing the handle is enough.
    }
    db.close();
  }

  return {
    path: dbPath,
    syncFromSeed,
    searchItems,
    upsertItem,
    deleteItem,
    reviewItem,
    createNode,
    listNodes,
    listItems,
    listMutations,
    exportSnapshot,
    importSnapshot,
    rebuildFts,
    getCachedEmbedding,
    upsertCachedEmbedding,
    stats,
    close
  };
}
