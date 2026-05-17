export const AWP_SCHEMA = "agent-workflow-protocol" as const;
export const AWP_VERSION = "0.1" as const;

export type AwpSchema = typeof AWP_SCHEMA;
export type AwpVersion = typeof AWP_VERSION;

export type AwpScalarType = "string" | "number" | "integer" | "boolean" | "object" | "array";

export interface AwpFieldSpec {
  type: AwpScalarType;
  required?: boolean;
  description?: string;
  default?: unknown;
}

export type AwpStateSpec = Record<string, AwpScalarType | AwpFieldSpec>;

export interface AwpModelRef {
  provider: string;
  name: string;
  temperature?: number;
  max_output_tokens?: number;
}

export interface AwpAgentSpec {
  role: string;
  model?: AwpModelRef;
  instructions?: string;
  tools?: string[];
  connectors?: string[];
  children?: string[];
  max_steps?: number;
  tool_choice?: AwpToolChoiceSpec;
  tool_parallelism?: AwpToolParallelismSpec;
  metadata?: Record<string, unknown>;
}

export type AwpToolSchemaFormat =
  | "json_schema"
  | "openapi_schema"
  | "zod_adapter"
  | "mcp_tool";

export type AwpToolExecutionMode =
  | "host"
  | "client"
  | "server"
  | "mcp"
  | "remote"
  | "manual"
  | "adapter";

export type AwpToolApprovalMode =
  | "none"
  | "always"
  | "conditional"
  | "runtime";

export type AwpToolChoiceMode =
  | "auto"
  | "none"
  | "required"
  | "any"
  | "tool"
  | "validated";

export interface AwpToolChoiceSpec {
  mode: AwpToolChoiceMode;
  tool?: string;
  allowed_tools?: string[];
}

export interface AwpToolParallelismSpec {
  enabled?: boolean;
  max_concurrent?: number;
  return_results_together?: boolean;
}

export interface AwpToolApprovalSpec {
  mode: AwpToolApprovalMode;
  checkpoint?: string;
  condition?: string;
}

export interface AwpToolSpec {
  kind: string;
  description: string;
  schema_format?: AwpToolSchemaFormat;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  runtime?: "local" | "schift" | "mcp" | "http" | "adapter";
  execution?: {
    mode: AwpToolExecutionMode;
    binding?: string;
    timeout_ms?: number;
  };
  approval?: AwpToolApprovalSpec;
  strict?: boolean;
  idempotent?: boolean;
  side_effect?: "none" | "read" | "write" | "external";
  metadata?: Record<string, unknown>;
}

export interface AwpPolicySpec {
  code?: {
    enabled?: boolean;
  };
  egress?: {
    require_allowlist?: boolean;
    allowed_domains?: string[];
  };
  approvals?: {
    write_requires_approval?: boolean;
    external_requires_approval?: boolean;
  };
  capabilities?: {
    require_bound_connectors?: boolean;
  };
}

export interface AwpBlockingIssueSpec {
  code: string;
  message: string;
  field?: string;
}

export interface AwpInputMappingResult {
  normalized_input: Record<string, unknown>;
  route_decision: {
    awp_id: string;
    entry_node: string;
    reason: string;
  };
  validation: {
    passed: boolean;
    blocking_issues: AwpBlockingIssueSpec[];
    assumptions: string[];
  };
  user_facing_prompt?: {
    message: string;
    required_fields: string[];
  };
}

export interface AwpInputRoutingGateSpec {
  code: string;
  condition: string;
  entry_node: string;
  reason: string;
}

export interface AwpInputClampSpec {
  min?: number;
  max?: number;
}

export interface AwpInputMappingContract {
  raw_fields?: Record<string, AwpFieldSpec>;
  intent_resolution?: {
    task_kinds?: string[];
    source_modes?: string[];
    passage_modes?: string[];
    missing_inputs?: string[];
    assumptions?: string[];
  };
  defaults?: Record<string, unknown>;
  clamps?: Record<string, AwpInputClampSpec>;
  routing_gates?: AwpInputRoutingGateSpec[];
  blocking_rules?: AwpBlockingIssueSpec[];
  normalized_output: {
    normalized_input: Record<string, AwpFieldSpec>;
    route_decision: {
      awp_id?: string;
      entry_node: string;
      reason?: string;
    };
    validation: {
      blocking_issue_codes?: string[];
      assumptions?: string[];
      user_facing_prompt_fields?: string[];
    };
  };
}

export type AwpQualityContractMode = "blocking" | "advisory";
export type AwpQualityIssueSeverity = "blocker" | "warning";

export interface AwpRetryPolicySpec {
  normal_attempts?: number;
  agentic_extra_attempts?: number;
  retry_input?: "issues_and_suggestions" | "failed_artifact" | "custom";
  no_graph_cycle?: boolean;
}

export interface AwpQualityTargetSpec {
  artifact: string;
  checks: string[];
}

