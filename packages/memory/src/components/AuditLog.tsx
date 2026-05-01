import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MemoryMutation } from "../lib/types";
import { mcp } from "../lib/mcp";

interface Props {
  workspace?: string;
  onSelectNode?: (nodeId: string) => void;
  onSelectItem?: (nodeId: string, itemId: string) => void;
}

function mutationNodeId(row: MemoryMutation): string | null {
  const payload = row.payload as any;
  return row.node_id ?? payload?.node_id ?? (payload?.label ? payload?.id : null) ?? null;
}

function mutationItemId(row: MemoryMutation): string | null {
  const payload = row.payload as any;
  return row.item_id ?? (payload?.content ? payload?.id : null) ?? null;
}

function shortId(id: string | null): string {
  if (!id) return "";
  return id.length > 36 ? `${id.slice(0, 18)}...${id.slice(-10)}` : id;
}

export function AuditLog({ workspace, onSelectNode, onSelectItem }: Props) {
  const [rows, setRows] = useState<MemoryMutation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [auto, setAuto] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const result = await mcp.mutations(workspace, 300);
      setRows(result.mutations);
      return;
    } catch {
      // Older sidecars may not expose memory_mutations yet; keep the direct
      // SQLite fallback for source-checkout development.
    }
    invoke<MemoryMutation[]>("read_mutations", { workspace: workspace ?? null, limit: 300 })
      .then(setRows)
      .catch((caught) => setError(String(caught)));
  };

  useEffect(() => { load(); }, [workspace]);

  useEffect(() => {
    if (!auto) return;
    const timer = window.setInterval(() => { load(); }, 5000);
    return () => window.clearInterval(timer);
  }, [auto, workspace]);

  if (error) {
    return (
      <div className="empty">
        Audit log unavailable: <code>{error}</code>
      </div>
    );
  }

  if (!rows) return <div className="empty">Loading audit...</div>;
  if (rows.length === 0) return <div className="empty">No mutations recorded yet.</div>;

  const visibleRows = rows.filter((row) => {
    const haystack = `${row.operation} ${row.actor ?? ""} ${row.node_id ?? ""} ${row.item_id ?? ""} ${row.reason ?? ""} ${JSON.stringify(row.payload ?? {})}`.toLowerCase();
    return haystack.includes(filter.trim().toLowerCase());
  });

  const focusRow = (row: MemoryMutation) => {
    const itemId = mutationItemId(row);
    const nodeId = mutationNodeId(row);
    if (itemId && nodeId && onSelectItem) {
      onSelectItem(nodeId, itemId);
      return;
    }
    if (nodeId && onSelectNode) onSelectNode(nodeId);
  };

  return (
    <div className="audit-list">
      <div className="audit-toolbar">
        <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter operation, actor, item..." />
        <button className={`ghost small${auto ? " active" : ""}`} onClick={() => setAuto(!auto)}>Auto</button>
        <button className="ghost small" onClick={load}>Refresh</button>
      </div>
      {visibleRows.map((row) => {
        const nodeId = mutationNodeId(row);
        const itemId = mutationItemId(row);
        const expanded = expandedId === row.id;
        return (
          <div key={row.id} className={`audit-row-wrap${expanded ? " expanded" : ""}`}>
            <div className="audit-row" onClick={() => setExpandedId(expanded ? null : row.id)}>
              <span className="ts">{row.at?.slice(0, 19).replace("T", " ")}</span>
              <span className={`op ${row.operation}`}>{row.operation}</span>
              <span className="audit-targets">
                {itemId && <code title={itemId}>item:{shortId(itemId)}</code>}
                {nodeId && <code title={nodeId}>node:{shortId(nodeId)}</code>}
                {row.actor && <span className="audit-muted">actor:{row.actor}</span>}
                {row.reason && <span className="audit-muted">reason:{row.reason}</span>}
              </span>
              <button
                className="ghost small"
                disabled={!nodeId}
                onClick={(event) => { event.stopPropagation(); focusRow(row); }}
              >
                Open
              </button>
            </div>
            {expanded && (
              <div className="audit-detail">
                <div className="audit-detail-grid">
                  <div><span>ID</span><code>{row.id}</code></div>
                  <div><span>Item</span><code>{itemId ?? "-"}</code></div>
                  <div><span>Node</span><code>{nodeId ?? "-"}</code></div>
                  <div><span>Reason</span><code>{row.reason ?? "-"}</code></div>
                </div>
                <pre>{JSON.stringify(row.payload ?? {}, null, 2)}</pre>
              </div>
            )}
          </div>
        );
      })}
      {visibleRows.length === 0 && <div className="empty">No mutation matches this filter.</div>}
    </div>
  );
}
