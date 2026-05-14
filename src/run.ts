import { randomUUID } from "node:crypto";
import type {
  AwpCostObservation,
  AwpModelRef,
  AwpNativeEvent,
  AwpQualityObservation,
  AwpRunArtifact,
  AwpRunEvent,
  AwpRunResult,
  AwpTemplate,
  AwpTokenUsage,
  AwpToolCallRecord,
} from "./types.js";
import { validateAwpTemplate } from "./validate.js";

export interface RunAwpReferenceOptions {
  input?: Record<string, unknown>;
  now?: () => Date;
  runId?: string;
  target?: "reference";
  cost?: AwpCostObservation;
  quality?: AwpQualityObservation[];
}

interface RuntimeState {
  runId: string;
  template: AwpTemplate;
  startedAt: string;
  startedAtMs: number;
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
  const startedAt = now();
  const state: RuntimeState = {
    runId: options.runId ?? createAwpRunId(),
    template,
    startedAt: startedAt.toISOString(),
    startedAtMs: startedAt.getTime(),
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

  const completedAt = now();
  const durationMs = Math.max(0, completedAt.getTime() - state.startedAtMs);
  const usage = aggregateUsage(state.events
    .filter((event) => event.type === "token.usage")
    .map((event) => event.usage));
  if (options.cost) {
    emit(state, "cost.observed", {
      scope: "run",
      source: options.cost.source,
      estimated: options.cost.estimated,
      currency: options.cost.currency,
      total_cost: options.cost.total_cost,
    }, undefined, undefined, undefined, undefined, undefined, undefined, options.cost);
  }

  if (options.quality?.length) {
    emit(state, "quality.observed", {
      scope: "run",
      metric_count: options.quality.length,
      metrics: options.quality.map((observation) => observation.metric),
    }, undefined, undefined, undefined, undefined, undefined, undefined, undefined, options.quality);
  }

  const cost = aggregateCost(state.events.map((event) => event.cost));
  const quality = aggregateQuality(state.events.map((event) => event.quality));
  emit(state, "run.completed", {
    status: "completed",
    artifact_count: state.artifacts.length,
    event_count: state.events.length + 1,
    duration_ms: durationMs,
    model_invocation_count: state.events.filter((event) => event.type === "model.started").length,
  }, undefined, undefined, undefined, undefined, usage, durationMs, cost, quality);

  return {
    run_id: state.runId,
    template_id: template.id,
    target: options.target ?? "reference",
    status: "completed",
    started_at: state.startedAt,
    completed_at: completedAt.toISOString(),
    duration_ms: durationMs,
    events: state.events,
    artifacts: state.artifacts,
    intermediate_results: state.intermediateResults,
    outputs: state.outputs,
    usage,
    ...(cost ? { cost } : {}),
    ...(quality ? { quality } : {}),
  };
}

function executeNode(state: RuntimeState, nodeId: string): void {
  const node = state.template.graph.nodes[nodeId];
  const stepId = `${state.runId}_step_${String(state.sequence + 1).padStart(4, "0")}`;
  const stepStartedAtMs = state.now().getTime();

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

  const stepDurationMs = elapsedSince(state, stepStartedAtMs);
  emit(state, "step.completed", {
    node_type: node.type,
    artifact_count: state.artifacts.filter((artifact) => artifact.step_id === stepId).length,
    duration_ms: stepDurationMs,
  }, nodeId, stepId, undefined, undefined, undefined, stepDurationMs);
}

function executeAgentNode(
  state: RuntimeState,
  nodeId: string,
  stepId: string,
  agentId: string | undefined,
): void {
  const agent = agentId ? state.template.agents[agentId] : undefined;
  const modelStartedAtMs = state.now().getTime();
  const model = agent?.model;

  emit(state, "model.started", {
    agent_id: agentId,
    role: agent?.role,
    model: model ?? null,
    model_resolution: model ? "template" : "unresolved",
    model_provider: model?.provider,
    model_name: model?.name,
    temperature: model?.temperature,
    max_output_tokens: model?.max_output_tokens,
  }, nodeId, stepId);

  const toolCalls: AwpToolCallRecord[] = [];
  for (const toolName of agent?.tools ?? []) {
    toolCalls.push(executeReferenceToolCall(state, toolName, nodeId, stepId));
  }

  const message = `Reference output for agent '${agentId ?? nodeId}'.`;
  emitModelOutputDeltas(state, nodeId, stepId, message, model);

  const reasoningCapture = state.template.native?.reasoning?.capture ?? "provider_summary";
  if (reasoningCapture !== "none") {
    const reasoningSummary = {
      capture: reasoningCapture,
      raw_thinking_captured: false,
      summary:
        "Reference runner records provider-exposed reasoning summaries or metadata only; hidden raw chain-of-thought is intentionally excluded.",
      model: model ?? null,
      model_resolution: model ? "template" : "unresolved",
      model_provider: model?.provider,
      model_name: model?.name,
    };
    const artifact = createArtifact(
      state,
      "reasoning_summary",
      `${nodeId}.reasoning_summary`,
      reasoningSummary,
      nodeId,
      stepId,
    );
    emit(state, "reasoning.summary", {
      ...reasoningSummary,
      artifact_id: artifact.artifact_id,
    }, nodeId, stepId, undefined, artifact.artifact_id);
  }

  const structuredOutput = {
    type: "awp.reference.agent_output",
    agent_id: agentId,
    role: agent?.role,
    node_id: nodeId,
    model: model ?? null,
    model_resolution: model ? "template" : "unresolved",
    message,
    input_keys: Object.keys(state.input),
    tool_call_count: toolCalls.length,
    tool_call_ids: toolCalls.map((toolCall) => toolCall.protocol_call_id),
  };
  const structuredArtifact = createArtifact(
    state,
    "structured_output",
    `${nodeId}.structured_output`,
    structuredOutput,
    nodeId,
    stepId,
  );
  emit(state, "model.structured_output", {
    artifact_id: structuredArtifact.artifact_id,
    output_type: structuredOutput.type,
    output_keys: Object.keys(structuredOutput),
    schema_mode: state.template.native?.structured_output?.mode ?? "adapter",
    required: state.template.native?.structured_output?.required ?? false,
  }, nodeId, stepId, undefined, structuredArtifact.artifact_id);

  const result = {
    agent_id: agentId,
    role: agent?.role,
    node_id: nodeId,
    model: model ?? null,
    model_resolution: model ? "template" : "unresolved",
    mode: "reference",
    message,
    input: state.input,
    tool_calls: toolCalls,
    structured_output: structuredOutput,
    structured_output_artifact_id: structuredArtifact.artifact_id,
  };
  state.intermediateResults[nodeId] = result;
  createArtifact(state, "intermediate_result", `${nodeId}.agent_output`, result, nodeId, stepId);

  const usage = estimateUsage(state.input, {
    message,
    structured_output: structuredOutput,
    tool_calls: toolCalls.map((toolCall) => toolCall.arguments_json),
  });
  const modelDurationMs = elapsedSince(state, modelStartedAtMs);
  emit(state, "model.completed", {
    agent_id: agentId,
    model: model ?? null,
    model_resolution: model ? "template" : "unresolved",
    model_provider: model?.provider,
    model_name: model?.name,
    duration_ms: modelDurationMs,
    token_usage: {
      ...usage,
    },
  }, nodeId, stepId, undefined, undefined, usage, modelDurationMs);
  emit(state, "token.usage", {
    scope: "model",
    agent_id: agentId,
    model: model ?? null,
    model_resolution: model ? "template" : "unresolved",
    duration_ms: modelDurationMs,
  }, nodeId, stepId, undefined, undefined, usage, modelDurationMs);
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

  emitToolCallDeltas(state, nodeId, stepId, protocolCallId, toolName, argumentsJson);

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

  const toolStartedAtMs = state.now().getTime();
  emit(state, "tool.started", {
    tool_name: toolName,
    protocol_call_id: protocolCallId,
    runtime: tool?.runtime,
    execution: tool?.execution,
    arguments_json: argumentsJson,
  }, nodeId, stepId, protocolCallId);

  const resultPayload = {
    mode: "reference",
    message: `Tool '${toolName}' was not externally executed; this is a reference result.`,
    kind: tool?.kind,
  };
  const usage = estimateUsage(argumentsJson, resultPayload);
  const record: AwpToolCallRecord = {
    protocol_call_id: protocolCallId,
    tool_name: toolName,
    arguments_json: argumentsJson,
    status: "completed",
    approval_state: tool?.approval?.mode && tool.approval.mode !== "none" ? "approved" : "not_required",
    result_payload: resultPayload,
    is_error: false,
    usage,
    audit_metadata: {
      node_id: nodeId,
      step_id: stepId,
      side_effect: tool?.side_effect ?? "none",
    },
  };

  createArtifact(state, "tool_result", `${toolName}.tool_result`, record, nodeId, stepId);
  const toolDurationMs = elapsedSince(state, toolStartedAtMs);
  emit(state, "tool.completed", {
    tool_name: toolName,
    protocol_call_id: protocolCallId,
    duration_ms: toolDurationMs,
    result_payload: record.result_payload as Record<string, unknown>,
  }, nodeId, stepId, protocolCallId, undefined, usage, toolDurationMs);
  emit(state, "token.usage", {
    scope: "tool",
    tool_name: toolName,
    protocol_call_id: protocolCallId,
    duration_ms: toolDurationMs,
  }, nodeId, stepId, protocolCallId, undefined, usage, toolDurationMs);

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
  usage?: AwpTokenUsage,
  durationMs?: number,
  cost?: AwpCostObservation,
  quality?: AwpQualityObservation[],
): AwpRunEvent {
  state.sequence += 1;
  const event: AwpRunEvent = {
    run_id: state.runId,
    event_id: `${state.runId}_event_${String(state.sequence).padStart(5, "0")}`,
    sequence: state.sequence,
    timestamp: state.now().toISOString(),
    type,
    level: eventLevel(type),
    template_id: state.template.id,
    node_id: nodeId,
    step_id: stepId,
    tool_call_id: toolCallId,
    artifact_id: artifactId,
    duration_ms: durationMs,
    payload,
    usage,
    cost,
    quality,
  };
  state.events.push(event);
  return event;
}

function eventLevel(type: AwpNativeEvent): AwpRunEvent["level"] {
  if (type.endsWith(".failed")) {
    return "error";
  }
  if (type.endsWith(".delta") || type === "reasoning.summary" || type === "token.usage") {
    return "debug";
  }
  return "info";
}

function emitModelOutputDeltas(
  state: RuntimeState,
  nodeId: string,
  stepId: string,
  text: string,
  model: AwpModelRef | undefined,
): void {
  const streaming = state.template.native?.streaming;
  if (streaming?.enabled === false || streaming?.include_text_deltas === false) {
    return;
  }

  const chunks = chunkText(text, 24);
  let accumulatedLength = 0;
  chunks.forEach((delta, index) => {
    accumulatedLength += delta.length;
    emit(state, "model.output.delta", {
      index,
      channel: "assistant_text",
      delta,
      accumulated_length: accumulatedLength,
      is_final: index === chunks.length - 1,
      model: model ?? null,
      model_resolution: model ? "template" : "unresolved",
      model_provider: model?.provider,
      model_name: model?.name,
    }, nodeId, stepId);
  });
}

function emitToolCallDeltas(
  state: RuntimeState,
  nodeId: string,
  stepId: string,
  protocolCallId: string,
  toolName: string,
  argumentsJson: string,
): void {
  const streaming = state.template.native?.streaming;
  if (streaming?.enabled === false || streaming?.include_tool_call_deltas === false) {
    return;
  }

  const chunks = chunkText(argumentsJson, Math.max(32, Math.ceil(argumentsJson.length / 2)));
  chunks.forEach((delta, index) => {
    emit(state, "tool.call.delta", {
      index,
      tool_name: toolName,
      protocol_call_id: protocolCallId,
      delta_type: "arguments_json",
      arguments_delta: delta,
      is_final: index === chunks.length - 1,
    }, nodeId, stepId, protocolCallId);
  });
}

function chunkText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) {
    return [text];
  }
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += maxLength) {
    chunks.push(text.slice(index, index + maxLength));
  }
  return chunks;
}

