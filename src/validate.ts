import {
  AWP_SCHEMA,
  AWP_VERSION,
  type AwpDiagnostic,
  type AwpTemplate,
  type AwpToolChoiceSpec,
  type AwpValidationResult,
} from "./types.js";

export function validateAwpTemplate(template: AwpTemplate): AwpValidationResult {
  const diagnostics: AwpDiagnostic[] = [];

  if (template.schema !== AWP_SCHEMA) {
    diagnostics.push({
      level: "error",
      path: "schema",
      message: `Expected schema '${AWP_SCHEMA}'`,
    });
  }

  if (template.version !== AWP_VERSION) {
    diagnostics.push({
      level: "error",
      path: "version",
      message: `Expected version '${AWP_VERSION}'`,
    });
  }

  if (!template.id) {
    diagnostics.push({ level: "error", path: "id", message: "Template id is required" });
  }

  if (!template.name) {
    diagnostics.push({ level: "error", path: "name", message: "Template name is required" });
  }

  const agentIds = new Set(Object.keys(template.agents ?? {}));
  if (agentIds.size === 0) {
    diagnostics.push({ level: "error", path: "agents", message: "At least one agent is required" });
  }

  const toolIds = new Set(Object.keys(template.tools ?? {}));
  const connectorIds = new Set(Object.keys(template.connectors ?? {}));

  for (const [agentId, agent] of Object.entries(template.agents ?? {})) {
    for (const childId of agent.children ?? []) {
      if (!agentIds.has(childId)) {
        diagnostics.push({
          level: "error",
          path: `agents.${agentId}.children`,
          message: `Unknown child agent '${childId}'`,
        });
      }
    }
    for (const toolId of agent.tools ?? []) {
      if (!toolIds.has(toolId)) {
        diagnostics.push({
          level: "error",
          path: `agents.${agentId}.tools`,
          message: `Unknown tool '${toolId}'`,
        });
      }
    }
    for (const connectorId of agent.connectors ?? []) {
      if (!connectorIds.has(connectorId)) {
        diagnostics.push({
          level: "error",
          path: `agents.${agentId}.connectors`,
          message: `Unknown connector '${connectorId}'`,
        });
      }
    }
    validateToolChoice(`agents.${agentId}.tool_choice`, agent.tool_choice, toolIds, diagnostics);
  }

  validateToolChoice("tool_calling.default_choice", template.tool_calling?.default_choice, toolIds, diagnostics);
  validateTools(template, diagnostics);
  validateNative(template, diagnostics);
  validateGraph(template, agentIds, toolIds, connectorIds, diagnostics);

  return {
    valid: diagnostics.every((diagnostic) => diagnostic.level !== "error"),
    diagnostics,
  };
}

function validateToolChoice(
  path: string,
  choice: AwpToolChoiceSpec | undefined,
  toolIds: Set<string>,
  diagnostics: AwpDiagnostic[],
): void {
  if (!choice) {
    return;
  }
  if (choice.mode === "tool" && !choice.tool) {
    diagnostics.push({
      level: "error",
      path,
      message: "Tool choice mode 'tool' requires a tool name",
    });
  }
  if (choice.tool && !toolIds.has(choice.tool)) {
    diagnostics.push({
      level: "error",
      path: `${path}.tool`,
      message: `Unknown forced tool '${choice.tool}'`,
    });
  }
  for (const toolId of choice.allowed_tools ?? []) {
    if (!toolIds.has(toolId)) {
      diagnostics.push({
        level: "error",
        path: `${path}.allowed_tools`,
        message: `Unknown allowed tool '${toolId}'`,
      });
    }
  }
}

function validateTools(template: AwpTemplate, diagnostics: AwpDiagnostic[]): void {
  for (const [toolId, tool] of Object.entries(template.tools ?? {})) {
    if (tool.approval?.mode !== "none" && tool.side_effect === "write" && !tool.approval?.checkpoint) {
      diagnostics.push({
        level: "warning",
        path: `tools.${toolId}.approval.checkpoint`,
        message: "Write tools should name the audit checkpoint used for approval",
      });
    }
    if (tool.strict === true && tool.schema_format && tool.schema_format !== "json_schema") {
      diagnostics.push({
        level: "warning",
        path: `tools.${toolId}.strict`,
        message: "Strict tool schemas are most portable when schema_format is json_schema",
      });
    }
  }
}

