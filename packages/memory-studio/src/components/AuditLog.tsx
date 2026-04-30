import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MemoryMutation } from "../lib/types";

interface Props {
  workspace?: string;
}

/**
 * Audit view. The MCP currently has no `memory_list_mutations` tool, so this
 * panel reads the SQLite directly via a Tauri command (`read_mutations`)
 * registered in the Rust backend as a convenience for the local user.
 *
 * If that command is not yet wired (early dev), we just render a stub.
 */
export function AuditLog({ workspace }: Props) {
  const [rows, setRows] = useState<MemoryMutation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<MemoryMutation[]>("read_mutations", { workspace: workspace ?? null, limit: 200 })
      .then(setRows)
      .catch((caught) => setError(String(caught)));
  }, [workspace]);

  if (error) {
    return (
      <div className="empty">
        Audit log unavailable: <code>{error}</code><br />
        <small>Falls back to MCP-only mode. Add a `memory_list_mutations` tool to expose this over MCP.</small>
      </div>
    );
  }

  if (!rows) return <div className="empty">Loading audit…</div>;
  if (rows.length === 0) return <div className="empty">No mutations recorded yet.</div>;

  return (
    <div className="audit-list">
      {rows.map((row) => (
        <div key={row.id} className="audit-row">
          <span className="ts">{row.at?.slice(0, 19).replace("T", " ")}</span>
          <span className={`op ${row.operation}`}>{row.operation}</span>
          <span>
            {row.actor && <code>{row.actor}</code>} {row.node_id || row.item_id || ""} {row.reason && <span style={{ color: "var(--muted)" }}>· {row.reason}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
