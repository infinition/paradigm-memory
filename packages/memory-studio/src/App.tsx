import { useEffect, useMemo, useState, useCallback } from "react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile, readDir, mkdir } from "@tauri-apps/plugin-fs";
import { mcp } from "./lib/mcp";
import type { MemoryItem, MemoryNode, SearchResult } from "./lib/types";
import { Sidebar } from "./components/Sidebar";
import { Graph } from "./components/Graph";
import { ItemEditor } from "./components/ItemEditor";
import { SearchBar } from "./components/SearchBar";
import { ReviewQueue } from "./components/ReviewQueue";
import { AuditLog } from "./components/AuditLog";
import { Settings } from "./components/Settings";
import { ToastContainer, toast } from "./components/Toast";
import type { UpdateCheckResult, VersionResult } from "./lib/types";

type Tab = "map" | "review" | "audit" | "dream" | "settings";

interface WorkspaceState {
  nodes: MemoryNode[];
  itemsByNode: Record<string, MemoryItem[]>;
}

const EMPTY_STATE: WorkspaceState = { nodes: [], itemsByNode: {} };

export default function App() {
  const [tab, setTab] = useState<Tab>("map");
  const [workspace, setWorkspace] = useState<string | undefined>(undefined);
  const [workspaceInput, setWorkspaceInput] = useState("");
  const [existingWorkspaces, setExistingWorkspaces] = useState<string[]>([]);
  const [state, setState] = useState<WorkspaceState>(EMPTY_STATE);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [proposedCount, setProposedCount] = useState(0);
  const [dreamBusy, setDreamBusy] = useState(false);
  const [dreamCount, setDreamCount] = useState<number | null>(null);
  const [version, setVersion] = useState<VersionResult | null>(null);
  const [update, setUpdate] = useState<UpdateCheckResult | null>(null);
  const [showItems, setShowItems] = useState(false);
  const [sidebarFilter, setSidebarFilter] = useState("");
  const [showCreateNode, setShowCreateNode] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [newNodeId, setNewNodeId] = useState("");
  const [newNodeLabel, setNewNodeLabel] = useState("");
  const [newNodeOneLiner, setNewNodeOneLiner] = useState("");
  const [dreamReport, setDreamReport] = useState<any | null>(null);

  const listWorkspaces = useCallback(async (dataDir?: string) => {
    if (!dataDir) return;
    try {
      const workspacesPath = `${dataDir}/workspaces`;
      const entries = await readDir(workspacesPath);
      const names = entries.filter(e => e.isDirectory).map(e => e.name);
      setExistingWorkspaces(names);
    } catch (err) {
      console.warn("Could not list workspaces:", err);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      setMapError(null);
      const itemsByNode: Record<string, MemoryItem[]> = {};
      const tree = await mcp.tree(workspace);
      for (const item of tree.items ?? []) {
        itemsByNode[item.node_id] ??= [];
        itemsByNode[item.node_id].push(item);
      }
      setState({ nodes: tree.nodes, itemsByNode });
      setItemCounts(tree.item_counts ?? {});
      if (!selectedId && tree.nodes.length > 0) {
        setSelectedId(tree.roots?.[0] ?? tree.nodes[0].id);
      }
    } catch (caught: any) {
      setMapError(String(caught?.message ?? caught));
      return;
    }
    mcp.listProposed(workspace).then((proposed) => setProposedCount(proposed.count)).catch(() => setProposedCount(0));
    const v = await mcp.version(workspace);
    setVersion(v);
    if (v.data_dir) listWorkspaces(v.data_dir);
  }, [workspace, listWorkspaces]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await mcp.initialize(workspace);
        if (!mounted) return;
        mcp.updateCheck(workspace).then((res) => { if (mounted) setUpdate(res); }).catch(() => { if (mounted) setUpdate(null); });
        await refresh();
        if (mounted) {
            if (workspace) toast.info("Switched Workspace", workspace);
            else toast.info("Connected", "Default workspace ready");
        }
      } catch (caught: any) {
        if (mounted) {
          setBootError(String(caught?.message ?? caught));
          toast.error("Boot failed", String(caught?.message ?? caught));
        }
      }
    })();
    return () => { mounted = false; };
  }, [workspace]); // Only trigger on workspace change, refresh handles initial

  const activatedIds = useMemo(() => {
    if (!searchResult) return undefined;
    return new Set(searchResult.nodes.map((node) => node.id));
  }, [searchResult]);

  const selectedNode = state.nodes.find((node) => node.id === selectedId) ?? null;
  const selectedItems = selectedId ? state.itemsByNode[selectedId] ?? [] : [];

  const handleWorkspaceChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const newWs = workspaceInput.trim();
    if (!newWs) {
        setWorkspace(undefined);
        return;
    }

    if (existingWorkspaces.includes(newWs)) {
        setWorkspace(newWs);
    } else {
        setShowCreateWorkspace(true);
    }
  };

  const confirmCreateWorkspace = async () => {
    const newWs = workspaceInput.trim();
    if (!newWs || !version?.data_dir) return;
    try {
        const wsPath = `${version.data_dir}/workspaces/${newWs}`;
        await mkdir(wsPath, { recursive: true });
        setWorkspace(newWs);
        setShowCreateWorkspace(false);
        listWorkspaces(version.data_dir);
        toast.success("Workspace created", newWs);
    } catch (err: any) {
        toast.error("Failed to create workspace", err.message);
    }
  };

  const onExport = async () => {
    try {
      const result = await mcp.exportSnapshot({ workspace });
      const path = await save({
        filters: [{ name: "Paradigm Brain", extensions: ["brain", "json"] }],
        defaultPath: `${workspace ?? "default"}-${new Date().toISOString().slice(0, 10)}.brain`
      });
      if (path) {
        await writeTextFile(path, JSON.stringify(result.snapshot ?? result, null, 2));
        toast.success("Exported", path);
      }
    } catch (err: any) {
      toast.error("Export failed", err.message);
    }
  };

  const onImport = async () => {
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "Paradigm Brain", extensions: ["brain", "json"] }]
      });
      if (path) {
        const content = await readTextFile(path as string);
        const data = JSON.parse(content);
        await mcp.importSnapshot({ data, mode: "merge", workspace });
        await refresh();
        toast.success("Imported", `Merged from ${(path as string).split(/[\\/]/).pop()}`);
      }
    } catch (err: any) {
      toast.error("Import failed", err.message);
    }
  };

  const applyProposal = async (p: any, itemToDeleteId?: string) => {
    try {
      if (p.kind === "duplicate") {
        const idToDelete = itemToDeleteId ?? p.drop_id;
        await mcp.deleteItem({ item_id: idToDelete, reason: "dream_deduplication", workspace });
        toast.success("Deleted duplicate", idToDelete.slice(-8));
        await runDream();
      } else if (p.kind === "orphan" || p.kind === "stale") {
        await mcp.deleteItem({ item_id: p.item_id, reason: `dream_${p.kind}`, workspace });
        toast.success(`Removed ${p.kind}`, p.item_id.slice(-8));
        await runDream();
      }
    } catch (err: any) {
      toast.error("Action failed", err.message);
    }
  };

  const runDream = async () => {
    setDreamBusy(true);
    try {
      const report = await mcp.dream(workspace);
      setDreamReport(report);
      setDreamCount(report?.summary?.total ?? 0);
      setTab("dream");
      toast.info("Dream complete", `${report?.summary?.total ?? 0} suggestions`);
    } catch (err: any) {
      toast.error("Dream failed", err.message);
    } finally {
      setDreamBusy(false);
    }
  };

  const createNode = async () => {
    if (!newNodeId.trim() || !newNodeLabel.trim()) return;
    try {
      await mcp.createNode({
        id: newNodeId.trim(),
        label: newNodeLabel.trim(),
        one_liner: newNodeOneLiner.trim() || undefined,
        workspace
      });
      setShowCreateNode(false);
      setNewNodeId("");
      setNewNodeLabel("");
      setNewNodeOneLiner("");
      await refresh();
      setSelectedId(newNodeId.trim());
      toast.success("Node created", newNodeId.trim());
    } catch (err: any) {
      toast.error("Create failed", err.message);
    }
  };

  const onItemChanged = useCallback(async () => {
    await refresh();
  }, [refresh]);

  return (
    <div className="app">
      <ToastContainer />

      <div className="topbar">
        <h1>Paradigm · Memory</h1>
        {tab === "map" ? (
          <SearchBar workspace={workspace} onResult={setSearchResult} />
        ) : <span />}
        <div className="actions">
          <form onSubmit={handleWorkspaceChange} style={{ display: 'flex' }}>
              <input
                className="workspace-input"
                placeholder="workspace"
                value={workspaceInput}
                onChange={(event) => setWorkspaceInput(event.target.value)}
                list="workspace-list"
                title="Press Enter to switch workspace"
              />
              <datalist id="workspace-list">
                {existingWorkspaces.map(ws => <option key={ws} value={ws} />)}
              </datalist>
          </form>
          {version && (
            <span className="path-pill" title={version.workspace_dir}>
              {version.stats?.nodeCount ?? state.nodes.length}n · {version.stats?.itemCount ?? Object.values(itemCounts).reduce((s, c) => s + c, 0)}i
            </span>
          )}
          {update?.update_available && (
            <span className="update-badge" title={`${update.current} → ${update.latest}`}>
              ↑ {update.latest}
            </span>
          )}
          <button className="ghost" onClick={runDream} disabled={dreamBusy} title="Run dream consolidation">◌</button>
          <button className="ghost" onClick={refresh} title="Refresh">↻</button>
          <button className="ghost" onClick={onExport} title="Export .brain">↓</button>
          <button className="ghost" onClick={onImport} title="Import .brain">↑</button>
        </div>
      </div>

      <div className="main">
        <div className="tabs">
          <button className={`tab${tab === "map" ? " active" : ""}`} onClick={() => setTab("map")}>Map</button>
          <button className={`tab${tab === "review" ? " active" : ""}`} onClick={() => setTab("review")}>
            Review {proposedCount > 0 && <span className="update-badge" style={{ marginLeft: 6 }}>{proposedCount}</span>}
          </button>
          <button className={`tab${tab === "audit" ? " active" : ""}`} onClick={() => setTab("audit")}>Audit</button>
          <button className={`tab${tab === "dream" ? " active" : ""}`} onClick={() => setTab("dream")}>
            Dream {dreamCount !== null && dreamCount > 0 && <span className="update-badge" style={{ marginLeft: 6 }}>{dreamCount}</span>}
          </button>
          <button className={`tab${tab === "settings" ? " active" : ""}`} onClick={() => setTab("settings")}>Settings</button>
        </div>

        {/* Search overlay */}
        {searchResult && (
          <div className="search-results-overlay">
            <div className="sr-header">
              <h3>Search results ({searchResult.evidence.length} matches)</h3>
              <button className="ghost" onClick={() => setSearchResult(null)}>✕ Close</button>
            </div>
            <div className="sr-list">
              {searchResult.evidence.map((item, i) => (
                <div key={i} className="sr-item" onClick={() => { setSelectedId(item.node_id); setSearchResult(null); }}>
                  <div className="sr-meta">
                    <span className="sr-node">{item.node_id}</span>
                    <span className="sr-score">{item.score ? `${(item.score * 100).toFixed(0)}%` : "match"}</span>
                  </div>
                  <div className="sr-text">{item.content.length > 200 ? item.content.slice(0, 200) + "…" : item.content}</div>
                </div>
              ))}
              {searchResult.evidence.length === 0 && <div className="empty">No matches found.</div>}
            </div>
          </div>
        )}

        {bootError && (
          <div className="empty" style={{ color: "var(--red)" }}>
            Boot error: {bootError}<br />
            <small>Make sure the paradigm-memory-mcp sidecar is reachable.</small>
          </div>
        )}

        {!bootError && (
          <div className="statusbar">
            <span>Memory</span>
            <code>{version?.workspace_dir ?? "loading…"}</code>
            {mapError && <span className="status-error">{mapError}</span>}
          </div>
        )}

        {/* Dream tab */}
        {!bootError && tab === "dream" && (
          <div className="layout" style={{ gridTemplateColumns: "1fr" }}>
            <div className="pane" style={{ borderRight: "none", padding: 20 }}>
              <h2 style={{ position: "static", background: "transparent" }}>Memory Consolidation (Dream)</h2>
              {!dreamReport && <div className="empty">Run a dream to see consolidation suggestions.</div>}
              {dreamReport && (
                <div className="dream-results">
                  {dreamReport.proposals.filter((p: any) => p.kind === "duplicate").length > 0 && (
                    <section>
                      <h3 style={{ color: "var(--amber)" }}>Potential Duplicates</h3>
                      {dreamReport.proposals.filter((p: any) => p.kind === "duplicate").map((p: any, i: number) => {
                        const allItems = Object.values(state.itemsByNode).flat();
                        const keep = allItems.find(it => it.id === p.keep_id);
                        const drop = allItems.find(it => it.id === p.drop_id);
                        return (
                          <div key={i} className="review-card" style={{ marginBottom: 12 }}>
                            <div className="rc-content">
                              Node <strong>{p.node_id}</strong> — redundant items
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
                                <div style={{ background: "var(--bg-elev-2)", padding: 14, borderRadius: 8, display: "flex", flexDirection: "column" }}>
                                  <div style={{ color: "var(--muted)", fontSize: 10, marginBottom: 4, fontWeight: 700 }}>ITEM A · {p.keep_id.slice(-8)}</div>
                                  <div style={{ fontSize: 12, color: "var(--ink-soft)", flex: 1, lineHeight: 1.5 }}>{keep?.content.slice(0, 200)}…</div>
                                  <button className="danger small" style={{ marginTop: 10, alignSelf: "flex-start" }} onClick={() => applyProposal(p, p.keep_id)}>Delete A</button>
                                </div>
                                <div style={{ background: "var(--bg-elev-2)", padding: 14, borderRadius: 8, display: "flex", flexDirection: "column" }}>
                                  <div style={{ color: "var(--muted)", fontSize: 10, marginBottom: 4, fontWeight: 700 }}>ITEM B · {p.drop_id.slice(-8)}</div>
                                  <div style={{ fontSize: 12, color: "var(--ink-soft)", flex: 1, lineHeight: 1.5 }}>{drop?.content.slice(0, 200)}…</div>
                                  <button className="danger small" style={{ marginTop: 10, alignSelf: "flex-start" }} onClick={() => applyProposal(p, p.drop_id)}>Delete B</button>
                                </div>
                              </div>
                              <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 8 }}>{p.rationale} ({Math.round(p.similarity * 100)}% match)</div>
                            </div>
                          </div>
                        );
                      })}
                    </section>
                  )}
                  {dreamReport.proposals.filter((p: any) => p.kind === "orphan").length > 0 && (
                    <section>
                      <h3 style={{ color: "var(--red)" }}>Orphan Items</h3>
                      {dreamReport.proposals.filter((p: any) => p.kind === "orphan").map((p: any, i: number) => {
                        const allItems = Object.values(state.itemsByNode).flat();
                        const item = allItems.find(it => it.id === p.item_id);
                        return (
                          <div key={i} className="review-card" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div className="rc-content" style={{ flex: 1 }}>
                              <code style={{ fontSize: 10, color: "var(--muted)" }}>{p.item_id.slice(-12)}</code>
                              <div style={{ fontSize: 12, color: "var(--ink-soft)", margin: "4px 0" }}>{item?.content.slice(0, 120)}…</div>
                              <div style={{ fontSize: 11, color: "var(--muted)" }}>{p.rationale}</div>
                            </div>
                            <button className="danger small" onClick={() => applyProposal(p)}>Delete</button>
                          </div>
                        );
                      })}
                    </section>
                  )}
                  {dreamReport.proposals.filter((p: any) => p.kind === "stale").length > 0 && (
                    <section>
                      <h3 style={{ color: "var(--muted)" }}>Stale Items</h3>
                      {dreamReport.proposals.filter((p: any) => p.kind === "stale").map((p: any, i: number) => (
                        <div key={i} className="review-card" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div className="rc-content" style={{ flex: 1 }}>
                            <code style={{ fontSize: 10, color: "var(--muted)" }}>{p.item_id.slice(-12)}</code>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>{p.rationale} ({p.age_days}d old)</div>
                          </div>
                          <button className="ghost small" onClick={() => applyProposal(p)}>Archive</button>
                        </div>
                      ))}
                    </section>
                  )}
                  {dreamReport.proposals.filter((p: any) => p.kind === "overloaded").length > 0 && (
                    <section>
                      <h3 style={{ color: "var(--teal)" }}>Overloaded Nodes</h3>
                      {dreamReport.proposals.filter((p: any) => p.kind === "overloaded").map((p: any, i: number) => (
                        <div key={i} className="review-card" style={{ marginBottom: 12 }}>
                          <div className="rc-content">{p.rationale}</div>
                        </div>
                      ))}
                    </section>
                  )}
                  {dreamReport.proposals.length === 0 && (
                    <div className="empty">✓ Memory is well consolidated. No issues found.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Settings tab */}
        {!bootError && tab === "settings" && (
          <div className="layout" style={{ gridTemplateColumns: "1fr" }}>
            <div className="pane" style={{ borderRight: "none" }}>
              <Settings version={version} update={update} workspace={workspace} />
            </div>
          </div>
        )}

        {/* Map tab */}
        {!bootError && tab === "map" && (
          <div className="layout">
            <Sidebar
              nodes={state.nodes}
              selectedId={selectedId}
              onSelect={setSelectedId}
              itemCounts={itemCounts}
              activatedIds={activatedIds}
              searchFilter={sidebarFilter}
              onSearchFilterChange={setSidebarFilter}
              onCreateNode={() => {
                setNewNodeId(selectedId ? selectedId + "." : "");
                setShowCreateNode(true);
              }}
            />
            <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
              <div className="map-toolbar">
                <button className={`ghost small${showItems ? " active" : ""}`} onClick={() => setShowItems(!showItems)}>
                  {showItems ? "⊟ Hide items" : "⊞ Show items"}
                </button>
              </div>
              <Graph
                nodes={state.nodes}
                items={Object.values(state.itemsByNode).flat()}
                selectedId={selectedId}
                onSelect={setSelectedId}
                activatedIds={activatedIds}
                showItems={showItems}
                searchFilter={sidebarFilter}
                itemCounts={itemCounts}
              />
            </div>
            <ItemEditor
              node={selectedNode}
              items={selectedItems}
              workspace={workspace}
              onChanged={onItemChanged}
            />
          </div>
        )}

        {/* Review tab */}
        {!bootError && tab === "review" && (
          <ReviewQueue workspace={workspace} onChanged={onItemChanged} />
        )}

        {/* Audit tab */}
        {!bootError && tab === "audit" && <AuditLog workspace={workspace} />}
      </div>

      {/* Create Node Dialog */}
      {showCreateNode && (
        <div className="dialog-overlay" onClick={() => setShowCreateNode(false)}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <h3>Create Node</h3>
            <div className="field">
              <label>Node ID (dotted path)</label>
              <input value={newNodeId} onChange={e => setNewNodeId(e.target.value)} placeholder="projects.my_project" autoFocus />
            </div>
            <div className="field">
              <label>Label</label>
              <input value={newNodeLabel} onChange={e => setNewNodeLabel(e.target.value)} placeholder="My Project" />
            </div>
            <div className="field">
              <label>One-liner (optional)</label>
              <input value={newNodeOneLiner} onChange={e => setNewNodeOneLiner(e.target.value)} placeholder="Short description" />
            </div>
            <div className="actions">
              <button className="ghost" onClick={() => setShowCreateNode(false)}>Cancel</button>
              <button className="primary" onClick={createNode} disabled={!newNodeId.trim() || !newNodeLabel.trim()}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Workspace Dialog */}
      {showCreateWorkspace && (
        <div className="dialog-overlay" onClick={() => setShowCreateWorkspace(false)}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <h3>Create Workspace</h3>
            <p style={{ color: 'var(--ink-soft)', marginBottom: 16 }}>
                Workspace <strong>{workspaceInput}</strong> does not exist. Create it?
            </p>
            <div className="actions">
              <button className="ghost" onClick={() => setShowCreateWorkspace(false)}>Cancel</button>
              <button className="primary" onClick={confirmCreateWorkspace}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
