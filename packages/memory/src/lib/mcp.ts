import { invoke } from "@tauri-apps/api/core";
import type { DoctorFixResult, DoctorResult, McpRuntimeStatus, MemoryNode, MemoryItem, MemoryMutation, SearchResult, SnapshotDiffResult, SnapshotListResult, TreeResult, UpdateCheckResult, VersionResult } from "./types";

/**
 * Wraps the Tauri command `mcp_call` which forwards to the
 * `paradigm-memory-mcp` sidecar over stdio JSON-RPC.
 *
 * The sidecar returns MCP-shaped responses (`{ content: [{ type: "text", text }] }`)
 * for tool calls. We unwrap that here so callers get the parsed payload directly.
 */
async function rawCall(method: string, params: unknown): Promise<any> {
  return await invoke("mcp_call", { method, params });
}

async function callTool<T = any>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const result = await rawCall("tools/call", { name, arguments: args });
  const text = result?.content?.[0]?.text;
  if (typeof text !== "string") return result as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export const mcp = {
  async initialize(workspace?: string) {
    await rawCall("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "paradigm-memory", version: "0.1.0" }
    });
    return workspace ?? null;
  },

  async listTools(): Promise<{ tools: Array<{ name: string; description: string }> }> {
    return await rawCall("tools/list", {});
  },

  runtimeStatus(): Promise<McpRuntimeStatus> {
    return invoke("mcp_status", {});
  },

  version(workspace?: string): Promise<VersionResult> {
    return callTool("memory_version", workspace ? { workspace } : {});
  },

  updateCheck(workspace?: string): Promise<UpdateCheckResult> {
    return callTool("memory_update_check", workspace ? { workspace, timeout_ms: 1200 } : { timeout_ms: 1200 });
  },

  doctor(workspace?: string): Promise<DoctorResult> {
    return callTool("memory_doctor", workspace ? { workspace } : {});
  },

  mutations(workspace?: string, limit = 200): Promise<{ count: number; mutations: MemoryMutation[] }> {
    return callTool("memory_mutations", workspace ? { workspace, limit } : { limit });
  },

  snapshots(workspace?: string, limit = 50): Promise<SnapshotListResult> {
    return callTool("memory_snapshots", workspace ? { workspace, limit } : { limit });
  },

  doctorFix(workspace?: string, warm = false): Promise<DoctorFixResult> {
    const args: Record<string, unknown> = workspace ? { workspace } : {};
    if (warm) args.repairs = ["rebuild_fts", "mirror_json", "warm_embeddings"];
    return callTool("memory_doctor_fix", args);
  },

  warm(workspace?: string): Promise<any> {
    return callTool("memory_warm", workspace ? { workspace } : {});
  },

  search(query: string, workspace?: string, limit = 10): Promise<SearchResult> {
    return callTool("memory_search", workspace ? { query, limit, workspace } : { query, limit });
  },

  read(node_id: string, workspace?: string): Promise<{ node: MemoryNode; children: MemoryNode[]; items: MemoryItem[] }> {
    const args: any = { node_id, include_items: true, include_proposed: true };
    if (workspace) args.workspace = workspace;
    return callTool("memory_read", args);
  },

  tree(workspace?: string): Promise<TreeResult> {
    return callTool("memory_tree", workspace
      ? { workspace, include_items: true, include_proposed: true }
      : { include_items: true, include_proposed: true });
  },

  proposeWrite(args: { node_id: string; content: string; tags?: string[]; importance?: number; workspace?: string }): Promise<{ item: MemoryItem; mutation: MemoryMutation }> {
    return callTool("memory_propose_write", args);
  },

  write(args: { node_id: string; content: string; tags?: string[]; importance?: number; workspace?: string }): Promise<{ item: MemoryItem; mutation: MemoryMutation }> {
    return callTool("memory_write", args);
  },

  review(args: { item_id: string; action: "accept" | "reject"; reason?: string; workspace?: string }): Promise<{ item: MemoryItem; mutation: MemoryMutation }> {
    return callTool("memory_review", args);
  },

  listProposed(workspace?: string): Promise<{ count: number; items: MemoryItem[] }> {
    return callTool("memory_list_proposed", workspace ? { workspace } : {});
  },

  async deleteItem(args: { item_id: string; reason?: string; workspace?: string }): Promise<{ item: MemoryItem; mutation: MemoryMutation }> {
    return await callTool("memory_delete", args);
  },

  createNode(args: { id: string; label: string; one_liner?: string; summary?: string; keywords?: string[]; workspace?: string }): Promise<{ node: MemoryNode; mutation: MemoryMutation }> {
    return callTool("memory_create_node", args);
  },

  dream(workspace?: string): Promise<any> {
    return callTool("memory_dream", workspace ? { workspace } : {});
  },

  exportSnapshot(args: { output_path?: string; include_mutations?: boolean; workspace?: string } = {}): Promise<any> {
    return callTool("memory_export", args);
  },

  importSnapshot(args: { input_path?: string; data?: any; mode?: "merge" | "replace"; workspace?: string }): Promise<any> {
    return callTool("memory_import", args);
  },

  snapshotDiff(args: { left?: any; right?: any; left_path?: string; right_path?: string; workspace?: string }): Promise<SnapshotDiffResult> {
    return callTool("memory_snapshot_diff", args);
  },

  snapshotRestore(args: { source?: any; source_path?: string; item_ids?: string[]; node_ids?: string[]; reason?: string; workspace?: string }): Promise<any> {
    return callTool("memory_snapshot_restore", args);
  },

  feedback(args: { item_id: string; signal: "useful" | "ignored"; reason?: string; workspace?: string }): Promise<{ item: MemoryItem; mutation: MemoryMutation }> {
    return callTool("memory_feedback", args);
  },

  updateItem(args: { item_id: string; content: string; tags?: string[]; importance?: number; confidence?: number; workspace?: string }): Promise<{ item: MemoryItem; mutation: MemoryMutation }> {
    return callTool("memory_update_item", args);
  },

  moveItem(args: { item_id: string; node_id: string; workspace?: string }): Promise<{ success: boolean }> {
    return callTool("memory_move_item", args);
  },

  updateNode(args: { id: string; label?: string; one_liner?: string; importance?: number; confidence?: number; workspace?: string }): Promise<MemoryNode> {
    return callTool("memory_update_node", args);
  },

  deleteNode(args: { id: string; workspace?: string }): Promise<{ success: boolean }> {
    return callTool("memory_delete_node", args);
  },

  importMarkdown(args: { node_id: string; content: string; title?: string; workspace?: string }): Promise<any> {
    return callTool("memory_import_markdown", args);
  }
};
