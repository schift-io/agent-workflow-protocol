import {
  AWP_SCHEMA,
  AWP_VERSION,
  type AwpBlockingIssueSpec,
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
  const dataSourceIds = new Set(Object.keys(template.data_sources ?? {}));

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
  validateDataSources(template, diagnostics);
  validatePolicies(template, diagnostics);
  validateNative(template, diagnostics);
  validateContracts(template, diagnostics);
  validateGraph(template, agentIds, toolIds, connectorIds, dataSourceIds, diagnostics);

  return {
    valid: diagnostics.every((diagnostic) => diagnostic.level !== "error"),
    diagnostics,
  };
}

function validateDataSources(template: AwpTemplate, diagnostics: AwpDiagnostic[]): void {
  for (const [sourceId, source] of Object.entries(template.data_sources ?? {})) {
    if (source.kind === "api") {
      if (!source.api?.endpoint) {
        diagnostics.push({
          level: "error",
          path: `data_sources.${sourceId}.api.endpoint`,
          message: "API data sources must declare an endpoint",
        });
      }
      if (!source.return_schema) {
        diagnostics.push({
          level: "error",
          path: `data_sources.${sourceId}.return_schema`,
          message: "API data sources must declare a return schema",
        });
      }
    }

    if (source.api?.timeout_ms !== undefined && source.api.timeout_ms <= 0) {
      diagnostics.push({
        level: "error",
        path: `data_sources.${sourceId}.api.timeout_ms`,
        message: "API data source timeout must be greater than zero",
      });
    }

    if (source.cache?.ttl_seconds !== undefined && source.cache.ttl_seconds < 0) {
      diagnostics.push({
        level: "error",
        path: `data_sources.${sourceId}.cache.ttl_seconds`,
        message: "Data source cache ttl must be non-negative",
      });
    }
  }
}

function validateContracts(template: AwpTemplate, diagnostics: AwpDiagnostic[]): void {
  const nodeIds = new Set(Object.keys(template.graph?.nodes ?? {}));

  validateInputMappingContract(template, nodeIds, diagnostics);
  validateQualityContract(template, diagnostics);
  validateOutputContract(template, diagnostics);
}

function validateInputMappingContract(
  template: AwpTemplate,
  nodeIds: Set<string>,
  diagnostics: AwpDiagnostic[],
): void {
  const contract = template.input_mapping_contract;
  if (!contract) {
    return;
  }

  if (!contract.normalized_output) {
    diagnostics.push({
      level: "error",
      path: "input_mapping_contract.normalized_output",
      message: "Input mapping contracts must define normalized output expectations",
    });
    return;
  }

  if (!contract.normalized_output.route_decision?.entry_node) {
    diagnostics.push({
      level: "error",
      path: "input_mapping_contract.normalized_output.route_decision.entry_node",
      message: "Input mapping route decisions must name an entry node",
    });
  } else if (
    nodeIds.size > 0 &&
    !nodeIds.has(contract.normalized_output.route_decision.entry_node)
  ) {
    diagnostics.push({
      level: "error",
      path: "input_mapping_contract.normalized_output.route_decision.entry_node",
      message: `Unknown input mapping entry node '${contract.normalized_output.route_decision.entry_node}'`,
    });
  }

  for (const [index, gate] of (contract.routing_gates ?? []).entries()) {
    validateIssueCode(`input_mapping_contract.routing_gates.${index}.code`, gate.code, diagnostics);
    if (!gate.condition) {
      diagnostics.push({
        level: "error",
        path: `input_mapping_contract.routing_gates.${index}.condition`,
        message: "Input routing gates must include a condition",
      });
    }
    if (!gate.entry_node) {
      diagnostics.push({
        level: "error",
        path: `input_mapping_contract.routing_gates.${index}.entry_node`,
        message: "Input routing gates must name an entry node",
      });
    } else if (nodeIds.size > 0 && !nodeIds.has(gate.entry_node)) {
      diagnostics.push({
        level: "error",
        path: `input_mapping_contract.routing_gates.${index}.entry_node`,
        message: `Unknown input routing entry node '${gate.entry_node}'`,
      });
    }
  }

  for (const [index, rule] of (contract.blocking_rules ?? []).entries()) {
    validateBlockingIssue(`input_mapping_contract.blocking_rules.${index}`, rule, diagnostics);
  }

  for (const [field, clamp] of Object.entries(contract.clamps ?? {})) {
    if (
      typeof clamp.min === "number" &&
      typeof clamp.max === "number" &&
      clamp.min > clamp.max
    ) {
      diagnostics.push({
        level: "error",
        path: `input_mapping_contract.clamps.${field}`,
        message: "Input clamp min must be less than or equal to max",
      });
    }
  }
}