function estimateUsage(input: unknown, output: unknown): AwpTokenUsage {
  const promptTokens = estimateTokens(input);
  const completionTokens = estimateTokens(output);
  const totalTokens = promptTokens + completionTokens;

  return {
    source: "adapter_estimate",
    estimated: true,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    reasoning_tokens: 0,
    cached_tokens: 0,
    tool_call_tokens: 0,
    total_tokens: totalTokens,
  };
}

function estimateTokens(value: unknown): number {
  const serialized = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return Math.ceil(serialized.length / 4);
}

function aggregateUsage(usages: Array<AwpTokenUsage | undefined>): AwpTokenUsage {
  const known = usages.filter((usage): usage is AwpTokenUsage => usage !== undefined);
  if (known.length === 0) {
    return {
      source: "unavailable",
    };
  }

  return {
    source: known.every((usage) => usage.source === "provider") ? "provider" : "adapter_estimate",
    estimated: known.some((usage) => usage.estimated),
    prompt_tokens: sumUsageField(known, "prompt_tokens"),
    completion_tokens: sumUsageField(known, "completion_tokens"),
    reasoning_tokens: sumUsageField(known, "reasoning_tokens"),
    cached_tokens: sumUsageField(known, "cached_tokens"),
    tool_call_tokens: sumUsageField(known, "tool_call_tokens"),
    total_tokens: sumUsageField(known, "total_tokens"),
  };
}

