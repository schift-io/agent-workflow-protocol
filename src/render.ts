import type {
  AwpEdgeSpec,
  AwpNodeSpec,
  AwpTemplate,
} from "./types.js";

export type AwpGraphRenderFormat = "svg" | "html" | "mermaid" | "json";
export type AwpGraphRenderDirection = "LR" | "TD";

export interface AwpGraphRenderOptions {
  format?: AwpGraphRenderFormat;
  direction?: AwpGraphRenderDirection;
  title?: string;
}

export interface AwpGraphRenderNode {
  id: string;
  type: AwpNodeSpec["type"];
  label: string;
  ref?: string;
  level: number;
}

export interface AwpGraphRenderEdge {
  from: string;
  to: string;
  label?: string;
  condition?: string;
}

export interface AwpGraphRenderModel {
  template_id: string;
  template_name: string;
  start: string;
  nodes: AwpGraphRenderNode[];
  edges: AwpGraphRenderEdge[];
}

interface PositionedNode extends AwpGraphRenderNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 76;
const GAP_X = 120;
const GAP_Y = 34;
const MARGIN = 32;

const NODE_COLORS: Record<AwpNodeSpec["type"], { fill: string; stroke: string; accent: string }> = {
  agent: { fill: "#eef6ff", stroke: "#2563eb", accent: "#1d4ed8" },
  aggregate: { fill: "#f8fafc", stroke: "#64748b", accent: "#475569" },
  tool: { fill: "#ecfdf5", stroke: "#059669", accent: "#047857" },
  connector: { fill: "#f0fdfa", stroke: "#0d9488", accent: "#0f766e" },
  code: { fill: "#fefce8", stroke: "#ca8a04", accent: "#a16207" },
  data_source: { fill: "#f5f3ff", stroke: "#7c3aed", accent: "#6d28d9" },
  validate: { fill: "#fff7ed", stroke: "#ea580c", accent: "#c2410c" },
  guard: { fill: "#fff1f2", stroke: "#e11d48", accent: "#be123c" },
  qc: { fill: "#f0f9ff", stroke: "#0284c7", accent: "#0369a1" },
  router: { fill: "#faf5ff", stroke: "#9333ea", accent: "#7e22ce" },
  join: { fill: "#f8fafc", stroke: "#64748b", accent: "#475569" },
  state: { fill: "#f1f5f9", stroke: "#475569", accent: "#334155" },
  human_approval: { fill: "#fff7ed", stroke: "#f97316", accent: "#c2410c" },
  subworkflow: { fill: "#eff6ff", stroke: "#3b82f6", accent: "#2563eb" },
  end: { fill: "#f8fafc", stroke: "#0f172a", accent: "#0f172a" },
};

export function createAwpGraphRenderModel(template: AwpTemplate): AwpGraphRenderModel {
  const nodeIds = Object.keys(template.graph.nodes);
  const levelByNode = computeNodeLevels(nodeIds, template.graph.edges, template.graph.start);

  return {
    template_id: template.id,
    template_name: template.name,
    start: template.graph.start,
    nodes: nodeIds.map((id) => {
      const node = template.graph.nodes[id];
      return {
        id,
        type: node.type,
        label: node.label ?? id,
        ...(node.ref ? { ref: node.ref } : {}),
        level: levelByNode.get(id) ?? 0,
      };
    }),
    edges: template.graph.edges.map((edge) => renderEdge(edge)),
  };
}

export function renderAwpGraph(template: AwpTemplate, options: AwpGraphRenderOptions = {}): string {
  const model = createAwpGraphRenderModel(template);
  const format = options.format ?? "svg";

  switch (format) {
    case "svg":
      return renderAwpGraphSvg(model, options);
    case "html":
      return renderAwpGraphHtml(model, options);
    case "mermaid":
      return renderAwpGraphMermaid(model, options);
    case "json":
      return JSON.stringify(model, null, 2);
    default:
      assertNever(format);
  }
}

export function renderAwpGraphMermaid(
  model: AwpGraphRenderModel,
  options: AwpGraphRenderOptions = {},
): string {
  const direction = options.direction ?? "LR";
  const idMap = new Map(model.nodes.map((node) => [node.id, mermaidNodeId(node.id)]));
  const lines = [`flowchart ${direction}`];

  for (const node of model.nodes) {
    const label = mermaidLabel(node);
    lines.push(`  ${idMap.get(node.id)}${mermaidShape(node.type, label)}`);
  }

  for (const edge of model.edges) {
    const from = idMap.get(edge.from);
    const to = idMap.get(edge.to);
    if (!from || !to) {
      continue;
    }
    const edgeLabel = edge.label ?? edge.condition;
    lines.push(edgeLabel ? `  ${from} -->|${escapeMermaid(edgeLabel)}| ${to}` : `  ${from} --> ${to}`);
  }

  lines.push("  classDef agent fill:#eef6ff,stroke:#2563eb,color:#172554");
  lines.push("  classDef tool fill:#ecfdf5,stroke:#059669,color:#064e3b");
  lines.push("  classDef gate fill:#fff7ed,stroke:#ea580c,color:#7c2d12");
  lines.push("  classDef end fill:#f8fafc,stroke:#0f172a,color:#0f172a");
  for (const node of model.nodes) {
    lines.push(`  class ${idMap.get(node.id)} ${mermaidClass(node.type)}`);
  }

  return `${lines.join("\n")}\n`;
}

