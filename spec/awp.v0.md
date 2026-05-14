# AWP v0.1 Draft

AWP v0.1 is a draft protocol for YAML-authored agent workflow templates.

## Required Top-Level Fields

| Field | Type | Purpose |
| --- | --- | --- |
| `schema` | string | Must be `agent-workflow-protocol`. |
| `version` | string | Current draft is `0.1`. |
| `id` | string | Stable template id. |
| `name` | string | Human-readable template name. |
| `agents` | map | Agent definitions. |
| `graph` | object | Runtime-neutral execution topology. |

## Core Objects

- `inputs`: named input fields.
- `outputs`: named output fields.
- `state`: shared run state keys and scalar types.
- `agents`: role, model, instructions, tools, connectors, child agents, and caps.
- `tools`: named callable tools with JSON Schema-compatible input/output schemas.
- `connectors`: named data/service connectors with read/write mode and scopes.
- `policies`: portable safety gates for code execution, outbound egress,
  approvals, and bound capabilities.
- `native`: token counter, logging, trace, and audit requirements.
- `tool_calling`: model-level tool-choice, parallelism, result-correlation, and
  tool-result completeness policy.
- `graph`: nodes and edges. Nodes reference agents, tools, connectors, routers,
  joins, human approvals, subworkflows, or end states.
- `adapters`: runtime-specific hints. These are optional and must not be needed
  to understand the core graph.

## Native Evidence Contract

Runtimes that claim native AWP support should emit comparable events:

- `run.started`
- `step.started`
- `state.updated`
- `model.started`
- `model.output.delta`
- `model.structured_output`
- `reasoning.summary`
- `model.completed`
- `token.usage`
- `cost.observed`
- `quality.observed`
- `tool.call.delta`
- `tool.started`
- `tool.completed`
- `connector.started`
- `connector.completed`
- `audit.requested`
- `audit.decided`
- `step.completed`
- `run.completed`
- `run.failed`

Token counters should use the same field names across runtimes:

- `prompt_tokens`
- `completion_tokens`
- `reasoning_tokens`
- `cached_tokens`
- `tool_call_tokens`
- `total_tokens`

Completed events should include `duration_ms` when the runtime can measure it.
Model events should include provider/name settings and provider response ids when
available.

Cost and quality observations are optional. When present, runtimes should emit
`cost.observed` or `quality.observed` events and carry aggregate observations on
the completed run result. Provider or gateway values should be marked by source;
host-calculated pricing must use `adapter_estimate` with `estimated: true`.
Portable quality metric names should be runtime-neutral, for example
`faithfulness`, `schema_validity`, `distractor_quality`, `human_rating`, or
`latency_slo`.

Structured outputs should be persisted as `structured_output` artifacts.
Reasoning evidence should use provider summaries, redacted traces, or metadata;
hidden raw chain-of-thought is not an AWP log artifact.

## Tool Calling Contract

Every tool call must be represented as an AWP tool-call record with a
runtime-minted `protocol_call_id`. Provider ids such as OpenAI `call_id` or
Anthropic `tool_use.id` should be preserved as `provider_call_id`, but provider
ids are not sufficient for protocol-level correlation.

Tool declarations should include:

- `kind`
- `description`
- `schema_format`
- `input_schema`
- `output_schema` when known
- `execution.mode`
- `approval.mode`
- `strict`
- `side_effect`
- `idempotent`

Adapters must explicitly represent skipped, rejected, failed, and completed tool
calls. Missing tool results are not valid successful execution.

## Adapter Expectations

Adapters must classify every target mapping explicitly:

- `direct`: the target SDK/runtime can execute the AWP subset without hiding
  graph, tool, approval, or policy semantics.
- `requires_runtime`: the target needs a host runtime such as Schift to enforce
  retrieval bindings, approvals, writes, webhook delivery, secrets, or
  multi-step dataflow.
- `unsupported`: the template violates a target-visible policy or cannot be
  represented without changing behavior.
- `planned`: the mapping is part of the protocol roadmap but not implemented by
  the adapter yet.

LangGraph adapters should compile `graph.nodes` and `graph.edges` into a
`StateGraph`, use subgraphs for `subworkflow`, and require a checkpointer when
`native.audit` or `human_approval` nodes are present.

Vercel AI SDK adapters should compile agent tool surfaces into `tool(...)`
definitions and bounded multi-step calls using `generateText` or `streamText`.

Schift adapters should map the template into managed-agent or hosted-workflow
objects while preserving the AWP id, version, graph node ids, and native evidence
settings.

Schift Workflow v2 is the native managed-workflow target for AWP in Schift. It
may use internal block names such as source query, webhook source, human
approval, source write, outbound webhook, subworkflow, and code internally, but
public YAML examples should be expressed as AWP agents, tools, connectors,
policies, graph nodes, and adapter statuses.

The conformance examples in `examples/conformance/*.awp.yaml` are the public
contract set for adapter behavior. They cover simple LLM calls, structured
output, tool calling, retrieval plus answer, approval-gated writes, outbound
webhook allowlists, streaming, multi-step graphs, subworkflows, and
policy-disabled code.