function aggregateCost(costs: Array<AwpCostObservation | undefined>): AwpCostObservation | undefined {
  const known = costs.filter((cost): cost is AwpCostObservation => cost !== undefined);
  if (known.length === 0) {
    return undefined;
  }
  if (known.length === 1) {
    return known[0];
  }

  const currencies = new Set(known.map((cost) => cost.currency).filter((currency): currency is string => !!currency));
  return {
    source: known.every((cost) => cost.source === known[0].source) ? known[0].source : "adapter_estimate",
    estimated: known.some((cost) => cost.estimated === true || cost.source === "adapter_estimate"),
    currency: currencies.size === 1 ? [...currencies][0] : undefined,
    prompt_cost: sumCostField(known, "prompt_cost"),
    completion_cost: sumCostField(known, "completion_cost"),
    reasoning_cost: sumCostField(known, "reasoning_cost"),
    tool_cost: sumCostField(known, "tool_cost"),
    total_cost: sumCostField(known, "total_cost"),
  };
}

function aggregateQuality(
  qualityLists: Array<AwpQualityObservation[] | undefined>,
): AwpQualityObservation[] | undefined {
  const observations = qualityLists.flatMap((quality) => quality ?? []);
  return observations.length > 0 ? observations : undefined;
}

function sumUsageField(usages: AwpTokenUsage[], field: keyof AwpTokenUsage): number | undefined {
  const values = usages
    .map((usage) => usage[field])
    .filter((value): value is number => typeof value === "number");
  if (values.length === 0) {
    return undefined;
  }
  return values.reduce((sum, value) => sum + value, 0);
}

function sumCostField(costs: AwpCostObservation[], field: keyof AwpCostObservation): number | undefined {
  const values = costs
    .map((cost) => cost[field])
    .filter((value): value is number => typeof value === "number");
  if (values.length === 0) {
    return undefined;
  }
  return values.reduce((sum, value) => sum + value, 0);
}

function elapsedSince(state: RuntimeState, startedAtMs: number): number {
  return Math.max(0, state.now().getTime() - startedAtMs);
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
