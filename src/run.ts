import { randomUUID } from "node:crypto";
import type {
  AwpNativeEvent,
  AwpRunArtifact,
  AwpRunEvent,
  AwpRunResult,
  AwpTemplate,
  AwpToolCallRecord,
} from "./types.js";
import { validateAwpTemplate } from "./validate.js";

export interface RunAwpReferenceOptions {
  input?: Record<string, unknown>;
  now?: () => Date;
  runId?: string;
  target?: "reference";
}

interface RuntimeState {
  runId: string;
  template: AwpTemplate;
  startedAt: string;
  input: Record<string, unknown>;
  events: AwpRunEvent[];
  artifacts: AwpRunArtifact[];
  intermediateResults: Record<string, unknown>;
  outputs: Record<string, unknown>;
  sequence: number;
  now: () => Date;
}

export function createAwpRunId(): string {
  return `awp_run_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${randomUUID().slice(0, 8)}`;
}

export function runAwpReference(
  template: AwpTemplate,
  options: RunAwpReferenceOptions = {},
): AwpRunResult {
  const validation = validateAwpTemplate(template);
  if (!validation.valid) {
    const errors = validation.diagnostics
      .filter((diagnostic) => diagnostic.level === "error")
      .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
      .join("; ");
    throw new Error(`Cannot run invalid AWP template: ${errors}`);
  }

  const now = options.now ?? (() => new Date());
  const state: RuntimeState = {
    runId: options.runId ?? createAwpRunId(),
    template,
    startedAt: now().toISOString(),
    input: options.input ?? {},
    events: [],
    artifacts: [],
    intermediateResults: {},
    outputs: {},
    sequence: 0,
    now,
  };

  emit(state, "run.started", {
    template_id: template.id,
    template_version: template.version,
    target: options.target ?? "reference",
    input_keys: Object.keys(state.input),
  });

  emit(state, "state.updated", {
    state: {
      ...state.input,
    },
  });

  const nodeOrder = reachableTopologicalOrder(template);
  for (const nodeId of nodeOrder) {
    executeNode(state, nodeId);
  }

  const completedAt = now().toISOString();
  emit(state, "run.completed", {
    status: "completed",
    artifact_count: state.artifacts.length,
    event_count: state.events.length + 1,
  });

  return {
    run_id: state.runId,
    template_id: template.id,
    target: options.target ?? "reference",
    status: "completed",
    started_at: state.startedAt,
    completed_at: completedAt,
    events: state.events,
    artifacts: state.artifacts,
    intermediate_results: state.intermediateResults,
    outputs: state.outputs,
    usage: {
      source: "unavailable",
    },
  };
}

function executeNode(state: RuntimeState, nodeId: string): void {
  const node = state.template.graph.nodes[nodeId];
  const stepId = `${state.runId}_step_${String(state.sequence + 1).padStart(4, "0")}`;

  emit(state, "step.started", {
    node_type: node.type,
    ref: node.ref,
  }, nodeId, stepId);

  switch (node.type) {
    case "agent":
      executeAgentNode(state, nodeId, stepId, node.ref);
      break;
    case "tool":
      executeToolNode(state, nodeId, stepId, node.ref);
      break;
    case "human_approval":
      executeHumanApprovalNode(state, nodeId, stepId);
      break;
    case "end":
      state.outputs = {
        ...state.intermediateResults,
      };
      createArtifact(state, "final_output", "final_output", state.outputs, nodeId, stepId);
      break;
    default:
      createArtifact(
        state,
        "intermediate_result",
        `${nodeId}.reference`,
        { node_id: nodeId, node_type: node.type, config: node.config ?? {} },
        nodeId,
        stepId,
      );
      break;
  }

  emit(state, "step.completed", {
    node_type: node.type,
    artifact_count: state.artifacts.filter((artifact) => artifact.step_id === stepId).length,
  }, nodeId, stepId);
}

function executeAgentNode(
  state: RuntimeState,
  nodeId: string,
  stepId: string,
  agentId: string | undefined,
): void {
  const agent = agentId ? state.template.agents[agentId] : undefined;

  emit(state, "model.started", {
    agent_id: agentId,
    role: agent?.role,
    model: agent?.model,
  }, nodeId, stepId);

  const toolCalls: AwpToolCallRecord[] = [];
  for (const toolName of agent?.tools ?? []) {
    toolCalls.push(executeReferenceToolCall(state, toolName, nodeId, stepId));
  }

  const result = {
    agent_id: agentId,
    role: agent?.role,
    node_id: nodeId,
    mode: "reference",
    message: `Reference output for agent '${agentId ?? nodeId}'.`,
    input: state.input,
    tool_calls: toolCalls,
  };
  state.intermediateResults[nodeId] = result;
  createArtifact(state, "intermediate_result", `${nodeId}.agent_output`, result, nodeId, stepId);

  emit(state, "model.completed", {
    agent_id: agentId,
    token_usage: {
      source: "unavailable",
    },
  }, nodeId, stepId);
}

function executeToolNode(
  state: RuntimeState,
  nodeId: string,
  stepId: string,
  toolName: string | undefined,
): void {
  if (!toolName) {
    createArtifact(
      state,
      "tool_result",
      `${nodeId}.missing_tool_ref`,
      { status: "failed", reason: "tool node has no ref" },
      nodeId,
      stepId,
    );
    return;
  }
  const record = executeReferenceToolCall(state, toolName, nodeId, stepId);
  state.intermediateResults[nodeId] = record;
}

