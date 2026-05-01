import { useState, useEffect } from "react";
import type { MemoryItem, MemoryNode } from "../lib/types";
import { mcp } from "../lib/mcp";
import { toast } from "./Toast";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface Props {
  node: MemoryNode | null;
  items: MemoryItem[];
  allNodes: MemoryNode[];
  workspace?: string;
  onChanged: () => void;
  onSelect: (id: string) => void;
  highlightedItemId?: string | null;
}

const ITEM_DRAG_MIME = "application/x-paradigm-memory-item";

function isInteractiveDragTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("button,a,input,textarea,select"));
}

export function ItemEditor({ node, items, allNodes, workspace, onChanged, onSelect, highlightedItemId }: Props) {
  const [draft, setDraft] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [editingTags, setEditingTags] = useState("");
  const [editingImportance, setEditingImportance] = useState(0.5);
  const [editingConfidence, setEditingConfidence] = useState(0.8);

  useEffect(() => { setEditingId(null); }, [node?.id]);

  useEffect(() => {
    if (highlightedItemId) {
      const el = document.getElementById(`item-${highlightedItemId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [highlightedItemId]);

  if (!node) {
    return (
      <div className="pane editor">
        <div className="empty">Select a node to inspect.</div>
      </div>
    );
  }

  const submit = async (mode: "propose" | "write") => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      const args = {
        node_id: node!.id,
        content: draft.trim(),
        tags: tags.split(",").map(t => t.trim()).filter(Boolean),
        workspace
      };
      if (mode === "propose") await mcp.proposeWrite(args);
      else await mcp.write(args);
      setDraft("");
      setTags("");
      onChanged();
      toast.success(mode === "write" ? "Item written" : "Item proposed", node!.label);
    } catch (caught: any) {
      toast.error("Write failed", String(caught?.message ?? caught));
    } finally {
      setBusy(false);
    }
  };

  const handleIngest = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.txt";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !node) return;
      setBusy(true);
      try {
        const content = await file.text();
        await mcp.importMarkdown({ node_id: node.id, content, title: file.name, workspace });
        onChanged();
        toast.success("Ingested", file.name);
      } catch (caught: any) {
        toast.error("Ingest failed", String(caught?.message ?? caught));
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  const startEdit = (item: MemoryItem) => {
    setEditingId(item.id);
    setEditingContent(item.content);
    setEditingTags(item.tags?.join(", ") ?? "");
    setEditingImportance(item.importance ?? 0.5);
    setEditingConfidence(item.confidence ?? 0.8);
  };

  const saveEdit = async () => {
    if (!editingId || !editingContent.trim()) return;
    setBusy(true);
    try {
      await mcp.updateItem({ 
        item_id: editingId, 
        content: editingContent.trim(), 
        tags: editingTags.split(",").map(t => t.trim()).filter(Boolean),
        importance: editingImportance,
        confidence: editingConfidence,
        workspace 
      });
      setEditingId(null);
      onChanged();
      toast.success("Item updated");
    } catch (caught: any) {
      toast.error("Update failed", String(caught?.message ?? caught));
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (item: MemoryItem) => {
    setBusy(true);
    try {
      await mcp.deleteItem({ item_id: item.id, reason: "memory_delete", workspace });
      onChanged();
      toast.success("Item deleted", item.id.slice(-8));
    } catch (caught: any) {
      toast.error("Delete failed", String(caught?.message ?? caught));
    } finally {
      setBusy(false);
    }
  };

  const removeNode = async () => {
    if (!node || !window.confirm(`Delete node "${node.label}"? All items and sub-nodes will be moved to the parent.`)) return;
    setBusy(true);
    try {
      await mcp.deleteNode({ id: node.id, workspace });
      onSelect("workspace"); // Fallback to root
      onChanged();
      toast.success("Node deleted", node.id);
    } catch (caught: any) {
      toast.error("Delete failed", String(caught?.message ?? caught));
    } finally {
      setBusy(false);
    }
  };

  const startItemDrag = (event: React.DragEvent<HTMLDivElement>, item: MemoryItem, isEditing: boolean) => {
    if (isEditing || isInteractiveDragTarget(event.target)) {
      event.preventDefault();
      return;
    }
    event.currentTarget.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(ITEM_DRAG_MIME, item.id);
    event.dataTransfer.setData("text/plain", item.id);
  };

  return (
    <div className="pane editor">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{node.label}</h2>
        <button className="danger ghost small" onClick={removeNode} disabled={busy || node.id === "workspace"}>Delete Node</button>
      </div>
      <div className="meta">
        <code>{node.id}</code><br />
        {node.one_liner && <span>{node.one_liner}</span>}
        {node.keywords && node.keywords.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {node.keywords.map((kw, i) => (
              <span key={i} style={{
                display: "inline-block",
                background: "var(--teal-dim)",
                color: "var(--teal)",
                padding: "1px 8px",
                borderRadius: 10,
                fontSize: 10,
                fontWeight: 600,
                marginRight: 4,
                marginBottom: 4
              }}>{kw}</span>
            ))}
          </div>
        )}
      </div>

      {/* Children Navigation */}
      {allNodes.filter(n => n.parent_id === node.id).length > 0 && (
        <div className="sub-nodes" style={{ marginTop: 16 }}>
          <label style={{ 
            fontSize: 10, 
            textTransform: "uppercase", 
            letterSpacing: ".1em", 
            color: "var(--muted)", 
            display: "block",
            marginBottom: 8,
            fontWeight: 700 
          }}>Sub-nodes</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {allNodes.filter(n => n.parent_id === node.id).map(child => (
              <button 
                key={child.id} 
                className="ghost small" 
                style={{ 
                  background: "var(--bg-elev-2)", 
                  border: "1px solid var(--border-soft)",
                  padding: "4px 10px",
                  borderRadius: 14,
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  gap: 6
                }}
                onClick={() => onSelect(child.id)}
              >
                <span style={{ opacity: 0.5 }}>↳</span> {child.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field" style={{ marginTop: 20 }}>
        <label>New item</label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What should the agent remember?"
          rows={3}
        />
      </div>
      <div className="field">
        <label>Tags</label>
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="decision, convention" />
      </div>
      <div className="actions">
        <button className="primary" disabled={busy || !draft.trim()} onClick={() => submit("write")}>
          Write
        </button>
        <button disabled={busy || !draft.trim()} onClick={() => submit("propose")}>
          Propose
        </button>
        <button className="ghost" disabled={busy} onClick={handleIngest} title="Ingest .md/.txt">
          Ingest
        </button>
      </div>

      <h2 style={{ marginTop: 24, fontSize: 13, color: "var(--teal)" }}>Items ({items.length})</h2>
      {items.length === 0 && <div className="empty">No items yet.</div>}
      <div className="review-list" style={{ padding: 0 }}>
        {items.map((item) => {
          const isEditing = editingId === item.id;
          const isHighlighted = highlightedItemId === item.id;
          return (
            <div 
              key={item.id} 
              id={`item-${item.id}`}
              className={`review-card ${isHighlighted ? "highlighted" : ""}`}
              draggable={!isEditing}
              onDragStart={(e) => startItemDrag(e, item, isEditing)}
              onDragEnd={(e) => {
                e.currentTarget.classList.remove("dragging");
              }}
            >
              <div className="rc-meta">
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <div title="Drag to move" style={{ cursor: "grab", color: "var(--muted)", padding: "0 4px", fontSize: "14px", userSelect: "none" }}>⠿</div>
                  <span className={`status-pill ${item.status === "proposed" ? "proposed" : "active"}`}>
                    {item.status ?? "active"}
                  </span>
                  <code>{item.id.split(".").pop()}</code>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 10, color: "var(--muted)" }}>
                  {item.importance !== undefined && (
                    <span title="Importance" style={{ background: "var(--bg-elev-3)", padding: "2px 6px", borderRadius: 4 }}>
                      Imp: <strong style={{ color: "var(--amber)" }}>{item.importance.toFixed(1)}</strong>
                    </span>
                  )}
                  {item.confidence !== undefined && (
                    <span title="Confidence" style={{ background: "var(--bg-elev-3)", padding: "2px 6px", borderRadius: 4 }}>
                      Conf: <strong style={{ color: "var(--green)" }}>{item.confidence.toFixed(1)}</strong>
                    </span>
                  )}
                </div>
              </div>
              <div className="rc-content">
                {isEditing ? (
                  <div className="edit-container" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <textarea
                      className="inline-edit"
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      autoFocus
                      rows={5}
                    />
                    <div className="edit-meta-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                       <div className="field">
                          <label style={{ fontSize: 10 }}>Importance ({editingImportance.toFixed(2)})</label>
                          <input type="range" min="0" max="1" step="0.05" value={editingImportance} onChange={e => setEditingImportance(parseFloat(e.target.value))} />
                       </div>
                       <div className="field">
                          <label style={{ fontSize: 10 }}>Confidence ({editingConfidence.toFixed(2)})</label>
                          <input type="range" min="0" max="1" step="0.05" value={editingConfidence} onChange={e => setEditingConfidence(parseFloat(e.target.value))} />
                       </div>
                    </div>
                    <div className="field">
                       <label style={{ fontSize: 10 }}>Tags (comma separated)</label>
                       <input value={editingTags} onChange={e => setEditingTags(e.target.value)} placeholder="tag1, tag2" />
                    </div>
                  </div>
                ) : (
                  <div className="markdown-body">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                        p: ({ children }) => <p><NumberHighlighter>{children}</NumberHighlighter></p>,
                        li: ({ children }) => <li><NumberHighlighter>{children}</NumberHighlighter></li>
                      }}
                    >
                      {item.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>

              {/* Metadata Footer */}
              {!isEditing && (
                <div className="rc-footer" style={{ 
                  marginTop: 12, 
                  paddingTop: 10, 
                  borderTop: "1px solid var(--border-soft)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8
                }}>
                  {item.tags && item.tags.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {item.tags.map((tag, i) => (
                        <span key={i} style={{ 
                          fontSize: 9, 
                          background: "var(--cyan-dim)", 
                          color: "var(--cyan)", 
                          padding: "1px 6px", 
                          borderRadius: 4,
                          fontWeight: 600,
                          textTransform: "uppercase"
                        }}>#{tag}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center",
                    fontSize: 10,
                    color: "var(--muted)"
                  }}>
                    <span>{item.source ? `Source: ${item.source}` : ""}</span>
                    <span>{item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}</span>
                  </div>
                </div>
              )}

              <div className="rc-actions">
                {isEditing ? (
                  <>
                    <button className="primary small" onClick={saveEdit} disabled={busy}>Save Changes</button>
                    <button className="ghost small" onClick={() => setEditingId(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="ghost small" onClick={() => startEdit(item)}>Edit</button>
                    <button className="danger ghost small" onClick={() => removeItem(item)} disabled={busy}>Delete</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NumberHighlighter({ children }: { children: React.ReactNode }) {
  if (typeof children !== "string") {
    if (Array.isArray(children)) {
      return <>{children.map((child, i) => <NumberHighlighter key={i}>{child}</NumberHighlighter>)}</>;
    }
    return <>{children}</>;
  }
  const parts = children.split(/(\d+(?:\.\d+)?)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\d+(?:\.\d+)?$/.test(part)
          ? <span key={i} className="number-lite">{part}</span>
          : part
      )}
    </>
  );
}
