import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MemoryMutation } from "../lib/types";
import { mcp } from "../lib/mcp";

interface Props {
  workspace?: string;
}

export function AuditLog({ workspace }: Props) {
  const [rows, setRows] = useState<MemoryMutation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [auto, setAuto] = useState(true);

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
    const haystack = `${row.operation} ${row.actor ?? ""} ${row.node_id ?? ""} ${row.item_id ?? ""} ${row.reason ?? ""}`.toLowerCase();
    return haystack.includes(filter.trim().toLowerCase());
  });

  return (
    <div className="audit-list">
      <div className="audit-toolbar">
        <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter operation, actor, item..." />
        <button className={`ghost small${auto ? " active" : ""}`} onClick={() => setAuto(!auto)}>Auto</button>
        <button className="ghost small" onClick={load}>Refresh</button>
      </div>
      {visibleRows.map((row) => (
        <div key={row.id} className="audit-row">
          <span className="ts">{row.at?.slice(0, 19).replace("T", " ")}</span>
          <span className={`op ${row.operation}`}>{row.operation}</span>
          <span>
            {row.actor && <code>{row.actor}</code>} {row.node_id || row.item_id || ""} {row.reason && <span style={{ color: "var(--muted)" }}> / {row.reason}</span>}
          </span>
        </div>
      ))}
      {visibleRows.length === 0 && <div className="empty">No mutation matches this filter.</div>}
    </div>
  );
}
