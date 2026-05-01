export interface MemoryNode {
  id: string;
  parent_id?: string | null;
  label: string;
  one_liner?: string;
  summary?: string;
  importance?: number;
  freshness?: number;
  confidence?: number;
  status?: string;
  keywords?: string[];
  children?: string[];
  links?: string[];
  sources?: string[];
}

export interface MemoryItem {
  id: string;
  node_id: string;
  content: string;
  tags?: string[];
  source?: string;
  created_at?: string | null;
  updated_at?: string | null;
  importance?: number;
  confidence?: number;
  status?: "active" | "proposed" | "deleted" | string;
  deleted_at?: string | null;
}

export interface MemoryMutation {
  id: string;
  at: string;
  operation: string;
  item_id?: string | null;
  node_id?: string | null;
  reason?: string;
  actor?: string;
  payload?: any;
}

export interface SearchResult {
  query: string;
  workspace?: string | null;
  intent?: string;
  latency_ms?: number;
  token_estimate?: number;
  debug?: {
    why?: {
      intent?: string;
      semantic_error?: string;
      activation?: Array<{
        id: string;
        activation: number;
        reason?: Record<string, unknown> | null;
      }>;
      evidence?: Array<{
        id: string;
        node_id: string;
        score?: number;
        node_activation?: number;
        was_activated?: boolean;
        fts_score?: number;
        importance?: number;
        confidence?: number;
      }>;
    };
  };
  nodes: Array<{
    id: string;
    label: string;
    activation: number;
    status?: string;
    one_liner?: string;
  }>;
  evidence: Array<MemoryItem & { score?: number }>;
  context_pack: Array<{
    type: string;
    id: string;
    node_id?: string;
    activation?: number;
    score?: number;
    text: string;
  }>;
}

export interface TreeResult {
  workspace?: string | null;
  roots: string[];
  nodes: MemoryNode[];
  items: MemoryItem[];
  item_counts: Record<string, number>;
  stats?: {
    nodeCount?: number;
    itemCount?: number;
    embeddingCount?: number;
    path?: string;
  };
}

export interface VersionResult {
  package_name: string;
  version: string;
  protocol_version: string;
  tool_count: number | null;
  data_dir: string;
  workspace?: string | null;
  workspace_dir: string;
  storage: string;
  profile_default: string;
  update_check_disabled: boolean;
  stats?: TreeResult["stats"] | null;
}

export interface UpdateCheckResult {
  enabled: boolean;
  package_name: string;
  current: string;
  latest?: string | null;
  update_available: boolean;
  checked_at?: string;
  reason?: string;
  error?: string;
}

export interface DoctorResult {
  workspace?: string | null;
  data_dir: string;
  workspace_dir: string;
  score: number;
  ok: boolean;
  checks: Array<{
    id: string;
    ok: boolean;
    detail: string;
  }>;
  suggestions: string[];
  stats?: TreeResult["stats"] & {
    activeItemCount?: number;
    proposedItemCount?: number;
    deletedItemCount?: number;
    journalMode?: string;
    busyTimeoutMs?: number;
  };
}

export interface SnapshotDiffResult {
  left: { exported_at?: string | null; sha256: string; stats?: any };
  right: { exported_at?: string | null; sha256: string; stats?: any };
  nodes: { added: string[]; removed: string[]; changed: string[] };
  items: { added: string[]; removed: string[]; changed: string[] };
  summary: {
    nodes_added: number;
    nodes_removed: number;
    nodes_changed: number;
    items_added: number;
    items_removed: number;
    items_changed: number;
  };
}

export interface DoctorFixResult {
  workspace?: string | null;
  dry_run: boolean;
  requested: string[];
  applied: string[];
  before: DoctorResult;
  after: DoctorResult;
}

export interface SnapshotListResult {
  workspace?: string | null;
  directory: string;
  count: number;
  snapshots: Array<{
    name: string;
    path: string;
    bytes: number;
    modified_at: string;
    reason?: string;
    sha256?: string;
  }>;
}

export interface McpRuntimeStatus {
  memory_dir: string;
  command: string;
  args: string[];
}
