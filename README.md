# Agent Workflow Protocol

**AWP** is a YAML-first protocol for portable agent workflows.

Write an agent workflow once as `.awp.yaml`, then compile it into runtime-specific
targets such as Schift, LangGraph, Vercel AI SDK, OpenAI Responses/Agents,
Anthropic Messages, Gemini Function Calling, or MCP tool surfaces.

```yaml
schema: agent-workflow-protocol
version: "0.1"
id: research-router
name: Research router
```

## Status

AWP v0.1 is a draft contract.

Compatibility has been checked at the **protocol and documentation level** against
the official SDK/runtime surfaces listed below. Runtime adapters are not shipped
yet, so this repo currently proves the shared YAML shape, schema, parser,
validator, supported-target metadata, and SDK mapping rules.

| Area | Status |
| --- | --- |
| YAML schema | Implemented |
| TypeScript contract types | Implemented |
| Parser / serializer | Implemented |
| Structural validation | Implemented |
| Tool-calling normalization spec | Implemented |
| Native token/log/audit evidence spec | Implemented |
| Runtime adapters | Planned |
| Reference runner | Implemented |

The public conformance YAML set lives in `examples/conformance/*.awp.yaml`.
Schift Workflow v2 is the Schift-native managed-workflow target for these AWP
templates; internal Schift block names are implementation details, not the
public YAML contract.

## Why AWP Exists

Agent frameworks all describe similar ideas with different shapes:

- agents and roles
- model settings
- tools and function calling
- connectors and external context
- graph topology or step loops
- approval and human review
- token accounting, logging, and audit traces

AWP makes those concepts explicit in one neutral contract. The protocol is the
source of truth; SDK adapters are compilation targets.

## Compatibility Matrix

| Target | Support level | Contract status | Adapter target |
| --- | --- | --- | --- |
| Schift API and UI | Full workflow | Native target | Managed agents, hosted workflows, dashboard builder state |
| LangGraph Python | Full workflow | Mapped | `StateGraph`, nodes, edges, conditional routing, subgraphs, checkpointers |
| LangGraph JS | Full workflow | Mapped | `StateGraph`, stream/custom events, persistence, interrupts |
| Vercel AI SDK | Full workflow | Mapped | `generateText`, `streamText`, `tool(...)`, bounded step loops |
| OpenAI Responses / Agents SDK | Tool surface | Mapped | Function tools, built-in tools, MCP tools, host-side approval |
| Anthropic Messages | Tool surface | Mapped | Claude tools, `tool_use`, `tool_result`, streaming content blocks |
| Gemini Function Calling | Tool surface | Mapped | Function declarations, function response parts, safety and usage metadata |
| MCP tools | Connector surface | Mapped | MCP tool list/call schema and server capability surfaces |

Machine-readable target metadata is exported as `SUPPORTED_SDK_TARGETS`.

## Core Guarantees

### YAML Is Canonical

AWP templates are authored as `.awp.yaml`. Generated JSON or SDK objects are
adapter outputs, not the canonical source.

### Adapter Projection Is Explicit

Every adapter target should classify a template before execution:

- `direct`: the target can run the AWP subset without hiding semantics.
- `requires_runtime`: a host runtime such as Schift must enforce bindings,
  approvals, writes, webhooks, secrets, or multi-step dataflow.
- `unsupported`: the template violates policy or cannot be represented safely.

The conformance examples cover simple LLM calls, structured output, tool calls,
retrieval, approval-gated writes, outbound webhook allowlists, streaming,
multi-step graphs, subworkflows, and policy-disabled code.

### Tool Calls Have Stable IDs

Every tool call gets an AWP-owned `protocol_call_id`.

Provider ids are preserved as metadata:

- OpenAI `call_id`
- Anthropic `tool_use.id`
- Gemini response/function metadata
- LangGraph or Vercel runtime ids

The AWP id is the audit and correlation key across all targets.

### Native Evidence Is Part Of The Protocol

AWP does not treat observability as an afterthought. Templates can require:

- token counters
- structured run logs
- model identity and per-step duration
- tool-call records
- streaming deltas
- structured output artifacts
- provider-exposed reasoning summaries
- approval events
- intermediate audit checkpoints

This lets Schift, LangGraph, and Vercel AI SDK runs produce comparable evidence.
AWP does not require or permit storing hidden raw chain-of-thought; adapters log
reasoning summaries, token metadata, or redacted traces only when the provider
or host runtime exposes them.

## Quick Start

Install AWP in a TypeScript or Node.js project:

```bash
npm install @schift-io/agent-workflow-protocol
```

```bash
npm install
npm test
```

```ts
import {
  parseAwpYaml,
  stringifyAwpYaml,
  validateAwpTemplate,
  SUPPORTED_SDK_TARGETS,
} from "@schift-io/agent-workflow-protocol";
```

```ts
const template = parseAwpYaml(source);
const result = validateAwpTemplate(template);

if (!result.valid) {
  console.error(result.diagnostics);
}
```

## Run A Template

The first executable target is the **reference runner**. It does not call real
models or tools. It walks the graph and writes the standard run evidence that
real adapters must also produce.

Validate a template from an installed package:

```bash
npx @schift-io/agent-workflow-protocol validate ./workflow.awp.yaml
```

Or run the repository build directly while developing AWP:

