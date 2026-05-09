# Agent Workflow Protocol

Agent Workflow Protocol, or AWP, is a YAML-first protocol for portable agent
workflows. AWP describes agents, tools, connectors, state, graph topology, and
native run evidence once, then lets adapters compile the same template into
runtime-specific SDKs.

AWP is maintained as a standalone repository inside the Schift workspace because
Schift API, UI, SDKs, and external adapters all need the same contract.

## Goals

- One official YAML shape for agent workflow templates.
- Framework-neutral core: the protocol does not depend on LangGraph, Vercel AI
  SDK, or the Schift hosted workflow engine.
- Adapter-friendly targets for LangGraph, Vercel AI SDK, and Schift.
- Native support for token counting, structured logging, and intermediate audit
  checkpoints.

## File Extension

Use `.awp.yaml`.

```yaml
schema: agent-workflow-protocol
version: "0.1"
id: support-triage
name: Support triage
```

## Supported SDK Targets

| SDK / runtime | Status | Support | Adapter target |
| --- | --- | --- | --- |
| Schift API and UI | Native target | Full workflow | Managed agents, hosted workflow definitions, dashboard builder state |
| LangGraph Python / JS | Planned adapter | Full workflow | `StateGraph`, nodes, edges, conditional routing, subgraphs, checkpointers |
| Vercel AI SDK | Planned adapter | Full workflow | `generateText` / `streamText`, `tool(...)`, bounded `stopWhen` loops |
| OpenAI Responses / Agents SDK | Planned adapter | Tool surface | Function tools, built-in tools, MCP tools, approval around host execution |
| Anthropic Messages | Planned adapter | Tool surface | Claude tools and `tool_result` blocks |
| Gemini Function Calling | Planned adapter | Tool surface | Function declarations and response parts |
| MCP tools | Planned adapter | Connector surface | MCP tool list/call contracts |

The protocol exposes these as machine-readable metadata via
`SUPPORTED_SDK_TARGETS`.

## Native Support

AWP templates can declare the evidence a runtime must emit:

- Token counters: prompt, completion, cached, reasoning, and tool-call tokens.
- Structured run logs: run, step, model, tool, connector, and state events.
- Audit checkpoints: pre-tool, post-tool, pre-response, human approval, and
  policy decision events.

This is part of the protocol because logs and audit evidence should survive SDK
swaps. A LangGraph run and a Vercel AI SDK run should be comparable at the AWP
event layer.

## Tool Calling

AWP standardizes tool declarations, tool-choice policy, tool-call ids, approval,
parallel calls, streaming deltas, results, errors, and token/audit metadata.

The important rule: every adapter must mint a `protocol_call_id` for each tool
call, even when the provider already returns its own call id. Provider ids are
preserved as metadata, but AWP events and audit logs correlate on
`protocol_call_id`.

See [docs/tool-calling.md](./docs/tool-calling.md).

## Example

```yaml
schema: agent-workflow-protocol
version: "0.1"
id: research-router
name: Research router

inputs:
  query:
    type: string
    required: true

state:
  query: string
  findings: array
  answer: string

agents:
  root:
    role: coordinator
    model:
      provider: openai
      name: gpt-4.1-mini
    children: [researcher]
  researcher:
    role: researcher
    tools: [memory.search]

tools:
  memory.search:
    kind: schift.memory.search
    description: Search connected Schift memory.
    schema_format: json_schema
    strict: true
    side_effect: read
    input_schema:
      type: object
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
  logging:
    level: info
    events: [run.started, step.completed, tool.completed, run.completed]
  audit:
    checkpoints:
      - id: before_final_answer
        type: pre_response
        required: true

graph:
  start: route
  nodes:
    route:
      type: agent
      ref: root
    research:
      type: agent
      ref: researcher
    done:
      type: end
  edges:
    - from: route
      to: research
    - from: research
      to: done
```

## Package API

```ts
import {
  parseAwpYaml,
  stringifyAwpYaml,
  validateAwpTemplate,
  SUPPORTED_SDK_TARGETS,
} from "@schift-io/agent-workflow-protocol";
```

## Non-Goals

- AWP does not execute workflows by itself.
- AWP is not the existing Schift block workflow YAML.
- AWP is not a LangGraph-only schema.
- AWP is not a canvas-state persistence format.