function validateQualityContract(template: AwpTemplate, diagnostics: AwpDiagnostic[]): void {
  const contract = template.quality_contract;
  if (!contract) {
    return;
  }

  if (!contract.mode) {
    diagnostics.push({
      level: "error",
      path: "quality_contract.mode",
      message: "Quality contracts must set mode",
    });
  }

  if (!Array.isArray(contract.targets) || contract.targets.length === 0) {
    diagnostics.push({
      level: "error",
      path: "quality_contract.targets",
      message: "Quality contracts must name at least one artifact target",
    });
  }

  for (const [index, target] of (contract.targets ?? []).entries()) {
    if (!target.artifact) {
      diagnostics.push({
        level: "error",
        path: `quality_contract.targets.${index}.artifact`,
        message: "Quality target artifact is required",
      });
    }
    if (!Array.isArray(target.checks) || target.checks.length === 0) {
      diagnostics.push({
        level: "error",
        path: `quality_contract.targets.${index}.checks`,
        message: "Quality targets must declare at least one check",
      });
    }
  }

  for (const [index, code] of (contract.result_shape?.blocking_issue_codes ?? []).entries()) {
    validateIssueCode(
      `quality_contract.result_shape.blocking_issue_codes.${index}`,
      code,
      diagnostics,
    );
  }

  const retryPolicy = contract.retry_policy;
  if (retryPolicy) {
    if (retryPolicy.no_graph_cycle !== true) {
      diagnostics.push({
        level: "error",
        path: "quality_contract.retry_policy.no_graph_cycle",
        message: "Retry policy must be explicit metadata and must not introduce graph cycles",
      });
    }
    validateNonNegativeInteger(
      "quality_contract.retry_policy.normal_attempts",
      retryPolicy.normal_attempts,
      diagnostics,
    );
    validateNonNegativeInteger(
      "quality_contract.retry_policy.agentic_extra_attempts",
      retryPolicy.agentic_extra_attempts,
      diagnostics,
    );
  }
}

function validateOutputContract(template: AwpTemplate, diagnostics: AwpDiagnostic[]): void {
  const contract = template.output_contract;
  if (!contract) {
    return;
  }

  if (!Array.isArray(contract.required_fields) || contract.required_fields.length === 0) {
    diagnostics.push({
      level: "error",
      path: "output_contract.required_fields",
      message: "Output contracts must declare at least one required field",
    });
  }

  const outputFields = new Set(Object.keys(template.outputs ?? {}));
  for (const [index, field] of (contract.required_fields ?? []).entries()) {
    if (!field) {
      diagnostics.push({
        level: "error",
        path: `output_contract.required_fields.${index}`,
        message: "Output contract required field must be non-empty",
      });
    } else if (outputFields.size > 0 && !outputFields.has(field)) {
      diagnostics.push({
        level: "error",
        path: `output_contract.required_fields.${index}`,
        message: `Output contract references undeclared output field '${field}'`,
      });
    }
  }

  for (const [index, rule] of (contract.blocking_rules ?? []).entries()) {
    validateBlockingIssue(`output_contract.blocking_rules.${index}`, rule, diagnostics);
  }
}

function validateBlockingIssue(
  path: string,
  issue: AwpBlockingIssueSpec,
  diagnostics: AwpDiagnostic[],
): void {
  validateIssueCode(`${path}.code`, issue.code, diagnostics);
  if (!issue.message) {
    diagnostics.push({
      level: "error",
      path: `${path}.message`,
      message: "Blocking issue must include a user-facing message",
    });
  }
}

function validateIssueCode(path: string, code: string | undefined, diagnostics: AwpDiagnostic[]): void {
  if (!code || !/^[a-z][a-z0-9_.-]*$/.test(code)) {
    diagnostics.push({
      level: "error",
      path,
      message: "Issue codes must be stable lowercase identifiers",
    });
  }
}

