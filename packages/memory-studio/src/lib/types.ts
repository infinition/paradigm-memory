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
