import { toast } from "./Toast";
import type { VersionResult, UpdateCheckResult } from "../lib/types";

interface Props {
  version: VersionResult | null;
  update: UpdateCheckResult | null;
  workspace?: string;
}

export function Settings({ version, update, workspace }: Props) {
  const copyCmd = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied!", text.slice(0, 60)));
  };

  const mcpPath = version?.data_dir
    ? `node ${version.data_dir.replace(/[\\/]data$/, "")}/packages/memory-mcp/src/server.mjs`
    : "node /path/to/paradigm-memory/packages/memory-mcp/src/server.mjs";

  return (
    <div className="settings-panel">
      <h2>Settings & Configuration</h2>

      <div className="settings-section">
        <h3>System Info</h3>
        <div className="settings-row">
          <span className="label">Version</span>
          <span className="value">{version?.version ?? "…"}</span>
        </div>
        <div className="settings-row">
          <span className="label">Protocol</span>
          <span className="value">{version?.protocol_version ?? "…"}</span>
        </div>
        <div className="settings-row">
          <span className="label">MCP Status</span>
          <span className="value">
            <span className={`status-dot ${version ? "online" : "offline"}`} />
            {version ? "Connected" : "Disconnected"}
          </span>
        </div>
        <div className="settings-row">
          <span className="label">Storage</span>
          <span className="value">{version?.storage ?? "…"}</span>
        </div>
        {update?.update_available && (
          <div className="settings-row">
            <span className="label">Update Available</span>
            <span className="value" style={{ color: "var(--amber)" }}>
              {update.current} → {update.latest}
            </span>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h3>Memory</h3>
        <div className="settings-row">
          <span className="label">Memory Directory</span>
          <span className="value" title={version?.workspace_dir}>{version?.workspace_dir ?? "…"}</span>
        </div>
        <div className="settings-row">
          <span className="label">Active Workspace</span>
          <span className="value">{workspace ?? "default"}</span>
        </div>
        <div className="settings-row">
          <span className="label">Nodes</span>
          <span className="value">{version?.stats?.nodeCount ?? "…"}</span>
        </div>
        <div className="settings-row">
          <span className="label">Items</span>
          <span className="value">{version?.stats?.itemCount ?? "…"}</span>
        </div>
        <div className="settings-row">
          <span className="label">Embeddings Cached</span>
          <span className="value">{version?.stats?.embeddingCount ?? "…"}</span>
        </div>
      </div>

      <div className="settings-section">
        <h3>MCP Client Setup</h3>
        <p style={{ color: "var(--ink-soft)", fontSize: 12, marginBottom: 12 }}>
          Click a command to copy it to your clipboard.
        </p>
        <div className="cmd-block" onClick={() => copyCmd(`claude mcp add --scope user paradigm-memory ${mcpPath}`)}>
          <span className="copy-hint">click to copy</span>
          <strong style={{ color: "var(--teal)" }}>Claude Code</strong><br />
          claude mcp add --scope user paradigm-memory {mcpPath}
        </div>
        <div className="cmd-block" style={{ marginTop: 8 }} onClick={() => copyCmd(`codex mcp add paradigm-memory -- ${mcpPath}`)}>
          <span className="copy-hint">click to copy</span>
          <strong style={{ color: "var(--teal)" }}>OpenAI Codex</strong><br />
          codex mcp add paradigm-memory -- {mcpPath}
        </div>
        <div className="cmd-block" style={{ marginTop: 8 }} onClick={() => copyCmd(`gemini mcp add --scope user paradigm-memory ${mcpPath}`)}>
          <span className="copy-hint">click to copy</span>
          <strong style={{ color: "var(--teal)" }}>Gemini CLI</strong><br />
          gemini mcp add --scope user paradigm-memory {mcpPath}
        </div>
      </div>

      <div className="settings-section">
        <h3>Environment Variables</h3>
        <div className="settings-row">
          <span className="label">PARADIGM_MEMORY_DIR</span>
          <span className="value">{version?.data_dir ?? "~/.paradigm"}</span>
        </div>
        <div className="settings-row">
          <span className="label">PARADIGM_MEMORY_EMBEDDINGS</span>
          <span className="value">off | wasm | ollama</span>
        </div>
        <div className="settings-row">
          <span className="label">PARADIGM_MEMORY_AUTOWARM</span>
          <span className="value">0 | 1</span>
        </div>
      </div>
    </div>
  );
}
