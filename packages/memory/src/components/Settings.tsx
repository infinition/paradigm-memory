import { useState } from "react";
import { open as openShell } from "@tauri-apps/plugin-shell";
import { mcp } from "../lib/mcp";
import { toast } from "./Toast";
import type { VersionResult, UpdateCheckResult } from "../lib/types";

interface Props {
  version: VersionResult | null;
  update: UpdateCheckResult | null;
  workspace?: string;
  autoRefresh: boolean;
  refreshSeconds: number;
  onAutoRefreshChange: (enabled: boolean) => void;
  onRefreshSecondsChange: (seconds: number) => void;
  onExport: () => void;
  onImport: () => void;
  onRefresh: () => void;
  onDoctorFix: (warm?: boolean) => void;
  onReviewSnapshot: () => void;
  onUpdateChecked?: (result: UpdateCheckResult) => void;
}

const REPO_URL = "https://github.com/infinition/paradigm-memory";
const RELEASES_URL = `${REPO_URL}/releases/latest`;

export function Settings({
  version,
  update,
  workspace,
  autoRefresh,
  refreshSeconds,
  onAutoRefreshChange,
  onRefreshSecondsChange,
  onExport,
  onImport,
  onRefresh,
  onDoctorFix,
  onReviewSnapshot,
  onUpdateChecked
}: Props) {
  const [checking, setChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  const copyCmd = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied!", text.slice(0, 60)));
  };

  const checkForUpdates = async () => {
    setChecking(true);
    try {
      const result = await mcp.updateCheck(workspace);
      setLastCheckedAt(new Date().toLocaleTimeString());
      onUpdateChecked?.(result);
      if (result.update_available) {
        toast.success("Update available", `${result.current} → ${result.latest}`);
      } else if (result.error) {
        toast.error("Update check failed", String(result.error));
      } else {
        toast.info("Up to date", `You are on ${result.current}.`);
      }
    } catch (err: any) {
      toast.error("Update check failed", String(err?.message ?? err));
    } finally {
      setChecking(false);
    }
  };

  const openReleases = async () => {
    try {
      await openShell(RELEASES_URL);
    } catch (err: any) {
      // Fallback: copy the URL to clipboard if shell:open is denied.
      navigator.clipboard.writeText(RELEASES_URL).then(() =>
        toast.info("URL copied", RELEASES_URL)
      );
    }
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
      </div>

      <div className="settings-section">
        <h3>Updates</h3>
        <div className="settings-row">
          <span className="label">Installed version</span>
          <span className="value">{version?.version ?? "…"}</span>
        </div>
        <div className="settings-row">
          <span className="label">Latest on GitHub</span>
          <span className="value">
            {update?.latest ?? (update?.error ? `error: ${update.error}` : "not checked")}
            {update?.update_available && <span style={{ color: "var(--amber)", marginLeft: 8 }}>(update available)</span>}
            {update && !update.update_available && update.latest && <span style={{ color: "var(--teal)", marginLeft: 8 }}>(up to date)</span>}
          </span>
        </div>
        {lastCheckedAt && (
          <div className="settings-row">
            <span className="label">Last checked</span>
            <span className="value" style={{ color: "var(--muted)" }}>{lastCheckedAt}</span>
          </div>
        )}
        <div className="settings-actions">
          <button className="primary" onClick={checkForUpdates} disabled={checking}>
            {checking ? "Checking…" : "Check for updates"}
          </button>
          <button className="ghost" onClick={openReleases}>Open releases page</button>
        </div>
        {update?.update_available && (
          <div style={{ marginTop: 12, padding: 12, border: "1px solid var(--amber)", borderRadius: "var(--radius)", background: "rgba(245, 158, 11, 0.06)" }}>
            <div style={{ fontWeight: 700, color: "var(--amber)", marginBottom: 4 }}>
              Update {update.latest} is available.
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
              Re-run the one-line installer to upgrade. Your memory data is never touched.
            </div>
            <div className="cmd-block" onClick={() =>
              copyCmd(`irm https://raw.githubusercontent.com/infinition/paradigm-memory/main/scripts/installer/install.ps1 | iex`)
            }>
              <span className="copy-hint">click to copy</span>
              <strong style={{ color: "var(--teal)" }}>Windows (PowerShell)</strong><br />
              irm https://raw.githubusercontent.com/infinition/paradigm-memory/main/scripts/installer/install.ps1 | iex
            </div>
            <div className="cmd-block" style={{ marginTop: 8 }} onClick={() =>
              copyCmd(`curl -fsSL https://raw.githubusercontent.com/infinition/paradigm-memory/main/scripts/installer/install.sh | bash`)
            }>
              <span className="copy-hint">click to copy</span>
              <strong style={{ color: "var(--teal)" }}>macOS / Linux</strong><br />
              curl -fsSL https://raw.githubusercontent.com/infinition/paradigm-memory/main/scripts/installer/install.sh | bash
            </div>
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
        <h3>Actions</h3>
        <div className="settings-row">
          <span className="label">Auto refresh</span>
          <span className="value">
            <label className="toggle-line">
              <input type="checkbox" checked={autoRefresh} onChange={(event) => onAutoRefreshChange(event.target.checked)} />
              enabled
            </label>
          </span>
        </div>
        <div className="settings-row">
          <span className="label">Refresh interval</span>
          <span className="value">
            <select className="mini-select" value={refreshSeconds} onChange={(event) => onRefreshSecondsChange(Number(event.target.value))}>
              <option value={5}>5s</option>
              <option value={10}>10s</option>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
            </select>
          </span>
        </div>
        <div className="settings-actions">
          <button className="primary" onClick={onRefresh}>Refresh now</button>
          <button className="ghost" onClick={onExport}>Export .brain</button>
          <button className="ghost" onClick={onImport}>Import .brain</button>
          <button className="ghost" onClick={onReviewSnapshot}>Compare snapshot</button>
          <button className="ghost" onClick={() => onDoctorFix(false)}>Repair indexes</button>
          <button className="ghost" onClick={() => onDoctorFix(true)}>Repair + warm</button>
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
        <h3>Install / Uninstall</h3>
        <div className="cmd-block" onClick={() => copyCmd("npm i -g @paradigm-memory/memory-cli @paradigm-memory/memory-mcp")}>
          <span className="copy-hint">click to copy</span>
          <strong style={{ color: "var(--teal)" }}>Install CLI + MCP</strong><br />
          npm i -g @paradigm-memory/memory-cli @paradigm-memory/memory-mcp
        </div>
        <div className="cmd-block" style={{ marginTop: 8 }} onClick={() => copyCmd("npm update -g @paradigm-memory/memory-cli @paradigm-memory/memory-mcp")}>
          <span className="copy-hint">click to copy</span>
          <strong style={{ color: "var(--teal)" }}>Update</strong><br />
          npm update -g @paradigm-memory/memory-cli @paradigm-memory/memory-mcp
        </div>
        <div className="cmd-block" style={{ marginTop: 8 }} onClick={() => copyCmd("npm uninstall -g @paradigm-memory/memory-cli @paradigm-memory/memory-mcp")}>
          <span className="copy-hint">click to copy</span>
          <strong style={{ color: "var(--red)" }}>Uninstall</strong><br />
          npm uninstall -g @paradigm-memory/memory-cli @paradigm-memory/memory-mcp
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
