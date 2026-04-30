# Unified Development Plan

Target Vision: Paradigm is a persistent, navigable, and audited cognitive substrate. Memory is the territory, the active orientation is the map, the LLM is an interchangeable cortex, and every mutation is audited.

## Core Rules:

1. No features without evaluation (evals) to prove improvement.
2. No memory mutations without an audit trail.
3. The manifesto remains separate from the code: the code answers falsifiable questions.

---

## P0 - Foundations & Instrumentation

**Objective:** Make everything verifiable.

### P0.1 - Local Testing
- Maintain `packages/memory-core/tests/` with `node --test`.
- Cover `atlas`, `writer`, `storage`.
- Maintain `scripts/install.ps1` for easy setup.

### P0.2 - Evaluation Harness
- Standardize `evals/*.json` with `id`, `query`, `expected_node_ids`, `expected_item_ids`.
- Maintain at least 30 cases: activation, paraphrase, EN/FR, ambiguous, out-of-domain.
- Generate `evals/results/YYYY-MM-DD.md`.

### P0.3 - Observability (Traces)
- Trace every request: intent, activation, retrieval, rerank, context pack, response.
- Write to `data/traces/<request-id>.json`.
- [Done] Integrated "Audit" tab in Studio.

---

## P1 - Memory Core (The Atlas)

**Objective:** Make Cognitive Map Retrieval the project's standout feature.

### P1.1 - Hybrid Activation
- [Done] Lexical scoring as baseline.
- [Done] Semantic activation via local embeddings (Xenova/Transformers.js).
- Combine `activation = lexical + semantic + recency + importance`.

### P1.2 - Cognitive Map Refinement
- If confidence is low or the user signals a mismatch, reopen latent branches.
- Expose `request_branch_reactivation(reason)`.

### P1.3 - Hybrid Retrieval
- [Done] SQLite FTS5 for exact terms.
- [Done] Local vector search per active branch.
- [Done] Filter by metadata: discipline, freshness, confidence, status.

### P1.4 - Explicit Context Budget
- Configurable token budget per request.
- [Done] Distribution: Map (10%), Active Branch (20%), Evidence (60%), State (10%).

---

## P2 - Memory Lifecycle (The Consolidator)

**Objective:** Make memory alive without letting it become uncontrollable.

### P2.1 - The Dream Pass (Consolidator)
- [Done] Detect overloaded nodes, empty nodes, duplicates, and orphan items.
- [Done] Produce proposals, never automatic mutations.
- [Done] UI in Studio to review and apply proposals.

### P2.2 - Controlled Forgetting
- Node policies: decay, pruning low importance, manual only.
- Archive instead of erase.

### P2.3 - Guarded Mutations
- Pipeline: `candidate -> queue -> accept/edit/reject`.
- [Done] Review UI with diff-like visibility in Studio.

---

## P3 - Cortex Orchestration

**Objective:** Make the LLM interchangeable and disciplined.

### P3.1 - Adapters
- Standardize MCP interface.
- Support local (Ollama, llama.cpp) and cloud-based (OpenAI, Claude) backends via standard MCP clients.

---

## P5 - Hardening & Distribution

**Objective:** Make the substrate robust, portable, and user-friendly.

### P5.1 - Sandbox & Integrity
- Restrict network access to whitelisted LLM backends.
- Append-only hash chain for audit logs.

### P5.2 - Distribution
- [Done] Packages: `@paradigm-memory/memory-core`, `@paradigm-memory/memory-mcp`, `@paradigm-memory/memory-studio`.
- [Done] Compiled binaries for Studio.

---

## Recommended Roadmap

```text
P0 Testing & Traces
  -> P1.1 Hybrid Activation
  -> P2.1 Consolidation (Dream Pass)
  -> P5.2 Studio Distribution
  -> P1.4 Context Budgeting
```