function validateNonNegativeInteger(
  path: string,
  value: number | undefined,
  diagnostics: AwpDiagnostic[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Number.isInteger(value) || value < 0) {
    diagnostics.push({
      level: "error",
      path,
      message: "Retry attempt counts must be non-negative integers",
    });
  }
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

function validatePolicies(template: AwpTemplate, diagnostics: AwpDiagnostic[]): void {
  const allowedDomains = new Set(template.policies?.egress?.allowed_domains ?? []);
  for (const [toolId, tool] of Object.entries(template.tools ?? {})) {
    if (
      template.policies?.approvals?.write_requires_approval === true &&
      tool.side_effect === "write" &&
      (!tool.approval || tool.approval.mode === "none")
    ) {
      diagnostics.push({
        level: "error",
        path: `tools.${toolId}.approval.mode`,
        message: "Write tools require approval by policy",
      });
    }

    if (
      template.policies?.approvals?.external_requires_approval === true &&
      tool.side_effect === "external" &&
      (!tool.approval || tool.approval.mode === "none")
    ) {
      diagnostics.push({
        level: "error",
        path: `tools.${toolId}.approval.mode`,
        message: "External side-effect tools require approval by policy",
      });
    }

    if (template.policies?.egress?.require_allowlist === true) {
      const binding = tool.execution?.binding;
      if (typeof binding === "string") {
        const domain = domainOf(binding);
        if (domain && !allowedDomains.has(domain)) {
          diagnostics.push({
            level: "error",
            path: `tools.${toolId}.execution.binding`,
            message: `External egress domain is not allowlisted: ${domain}`,
          });
        }
      }
    }
  }
}

function domainOf(value: string): string | undefined {
  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
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
  dataSourceIds: Set<string>,
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
    if (node.type === "data_source" && node.ref && !dataSourceIds.has(node.ref)) {
      diagnostics.push({
        level: "error",
        path: `graph.nodes.${nodeId}.ref`,
        message: `Unknown data source '${node.ref}'`,
      });
    }
    if (node.type === "code" && template.policies?.code?.enabled === false) {
      diagnostics.push({
        level: "error",
        path: `graph.nodes.${nodeId}.type`,
        message: "Code nodes are disabled by policy",
      });
    }
    if (node.stage !== undefined && (!Number.isInteger(node.stage) || node.stage < 0)) {
      diagnostics.push({
        level: "error",
        path: `graph.nodes.${nodeId}.stage`,
        message: "Node stage must be a non-negative integer",
      });
    }
    if (node.parallel_group !== undefined && node.parallel_group.length === 0) {
      diagnostics.push({
        level: "error",
        path: `graph.nodes.${nodeId}.parallel_group`,
        message: "Parallel group must be non-empty when provided",
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
      const sourceStage = graph.nodes[edge.from]?.stage;
      const targetStage = graph.nodes[edge.to]?.stage;
      if (
        sourceStage !== undefined &&
        targetStage !== undefined &&
        sourceStage >= targetStage
      ) {
        diagnostics.push({
          level: "error",
          path: `graph.edges.${index}`,
          message: "Explicit node stages must increase across graph edges",
        });
      }
    }
  }

  if (graph.execution?.max_concurrency !== undefined) {
    const maxConcurrency = graph.execution.max_concurrency;
    if (!Number.isInteger(maxConcurrency) || maxConcurrency <= 0) {
      diagnostics.push({
        level: "error",
        path: "graph.execution.max_concurrency",
        message: "Graph max_concurrency must be a positive integer",
      });
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

  for (const [nodeId, node] of Object.entries(graph.nodes ?? {})) {
    if (node.type !== "join" && node.type !== "aggregate") {
      continue;
    }
    const inboundCount = (graph.edges ?? []).filter((edge) => edge.to === nodeId).length;
    if (inboundCount < 2) {
      diagnostics.push({
        level: "warning",
        path: `graph.nodes.${nodeId}`,
        message: "Join and aggregate nodes are most useful with two or more inbound edges",
      });
    }
    const mode = node.config?.mode;
    if (
      mode !== undefined &&
      typeof mode === "string" &&
      !["all_settled", "qc_report", "merge", "first_success"].includes(mode)
    ) {
      diagnostics.push({
        level: "warning",
        path: `graph.nodes.${nodeId}.config.mode`,
        message: "Aggregate mode is not a standard portable mode",
      });
    }
  }
}
