# Experimental Results

This file tracks experimental observations. Results must remain dated, reproducible, and modest.

## 2026-04-24 - Initial Foundations
**Hypothesis:** A minimal memory substrate can be exposed via a web server before any LLM integration.
**Result:** Validated for the local core.
**Observations:** Paradigm Memory (v0) successfully rendered the initial cognitive map and items.

## 2026-04-24 - SQLite FTS5 Memory Store
**Hypothesis:** The cognitive map can remain readable in JSON while using SQLite/FTS5 for precise local retrieval.
**Result:** Validated.
**Observations:** FTS5 provides sub-millisecond keyword search across thousands of memory items.

## 2026-04-29 - Paradigm Memory MCP v0
**Hypothesis:** The memory layer can be decoupled from the affective substrate and exposed as a standalone MCP server.
**Result:** Validated.
**Observations:** `memory.search`, `memory.read`, and `memory.propose_write` are fully operational. Latency for local fixture searches remains under 100ms.

## 2026-04-29 - Hybrid Activation (Semantic Boost)
**Hypothesis:** Adding a local semantic layer (embeddings) improves routing for distant paraphrases without breaking lexical speed.
**Result:** Validated on a "hard" evaluation set.
**Metrics (semantic-hard-cases):**
- Lexical only: `node@1` 0.500, `node@3` 0.833.
- Hybrid (Ollama embeddings): `node@1` 0.833, `node@3` 1.000.
**Observation:** The semantic layer provides the first measured gain on formulations that do not share literal tokens with the memory nodes.

## 2026-04-30 - Paradigm Memory Consolidation (The Dream Pass)
**Hypothesis:** The "Consolidator" (Dream) can identify memory maintenance needs (duplicates, orphans) and present them for human review.
**Result:** Validated.
**Observation:** Paradigm Memory now displays actionable consolidation proposals, allowing for deduplication with item-level comparison.

## 2026-04-30 - Search Robustness (Lexical Boost)
**Hypothesis:** A lexical boost ensures that exact keyword matches are never filtered out by semantic thresholds.
**Result:** Validated.
**Observation:** Searching for clear keywords (e.g., "pizzas") now returns matches even if the semantic activation of the parent node is relatively low.