function executeReferenceToolCall(
  state: RuntimeState,
  toolName: string,
  nodeId: string,
  stepId: string,
): AwpToolCallRecord {
  const tool = state.template.tools?.[toolName];
  const protocolCallId = `${state.runId}_call_${randomUUID().slice(0, 8)}`;
  const argumentsJson = JSON.stringify({
    input: state.input,
    tool: toolName,
    mode: "reference",
  });

  if (tool?.approval?.mode && tool.approval.mode !== "none") {
    emit(state, "tool.approval.requested", {
      tool_name: toolName,
      approval: tool.approval,
      protocol_call_id: protocolCallId,
    }, nodeId, stepId, protocolCallId);
    emit(state, "tool.approval.decided", {
      tool_name: toolName,
      protocol_call_id: protocolCallId,
      decision: "auto_approved_reference",
    }, nodeId, stepId, protocolCallId);
  }

  emit(state, "tool.started", {
    tool_name: toolName,
    protocol_call_id: protocolCallId,
    runtime: tool?.runtime,
    execution: tool?.execution,
    arguments_json: argumentsJson,
  }, nodeId, stepId, protocolCallId);

  const record: AwpToolCallRecord = {
    protocol_call_id: protocolCallId,
    tool_name: toolName,
    arguments_json: argumentsJson,
    status: "completed",
    approval_state: tool?.approval?.mode && tool.approval.mode !== "none" ? "approved" : "not_required",
    result_payload: {
      mode: "reference",
      message: `Tool '${toolName}' was not externally executed; this is a reference result.`,
      kind: tool?.kind,
    },
    is_error: false,
    usage: {
      source: "unavailable",
    },
    audit_metadata: {
      node_id: nodeId,
      step_id: stepId,
      side_effect: tool?.side_effect ?? "none",
    },
  };

  createArtifact(state, "tool_result", `${toolName}.tool_result`, record, nodeId, stepId);
  emit(state, "tool.completed", {
    tool_name: toolName,
    protocol_call_id: protocolCallId,
    result_payload: record.result_payload as Record<string, unknown>,
  }, nodeId, stepId, protocolCallId);

  return record;
}

function executeHumanApprovalNode(state: RuntimeState, nodeId: string, stepId: string): void {
  const payload = {
    decision: "auto_approved_reference",
    reason: "Reference runner records the checkpoint without blocking for input.",
  };
  emit(state, "audit.requested", payload, nodeId, stepId);
  createArtifact(state, "audit_decision", `${nodeId}.audit_decision`, payload, nodeId, stepId);
  emit(state, "audit.decided", payload, nodeId, stepId);
}

function createArtifact(
  state: RuntimeState,
  kind: AwpRunArtifact["kind"],
  name: string,
  payload: unknown,
  nodeId?: string,
  stepId?: string,
): AwpRunArtifact {
  const artifact: AwpRunArtifact = {
    artifact_id: `${state.runId}_artifact_${String(state.artifacts.length + 1).padStart(4, "0")}`,
    run_id: state.runId,
    node_id: nodeId,
    step_id: stepId,
    kind,
    name,
    created_at: state.now().toISOString(),
    payload,
  };
  state.artifacts.push(artifact);
  emit(state, "artifact.created", {
    artifact_id: artifact.artifact_id,
    kind,
    name,
  }, nodeId, stepId, undefined, artifact.artifact_id);
  return artifact;
}

function emit(
  state: RuntimeState,
  type: AwpNativeEvent,
  payload: Record<string, unknown> = {},
  nodeId?: string,
  stepId?: string,
  toolCallId?: string,
  artifactId?: string,
): AwpRunEvent {
  state.sequence += 1;
  const event: AwpRunEvent = {
    run_id: state.runId,
    event_id: `${state.runId}_event_${String(state.sequence).padStart(5, "0")}`,
    sequence: state.sequence,
    timestamp: state.now().toISOString(),
    type,
    level: type.endsWith(".failed") ? "error" : "info",
    template_id: state.template.id,
    node_id: nodeId,
    step_id: stepId,
    tool_call_id: toolCallId,
    artifact_id: artifactId,
    payload,
  };
  state.events.push(event);
  return event;
}

function reachableTopologicalOrder(template: AwpTemplate): string[] {
  const graph = template.graph;
  const nodeIds = new Set(Object.keys(graph.nodes));
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const nodeId of nodeIds) {
    adjacency.set(nodeId, []);
    inDegree.set(nodeId, 0);
  }
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      continue;
    }
    adjacency.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const reachable = new Set<string>();
  const stack = [graph.start];
  while (stack.length > 0) {
    const nodeId = stack.pop();
    if (!nodeId || reachable.has(nodeId)) {
      continue;
    }
    reachable.add(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      stack.push(next);
    }
  }

  const queue = [...reachable].filter((nodeId) => (inDegree.get(nodeId) ?? 0) === 0);
  if (reachable.has(graph.start) && !queue.includes(graph.start)) {
    queue.unshift(graph.start);
  }

  const ordered: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || ordered.includes(nodeId) || !reachable.has(nodeId)) {
      continue;
    }
    ordered.push(nodeId);
    for (const target of adjacency.get(nodeId) ?? []) {
      if (!reachable.has(target)) {
        continue;
      }
      const nextDegree = (inDegree.get(target) ?? 1) - 1;
      inDegree.set(target, nextDegree);
      if (nextDegree === 0) {
        queue.push(target);
      }
    }
  }

  return ordered;
}
