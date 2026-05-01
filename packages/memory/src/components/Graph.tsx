import { useMemo, useEffect, useRef, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Node,
  type Edge,
  Handle,
  Position,
  useReactFlow,
  useNodesState,
  useEdgesState,
  ReactFlowProvider
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import type { MemoryNode, MemoryItem } from "../lib/types";

interface Props {
  nodes: MemoryNode[];
  items: MemoryItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  activatedIds?: Set<string>;
  showItems?: boolean;
  searchFilter?: string;
  itemCounts?: Record<string, number>;
  layoutTrigger?: number;
}

interface NodeData extends Record<string, unknown> {
  label: string;
  status?: string;
  importance?: number;
  one_liner?: string;
  activated?: boolean;
  isItem?: boolean;
  itemCount?: number;
  dimmed?: boolean;
}

const NODE_WIDTH = 240;
const NODE_HEIGHT = 100;
const ITEM_WIDTH = 200;
const ITEM_HEIGHT = 60;

function ItemNode({ data }: { data: NodeData }) {
  return (
    <div className={`graph-node item-node${data.dimmed ? " dim" : ""}`}>
      <Handle type="target" position={Position.Top} style={{ background: "var(--border)", width: 6, height: 6 }} />
      <div className="gn-text">{String(data.label).length > 50 ? String(data.label).slice(0, 50) + "…" : data.label}</div>
    </div>
  );
}

function ParadigmNode({ data, selected }: { data: NodeData; selected?: boolean }) {
  const status = data.status === "active" ? "status-active" : data.status === "proposed" ? "status-proposed" : "status-latent";
  const activated = data.activated ? " activated activation-pulse" : "";
  const dimmed = data.dimmed ? " dim" : "";
  return (
    <div className={`graph-node ${status}${activated}${dimmed}`} style={selected ? { outline: "2px solid var(--cyan)", outlineOffset: 2 } : undefined}>
      <Handle type="target" position={Position.Top} style={{ background: "var(--border)", width: 6, height: 6 }} />
      <div className="gn-label">{data.label}</div>
      {data.one_liner && <div className="gn-meta">{data.one_liner}</div>}
      {(data.itemCount ?? 0) > 0 && <div className="gn-badge">{data.itemCount} items</div>}
      <Handle type="source" position={Position.Bottom} style={{ background: "var(--border)", width: 6, height: 6 }} />
    </div>
  );
}

const nodeTypes = { paradigm: ParadigmNode, item: ItemNode };

const layoutWith = (nodes: Node<NodeData>[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: "TB", nodesep: 100, ranksep: 150 });
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: node.type === "item" ? ITEM_WIDTH : NODE_WIDTH,
      height: node.type === "item" ? ITEM_HEIGHT : NODE_HEIGHT,
    });
  });
  edges.forEach((edge) => dagreGraph.setEdge(edge.source, edge.target));
  dagre.layout(dagreGraph);
  nodes.forEach((node) => {
    const np = dagreGraph.node(node.id);
    node.position = {
      x: np.x - (node.type === "item" ? ITEM_WIDTH : NODE_WIDTH) / 2,
      y: np.y - (node.type === "item" ? ITEM_HEIGHT : NODE_HEIGHT) / 2,
    };
  });
  return nodes;
};