export function renderAwpGraphSvg(
  model: AwpGraphRenderModel,
  options: AwpGraphRenderOptions = {},
): string {
  const direction = options.direction ?? "LR";
  const title = options.title ?? model.template_name;
  const positioned = positionNodes(model.nodes, direction);
  const nodeById = new Map(positioned.map((node) => [node.id, node]));
  const maxX = Math.max(...positioned.map((node) => node.x + node.width), MARGIN + NODE_WIDTH);
  const maxY = Math.max(...positioned.map((node) => node.y + node.height), MARGIN + NODE_HEIGHT);
  const width = maxX + MARGIN;
  const height = maxY + MARGIN + 36;
  const titleY = 24;
  const graphOffsetY = 36;

  const edges = model.edges
    .map((edge) => renderSvgEdge(edge, nodeById, direction, graphOffsetY))
    .filter(Boolean)
    .join("\n");
  const nodes = positioned.map((node) => renderSvgNode(node, graphOffsetY)).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">AWP node graph for ${escapeXml(model.template_id)}</desc>
  <defs>
    <marker id="awp-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="#64748b" />
    </marker>
    <filter id="awp-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#0f172a" flood-opacity="0.12" />
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="#ffffff" />
  <text x="${MARGIN}" y="${titleY}" fill="#0f172a" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="18" font-weight="700">${escapeXml(title)}</text>
  ${edges}
  ${nodes}
</svg>
`;
}

export function renderAwpGraphHtml(
  model: AwpGraphRenderModel,
  options: AwpGraphRenderOptions = {},
): string {
  const title = options.title ?? model.template_name;
  const svg = renderAwpGraphSvg(model, options).replace(/^<\?xml[^>]*>\n/, "");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeXml(title)}</title>
  <style>
    body { margin: 0; background: #f8fafc; color: #0f172a; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { padding: 24px; }
    .surface { overflow: auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06); }
    svg { display: block; max-width: none; }
  </style>
</head>
<body>
  <main>
    <div class="surface">${svg}</div>
  </main>
</body>
</html>
`;
}

function computeNodeLevels(
  nodeIds: string[],
  edges: AwpEdgeSpec[],
  start: string,
): Map<string, number> {
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const levelByNode = new Map<string, number>();

  for (const nodeId of nodeIds) {
    adjacency.set(nodeId, []);
    inDegree.set(nodeId, 0);
    levelByNode.set(nodeId, 0);
  }

  for (const edge of edges) {
    if (!adjacency.has(edge.from) || !inDegree.has(edge.to)) {
      continue;
    }
    adjacency.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const queue = nodeIds.filter((nodeId) => (inDegree.get(nodeId) ?? 0) === 0);
  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index];
    for (const targetId of adjacency.get(nodeId) ?? []) {
      levelByNode.set(targetId, Math.max(levelByNode.get(targetId) ?? 0, (levelByNode.get(nodeId) ?? 0) + 1));
      const nextDegree = (inDegree.get(targetId) ?? 1) - 1;
      inDegree.set(targetId, nextDegree);
      if (nextDegree === 0) {
        queue.push(targetId);
      }
    }
  }

  return levelByNode;
}

function renderEdge(edge: AwpEdgeSpec): AwpGraphRenderEdge {
  return {
    from: edge.from,
    to: edge.to,
    ...(edge.label ? { label: edge.label } : {}),
    ...(edge.condition ? { condition: edge.condition } : {}),
  };
}

function positionNodes(nodes: AwpGraphRenderNode[], direction: AwpGraphRenderDirection): PositionedNode[] {
  const groups = new Map<number, AwpGraphRenderNode[]>();
  for (const node of nodes) {
    const group = groups.get(node.level) ?? [];
    group.push(node);
    groups.set(node.level, group);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([level, group]) => group.map((node, index) => {
      const primary = MARGIN + level * (NODE_WIDTH + GAP_X);
      const secondary = MARGIN + index * (NODE_HEIGHT + GAP_Y);
      return {
        ...node,
        x: direction === "LR" ? primary : secondary,
        y: direction === "LR" ? secondary : primary,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      };
    }));
}