```bash
npm run build
node dist/cli.js run examples/research-router.awp.yaml \
  --target reference \
  --input '{"query":"How should logs work?"}'
```

Output:

```text
run_id: awp_run_...
status: completed
events: <count>
artifacts: <count>
log: .awp-runs/<run_id>/events.jsonl
summary: .awp-runs/<run_id>/run.json
```

The run directory contains:

```text
.awp-runs/<run_id>/
├── run.json
├── events.jsonl
├── artifacts.json
└── intermediate-results.json
```

`events.jsonl` includes lifecycle, model, streaming, tool, token, audit, and
duration events. `artifacts.json` includes intermediate results, normalized tool
results, structured outputs, reasoning summaries, audit decisions, and the final
output. This is the debugging surface Schift API/UI and SDK adapters should read
instead of scraping provider-specific logs.

## Minimal Template

```yaml
schema: agent-workflow-protocol
version: "0.1"
id: support-triage
name: Support triage

inputs:
  ticket:
    type: string
    required: true

state:
  ticket: string
  answer: string

agents:
  triage:
    role: support-triage
    model:
      provider: openai
      name: gpt-4.1-mini
    tools: [memory.search]
    max_steps: 6

tools:
  memory.search:
    kind: schift.memory.search
    description: Search connected Schift memory.
    schema_format: json_schema
    strict: true
    side_effect: read
    idempotent: true
    runtime: schift
    execution:
      mode: server
      binding: schift.memory.search
      timeout_ms: 10000
    approval:
      mode: none
    input_schema:
      type: object
      additionalProperties: false
      required: [query]
      properties:
        query:
          type: string

tool_calling:
  default_choice:
    mode: auto
    allowed_tools: [memory.search]
  parallelism:
    enabled: true
    max_concurrent: 4
    return_results_together: true
  require_results_for_all_calls: true
  mint_protocol_call_id: true

native:
  token_counter:
    required: true
    fields:
      - prompt_tokens
      - completion_tokens
      - reasoning_tokens
      - cached_tokens
      - tool_call_tokens
      - total_tokens
  logging:
    level: info
    events:
      - run.started
      - step.started
      - model.started
      - model.output.delta
      - model.structured_output
      - reasoning.summary
      - model.completed
      - token.usage
      - tool.call.delta
      - tool.started
      - tool.completed
      - run.completed
      - run.failed
  streaming:
    enabled: true
    persist_deltas: true
    include_text_deltas: true
    include_tool_call_deltas: true
  structured_output:
    required: true
    mode: adapter
  reasoning:
    capture: provider_summary
    include_raw_thinking: false
    summary_required: true
  audit:
    checkpoints:
      - id: before_final_answer
        type: pre_response
        required: true

graph:
  start: triage
  nodes:
    triage:
      type: agent
      ref: triage
    done:
      type: end
  edges:
    - from: triage
      to: done
```

See [examples/research-router.awp.yaml](./examples/research-router.awp.yaml) for
a fuller graph with parallel specialist branches and audit checkpoints.

## Tool Calling Model

AWP standardizes the full tool lifecycle.

| Layer | AWP field / event | Purpose |
| --- | --- | --- |
| Declaration | `tools.*` | Stable tool identity, schema, runtime, side effects, approval policy |
| Choice | `tool_calling.default_choice` | Model-level tool-choice policy |
| Parallelism | `tool_calling.parallelism` | Concurrency and result-buffering policy |
| Correlation | `protocol_call_id` | Runtime-neutral call id for logs, replay, and audit |
| Streaming | `tool.call.delta` | Partial arguments or incremental tool-call data |
| Approval | `tool.approval.requested`, `tool.approval.decided` | Host/runtime approval before side effects |
| Execution | `tool.started`, `tool.completed`, `tool.failed` | Tool execution evidence |
| Accounting | `AwpTokenUsage` | Provider-exposed token counters, never fabricated |

Detailed rules are in [docs/tool-calling.md](./docs/tool-calling.md).

## Repository Map

```text
.
├── docs/
│   ├── sdk-mapping.md
│   ├── schift-workflow-v2-target.md
│   └── tool-calling.md
├── examples/
│   └── research-router.awp.yaml
├── schemas/
│   └── awp.v0.schema.json
├── spec/
│   └── awp.v0.md
├── src/
│   ├── index.ts
│   ├── supported-sdks.ts
│   ├── types.ts
│   ├── validate.ts
│   └── yaml.ts
└── test/
    └── awp.test.mjs
```

## Design Docs

- [AWP v0.1 draft](./spec/awp.v0.md)
- [Tool calling protocol](./docs/tool-calling.md)
- [SDK mapping](./docs/sdk-mapping.md)
- [Run logging](./docs/run-logging.md)
- [Schift Workflow v2 target](./docs/schift-workflow-v2-target.md)

## Roadmap

1. Add adapter test fixtures for every supported target.
2. Implement `@schift-io/awp-langgraph`.
3. Implement `@schift-io/awp-vercel-ai-sdk`.
4. Add OpenAI, Anthropic, Gemini, and MCP tool-surface normalizers.
5. Wire Schift API/UI import, preview, validation, and run evidence storage.

## Non-Goals

- AWP does not execute workflows by itself.
- AWP is not the existing Schift block workflow YAML.
- AWP is not a LangGraph-only schema.
- AWP is not a canvas-state persistence format.
