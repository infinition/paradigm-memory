import { useEffect, useState } from "react";
import { mcp } from "../lib/mcp";
import { toast } from "./Toast";
import type { MemoryItem } from "../lib/types";

interface Props {
  workspace?: string;
  onChanged?: () => void;
}

export function ReviewQueue({ workspace, onChanged }: Props) {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    try {
      const result = await mcp.listProposed(workspace);
      setItems(result.items);
    } finally { setBusy(false); }
  };

  useEffect(() => { refresh(); }, [workspace]);

  const review = async (item: MemoryItem, action: "accept" | "reject") => {
    try {
      await mcp.review({ item_id: item.id, action, reason: `memory_${action}`, workspace });
      await refresh();
      onChanged?.();
      toast.success(action === "accept" ? "Accepted" : "Rejected", item.content.slice(0, 50));
    } catch (err: any) {
      toast.error("Review failed", err.message);
    }
  };

  return (
    <div className="layout" style={{ gridTemplateColumns: "1fr" }}>
      <div className="pane" style={{ borderRight: "none" }}>
        <h2>Pending Review ({items.length}) {busy && <span style={{ color: "var(--muted)" }}>…</span>}</h2>
        <div className="review-list">
          {items.length === 0 && <div className="empty">✓ Nothing to review. Queue is clean.</div>}
          {items.map((item) => (
            <div key={item.id} className="review-card">
              <div className="rc-meta">
                <span className="status-pill proposed">proposed</span>
                <code style={{ fontSize: 10 }}>{item.node_id}</code>
                <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 10 }}>{item.created_at?.slice(0, 16)}</span>
              </div>
              <div className="rc-content">{item.content}</div>
              <div className="rc-actions" style={{ opacity: 1 }}>
                <button className="primary small" onClick={() => review(item, "accept")}>Accept</button>
                <button className="danger small" onClick={() => review(item, "reject")}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
