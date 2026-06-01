# SDK Mapping

AWP is the canonical YAML contract. SDK adapters compile AWP into runtime-native
objects and normalize runtime events back into AWP run evidence.

## Mapping Matrix

| AWP concept | LangGraph | Vercel AI SDK | Google Gen AI | Schift |
| --- | --- | --- | --- | --- |
| Trigger nodes (`chat_trigger`, `manual_trigger`, `webhook_source`, etc.) | `START` edge plus input adapter node | Host route/server action before SDK call | Host request/event adapter before model call | Agent/workflow trigger binding |
| `graph.nodes` / `graph.edges` | `StateGraph` nodes, edges, conditional edges, subgraphs | Generated TypeScript control flow, routes, parallel stages, step loops | Host control flow around `models.generateContent` | Managed-agent run graph or hosted workflow definition |
| `graph.layout.react_flow` | Editor-only projection metadata; ignored by runtime compiler | Editor-only projection metadata; ignored by SDK call path | Editor-only projection metadata; ignored by SDK call path | Canvas node positions, handles, viewport |
| `graph.nodes.*.stage` / `parallel_group` | Supersteps with barrier fan-in | Host-controlled parallel stage execution | Host-controlled parallel stage execution | Workflow v2 execution groups |
| `agents.*.tools` | Model bound tools plus `ToolNode` or custom tool node | `tools` object passed to `generateText` / `streamText` | `functionDeclarations` / host-owned tool execution | Managed-agent tool registry |
| `data_sources.*` | Fetch/custom source nodes | Host fetch before/around model calls | Host fetch before/around model calls | Managed connector/source binding |
| `tool_calling.default_choice` | Model/provider tool-choice config when available | Tool choice / step preparation where supported | `functionCallingConfig` where available | Schift execution policy |
| `tool_calling.parallelism` | Parallel graph supersteps or tool node fan-out | Host JS parallelism or SDK parallel tool calls | Host JS parallelism around model/tool calls | Worker/executor concurrency caps |
| `input_mapping_contract` / `output_contract` | Validation nodes and state schema | Host validation before/after model calls | Host validation before/after model calls | Runtime preflight/completion gates |
| `quality_contract` | QC/evaluator nodes and retry policy metadata | Host evaluator steps and retry policy metadata | Host evaluator steps and retry policy metadata | Runtime QC gates and retry policy |
| `native.audit` | Checkpointer plus interrupts / resume commands | Approval request/result parts and application state | Host approval state around function calls | Schift audit log and approval workflow |
| `native.token_counter` | Provider metadata or tracing integration | `usage` / `totalUsage` | provider usage metadata | Schift run ledger |
| `native.streaming` | Stream modes plus custom events | `streamText` parts | streaming responses mapped to events | Schift live run event feed |
| `native.structured_output` | Node output schema / adapter validation | `experimental_output` or host validation | `responseSchema` or `responseJsonSchema` | Schift structured artifact |
| AWP events | LangGraph stream modes and custom events | Stream parts and lifecycle callbacks | Response lifecycle and host events | Schift run events |

## Adapter Rules

1. Preserve AWP ids.
   Runtime ids can be added, but `template.id`, graph node ids, tool ids, and
   `protocol_call_id` must remain visible in logs.

2. Keep tool execution host-owned.
   Models propose tool calls. The adapter or host runtime executes them after
   validation and approval.

3. Emit normalized events.
   Runtime-specific stream events must be mapped to AWP events before they are
   persisted or displayed.

4. Preserve model evidence.
   Model provider/name, duration, token usage, structured output, and streaming
   deltas must be queryable through AWP events or artifacts.

5. Treat approvals as resumable state.
   LangGraph can resume through checkpointers. Vercel AI SDK adapters should
   persist enough message/tool state to continue after an approval response.

6. Do not hide missing tool results.
   If a model turn produced N tool calls, the adapter must either return N
   results, mark skipped/rejected calls explicitly, or fail the step.

7. Report projection status before execution.
   Adapter preflight should classify a template as `direct`,
   `requires_runtime`, or `unsupported`. A target must not silently drop graph
   edges, connector bindings, approval gates, external egress policy, secret
   resolution, or structured-output requirements.

8. Preserve stage barriers.
   Nodes in the same stage may be run concurrently only when there is no graph
   dependency between them. Join and aggregate nodes must wait for all inbound
   producer nodes to settle and must expose missing, failed, or skipped inputs
   in a structured aggregate artifact.

## LangGraph Adapter Notes

- Compile `graph.start` into the `START` edge.
- Compile `human_approval` nodes or tool approval gates into interrupts.
- Require a checkpointer when `native.audit` has required checkpoints.
- Map `subworkflow` nodes to subgraphs where possible.
- Emit AWP events from LangGraph stream modes and custom events.

## Vercel AI SDK Adapter Notes

- Compile `tools` into AI SDK tool definitions.
- Use `tool_calling.parallelism` to decide when the generated host code may use
  parallel execution.
- Use `graph.nodes.*.stage` and `parallel_group` for host-controlled fan-out
  when the template needs independent QC or evaluator nodes to run together.
- Use `agents.*.max_steps` or adapter defaults for bounded step loops.
- Map approval requests into AWP `tool.approval.*` events.
- Use `usage` and `totalUsage` when exposed, without fabricating unavailable
  counts.

## Google Gen AI Adapter Notes

- Keep YAML schemas in AWP as OpenAPI-compatible schema objects
  (`schema_format: openapi_schema`).
- Pass compatible schemas directly to `responseSchema` with
  `responseMimeType: "application/json"` when using the SDK's OpenAPI-subset
  schema path.
- Use `responseJsonSchema` only when the SDK/API path should receive a JSON
  Schema object directly.
- Do not duplicate schema definitions in adapter-specific fields. The AWP YAML
  remains the canonical schema source.

## Schift Adapter Notes

- Store the original AWP YAML or normalized JSON next to the compiled execution
  object.
- Keep AWP event names in the run ledger even if internal workers use different
  event names.
- Use Schift audit/compliance tools for `native.audit` checkpoints.
- Treat Schift Workflow v2 as the native managed-workflow target for AWP.
  Internal Schift block names are implementation details; public YAML should
  remain AWP-shaped.
- `examples/conformance/*.awp.yaml` is the adapter fixture set. Schift can
  compile it to Workflow v2; Vercel AI SDK, Google Gen AI, and LangGraph
  adapters must either project the safe subset directly or require Schift
  runtime explicitly.
