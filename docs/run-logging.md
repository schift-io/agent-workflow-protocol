# Run Logging

AWP run logging is designed to make intermediate work inspectable before a final
answer exists.

## Run ID

Every run has a stable `run_id`.

Recommended shape:

```text
awp_run_<yyyymmddhhmmss>_<short-random>
```

The run id must appear on:

- every event
- every artifact
- every tool-call record
- every persisted run summary

## Run Directory

The reference CLI writes this layout:

```text
.awp-runs/<run_id>/
├── run.json
├── events.jsonl
├── artifacts.json
└── intermediate-results.json
```

Adapters may store the same records in a database, but the event and artifact
shape should stay compatible.

## Event Shape

```ts
interface AwpRunEvent {
  run_id: string;
  event_id: string;
  sequence: number;
  timestamp: string;
  type: AwpNativeEvent;
  template_id?: string;
  node_id?: string;
  step_id?: string;
  tool_call_id?: string;
  artifact_id?: string;
  duration_ms?: number;
  payload?: Record<string, unknown>;
  usage?: AwpTokenUsage;
}
```

Events are append-only and sequence-numbered. `events.jsonl` is the canonical
portable log format.

## Intermediate Artifacts

Artifacts are structured payloads created during execution:

- `intermediate_result`: agent/node output before final response
- `tool_result`: normalized tool-call result
- `audit_decision`: approval or review decision
- `state_snapshot`: optional state checkpoint
- `structured_output`: validated or adapter-normalized model output
- `reasoning_summary`: provider-exposed reasoning summary or host summary
- `stream_snapshot`: optional compact snapshot of streamed output
- `final_output`: final run output

Artifacts make UI review possible without replaying a whole run.

## Model, Timing, and Usage

Adapters should record model identity wherever a model is involved:

- `model_provider`
- `model_name`
- temperature and max output token settings when known
- provider response ids when available

If a template omits `agents.*.model` and the runtime applies a default model,
the adapter should log the resolved effective model on `model.started`. If no
model is resolved, the event should make that explicit instead of silently
omitting model metadata.

`duration_ms` belongs on completed lifecycle events such as `model.completed`,
`tool.completed`, `step.completed`, and `run.completed`. `AwpRunResult` also
stores run-level `duration_ms`.

Token usage is normalized through `AwpTokenUsage`:

```ts
interface AwpTokenUsage {
  source?: "provider" | "gateway" | "adapter_estimate" | "unavailable";
  estimated?: boolean;
  prompt_tokens?: number;
  completion_tokens?: number;
  reasoning_tokens?: number;
  cached_tokens?: number;
  tool_call_tokens?: number;
  total_tokens?: number;
}
```

Real adapters should prefer provider or gateway counts. If a count is not
exposed, omit the field or mark an estimate instead of presenting it as a
provider value.

## Streaming

Streaming is represented as append-only events:

- `model.output.delta`: assistant text or structured-output stream deltas
- `tool.call.delta`: streamed tool-call argument deltas

Each delta event carries the same `run_id`, `node_id`, `step_id`, and, for tool
calls, `tool_call_id`. A final completion event still contains the canonical
full payload so a consumer does not need to reconstruct state from deltas unless
it wants live playback.

## Structured Output

Structured output is persisted as a `structured_output` artifact and announced
with `model.structured_output`. The artifact should contain the validated
JSON-like output when a schema is enforced, or an adapter-normalized object when
the target runtime does not have native structured output.

## Reasoning / Thinking Policy

AWP is designed for debugging without storing hidden raw chain-of-thought.
Adapters must not persist private reasoning text unless a provider explicitly
exposes a safe summary or the host creates a redacted trace.

Allowed capture modes:

- `none`: do not record reasoning evidence
- `provider_summary`: store provider-exposed summaries only
- `redacted_trace`: store a host-produced redacted trace
- `metadata_only`: store counts, effort, and timing metadata only

Recommended default is `provider_summary` with `include_raw_thinking: false`.

## Reference Runner

The built-in `reference` target does not call real models or external tools. It
exists to prove that a template can produce:

- a `run_id`
- ordered events
- tool-call records
- audit checkpoints
- intermediate artifacts
- final output shape

Use it before implementing or debugging a runtime adapter.

```bash
awp run examples/research-router.awp.yaml \
  --target reference \
  --input '{"query":"How should logs work?"}'
```
