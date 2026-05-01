# Architectural Decisions

## ADR-0001 - Paradigm Memory as Primary Surface
**Date:** 2026-04-24
**Decision:** Paradigm exposes the memory substrate through the local Paradigm Memory application.
**Rationale:** The interface makes the memory observable. Without a visible surface, we risk developing internal mechanics that are impossible to inspect, compare, or audit.
**Consequences:**
- Internal state must be serializable.
- Memory mutations must be visible in real-time (Audit tab).
- The API remains decoupled from the frontend.

## ADR-0002 - Interchangeable LLM Backend
**Date:** 2026-04-24
**Decision:** The memory core does not depend directly on any specific LLM provider (Ollama, Claude, etc.). It communicates via the Model Context Protocol (MCP).
**Rationale:** The LLM (cortex) is an external processing unit. Changing the LLM should not alter the identity or the stored memory.
**Consequences:**
- `mock` backend is used for local tests.
- Support for standard MCP clients (Claude Code, Gemini CLI, etc.).

## ADR-0003 - Abstract Visual Identity
**Date:** 2026-04-24
**Decision:** The entity has a visual presence (Paradigm Memory) but does not immediately adopt a humanoid form.
**Rationale:** A humanoid form prematurely encourages users to project human-like interiority that hasn't been demonstrated.
**Consequences:**
- The UI feels like a "living cockpit" rather than a mascot.
- Focus on state indicators and navigation over avatar animation.

## ADR-0004 - Serialized Action Queue
**Date:** 2026-04-24
**Decision:** User interactions and memory mutations pass through a serialized action queue.
**Rationale:** Large models may respond slowly. Without a queue, concurrent messages could interleave memory updates and corrupt the audit trail.
**Consequences:**
- Only one conversational action modifies the state at a time.
- Heartbeats and health checks continue independently.
