# Operations guide

Field notes from running `paradigm-memory` on Windows, macOS and Linux.
This is the place to look first when something behaves weirdly in production.

---

## 1. Embedding indexing latency after bulk ingest

**Symptom.** You just imported a folder via `paradigm ingest ./vault` (or via
direct SQL inserts) and the new items are *invisible* to:
- `memory_dream` (no duplicate detection),
- semantic search (`memory_search` with a paraphrase that doesn't share
  literal tokens),
- the activation pulse in Paradigm Memory.

**Cause.** Embeddings are computed *lazily* on the first query that touches an
item. Bulk inserts skip this step. Until something requests the embedding, the
item only exists in the FTS5 lexical index — it can be found by exact tokens
but not by semantic similarity.

**Fix (preferred).** Pass `--warm` to the ingest command:

```bash
paradigm ingest ./vault --node projects.research --warm
```

`--warm` calls `service.warm()` after the import, which iterates every node
and item and computes the embeddings synchronously. Output looks like:

```
[paradigm] Warmed 42 nodes + 318 items in 12473ms (Xenova/all-MiniLM-L6-v2).
[paradigm] Ingested 17 file(s) into projects.research.
```

**Fix (manual).** Run the warm pass on demand:

```bash
paradigm warm                          # default workspace
paradigm warm --workspace research     # named workspace
```

**Diagnostic.** Use the read-only health command:

```bash
paradigm doctor
```

Reports cached-embedding count vs. total nodes+items, lists orphan items
(items pointing at deleted nodes), and tells you when to warm.

**Workaround you may have seen in the wild.** Forcing a textual search with
the FTS5 `+token` operator does touch each matching item and triggers
embedding on the next semantic query. It works but is brittle — prefer the
explicit `paradigm warm` path.

---

## 2. Node visibility & keywords

**Symptom.** A query that *should* match an item never makes it through; the
item is in the right node but the node never activates.

**Cause.** Activation walks the cognitive map: a node lights up when its
`label` / `keywords` match the query terms (lexically or semantically). If
the parent node has no relevant keywords, the activation gate (default
`>= 0.45` to be latent, `>= 0.75` to be open) never fires for that branch.
Items inside it are then filtered out at the gating step before retrieval
even runs.

**Fix today.** Edit the node manually in Paradigm Memory (item editor -> keywords) or
via `memory_create_node` / forthcoming `memory_update_node`, and add the
missing keywords.

**Fix tomorrow (v0.2.x).** The **Auto-Keywords** pass will recompute a
parent's keywords from a TF-IDF over its items and propose mutations the user
can accept. Tracked in `ROADMAP.md` § v0.2.x.

**Tip.** When you create a new branch, give it 3–5 broad keywords up front
(`projects`, `notes`, `decisions`, `people`, `architecture`, …). Specific
terms from items will reinforce activation later; the broad keywords ensure
the branch is reachable from a cold query.

---

## 3. Windows pitfalls

### 3.1 Environment variables — Git Bash vs. PowerShell

`KEY=VALUE node script.mjs` does **not** propagate `KEY` to Node when invoked
through Git Bash on Windows because the npm wrapper re-spawns through cmd.
This silently breaks `PARADIGM_MEMORY_DIR`, `PARADIGM_MEMORY_EMBEDDINGS`,
etc.

**Use PowerShell:**

```powershell
$env:PARADIGM_MEMORY_EMBEDDINGS = "wasm"
$env:PARADIGM_MEMORY_DIR = "$env:USERPROFILE\.paradigm"
node packages/memory-mcp/src/server.mjs
```

**Or set the var inside the launching process** (e.g. the MCP client's
`env` block in `~/.codex/config.toml`, `~/.gemini/settings.json`, or
`claude mcp add … --env KEY=VALUE`). That always works.

### 3.2 `sqlite3.exe` quoting

Running `sqlite3.exe paradigm.sqlite "UPDATE memory_items SET …"` from PowerShell
or cmd is a quoting minefield: backticks vs. backslashes vs. double quotes,
and any apostrophe in the data corrupts the statement. Symptoms range from
silent partial updates to `near "...": syntax error`.

**Don't do ad-hoc SQL on the prompt.** Two reliable paths:

1. Put the SQL in a file and pipe it:
   ```powershell
   Get-Content fix.sql | sqlite3.exe "$env:USERPROFILE\.paradigm\memory\paradigm.sqlite"
   ```
2. Write a one-shot `.mjs` script that opens the DB via `node:sqlite` and
   uses parameterised statements. Bonus: it inherits Node's UTF-8 handling
   instead of fighting Windows code pages.

   ```javascript
   import { DatabaseSync } from "node:sqlite";
   import os from "node:os";
   import path from "node:path";

   const db = new DatabaseSync(path.join(os.homedir(), ".paradigm", "memory", "paradigm.sqlite"));
   db.prepare("UPDATE memory_items SET tags = ? WHERE id = ?").run(JSON.stringify(["fix"]), "mem.xyz");
   db.close();
   ```

### 3.3 SQLite `database is locked`

The MCP server, the CLI, Paradigm Memory and any custom script all open
the *same* SQLite file. Under heavy concurrency you can hit `SQLITE_BUSY`.

Mitigations baked into `@paradigm-memory/memory-core`:
- WAL journal mode (parallel readers + one writer).
- A `busy_timeout` on every connection.

What you can do:
- **Don't run two MCP servers against the same workspace.** One process,
  many clients (the MCP itself is a process, not a per-client child).
- **Avoid long-running transactions in scripts.** Open, write, close. Don't
  hold a cursor while you go think.
- **Stop the MCP before destructive maintenance scripts** if they touch many
  rows in a single transaction.

If you do see `database is locked` repeatedly, file an issue with the
operation that triggered it — it usually means a path inside the engine is
holding a transaction longer than it should.

---

## 4. Reasoner sizing

The default reasoner (`onnx-community/Qwen2.5-1.5B-Instruct`, WASM, CPU) is
sized for "good-enough summaries on a laptop without a GPU". Cold-start
download is ~1.5 GB; subsequent runs reuse the local cache.

**When to upgrade.** If `memory_dream` consistently produces summaries you
end up rewriting, or if it merges items that shouldn't have been merged,
consider a 3B-class model:

```
PARADIGM_REASONER_MODEL=onnx-community/Qwen2.5-3B-Instruct
```

(Set in the MCP's `env` block. Requires substantially more RAM and roughly
2–3× the latency.)

**When to downgrade.** If the cold start is unacceptable on a constrained
machine, you can disable the reasoner entirely — the heuristic dream pass
(duplicates, stale, overloaded, orphans) still runs and is the default
behaviour.

---

## 5. Backup & sync (interim guidance)

There is no built-in cross-machine sync yet (tracked in ROADMAP § v0.3).
Until then:

- **Backup.** `paradigm export $HOME/.paradigm-backups/$(date +%Y-%m-%d).brain`
  produces a single JSON snapshot. Versioning these in a private git repo is
  cheap and gives you a full audit trail.
- **Restore.** `paradigm import path.brain --mode merge` is non-destructive
  (upserts only). Use `--mode replace` only when you really want to wipe.
- **Two machines.** Export from A, copy the `.brain` file across, import on B
  (`merge`). Conflicts: the latest `updated_at` wins on a per-item basis;
  audit rows are appended.

Auto-snapshots are already taken before destructive MCP ops
(`memory_delete`, `memory_import:replace`) under
`<memory-dir>/snapshots/`. Don't disable them.

---

## 6. Where to look when things break

| Symptom | Look here |
|---|---|
| Search returns nothing | `data/traces/*.json` — the activation step shows whether the query lit up any node. |
| Dream finds zero duplicates after ingest | Run `paradigm doctor`, then `paradigm warm`. |
| MCP client reports protocol errors | Stderr of the MCP process. The server intentionally writes nothing to stdout outside JSON-RPC. |
| Paradigm Memory is empty | Check `version.workspace_dir` in the top bar; you may be pointed at a fresh `~/.paradigm` while your data is in the repo's `data/`. |
| `database is locked` | See § 3.3. |
| Embeddings disabled silently | `paradigm version` — `PARADIGM_MEMORY_EMBEDDINGS` propagates to the `stats.embeddingProvider` field. |
