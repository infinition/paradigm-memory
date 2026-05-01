# Memory Writer

## Philosophy

The LLM does not store anything by itself. The cortex (LLM) proposes; the substrate (Paradigm) writes, updates, or deletes. Paradigm memory is mutable, but never silently mutable.

## Rules of Engagement

- **Write**: An interaction produces a memory item if it contains a preference, decision, constraint, or significant architectural insight.
- **Update**: New items can supersede old ones. Every update creates a new version.
- **Delete**: Logically deleted (marked as `deleted`), never silently erased.
- **Audit**: Every mutation creates an entry in the `memory_mutations` table.
- **Active Retrieval**: Deleted items are excluded from search and context injection.

## Why Logical Deletion?

An entity whose memory can be erased without a trace can be "gaslighted" or rewritten. Paradigm maintains:
- The item content (marked `status='deleted'`);
- Deletion timestamp;
- The actor (e.g., `user`, `mcp`);
- The reason;
- The audit mutation ID.

## Implementation (v0.1.x)

The writer is cautious and heuristic:
- It ignores very short messages or obvious tests.
- It targets existing nodes or proposes new ones.
- It prioritizes architectural conventions and user preferences.

## Human-in-the-loop

Through Paradigm Memory, users can review proposed writes and deletions:
```text
Candidate Item -> Accept / Edit / Reject
```

This ensures the memory remains a faithful representation of the intended cognitive state.