function buildElements(
  nodes: MemoryNode[],
  items: MemoryItem[],
  selectedId: string | null,
  activatedIds: Set<string> | undefined,
  showItems: boolean,
  lf: string,
  itemCounts: Record<string, number> | undefined
): { rawNodes: Node<NodeData>[]; rawEdges: Edge[] } {
  const rawNodes: Node<NodeData>[] = nodes.map((node) => ({
    id: node.id,
    type: "paradigm",
    position: { x: 0, y: 0 },
    data: {
      label: node.label,
      status: node.status,
      importance: node.importance,
      one_liner: node.one_liner,
      activated: activatedIds?.has(node.id) ?? false,
      itemCount: itemCounts?.[node.id] ?? 0,
      dimmed: lf ? !(node.label.toLowerCase().includes(lf) || node.id.toLowerCase().includes(lf)) : false
    },
    selected: node.id === selectedId
  }));

  const rawEdges: Edge[] = [];
  const idSet = new Set(nodes.map((n) => n.id));
  for (const node of nodes) {
    const parts = node.id.split(".");
    if (parts.length > 1) {
      const parent = parts.slice(0, -1).join(".");
      if (idSet.has(parent)) {
        rawEdges.push({
          id: `${parent}->${node.id}`,
          source: parent,
          target: node.id,
          type: "smoothstep",
          style: { stroke: "var(--border-hover)", strokeWidth: 1.4 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#1e293b", width: 14, height: 14 }
        });
      }
    }
  }

  if (showItems) {
    for (const item of items) {
      if ((item.status ?? "active") === "deleted") continue;
      rawNodes.push({
        id: item.id,
        type: "item",
        position: { x: 0, y: 0 },
        data: {
          label: item.content,
          isItem: true,
          dimmed: lf ? !item.content.toLowerCase().includes(lf) : false
        },
        selected: item.id === selectedId
      });
      rawEdges.push({
        id: `${item.node_id}->${item.id}`,
        source: item.node_id,
        target: item.id,
        type: "smoothstep",
        style: { stroke: "rgba(0,209,255,0.2)", strokeWidth: 1, strokeDasharray: "5 3" },
      });
    }
  }

  return { rawNodes, rawEdges };
}

function topologyKey(rawNodes: Node<NodeData>[], rawEdges: Edge[]): string {
  const nodeIds = rawNodes.map((n) => n.id).sort().join("|");
  const edgeIds = rawEdges.map((e) => e.id).sort().join("|");
  return `${nodeIds}::${edgeIds}`;
}

function GraphInner({ nodes, items, selectedId, onSelect, activatedIds, showItems, searchFilter, itemCounts, layoutTrigger }: Props) {
  const flow = useReactFlow();
  const lf = (searchFilter ?? "").toLowerCase();

  const { rawNodes, rawEdges } = useMemo(
    () => buildElements(nodes, items, selectedId, activatedIds, showItems ?? false, lf, itemCounts),
    [nodes, items, selectedId, activatedIds, showItems, lf, itemCounts]
  );

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<Node<NodeData>>([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const lastTopologyRef = useRef<string>("");
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Capture user drags so positions persist across data refreshes.
  const handleNodesChange = useCallback((changes: any[]) => {
    onNodesChange(changes);
    for (const change of changes) {
      if (change.type === "position" && change.position) {
        positionsRef.current.set(change.id, change.position);
      }
      if (change.type === "remove") {
        positionsRef.current.delete(change.id);
      }
    }
  }, [onNodesChange]);

  // Sync external (server) data into flow state. Re-layout only when the
  // topology (set of node IDs + edges) genuinely changes; otherwise just
  // merge the new data into existing nodes, preserving positions and any
  // user drag.
  useEffect(() => {
    const key = topologyKey(rawNodes, rawEdges);
    // Auto-layout if the topology changed (new nodes/edges) OR if it's the first real load.
    if (key !== lastTopologyRef.current && key !== "::") {
      const laidOut = layoutWith(
        rawNodes.map((n) => ({ ...n, position: positionsRef.current.get(n.id) ?? n.position })),
        rawEdges
      );
      // Cache the laid-out positions so subsequent data-only refreshes see them.
      for (const n of laidOut) positionsRef.current.set(n.id, n.position);
      setFlowNodes(laidOut);
      setFlowEdges(rawEdges);
      lastTopologyRef.current = key;
      return;
    }
    // Topology unchanged (simple tick/data update): merge data, keep existing positions.
    if (key === lastTopologyRef.current) {
      setFlowNodes((prev) => {
        const byId = new Map(prev.map((n) => [n.id, n]));
        return rawNodes.map((next) => {
          const existing = byId.get(next.id);
          return existing
            ? { ...existing, data: next.data, selected: next.selected }
            : { ...next, position: positionsRef.current.get(next.id) ?? next.position };
        });
      });
    }
    setFlowEdges(rawEdges);
  }, [rawNodes, rawEdges, setFlowNodes, setFlowEdges]);

  // Handle manual layout trigger
  useEffect(() => {
    if (layoutTrigger && layoutTrigger > 0) {
      const laidOut = layoutWith(
        rawNodes.map((n) => ({ ...n, position: { x: 0, y: 0 } })),
        rawEdges
      );
      for (const n of laidOut) positionsRef.current.set(n.id, n.position);
      setFlowNodes(laidOut);
      setFlowEdges(rawEdges);
      lastTopologyRef.current = topologyKey(rawNodes, rawEdges);
    }
  }, [layoutTrigger, rawNodes, rawEdges, setFlowNodes, setFlowEdges]);

  // Pan to the selected node when it changes (user-driven, not on every tick).
  useEffect(() => {
    if (!selectedId) return;
    const node = flowNodes.find((n) => n.id === selectedId);
    if (node) flow.setCenter(node.position.x + 100, node.position.y + 50, { zoom: 1, duration: 350 });
  }, [selectedId]); // intentionally not depending on flowNodes — avoid re-centering on data refresh

  return (
    <div className="graph-wrapper">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => {
          if (node.data.isItem) {
            const item = items.find((i) => i.id === node.id);
            if (item) onSelect(item.node_id);
          } else {
            onSelect(node.id);
          }
        }}
        fitView={lastTopologyRef.current === ""}
        proOptions={{ hideAttribution: true }}
        minZoom={0.05}
        maxZoom={2}
      >
        <Background color="var(--border)" gap={32} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => (n.data?.activated ? "#00D1FF" : "#1e293b")}
          maskColor="rgba(5, 7, 10, 0.85)"
          style={{ borderRadius: 8 }}
        />
      </ReactFlow>
    </div>
  );
}

export function Graph(props: Props) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  );
}