export interface AwpQualityContract {
  mode: AwpQualityContractMode;
  targets: AwpQualityTargetSpec[];
  required_evidence?: string[];
  retry_policy?: AwpRetryPolicySpec;
  result_shape?: {
    score_required?: boolean;
    metrics?: string[];
    blocking_issue_codes?: string[];
    retry_hints_required?: boolean;
  };
}

export interface AwpQcResult {
  passed: boolean;
  score: number | null;
  blocking_issues: Array<AwpBlockingIssueSpec & {
    severity: AwpQualityIssueSeverity;
    evidence?: string;
  }>;
  retry_hints: Array<{
    target_node: string;
    instruction: string;
  }>;
  metrics: Record<string, number | boolean | string | null>;
}

export interface AwpOutputContract {
  required_fields: string[];
  required_metadata?: string[];
  include_qc_summary?: boolean;
  include_usage?: boolean;
  include_protocol_metadata?: boolean;
  blocking_rules?: AwpBlockingIssueSpec[];
}

export type AwpDataSourceKind = "api" | "connector" | "file" | "inline" | "runtime";
export type AwpHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type AwpDataSourceAuthMode = "none" | "api_key" | "bearer" | "oauth" | "runtime";

export interface AwpApiDataSourceSpec {
  endpoint: string;
  method?: AwpHttpMethod;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body_schema?: Record<string, unknown>;
  auth?: AwpDataSourceAuthMode;
  timeout_ms?: number;
}

export interface AwpDataSourceSpec {
  kind: AwpDataSourceKind;
  description?: string;
  schema_format?: AwpToolSchemaFormat;
  input_schema?: Record<string, unknown>;
  return_schema?: Record<string, unknown>;
  api?: AwpApiDataSourceSpec;
  cache?: {
    enabled?: boolean;
    ttl_seconds?: number;
    key_fields?: string[];
  };
  maps_to?: string[];
  metadata?: Record<string, unknown>;
}

export interface AwpConnectorSpec {
  kind: string;
  source: string;
  mode?: "read" | "write" | "read_write";
  scopes?: string[];
  config?: Record<string, unknown>;
}

export type AwpNativeEvent =
  | "run.started"
  | "stage.started"
  | "stage.completed"
  | "step.started"
  | "state.updated"
  | "model.started"
  | "model.output.delta"
  | "model.structured_output"
  | "reasoning.summary"
  | "model.completed"
  | "token.usage"
  | "cost.observed"
  | "quality.observed"
  | "tool.call.delta"
  | "tool.started"
  | "tool.approval.requested"
  | "tool.approval.decided"
  | "tool.completed"
  | "tool.failed"
  | "connector.started"
  | "connector.completed"
  | "audit.requested"
  | "audit.decided"
  | "artifact.created"
  | "step.completed"
  | "run.completed"
  | "run.failed";

export type AwpTokenCounterField =
  | "prompt_tokens"
  | "completion_tokens"
  | "reasoning_tokens"
  | "cached_tokens"
  | "tool_call_tokens"
  | "total_tokens";

export interface AwpNativeSpec {
  token_counter?: {
    required?: boolean;
    fields?: AwpTokenCounterField[];
  };
  logging?: {
    level?: "debug" | "info" | "warn" | "error";
    events?: AwpNativeEvent[];
  };
  streaming?: {
    enabled?: boolean;
    persist_deltas?: boolean;
    include_text_deltas?: boolean;
    include_tool_call_deltas?: boolean;
    snapshot_interval_ms?: number;
  };
  structured_output?: {
    required?: boolean;
    mode?: "json_schema" | "tool_result" | "adapter";
    schema?: Record<string, unknown>;
  };
  reasoning?: {
    capture?: "none" | "provider_summary" | "redacted_trace" | "metadata_only";
    include_raw_thinking?: false;
    summary_required?: boolean;
  };
  audit?: {
    checkpoints?: Array<{
      id: string;
      type: string;
      required?: boolean;
      metadata?: Record<string, unknown>;
    }>;
  };
}

export type AwpRunStatus = "running" | "completed" | "failed" | "cancelled";
export type AwpTokenUsageSource = "provider" | "gateway" | "adapter_estimate" | "unavailable";
export type AwpCostObservationSource =
  | "provider"
  | "gateway"
  | "adapter_estimate"
  | "billing_export"
  | "unavailable";
export type AwpQualityObservationSource =
  | "provider"
  | "gateway"
  | "adapter"
  | "evaluator"
  | "human"
  | "unavailable";
export type AwpQualityObservationKind =
  | "score"
  | "rating"
  | "pass_fail"
  | "label"
  | "metric";

export type AwpToolCallStatus =
  | "proposed"
  | "approval_requested"
  | "approved"
  | "rejected"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface AwpTokenUsage {
  source?: AwpTokenUsageSource;
  estimated?: boolean;
  prompt_tokens?: number;
  completion_tokens?: number;
  reasoning_tokens?: number;
  cached_tokens?: number;
  tool_call_tokens?: number;
  total_tokens?: number;
}