function validateNative(template: AwpTemplate, diagnostics: AwpDiagnostic[]): void {
  for (const [index, checkpoint] of (template.native?.audit?.checkpoints ?? []).entries()) {
    if (!checkpoint.id) {
      diagnostics.push({
        level: "error",
        path: `native.audit.checkpoints.${index}.id`,
        message: "Audit checkpoint id is required",
      });
    }
    if (!checkpoint.type) {
      diagnostics.push({
        level: "error",
        path: `native.audit.checkpoints.${index}.type`,
        message: "Audit checkpoint type is required",
      });
    }
  }
}

function validateGraph(
  template: AwpTemplate,
  agentIds: Set<string>,
  toolIds: Set<string>,
  connectorIds: Set<string>,
  diagnostics: AwpDiagnostic[],
): void {
  const graph = template.graph;
  if (!graph) {
    diagnostics.push({ level: "error", path: "graph", message: "Graph is required" });
    return;
  }

  const nodeIds = new Set(Object.keys(graph.nodes ?? {}));
  if (!graph.start || !nodeIds.has(graph.start)) {
    diagnostics.push({
      level: "error",
      path: "graph.start",
      message: "Graph start must reference an existing node",
    });
  }

  for (const [nodeId, node] of Object.entries(graph.nodes ?? {})) {
    if (node.type === "agent" && node.ref && !agentIds.has(node.ref)) {
      diagnostics.push({
        level: "error",
        path: `graph.nodes.${nodeId}.ref`,
        message: `Unknown agent '${node.ref}'`,
      });
    }
    if (node.type === "tool" && node.ref && !toolIds.has(node.ref)) {
      diagnostics.push({
        level: "error",
        path: `graph.nodes.${nodeId}.ref`,
        message: `Unknown tool '${node.ref}'`,
      });
    }
    if (node.type === "connector" && node.ref && !connectorIds.has(node.ref)) {
      diagnostics.push({
        level: "error",
        path: `graph.nodes.${nodeId}.ref`,
        message: `Unknown connector '${node.ref}'`,
      });
    }
  }

  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const nodeId of nodeIds) {
    adjacency.set(nodeId, []);
    inDegree.set(nodeId, 0);
  }

  for (const [index, edge] of (graph.edges ?? []).entries()) {
    if (!nodeIds.has(edge.from)) {
      diagnostics.push({
        level: "error",
        path: `graph.edges.${index}.from`,
        message: `Unknown source node '${edge.from}'`,
      });
    }
    if (!nodeIds.has(edge.to)) {
      diagnostics.push({
        level: "error",
        path: `graph.edges.${index}.to`,
        message: `Unknown target node '${edge.to}'`,
      });
    }
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
      adjacency.get(edge.from)?.push(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    }
  }

  const queue = [...nodeIds].filter((nodeId) => (inDegree.get(nodeId) ?? 0) === 0);
  let visited = 0;
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId) {
      continue;
    }
    visited += 1;
    for (const targetId of adjacency.get(nodeId) ?? []) {
      const nextDegree = (inDegree.get(targetId) ?? 1) - 1;
      inDegree.set(targetId, nextDegree);
      if (nextDegree === 0) {
        queue.push(targetId);
      }
    }
  }
  if (visited !== nodeIds.size) {
    diagnostics.push({
      level: "error",
      path: "graph.edges",
      message: "Graph contains a cycle",
    });
  }

  if (graph.start && nodeIds.has(graph.start)) {
    const reachable = new Set<string>();
    const stack = [graph.start];
    while (stack.length > 0) {
      const nodeId = stack.pop();
      if (!nodeId || reachable.has(nodeId)) {
        continue;
      }
      reachable.add(nodeId);
      for (const targetId of adjacency.get(nodeId) ?? []) {
        stack.push(targetId);
      }
    }
    for (const nodeId of nodeIds) {
      if (!reachable.has(nodeId)) {
        diagnostics.push({
          level: "warning",
          path: `graph.nodes.${nodeId}`,
          message: "Node is not reachable from graph.start",
        });
      }
    }
  }
}
