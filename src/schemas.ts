import { z } from "zod";

export const AWP_SCHEMA = "agent-workflow-protocol" as const;
export const AWP_VERSION = "0.1" as const;

export const AwpSchemaSchema = z.literal(AWP_SCHEMA);
export type AwpSchema = z.infer<typeof AwpSchemaSchema>;

export const AwpVersionSchema = z.literal(AWP_VERSION);
export type AwpVersion = z.infer<typeof AwpVersionSchema>;

export const AwpScalarTypeSchema = z.enum([
  "string",
  "number",
  "integer",
  "boolean",
  "object",
  "array",
]);
export type AwpScalarType = z.infer<typeof AwpScalarTypeSchema>;

export const AwpFieldSpecSchema = z.object({
  type: AwpScalarTypeSchema,
  required: z.boolean().optional(),
  description: z.string().optional(),
  default: z.unknown().optional(),
});
export type AwpFieldSpec = z.infer<typeof AwpFieldSpecSchema>;

export const AwpStateSpecSchema = z.record(
  z.union([AwpScalarTypeSchema, AwpFieldSpecSchema]),
);
export type AwpStateSpec = z.infer<typeof AwpStateSpecSchema>;

export const AwpModelRefSchema = z.object({
  provider: z.string(),
  name: z.string(),
  temperature: z.number().optional(),
  max_output_tokens: z.number().optional(),
});
export type AwpModelRef = z.infer<typeof AwpModelRefSchema>;

export const AwpToolChoiceModeSchema = z.enum([
  "auto",
  "none",
  "required",
  "any",
  "tool",
  "validated",
]);
export type AwpToolChoiceMode = z.infer<typeof AwpToolChoiceModeSchema>;

export const AwpToolParallelismSpecSchema = z.object({
  enabled: z.boolean().optional(),
  max_concurrent: z.number().optional(),
  return_results_together: z.boolean().optional(),
});
export type AwpToolParallelismSpec = z.infer<typeof AwpToolParallelismSpecSchema>;

export const AwpToolChoiceSpecSchema = z.object({
  mode: AwpToolChoiceModeSchema,
  tool: z.string().optional(),
  allowed_tools: z.array(z.string()).optional(),
});
export type AwpToolChoiceSpec = z.infer<typeof AwpToolChoiceSpecSchema>;

export const AwpStructuredOutputSpecSchema = z.object({
  required: z.boolean().optional(),
  mode: z.enum(["json_schema", "tool_result", "adapter"]).optional(),
  schema: z.record(z.unknown()).optional(),
});
export type AwpStructuredOutputSpec = z.infer<typeof AwpStructuredOutputSpecSchema>;

