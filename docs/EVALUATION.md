# Falsifiable Evaluation

This document defines the core hypotheses and the automated tests used to measure project progress.

## Hypothesis H1 - Historical Divergence
**Statement:** Given the same LLM backend, two instances with different interaction histories must diverge in a measurable way.
**v0 Proxy Test:**
- Replay two different artificial histories in isolated substrates.
- Ask the same probes to both.
- Compare activated nodes, retrieved evidence, and the produced context pack.
**Success Criteria:** Different histories must lead to different context packs for relevant probes.

## Hypothesis H2 - Substrate Continuity
**Statement:** Given the same history but a different LLM backend, the entity must maintain a recognizable continuity superior to a "blank" chat session.
**v0 Proxy Test:**
- Verify that the substrate reconstructs the exact same context pack for a given history, regardless of which LLM is currently active.
- This ensures the "Identity" is stored in the memory substrate, not the model's weights.
**Success Criteria:** Two instances built from the same history produce the same context pack fingerprint.

## Automated Commands

```powershell
# Run the core memory evaluation (Activation & Recall)
npm run eval:memory

# Run the substrate divergence test (H1/H2)
npm run eval:substrate
```

## What These Tests Do NOT Prove
- They do not prove consciousness.
- They do not prove phenomenal identity.
- They do not yet validate subjective conversational quality.

They prove only that the substrate is producing a **stable, replayable, and falsifiable external memory**.