export interface AwpCostObservation {
  source?: AwpCostObservationSource;
  estimated?: boolean;
  currency?: string;
  prompt_cost?: number;
  completion_cost?: number;
  reasoning_cost?: number;
  tool_cost?: number;
  total_cost?: number;
}

export interface AwpQualityObservation {
  source?: AwpQualityObservationSource;
  kind?: AwpQualityObservationKind;
  metric: string;
  score?: number;
  scale_min?: number;
  scale_max?: number;
  passed?: boolean;
  label?: string;
  confidence?: number;
  evaluator?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface AwpRunEvent {
  run_id: string;
  event_id: string;
  sequence: number;
  timestamp: string;
  type: AwpNativeEvent;
  level?: "debug" | "info" | "warn" | "error";
  template_id?: string;
  node_id?: string;
  step_id?: string;
  tool_call_id?: string;
  artifact_id?: string;
  duration_ms?: number;
  payload?: Record<string, unknown>;
  usage?: AwpTokenUsage;
  cost?: AwpCostObservation;
  quality?: AwpQualityObservation[];
}

export interface AwpRunArtifact {
  artifact_id: string;
  run_id: string;
  node_id?: string;
  step_id?: string;
  kind:
    | "intermediate_result"
    | "tool_result"
    | "audit_decision"
    | "state_snapshot"
    | "structured_output"
    | "reasoning_summary"
    | "stream_snapshot"
    | "final_output";
  name: string;
  created_at: string;
  payload: unknown;
}

export interface AwpRunResult {
  run_id: string;
  template_id: string;
  target: string;
  status: AwpRunStatus;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  events: AwpRunEvent[];
  artifacts: AwpRunArtifact[];
  intermediate_results: Record<string, unknown>;
  outputs: Record<string, unknown>;
  usage?: AwpTokenUsage;
  cost?: AwpCostObservation;
  quality?: AwpQualityObservation[];
}

export interface AwpToolCallRecord {
  protocol_call_id: string;
  provider_call_id?: string;
  provider_response_id?: string;
  provider_item_id?: string;
  tool_name: string;
  arguments_json: string;
  status: AwpToolCallStatus;
  approval_state?: "not_required" | "pending" | "approved" | "rejected" | "edited";
  result_payload?: unknown;
  error_payload?: unknown;
  is_error?: boolean;
  usage?: AwpTokenUsage;
  audit_metadata?: Record<string, unknown>;
}

export type AwpNodeType =
  | "agent"
  | "aggregate"
  | "tool"
  | "connector"
  | "code"
  | "data_source"
  | "validate"
  | "guard"
  | "qc"
  | "router"
  | "join"
  | "state"
  | "human_approval"
  | "subworkflow"
  | "end";

export interface AwpNodeSpec {
  type: AwpNodeType;
  ref?: string;
  label?: string;
  stage?: number;
  parallel_group?: string;
  config?: Record<string, unknown>;
}

export interface AwpEdgeSpec {
  from: string;
  to: string;
  condition?: string;
  label?: string;
}

export interface AwpGraphExecutionSpec {
  max_concurrency?: number;
  stage_policy?: "auto" | "explicit";
  aggregate_policy?: "all_settled" | "fail_fast";
}

export interface AwpGraphSpec {
  start: string;
  nodes: Record<string, AwpNodeSpec>;
  edges: AwpEdgeSpec[];
  execution?: AwpGraphExecutionSpec;
}

export interface AwpTemplate {
  schema: AwpSchema;
  version: AwpVersion;
  id: string;
  name: string;
  description?: string;
  inputs?: Record<string, AwpFieldSpec>;
  outputs?: Record<string, AwpFieldSpec>;
  state?: AwpStateSpec;
  data_sources?: Record<string, AwpDataSourceSpec>;
  input_mapping_contract?: AwpInputMappingContract;
  quality_contract?: AwpQualityContract;
  output_contract?: AwpOutputContract;
  agents: Record<string, AwpAgentSpec>;
  tools?: Record<string, AwpToolSpec>;
  connectors?: Record<string, AwpConnectorSpec>;
  policies?: AwpPolicySpec;
  tool_calling?: {
    default_choice?: AwpToolChoiceSpec;
    parallelism?: AwpToolParallelismSpec;
    require_results_for_all_calls?: boolean;
    mint_protocol_call_id?: boolean;
  };
  native?: AwpNativeSpec;
  graph: AwpGraphSpec;
  adapters?: Record<string, AwpAdapterSpec>;
  metadata?: Record<string, unknown>;
}

export type AwpAdapterProjectionStatus =
  | "direct"
  | "requires_runtime"
  | "unsupported"
  | "planned";

export interface AwpAdapterSpec {
  target?: string;
  status?: AwpAdapterProjectionStatus;
  runtime?: "schift" | "host" | "provider" | "reference";
  notes?: string[];
  [key: string]: unknown;
}

export interface AwpDiagnostic {
  level: "error" | "warning";
  path: string;
  message: string;
}

export interface AwpValidationResult {
  valid: boolean;
  diagnostics: AwpDiagnostic[];
}
