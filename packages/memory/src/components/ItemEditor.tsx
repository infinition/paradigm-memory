import { useState, useEffect } from "react";
import type { MemoryItem, MemoryNode } from "../lib/types";
import { mcp } from "../lib/mcp";
import { toast } from "./Toast";

interface Props {
  node: MemoryNode | null;
  items: MemoryItem[];
  workspace?: string;
  onChanged: () => void;
}

export function ItemEditor({ node, items, workspace, onChanged }: Props) {
  const [draft, setDraft] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");

  useEffect(() => { setEditingId(null); }, [node?.id]);

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

  const saveEdit = async () => {
    if (!editingId || !editingContent.trim()) return;
    setBusy(true);
    try {
      await mcp.updateItem({ item_id: editingId, content: editingContent.trim(), workspace });
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

  return (
    <div className="pane editor">
      <h2>{node.label}</h2>
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

      <div className="field" style={{ marginTop: 16 }}>
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
          return (
            <div key={item.id} className="review-card">
              <div className="rc-meta">
                <span className={`status-pill ${item.status === "proposed" ? "proposed" : "active"}`}>
                  {item.status ?? "active"}
                </span>
                <code>{item.id.split(".").pop()}</code>
              </div>
              <div className="rc-content">
                {isEditing ? (
                  <textarea
                    className="inline-edit"
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    autoFocus
                  />
                ) : (
                  item.content.split("\n").map((line, i) => {
                    if (line.startsWith("#")) {
                      return <div key={i} style={{ fontWeight: 700, color: "var(--teal)", marginTop: i > 0 ? 6 : 0 }}>{line}</div>;
                    }
                    const parts = line.split(/(\*\*.*?\*\*)/g);
                    return (
                      <div key={i}>
                        {parts.map((part, j) => {
                          if (part.startsWith("**") && part.endsWith("**")) {
                            return <strong key={j} style={{ color: "var(--ink)" }}>{part.slice(2, -2)}</strong>;
                          }
                          return part;
                        })}
                      </div>
                    );
                  })
                )}
              </div>
              <div className="rc-actions">
                {isEditing ? (
                  <>
                    <button className="primary small" onClick={saveEdit} disabled={busy}>Save</button>
                    <button className="ghost small" onClick={() => setEditingId(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="ghost small" onClick={() => { setEditingId(item.id); setEditingContent(item.content); }}>Edit</button>
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
