# SDK Mapping

AWP is the canonical YAML contract. SDK adapters compile AWP into runtime-native
objects and normalize runtime events back into AWP run evidence.

## Mapping Matrix

| AWP concept | LangGraph | Vercel AI SDK | Schift |
| --- | --- | --- | --- |
| `graph.nodes` / `graph.edges` | `StateGraph` nodes, edges, conditional edges, subgraphs | Generated TypeScript control flow, routes, `Promise.all`, step loops | Managed-agent run graph or hosted workflow definition |
| `agents.*.tools` | Model bound tools plus `ToolNode` or custom tool node | `tools` object passed to `generateText` / `streamText` | Managed-agent tool registry |
| `tool_calling.default_choice` | Model/provider tool-choice config when available | Tool choice / step preparation where supported | Schift execution policy |
| `tool_calling.parallelism` | Parallel graph supersteps or tool node fan-out | Host JS parallelism or SDK parallel tool calls | Worker/executor concurrency caps |
| `native.audit` | Checkpointer plus interrupts / resume commands | Approval request/result parts and application state | Schift audit log and approval workflow |
| `native.token_counter` | Provider metadata or tracing integration | `usage` / `totalUsage` | Schift run ledger |
| AWP events | LangGraph stream modes and custom events | Stream parts and lifecycle callbacks | Schift run events |

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

4. Treat approvals as resumable state.
   LangGraph can resume through checkpointers. Vercel AI SDK adapters should
   persist enough message/tool state to continue after an approval response.

5. Do not hide missing tool results.
   If a model turn produced N tool calls, the adapter must either return N
   results, mark skipped/rejected calls explicitly, or fail the step.

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
- Use `agents.*.max_steps` or adapter defaults for bounded step loops.
- Map approval requests into AWP `tool.approval.*` events.
- Use `usage` and `totalUsage` when exposed, without fabricating unavailable
  counts.

## Schift Adapter Notes

- Store the original AWP YAML or normalized JSON next to the compiled execution
  object.
- Keep AWP event names in the run ledger even if internal workers use different
  event names.
- Use Schift audit/compliance tools for `native.audit` checkpoints.
