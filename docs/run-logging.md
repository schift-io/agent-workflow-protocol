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
- `final_output`: final run output

Artifacts make UI review possible without replaying a whole run.

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