function renderSvgEdge(
  edge: AwpGraphRenderEdge,
  nodeById: Map<string, PositionedNode>,
  direction: AwpGraphRenderDirection,
  yOffset: number,
): string {
  const from = nodeById.get(edge.from);
  const to = nodeById.get(edge.to);
  if (!from || !to) {
    return "";
  }

  const startX = direction === "LR" ? from.x + from.width : from.x + from.width / 2;
  const startY = direction === "LR" ? from.y + from.height / 2 + yOffset : from.y + from.height + yOffset;
  const endX = direction === "LR" ? to.x : to.x + to.width / 2;
  const endY = direction === "LR" ? to.y + to.height / 2 + yOffset : to.y + yOffset;
  const controlOffset = direction === "LR" ? Math.max(40, (endX - startX) / 2) : Math.max(40, (endY - startY) / 2);
  const path = direction === "LR"
    ? `M${startX},${startY} C${startX + controlOffset},${startY} ${endX - controlOffset},${endY} ${endX},${endY}`
    : `M${startX},${startY} C${startX},${startY + controlOffset} ${endX},${endY - controlOffset} ${endX},${endY}`;
  const label = edge.label ?? edge.condition;
  const labelX = (startX + endX) / 2;
  const labelY = (startY + endY) / 2 - 8;

  return `  <path d="${path}" fill="none" stroke="#64748b" stroke-width="1.6" marker-end="url(#awp-arrow)" />
  ${label ? `<text x="${labelX}" y="${labelY}" text-anchor="middle" fill="#475569" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="11">${escapeXml(truncate(label, 28))}</text>` : ""}`;
}

function renderSvgNode(node: PositionedNode, yOffset: number): string {
  const colors = NODE_COLORS[node.type];
  const labelLines = wrapLabel(node.label, 22, 2);
  const subtitle = node.ref ? `${node.type}: ${node.ref}` : node.type;
  const subtitleText = truncate(subtitle, 28);
  const labelTspans = labelLines
    .map((line, index) => `<tspan x="${node.x + 16}" dy="${index === 0 ? 0 : 17}">${escapeXml(line)}</tspan>`)
    .join("");

  return `  <g filter="url(#awp-shadow)">
    <title>${escapeXml(node.id)} (${escapeXml(node.type)})</title>
    <rect x="${node.x}" y="${node.y + yOffset}" width="${node.width}" height="${node.height}" rx="8" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="1.5" />
    <rect x="${node.x}" y="${node.y + yOffset}" width="6" height="${node.height}" rx="3" fill="${colors.accent}" />
    <text x="${node.x + 16}" y="${node.y + yOffset + 28}" fill="#0f172a" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="14" font-weight="700">${labelTspans}</text>
    <text x="${node.x + 16}" y="${node.y + yOffset + 60}" fill="#475569" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="12">${escapeXml(subtitleText)}</text>
  </g>`;
}

function mermaidLabel(node: AwpGraphRenderNode): string {
  const subtitle = node.ref ? `${node.type}: ${node.ref}` : node.type;
  return `${node.label}<br/>${subtitle}`;
}

function mermaidShape(type: AwpNodeSpec["type"], label: string): string {
  const escaped = escapeMermaid(label);
  if (type === "end") {
    return `(["${escaped}"])`;
  }
  if (type === "router" || type === "guard" || type === "validate" || type === "qc") {
    return `{"${escaped}"}`;
  }
  return `["${escaped}"]`;
}

function mermaidClass(type: AwpNodeSpec["type"]): string {
  if (type === "end") {
    return "end";
  }
  if (type === "tool" || type === "connector" || type === "data_source") {
    return "tool";
  }
  if (type === "guard" || type === "validate" || type === "qc" || type === "human_approval") {
    return "gate";
  }
  return "agent";
}

function mermaidNodeId(id: string): string {
  return `n_${id.replace(/[^A-Za-z0-9_]/g, "_")}`;
}

function wrapLabel(value: string, width: number, maxLines: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words.length > 0 ? words : [value]) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= width) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(truncate(word, width));
      current = "";
    }
    if (lines.length === maxLines) {
      break;
    }
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  if (lines.length === 0) {
    return [""];
  }

  const full = lines.join(" ");
  return full.length < value.length ? [...lines.slice(0, maxLines - 1), truncate(lines.at(-1) ?? "", width)] : lines;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}...` : value;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeMermaid(value: string): string {
  return value.replace(/"/g, "&quot;").replace(/\|/g, "&#124;");
}

function assertNever(value: never): never {
  throw new Error(`Unsupported AWP graph render format: ${String(value)}`);
}
