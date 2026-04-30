# Cognitive Map Retrieval (The Atlas)

## Thesis

An agent's active context should not contain its memory. It should contain its **orientation**.

Memory remains external, structured, verifiable, and navigable. The context carries only:

- The navigation map (Cognitive Map);
- The attentional state;
- Critical constraints;
- Pointers to relevant zones;
- The minimal evidence (items) necessary for the current action.

## Formula

```text
LLM Context != Memory
LLM Context = Navigation Map + Attentional Orientation
Memory = Deep territory consulted progressively
```

## Why Not Flat RAG?

Flat RAG usually follows this flow:
`query -> embedding search -> top-k chunks -> injection -> response`

This is useful but "myopic": it retrieves nearby chunks without understanding the cognitive region.

Paradigm follows this flow:
`query -> node activation -> branch selection -> local retrieval -> minimal injection -> response`

## Depths of Retrieval

- **Depth 0**: Global map, root domains.
- **Depth 1**: Active branch, domain summary.
- **Depth 2**: Key facts, decisions, constraints, open problems.
- **Depth 3**: Specific episodes, logs, traces.
- **Depth 4**: Raw archives, files, captures.

Descent is not automatic. It is triggered by activation, need for proof, or high uncertainty.

## The Node Structure

A node is a gateway, not a warehouse.

```json
{
  "id": "projects.paradigm.memory",
  "label": "Cognitive Map Retrieval",
  "one_liner": "Tree-structured memory activated progressively to keep context clean.",
  "importance": 0.92,
  "freshness": 1.0,
  "status": "active",
  "keywords": ["memory", "mind map", "gating", "retrieval", "context"],
  "retrieval_policy": {
    "default_depth": 1,
    "max_tokens": 600,
    "require_evidence": true
  }
}
```

## Activation Logic

Every message activates nodes based on a score:

```text
activation > 0.75 : Open branch (Inject items)
activation > 0.45 : Keep latent (Inject node summary only)
activation < 0.28 : Ignore
```

Inhibition prevents polluting the context with weak concurrent branches.

## Current Pipeline (v0.1.x)

1. **Activation**: Score nodes by labels, keywords, recency, and semantic similarity.
2. **Gating**: Select the best branches based on the activation threshold.
3. **Local Retrieval**: Fetch items from active branches (SQLite FTS5 + Vector).
4. **Context Packaging**: Assemble a token-budgeted prompt snippet.
5. **Mutation**: Audit and record the interaction.

## Storage Strategy

- **SQLite (FTS5)**: For exact term matching and metadata filtering.
- **Vector Search**: Localized search within activated branches for semantic flexibility.
- **Audit Log**: Every change is tracked in the `memory_mutations` table.

## Internal Module: Atlas

The core logic resides in the `atlas.mjs` module within `@paradigm-memory/memory-core`.
