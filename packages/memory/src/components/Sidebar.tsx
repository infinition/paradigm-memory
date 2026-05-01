import { useMemo, useState } from "react";
import type { MemoryNode } from "../lib/types";

interface Props {
  nodes: MemoryNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  itemCounts?: Record<string, number>;
  activatedIds?: Set<string>;
  searchFilter: string;
  onSearchFilterChange: (v: string) => void;
  onCreateNode?: () => void;
  onDropItem?: (itemId: string, nodeId: string) => void;
}

interface TreeEntry {
  node: MemoryNode;
  depth: number;
  children: TreeEntry[];
}

const ITEM_DRAG_MIME = "application/x-paradigm-memory-item";

function buildForest(nodes: MemoryNode[]): TreeEntry[] {
  const byId = new Map<string, TreeEntry>();
  for (const node of nodes) byId.set(node.id, { node, depth: 0, children: [] });
  const roots: TreeEntry[] = [];
  for (const entry of byId.values()) {
    const parts = entry.node.id.split(".");
    if (parts.length === 1) {
      roots.push(entry);
    } else {
      const parentId = parts.slice(0, -1).join(".");
      const parent = byId.get(parentId);
      if (parent) {
        entry.depth = parent.depth + 1;
        parent.children.push(entry);
      } else {
        roots.push(entry);
      }
    }
  }
  const sortRec = (entries: TreeEntry[]) => {
    entries.sort((a, b) => a.node.id.localeCompare(b.node.id));
    for (const entry of entries) sortRec(entry.children);
  };
  sortRec(roots);
  return roots;
}

function matchesFilter(entry: TreeEntry, filter: string): boolean {
  const lf = filter.toLowerCase();
  if (entry.node.label.toLowerCase().includes(lf) || entry.node.id.toLowerCase().includes(lf)) return true;
  return entry.children.some(c => matchesFilter(c, filter));
}

export function Sidebar({ nodes, selectedId, onSelect, itemCounts, activatedIds, searchFilter, onSearchFilterChange, onCreateNode, onDropItem }: Props) {
  const forest = useMemo(() => buildForest(nodes), [nodes]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderEntry = (entry: TreeEntry): React.ReactNode => {
    const hasChildren = entry.children.length > 0;
    const isCollapsed = collapsed.has(entry.node.id);
    const count = itemCounts?.[entry.node.id] ?? 0;
    const isSelected = entry.node.id === selectedId;
    const isActivated = activatedIds?.has(entry.node.id);
    const lf = searchFilter.toLowerCase();
    const matches = lf ? (entry.node.label.toLowerCase().includes(lf) || entry.node.id.toLowerCase().includes(lf)) : true;
    const childMatches = lf ? matchesFilter(entry, lf) : true;

    if (lf && !matches && !childMatches) return null;

    const clearDragOver = (target: EventTarget & HTMLDivElement) => {
      target.classList.remove("drag-over");
    };

    const getDraggedItemId = (event: React.DragEvent<HTMLDivElement>) => {
      return event.dataTransfer.getData(ITEM_DRAG_MIME) || event.dataTransfer.getData("text/plain");
    };

    return (
      <div key={entry.node.id}>
        <div
          className={`tree-node${isSelected ? " selected" : ""}${isActivated ? " activation-pulse" : ""}${lf && matches ? " highlighted" : ""}${lf && !matches ? " dim" : ""}`}
          style={{ paddingLeft: 12 + entry.depth * 16 }}
          onClick={() => onSelect(entry.node.id)}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.classList.add("drag-over");
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            e.currentTarget.classList.add("drag-over");
          }}
          onDragLeave={(e) => {
            e.stopPropagation();
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              clearDragOver(e.currentTarget);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            clearDragOver(e.currentTarget);
            const itemId = getDraggedItemId(e);
            if (itemId && onDropItem) {
              onDropItem(itemId, entry.node.id);
            }
          }}
        >
          <span
            className="twisty"
            onClick={(event) => { event.stopPropagation(); if (hasChildren) toggle(entry.node.id); }}
          >
            {hasChildren ? (isCollapsed ? "▶" : "▼") : "·"}
          </span>
          <span className="label">{entry.node.label}</span>
          {count > 0 && <span className="badge">{count}</span>}
        </div>
        {!isCollapsed && hasChildren && entry.children.map((child) => renderEntry(child))}
      </div>
    );
  };

  return (
    <div className="pane">
      <h2>Cognitive Map</h2>
      <div className="sidebar-actions">
        <input
          placeholder="Filter nodes..."
          value={searchFilter}
          onChange={e => onSearchFilterChange(e.target.value)}
        />
        {onCreateNode && (
          <button className="ghost small" onClick={onCreateNode} title="Create node">+</button>
        )}
      </div>
      <div className="tree">
        {forest.length === 0 && <div className="empty">No nodes yet.</div>}
        {forest.map((entry) => renderEntry(entry))}
      </div>
    </div>
  );
}