export const AwpAgentSpecSchema = z.object({
  role: z.string(),
  model: AwpModelRefSchema.optional(),
  instructions: z.string().optional(),
  tools: z.array(z.string()).optional(),
  connectors: z.array(z.string()).optional(),
  children: z.array(z.string()).optional(),
  max_steps: z.number().optional(),
  tool_choice: AwpToolChoiceSpecSchema.optional(),
  tool_parallelism: AwpToolParallelismSpecSchema.optional(),
  structured_output: AwpStructuredOutputSpecSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type AwpAgentSpec = z.infer<typeof AwpAgentSpecSchema>;

export const AwpToolSchemaFormatSchema = z.enum([
  "json_schema",
  "openapi_schema",
  "zod_adapter",
  "mcp_tool",
]);
export type AwpToolSchemaFormat = z.infer<typeof AwpToolSchemaFormatSchema>;

export const AwpToolExecutionModeSchema = z.enum([
  "host",
  "client",
  "server",
  "mcp",
  "remote",
  "manual",
  "adapter",
]);
export type AwpToolExecutionMode = z.infer<typeof AwpToolExecutionModeSchema>;

export const AwpToolApprovalModeSchema = z.enum([
  "none",
  "always",
  "conditional",
  "runtime",
]);
export type AwpToolApprovalMode = z.infer<typeof AwpToolApprovalModeSchema>;

export const AwpToolApprovalSpecSchema = z.object({
  mode: AwpToolApprovalModeSchema,
  checkpoint: z.string().optional(),
  condition: z.string().optional(),
});
export type AwpToolApprovalSpec = z.infer<typeof AwpToolApprovalSpecSchema>;

export const AwpToolSpecSchema = z.object({
  kind: z.string(),
  description: z.string(),
  schema_format: AwpToolSchemaFormatSchema.optional(),
  input_schema: z.record(z.unknown()).optional(),
  output_schema: z.record(z.unknown()).optional(),
  runtime: z.enum(["local", "schift", "mcp", "http", "adapter"]).optional(),
  execution: z
    .object({
      mode: AwpToolExecutionModeSchema,
      binding: z.string().optional(),
      timeout_ms: z.number().optional(),
    })
    .optional(),
  approval: AwpToolApprovalSpecSchema.optional(),
  strict: z.boolean().optional(),
  idempotent: z.boolean().optional(),
  side_effect: z.enum(["none", "read", "write", "external"]).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type AwpToolSpec = z.infer<typeof AwpToolSpecSchema>;

export const AwpPolicySpecSchema = z.object({
  code: z
    .object({
      enabled: z.boolean().optional(),
    })
    .optional(),
  egress: z
    .object({
      require_allowlist: z.boolean().optional(),
      allowed_domains: z.array(z.string()).optional(),
    })
    .optional(),
  approvals: z
    .object({
      write_requires_approval: z.boolean().optional(),
      external_requires_approval: z.boolean().optional(),
    })
    .optional(),
  capabilities: z
    .object({
      require_bound_connectors: z.boolean().optional(),
    })
    .optional(),
});
export type AwpPolicySpec = z.infer<typeof AwpPolicySpecSchema>;

export const AwpBlockingIssueSpecSchema = z.object({
  code: z.string(),
  message: z.string(),
  field: z.string().optional(),
});
export type AwpBlockingIssueSpec = z.infer<typeof AwpBlockingIssueSpecSchema>;

export const AwpInputMappingResultSchema = z.object({
  normalized_input: z.record(z.unknown()),
  route_decision: z.object({
    awp_id: z.string(),
    entry_node: z.string(),
    reason: z.string(),
  }),
  validation: z.object({
    passed: z.boolean(),
    blocking_issues: z.array(AwpBlockingIssueSpecSchema),
    assumptions: z.array(z.string()),
  }),
  user_facing_prompt: z
    .object({
      message: z.string(),
      required_fields: z.array(z.string()),
    })
    .optional(),
});
export type AwpInputMappingResult = z.infer<typeof AwpInputMappingResultSchema>;

export const AwpInputRoutingGateSpecSchema = z.object({
  code: z.string(),
  condition: z.string(),
  entry_node: z.string(),
  reason: z.string(),
});
export type AwpInputRoutingGateSpec = z.infer<typeof AwpInputRoutingGateSpecSchema>;

export const AwpInputClampSpecSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
});
export type AwpInputClampSpec = z.infer<typeof AwpInputClampSpecSchema>;

export const AwpInputMappingContractSchema = z.object({
  raw_fields: z.record(AwpFieldSpecSchema).optional(),
  intent_resolution: z
    .object({
      task_kinds: z.array(z.string()).optional(),
      source_modes: z.array(z.string()).optional(),
      passage_modes: z.array(z.string()).optional(),
      missing_inputs: z.array(z.string()).optional(),
      assumptions: z.array(z.string()).optional(),
    })
    .optional(),
  defaults: z.record(z.unknown()).optional(),
  clamps: z.record(AwpInputClampSpecSchema).optional(),
  routing_gates: z.array(AwpInputRoutingGateSpecSchema).optional(),
  blocking_rules: z.array(AwpBlockingIssueSpecSchema).optional(),
  normalized_output: z.object({
    normalized_input: z.record(AwpFieldSpecSchema),
    route_decision: z.object({
      awp_id: z.string().optional(),
      entry_node: z.string(),
      reason: z.string().optional(),
    }),
    validation: z.object({
      blocking_issue_codes: z.array(z.string()).optional(),
      assumptions: z.array(z.string()).optional(),
      user_facing_prompt_fields: z.array(z.string()).optional(),
    }),
  }),
});
export type AwpInputMappingContract = z.infer<typeof AwpInputMappingContractSchema>;

export const AwpQualityContractModeSchema = z.enum(["blocking", "advisory"]);
export type AwpQualityContractMode = z.infer<typeof AwpQualityContractModeSchema>;

export const AwpQualityIssueSeveritySchema = z.enum(["blocker", "warning"]);
export type AwpQualityIssueSeverity = z.infer<typeof AwpQualityIssueSeveritySchema>;

export const AwpRetryPolicySpecSchema = z.object({
  normal_attempts: z.number().optional(),
  agentic_extra_attempts: z.number().optional(),
  retry_input: z
    .enum(["issues_and_suggestions", "failed_artifact", "custom"])
    .optional(),
  no_graph_cycle: z.boolean().optional(),
});
export type AwpRetryPolicySpec = z.infer<typeof AwpRetryPolicySpecSchema>;

export const AwpQualityTargetSpecSchema = z.object({
  artifact: z.string(),
  checks: z.array(z.string()),
});
export type AwpQualityTargetSpec = z.infer<typeof AwpQualityTargetSpecSchema>;

export const AwpQualityContractSchema = z.object({
  mode: AwpQualityContractModeSchema,
  targets: z.array(AwpQualityTargetSpecSchema),
  required_evidence: z.array(z.string()).optional(),
  retry_policy: AwpRetryPolicySpecSchema.optional(),
  result_shape: z
    .object({
      score_required: z.boolean().optional(),
      metrics: z.array(z.string()).optional(),
      blocking_issue_codes: z.array(z.string()).optional(),
      retry_hints_required: z.boolean().optional(),
    })
    .optional(),
});
export type AwpQualityContract = z.infer<typeof AwpQualityContractSchema>;

export const AwpQcResultSchema = z.object({
  passed: z.boolean(),
  score: z.number().nullable(),
  blocking_issues: z.array(
    AwpBlockingIssueSpecSchema.extend({
      severity: AwpQualityIssueSeveritySchema,
      evidence: z.string().optional(),
    }),
  ),
  retry_hints: z.array(
    z.object({
      target_node: z.string(),
      instruction: z.string(),
    }),
  ),
  metrics: z.record(z.union([z.number(), z.boolean(), z.string(), z.null()])),
});
export type AwpQcResult = z.infer<typeof AwpQcResultSchema>;

export const AwpOutputContractSchema = z.object({
  required_fields: z.array(z.string()),
  required_metadata: z.array(z.string()).optional(),
  include_qc_summary: z.boolean().optional(),
  include_usage: z.boolean().optional(),
  include_protocol_metadata: z.boolean().optional(),
  blocking_rules: z.array(AwpBlockingIssueSpecSchema).optional(),
});
export type AwpOutputContract = z.infer<typeof AwpOutputContractSchema>;

export const AwpDataSourceKindSchema = z.enum([
  "api",
  "connector",
  "file",
  "inline",
  "runtime",
]);
export type AwpDataSourceKind = z.infer<typeof AwpDataSourceKindSchema>;

export const AwpHttpMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);
export type AwpHttpMethod = z.infer<typeof AwpHttpMethodSchema>;

export const AwpDataSourceAuthModeSchema = z.enum([
  "none",
  "api_key",
  "bearer",
  "oauth",
  "runtime",
]);
export type AwpDataSourceAuthMode = z.infer<typeof AwpDataSourceAuthModeSchema>;

export const AwpApiDataSourceSpecSchema = z.object({
  endpoint: z.string(),
  method: AwpHttpMethodSchema.optional(),
  headers: z.record(z.string()).optional(),
  query: z.record(z.string()).optional(),
  body_schema: z.record(z.unknown()).optional(),
  auth: AwpDataSourceAuthModeSchema.optional(),
  timeout_ms: z.number().optional(),
});
export type AwpApiDataSourceSpec = z.infer<typeof AwpApiDataSourceSpecSchema>;

export const AwpDataSourceSpecSchema = z.object({
  kind: AwpDataSourceKindSchema,
  description: z.string().optional(),
  schema_format: AwpToolSchemaFormatSchema.optional(),
  input_schema: z.record(z.unknown()).optional(),
  return_schema: z.record(z.unknown()).optional(),
  api: AwpApiDataSourceSpecSchema.optional(),
  cache: z
    .object({
      enabled: z.boolean().optional(),
      ttl_seconds: z.number().optional(),
      key_fields: z.array(z.string()).optional(),
    })
    .optional(),
  maps_to: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type AwpDataSourceSpec = z.infer<typeof AwpDataSourceSpecSchema>;

export const AwpConnectorSpecSchema = z.object({
  kind: z.string(),
  source: z.string(),
  mode: z.enum(["read", "write", "read_write"]).optional(),
  scopes: z.array(z.string()).optional(),
  config: z.record(z.unknown()).optional(),
});
export type AwpConnectorSpec = z.infer<typeof AwpConnectorSpecSchema>;

export const AwpNativeEventSchema = z.enum([
  "run.started",
  "stage.started",
  "stage.completed",
  "step.started",
  "state.updated",
  "model.started",
  "model.output.delta",
  "model.structured_output",
  "reasoning.summary",
  "model.completed",
  "token.usage",
  "cost.observed",
  "quality.observed",
  "tool.call.delta",
  "tool.started",
  "tool.approval.requested",
  "tool.approval.decided",
  "tool.completed",
  "tool.failed",
  "connector.started",
  "connector.completed",
  "audit.requested",
  "audit.decided",
  "artifact.created",
  "step.completed",
  "run.completed",
  "run.failed",
]);
export type AwpNativeEvent = z.infer<typeof AwpNativeEventSchema>;

export const AwpTokenCounterFieldSchema = z.enum([
  "prompt_tokens",
  "completion_tokens",
  "reasoning_tokens",
  "cached_tokens",
  "tool_call_tokens",
  "total_tokens",
]);
export type AwpTokenCounterField = z.infer<typeof AwpTokenCounterFieldSchema>;

export const AwpNativeSpecSchema = z.object({
  token_counter: z
    .object({
      required: z.boolean().optional(),
      fields: z.array(AwpTokenCounterFieldSchema).optional(),
    })
    .optional(),
  logging: z
    .object({
      level: z.enum(["debug", "info", "warn", "error"]).optional(),
      events: z.array(AwpNativeEventSchema).optional(),
    })
    .optional(),
  streaming: z
    .object({
      enabled: z.boolean().optional(),
      persist_deltas: z.boolean().optional(),
      include_text_deltas: z.boolean().optional(),
      include_tool_call_deltas: z.boolean().optional(),
      snapshot_interval_ms: z.number().optional(),
    })
    .optional(),
  structured_output: AwpStructuredOutputSpecSchema.optional(),
  reasoning: z
    .object({
      capture: z
        .enum(["none", "provider_summary", "redacted_trace", "metadata_only"])
        .optional(),
      include_raw_thinking: z.literal(false).optional(),
      summary_required: z.boolean().optional(),
    })
    .optional(),
  audit: z
    .object({
      checkpoints: z
        .array(
          z.object({
            id: z.string(),
            type: z.string(),
            required: z.boolean().optional(),
            metadata: z.record(z.unknown()).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});
export type AwpNativeSpec = z.infer<typeof AwpNativeSpecSchema>;

export const AwpRunStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export type AwpRunStatus = z.infer<typeof AwpRunStatusSchema>;

export const AwpTokenUsageSourceSchema = z.enum([
  "provider",
  "gateway",
  "adapter_estimate",
  "unavailable",
]);
export type AwpTokenUsageSource = z.infer<typeof AwpTokenUsageSourceSchema>;

export const AwpCostObservationSourceSchema = z.enum([
  "provider",
  "gateway",
  "adapter_estimate",
  "billing_export",
  "unavailable",
]);
export type AwpCostObservationSource = z.infer<typeof AwpCostObservationSourceSchema>;

export const AwpQualityObservationSourceSchema = z.enum([
  "provider",
  "gateway",
  "adapter",
  "evaluator",
  "human",
  "unavailable",
]);
export type AwpQualityObservationSource = z.infer<typeof AwpQualityObservationSourceSchema>;

export const AwpQualityObservationKindSchema = z.enum([
  "score",
  "rating",
  "pass_fail",
  "label",
  "metric",
]);
export type AwpQualityObservationKind = z.infer<typeof AwpQualityObservationKindSchema>;

export const AwpToolCallStatusSchema = z.enum([
  "proposed",
  "approval_requested",
  "approved",
  "rejected",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export type AwpToolCallStatus = z.infer<typeof AwpToolCallStatusSchema>;

export const AwpTokenUsageSchema = z.object({
  source: AwpTokenUsageSourceSchema.optional(),
  estimated: z.boolean().optional(),
  prompt_tokens: z.number().optional(),
  completion_tokens: z.number().optional(),
  reasoning_tokens: z.number().optional(),
  cached_tokens: z.number().optional(),
  tool_call_tokens: z.number().optional(),
  total_tokens: z.number().optional(),
});
export type AwpTokenUsage = z.infer<typeof AwpTokenUsageSchema>;

export const AwpCostObservationSchema = z.object({
  source: AwpCostObservationSourceSchema.optional(),
  estimated: z.boolean().optional(),
  currency: z.string().optional(),
  prompt_cost: z.number().optional(),
  completion_cost: z.number().optional(),
  reasoning_cost: z.number().optional(),
  tool_cost: z.number().optional(),
  total_cost: z.number().optional(),
});
export type AwpCostObservation = z.infer<typeof AwpCostObservationSchema>;

export const AwpQualityObservationSchema = z.object({
  source: AwpQualityObservationSourceSchema.optional(),
  kind: AwpQualityObservationKindSchema.optional(),
  metric: z.string(),
  score: z.number().optional(),
  scale_min: z.number().optional(),
  scale_max: z.number().optional(),
  passed: z.boolean().optional(),
  label: z.string().optional(),
  confidence: z.number().optional(),
  evaluator: z.string().optional(),
  notes: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type AwpQualityObservation = z.infer<typeof AwpQualityObservationSchema>;

export const AwpRunEventSchema = z.object({
  run_id: z.string(),
  event_id: z.string(),
  sequence: z.number(),
  timestamp: z.string(),
  type: AwpNativeEventSchema,
  level: z.enum(["debug", "info", "warn", "error"]).optional(),
  template_id: z.string().optional(),
  node_id: z.string().optional(),
  step_id: z.string().optional(),
  tool_call_id: z.string().optional(),
  artifact_id: z.string().optional(),
  duration_ms: z.number().optional(),
  payload: z.record(z.unknown()).optional(),
  usage: AwpTokenUsageSchema.optional(),
  cost: AwpCostObservationSchema.optional(),
  quality: z.array(AwpQualityObservationSchema).optional(),
});
export type AwpRunEvent = z.infer<typeof AwpRunEventSchema>;

export const AwpRunArtifactSchema = z.object({
  artifact_id: z.string(),
  run_id: z.string(),
  node_id: z.string().optional(),
  step_id: z.string().optional(),
  kind: z.enum([
    "intermediate_result",
    "tool_result",
    "audit_decision",
    "state_snapshot",
    "model_request",
    "structured_output",
    "reasoning_summary",
    "stream_snapshot",
    "final_output",
  ]),
  name: z.string(),
  created_at: z.string(),
  payload: z.unknown(),
});
export type AwpRunArtifact = z.infer<typeof AwpRunArtifactSchema>;

export const AwpRunResultSchema = z.object({
  run_id: z.string(),
  template_id: z.string(),
  target: z.string(),
  status: AwpRunStatusSchema,
  started_at: z.string(),
  completed_at: z.string().optional(),
  duration_ms: z.number().optional(),
  events: z.array(AwpRunEventSchema),
  artifacts: z.array(AwpRunArtifactSchema),
  intermediate_results: z.record(z.unknown()),
  outputs: z.record(z.unknown()),
  usage: AwpTokenUsageSchema.optional(),
  cost: AwpCostObservationSchema.optional(),
  quality: z.array(AwpQualityObservationSchema).optional(),
});
export type AwpRunResult = z.infer<typeof AwpRunResultSchema>;

export const AwpToolCallRecordSchema = z.object({
  protocol_call_id: z.string(),
  provider_call_id: z.string().optional(),
  provider_response_id: z.string().optional(),
  provider_item_id: z.string().optional(),
  tool_name: z.string(),
  arguments_json: z.string(),
  status: AwpToolCallStatusSchema,
  approval_state: z
    .enum(["not_required", "pending", "approved", "rejected", "edited"])
    .optional(),
  result_payload: z.unknown().optional(),
  error_payload: z.unknown().optional(),
  is_error: z.boolean().optional(),
  usage: AwpTokenUsageSchema.optional(),
  audit_metadata: z.record(z.unknown()).optional(),
});
export type AwpToolCallRecord = z.infer<typeof AwpToolCallRecordSchema>;

export const AwpNodeTypeSchema = z.enum([
  "chat_trigger",
  "manual_trigger",
  "schedule_trigger",
  "webhook_source",
  "gmail_trigger",
  "notion_trigger",
  "agent",
  "aggregate",
  "tool",
  "connector",
  "code",
  "data_source",
  "validate",
  "guard",
  "qc",
  "router",
  "join",
  "state",
  "human_approval",
  "subworkflow",
  "end",
]);
export type AwpNodeType = z.infer<typeof AwpNodeTypeSchema>;

export const AwpNodeSpecSchema = z.object({
  type: AwpNodeTypeSchema,
  ref: z.string().optional(),
  label: z.string().optional(),
  stage: z.number().optional(),
  parallel_group: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});
export type AwpNodeSpec = z.infer<typeof AwpNodeSpecSchema>;

export const AwpEdgeSpecSchema = z.object({
  from: z.string(),
  to: z.string(),
  condition: z.string().optional(),
  label: z.string().optional(),
});
export type AwpEdgeSpec = z.infer<typeof AwpEdgeSpecSchema>;

export const AwpGraphExecutionSpecSchema = z.object({
  max_concurrency: z.number().optional(),
  stage_policy: z.enum(["auto", "explicit"]).optional(),
  aggregate_policy: z.enum(["all_settled", "fail_fast"]).optional(),
});
export type AwpGraphExecutionSpec = z.infer<typeof AwpGraphExecutionSpecSchema>;

export const AwpCanvasPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type AwpCanvasPosition = z.infer<typeof AwpCanvasPositionSchema>;

export const AwpReactFlowNodeLayoutSchema = z.object({
  position: AwpCanvasPositionSchema,
  width: z.number().optional(),
  height: z.number().optional(),
  source_handles: z.array(z.string()).optional(),
  target_handles: z.array(z.string()).optional(),
  data: z.record(z.unknown()).optional(),
});
export type AwpReactFlowNodeLayout = z.infer<typeof AwpReactFlowNodeLayoutSchema>;

export const AwpReactFlowEdgeLayoutSchema = z.object({
  source_handle: z.string().optional(),
  target_handle: z.string().optional(),
  label: z.string().optional(),
  data: z.record(z.unknown()).optional(),
});
export type AwpReactFlowEdgeLayout = z.infer<typeof AwpReactFlowEdgeLayoutSchema>;

export const AwpReactFlowViewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
});
export type AwpReactFlowViewport = z.infer<typeof AwpReactFlowViewportSchema>;

export const AwpReactFlowLayoutSpecSchema = z.object({
  nodes: z.record(AwpReactFlowNodeLayoutSchema).optional(),
  edges: z.record(AwpReactFlowEdgeLayoutSchema).optional(),
  viewport: AwpReactFlowViewportSchema.optional(),
});
export type AwpReactFlowLayoutSpec = z.infer<typeof AwpReactFlowLayoutSpecSchema>;

export const AwpGraphLayoutSpecSchema = z.object({
  react_flow: AwpReactFlowLayoutSpecSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type AwpGraphLayoutSpec = z.infer<typeof AwpGraphLayoutSpecSchema>;

export const AwpGraphSpecSchema = z.object({
  start: z.string(),
  nodes: z.record(AwpNodeSpecSchema),
  edges: z.array(AwpEdgeSpecSchema),
  execution: AwpGraphExecutionSpecSchema.optional(),
  layout: AwpGraphLayoutSpecSchema.optional(),
});
export type AwpGraphSpec = z.infer<typeof AwpGraphSpecSchema>;

// --- memory (AWP v0.2 proposal, additive to v0.1) ---
// Consumption contract for CCLG/Schift-memory MCP `memory.*` tools, per
// docs/plans/2026-07-10-cclg-schift-memory-coexistence.md S4. The block only
// declares intent (scopes/tools/seed refs/write approvals); the runtime binds
// it to a local (~/.cclg) or cloud (memory_repo) store. Schema/parser/roundtrip
// only validate shape here — container checksum and secret-free (auth-free)
// verification of a seed `.cclg` file happens at install/runtime, not here,
// because that requires filesystem access this package does not perform.

export const AwpMemoryScopeSchema = z.enum(["core", "agent", "session"]);
export type AwpMemoryScope = z.infer<typeof AwpMemoryScopeSchema>;

export const AwpMemoryToolSchema = z.enum([
  "memory.search",
  "memory.pack",
  "memory.add",
  "memory.patch",
  "memory.recall",
  "memory.cite",
  "memory.conflicts",
  "memory.resolve",
]);
export type AwpMemoryTool = z.infer<typeof AwpMemoryToolSchema>;

export const AwpMemoryRequiresSpecSchema = z.object({
  scopes: z.array(AwpMemoryScopeSchema).optional(),
  tools: z.array(AwpMemoryToolSchema).optional(),
});
export type AwpMemoryRequiresSpec = z.infer<typeof AwpMemoryRequiresSpecSchema>;

export const AwpMemorySeedInstallModeSchema = z.enum(["import_pending"]);
export type AwpMemorySeedInstallMode = z.infer<typeof AwpMemorySeedInstallModeSchema>;

const MEMORY_SEED_REF_URL_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

export const AwpMemorySeedSpecSchema = z.object({
  // Package-relative path to a bundled `.cclg` seed container only. Absolute
  // paths and URL schemes are rejected so a pack can never point outside its
  // own bundle at parse time.
  ref: z
    .string()
    .min(1)
    .refine(
      (value) => !value.startsWith("/") && !MEMORY_SEED_REF_URL_SCHEME.test(value),
      {
        message:
          "memory.seed.ref must be a package-relative path (no absolute paths or URL schemes)",
      },
    ),
  install: AwpMemorySeedInstallModeSchema.optional().default("import_pending"),
});
export type AwpMemorySeedSpec = z.infer<typeof AwpMemorySeedSpecSchema>;

export const AwpMemoryWriteSpecSchema = z.object({
  action: AwpMemoryToolSchema,
  approvalRequired: z.boolean().optional().default(true),
});
export type AwpMemoryWriteSpec = z.infer<typeof AwpMemoryWriteSpecSchema>;

export const AwpMemorySpecSchema = z.object({
  requires: AwpMemoryRequiresSpecSchema.optional(),
  seed: z.array(AwpMemorySeedSpecSchema).optional(),
  writes: z.array(AwpMemoryWriteSpecSchema).optional(),
});
export type AwpMemorySpec = z.infer<typeof AwpMemorySpecSchema>;

export const AwpAdapterProjectionStatusSchema = z.enum([
  "direct",
  "requires_runtime",
  "unsupported",
  "planned",
]);
export type AwpAdapterProjectionStatus = z.infer<typeof AwpAdapterProjectionStatusSchema>;

export const AwpAdapterSpecSchema = z
  .object({
    target: z.string().optional(),
    status: AwpAdapterProjectionStatusSchema.optional(),
    runtime: z.enum(["schift", "host", "provider", "reference"]).optional(),
    notes: z.array(z.string()).optional(),
  })
  .catchall(z.unknown());
export type AwpAdapterSpec = z.infer<typeof AwpAdapterSpecSchema>;

export const AwpTemplateSchema = z.object({
  schema: AwpSchemaSchema,
  version: AwpVersionSchema,
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  inputs: z.record(AwpFieldSpecSchema).optional(),
  outputs: z.record(AwpFieldSpecSchema).optional(),
  state: AwpStateSpecSchema.optional(),
  data_sources: z.record(AwpDataSourceSpecSchema).optional(),
  input_mapping_contract: AwpInputMappingContractSchema.optional(),
  quality_contract: AwpQualityContractSchema.optional(),
  output_contract: AwpOutputContractSchema.optional(),
  agents: z.record(AwpAgentSpecSchema),
  tools: z.record(AwpToolSpecSchema).optional(),
  connectors: z.record(AwpConnectorSpecSchema).optional(),
  policies: AwpPolicySpecSchema.optional(),
  tool_calling: z
    .object({
      default_choice: AwpToolChoiceSpecSchema.optional(),
      parallelism: AwpToolParallelismSpecSchema.optional(),
      require_results_for_all_calls: z.boolean().optional(),
      mint_protocol_call_id: z.boolean().optional(),
    })
    .optional(),
  native: AwpNativeSpecSchema.optional(),
  memory: AwpMemorySpecSchema.optional(),
  graph: AwpGraphSpecSchema,
  adapters: z.record(AwpAdapterSpecSchema).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type AwpTemplate = z.infer<typeof AwpTemplateSchema>;

export const AwpDiagnosticSchema = z.object({
  level: z.enum(["error", "warning"]),
  path: z.string(),
  message: z.string(),
});
export type AwpDiagnostic = z.infer<typeof AwpDiagnosticSchema>;

export const AwpValidationResultSchema = z.object({
  valid: z.boolean(),
  diagnostics: z.array(AwpDiagnosticSchema),
});
export type AwpValidationResult = z.infer<typeof AwpValidationResultSchema>;

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
}
