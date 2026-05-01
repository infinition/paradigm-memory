# Backlog

High-priority tasks and experiments to move Paradigm forward.

## Short-Term (Current Sprint)

### UI & UX
- **Trace Visualization**: Add a panel in Paradigm Memory to see exactly why a node was activated or an item was injected.
- **Node Keywords Editor**: Improve the UI for manually adding/editing keywords on a node.
- **Auto-Keywords**: Implement a task that suggests keywords for a node based on its items' content (TF-IDF).

### Performance
- **Streaming MCP**: Support streaming responses in the MCP server to reduce perceived latency.
- **Batched Embeddings**: Optimize the warm pass to use larger batches for the embedding provider.

---

## Mid-Term

### Memory Maintenance
- **Branch Resumation**: Use the LLM to summarize a branch that has too many items, replacing the noise with a single high-quality "anchor" item.
- **Cross-Node Links**: Implement explicit links between nodes to allow the activation pulse to jump between distant branches.

### Evaluation
- **Human Continuity Test**: Conduct an experiment where the LLM's backend is swapped, and a human evaluator (blind) rates the continuity of the conversation.
- **Divergence Metric v2**: Use a more sophisticated semantic distance metric to measure how much two instances differ after 100+ interactions.

---

## Long-Term

### Distribution & Security
- **Encrypted Storage**: Optional encryption for the SQLite database at rest.
- **Multi-Entity Server**: Allow a single Paradigm server to host multiple isolated entities.
- **Cloud Bridges**: Optional, encrypted backup to a cloud provider or IPFS.

---

## Completed ✅

- **Interactive Reorganization**: Drag-and-drop items to nodes via the sidebar.
- **Advanced Metadata Editor**: Sliders for importance/confidence and tag editing.
- **Smart Node Deletion**: Backend inheritance logic for orphan items/nodes.
- **Node ID Autocomplete**: Suggesting existing paths in the creation modal.
- **Rich Markdown**: support for KaTeX and line breaks in item cards.
