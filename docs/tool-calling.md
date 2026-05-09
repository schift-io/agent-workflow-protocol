# Tool Calling Protocol

AWP treats tool calling as a first-class protocol surface, not as a prompt
convention. Runtime adapters must normalize provider-specific tool semantics
into the AWP tool declaration, tool-call record, and event model.

## Why AWP Normalizes Tool Calls

Tool calling differs across SDKs:

- OpenAI Responses uses function tools with JSON Schema parameters, response
  output items, `call_id`, tool-choice controls, and streaming argument deltas.
- Anthropic Claude uses `tool_use` content blocks, `tool_result` blocks keyed by
  `tool_use_id`, and can return multiple tool uses in one assistant turn.
- Gemini function calling exposes function declarations and function response
  parts, but adapters should mint an AWP call id because provider-level per-call
  ids are not always exposed consistently.
- LangGraph gives a graph runtime, checkpoints, interrupts, and tool nodes, but
  token accounting depends on the underlying model/provider metadata.
- Vercel AI SDK exposes tools through `tool(...)`, `inputSchema`, optional
  execution/approval behavior, multi-step loops, stream parts, and usage data.

AWP therefore requires every runtime to produce a normalized
`AwpToolCallRecord`.

## Tool Declaration

```yaml
tools:
  crm.update_ticket:
    kind: http.request
    description: Update a customer support ticket.
    schema_format: json_schema
    strict: true
    side_effect: write
    idempotent: false
    runtime: http
    execution:
      mode: remote
      binding: https://api.example.com/tickets/{ticket_id}
      timeout_ms: 5000
    approval:
      mode: always
      checkpoint: before_ticket_write
    input_schema:
      type: object
      additionalProperties: false
      required: [ticket_id, status]
      properties:
        ticket_id:
          type: string
        status:
          type: string
          enum: [open, pending, closed]
```

### Fields

| Field | Meaning |
| --- | --- |
| `kind` | Stable semantic kind, not an SDK class name. |
| `schema_format` | Source schema dialect: `json_schema`, `openapi_schema`, `zod_adapter`, or `mcp_tool`. |
| `input_schema` | JSON Schema-compatible canonical schema. Adapters may compile to Zod/OpenAPI/provider schemas. |
| `runtime` | Broad runtime family: local, Schift, MCP, HTTP, or adapter-owned. |
| `execution.mode` | Who executes the tool: host, client, server, MCP, remote, manual, or adapter. |
| `approval.mode` | Whether execution needs approval: none, always, conditional, or runtime. |
| `strict` | Adapter should request strict schema enforcement when the target SDK supports it. |
| `side_effect` | Used by audit gates and UI warnings. |
| `idempotent` | Used for retries and replay safety. |

## Tool Choice

AWP separates graph topology from model-level tool-choice controls.

```yaml
tool_calling:
  default_choice:
    mode: auto
    allowed_tools: [memory.search, code.search]
  parallelism:
    enabled: true
    max_concurrent: 4
    return_results_together: true
  require_results_for_all_calls: true
  mint_protocol_call_id: true
```

Choice modes:

| AWP mode | Meaning | Common target mapping |
| --- | --- | --- |
| `auto` | Model may call tools or answer directly. | OpenAI `auto`, Anthropic `auto`, Gemini `AUTO`, Vercel default. |
| `none` | Model must not call tools. | OpenAI/Anthropic/Gemini none modes where supported. |
| `required` | Model must call at least one tool. | OpenAI `required`, Anthropic `any`, Gemini `ANY`. |
| `any` | Any allowed tool is acceptable. | Same as required/any target controls. |
| `tool` | Force a specific tool. | OpenAI forced function, Anthropic named tool, Gemini `allowed_function_names` with forced mode. |
| `validated` | Model may call only valid declared functions. | Gemini `VALIDATED` when available; otherwise adapter-enforced. |

## Normalized Tool Call Record

Every adapter must mint `protocol_call_id` before executing a tool.

```ts
interface AwpToolCallRecord {
  protocol_call_id: string;
  provider_call_id?: string;
  provider_response_id?: string;
  provider_item_id?: string;
  tool_name: string;
  arguments_json: string;
  status: "proposed" | "approval_requested" | "approved" | "rejected" |
    "running" | "completed" | "failed" | "cancelled";
  approval_state?: "not_required" | "pending" | "approved" | "rejected" | "edited";
  result_payload?: unknown;
  error_payload?: unknown;
  is_error?: boolean;
  usage?: AwpTokenUsage;
  audit_metadata?: Record<string, unknown>;
}
```

Provider ids are preserved when available, but they are not the primary AWP
correlation key.

## Required Event Order

For a normal tool call:

1. `tool.started`
2. `tool.completed` or `tool.failed`

For a tool that requires approval:

1. `tool.approval.requested`
2. `tool.approval.decided`
3. `tool.started`
4. `tool.completed` or `tool.failed`

For streaming arguments or partial tool-call deltas:

- Emit `tool.call.delta` with the same `protocol_call_id`.
- The final `tool.started` event must include the canonical `arguments_json`.

## Parallel Tool Calls

AWP permits parallel tool calls only when:

- `tool_calling.parallelism.enabled` is true, and
- each selected tool is safe for concurrent execution, or the adapter can isolate
  side effects.

When a target SDK returns multiple calls in one model turn, adapters should emit
one `protocol_call_id` per call and preserve the provider ordering in
`audit_metadata.provider_index`.

When a target SDK requires all tool results to be returned together, the adapter
must buffer results until all calls in the turn are resolved.

## Approval and Audit

Approval is an AWP runtime policy, not a provider assumption. Even if a target
SDK has native approval hooks, the adapter must still emit AWP approval events.

Recommended default:

- Read-only idempotent tools: `approval.mode: none`.
- Write or external side-effect tools: `approval.mode: always`.
- Expensive, private, or compliance-sensitive tools: `approval.mode: conditional`
  plus an audit checkpoint.

## Token Accounting

AWP token usage names:

- `prompt_tokens`
- `completion_tokens`
- `reasoning_tokens`
- `cached_tokens`
- `tool_call_tokens`
- `total_tokens`

Adapters should fill what their target exposes and omit unknown fields. They
must not invent provider token counts. Aggregate totals belong on run and step
events; per-tool overhead belongs on the tool call record when known.

## Source Notes

This draft is based on official documentation for:

- OpenAI Responses API, function calling, and Agents SDK:
  https://platform.openai.com/docs/api-reference/responses,
  https://platform.openai.com/docs/guides/function-calling,
  https://platform.openai.com/docs/guides/agents-sdk
- Anthropic Claude tool use and streaming:
  https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview,
  https://docs.anthropic.com/en/docs/build-with-claude/streaming
- Gemini function calling and streaming:
  https://ai.google.dev/gemini-api/docs/function-calling,
  https://ai.google.dev/gemini-api/docs/text-generation
- LangGraph graph, streaming, persistence, and interrupts:
  https://docs.langchain.com/oss/javascript/langgraph/graph-api,
  https://docs.langchain.com/oss/javascript/langgraph/streaming,
  https://docs.langchain.com/oss/javascript/langgraph/persistence,
  https://docs.langchain.com/oss/javascript/langgraph/interrupts
- Vercel AI SDK tool calling and workflows:
  https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling,
  https://ai-sdk.dev/docs/agents/workflows
