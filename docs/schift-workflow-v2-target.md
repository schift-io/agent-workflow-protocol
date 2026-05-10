# Schift Workflow v2 Target

AWP is the public workflow YAML contract. Schift Workflow v2 is Schift's
native implementation target for that contract.

## Boundary

- Public templates live in AWP as `.awp.yaml`.
- Schift imports AWP into its internal `WorkflowV2` model before analyze,
  compile, dry-run, publish preflight, or run.
- Schift-internal block names such as `source_query`, `source_write`,
  `outbound_webhook`, `subworkflow`, and `code` are implementation details, not
  public YAML shapes.
- AWP adapter metadata declares Schift support with:

```yaml
adapters:
  schift:
    target: workflow_v2
    status: direct
```

## Conformance

The public conformance set is `examples/conformance/*.awp.yaml`.

Schift's monorepo must not vendor those examples as canonical fixtures. The
Schift API conformance gate is opt-in and points at this repository from the
outside:

```bash
SCHIFT_AWP_CONFORMANCE_DIR=/path/to/agent-workflow-protocol/examples/conformance \
  uv run pytest tests/test_workflow_v2_contract.py -q
```

Without that environment variable, the Schift API unit tests skip the external
AWP conformance cases so the monorepo does not depend on a nested checkout.
