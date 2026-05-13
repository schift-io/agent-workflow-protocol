import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  AWP_SCHEMA,
  AWP_VERSION,
  SUPPORTED_SDK_TARGETS,
  parseAwpYaml,
  runAwpReference,
  stringifyAwpYaml,
  validateAwpTemplate,
} from "../dist/index.js";

test("parses and validates the example AWP YAML", () => {
  const source = readFileSync(new URL("../examples/research-router.awp.yaml", import.meta.url), "utf8");
  const template = parseAwpYaml(source);

  assert.equal(template.schema, AWP_SCHEMA);
  assert.equal(template.version, AWP_VERSION);
  assert.equal(template.native?.token_counter?.required, true);
  assert.equal(template.native?.streaming?.enabled, true);
  assert.equal(template.native?.structured_output?.required, true);
  assert.equal(template.native?.reasoning?.include_raw_thinking, false);
  assert.equal(template.tool_calling?.mint_protocol_call_id, true);
  assert.equal(template.tools?.["memory.search"]?.schema_format, "json_schema");
  assert.equal(validateAwpTemplate(template).valid, true);
});

test("round-trips a valid template", () => {
  const template = {
    schema: AWP_SCHEMA,
    version: AWP_VERSION,
    id: "smoke",
    name: "Smoke",
    agents: {
      root: { role: "coordinator" },
    },
    graph: {
      start: "root",
      nodes: {
        root: { type: "agent", ref: "root" },
        done: { type: "end" },
      },
      edges: [{ from: "root", to: "done" }],
    },
  };

  const yaml = stringifyAwpYaml(template);
  assert.equal(parseAwpYaml(yaml).id, "smoke");
});

test("exposes supported SDK targets", () => {
  assert.deepEqual(
    SUPPORTED_SDK_TARGETS.map((target) => target.id),
    [
      "schift",
      "langgraph-python",
      "langgraph-js",
      "vercel-ai-sdk",
      "openai-responses-agents",
      "anthropic-messages",
      "gemini-function-calling",
      "mcp-tools",
    ],
  );
});

test("reference runner emits run ids, logs, and intermediate artifacts", () => {
  const source = readFileSync(new URL("../examples/research-router.awp.yaml", import.meta.url), "utf8");
  const template = parseAwpYaml(source);
  const result = runAwpReference(template, {
    runId: "awp_run_test",
    input: { query: "How should logs work?" },
    now: () => new Date("2026-05-09T00:00:00.000Z"),
  });

  assert.equal(result.run_id, "awp_run_test");
  assert.equal(result.status, "completed");
  assert.equal(result.duration_ms, 0);
  assert.equal(result.usage?.source, "adapter_estimate");
  assert.ok(result.events.some((event) => event.type === "run.started"));
  assert.ok(result.events.some((event) => event.type === "model.started" && event.payload?.model_name === "gpt-4.1-mini"));
  assert.ok(result.events.some((event) => event.type === "model.output.delta"));
  assert.ok(result.events.some((event) => event.type === "model.structured_output"));
  assert.ok(result.events.some((event) => event.type === "reasoning.summary" && event.payload?.raw_thinking_captured === false));
  assert.ok(result.events.some((event) => event.type === "token.usage" && event.usage?.total_tokens));
  assert.ok(result.events.some((event) => event.type === "tool.call.delta"));
  assert.ok(result.events.some((event) => event.type === "tool.completed"));
  assert.ok(result.events.some((event) => event.type === "audit.decided"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "intermediate_result"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "tool_result"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "structured_output"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "reasoning_summary"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "final_output"));
  assert.ok(result.intermediate_results.memory);
});

test("validates public conformance AWP YAML examples", () => {
  const dir = new URL("../examples/conformance/", import.meta.url);
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".awp.yaml") && file !== "unsupported-code.awp.yaml")
    .sort();

  assert.deepEqual(files, [
    "approval-write.awp.yaml",
    "multi-step-graph.awp.yaml",
    "outbound-webhook.awp.yaml",
    "retrieval-answer.awp.yaml",
    "simple-llm.awp.yaml",
    "streaming.awp.yaml",
    "structured-output.awp.yaml",
    "subworkflow.awp.yaml",
    "tool-call.awp.yaml",
  ]);

  for (const file of files) {
    const template = parseAwpYaml(readFileSync(new URL(file, dir), "utf8"));
    const result = validateAwpTemplate(template);
    assert.equal(result.valid, true, `${file}: ${JSON.stringify(result.diagnostics)}`);
    assert.equal(template.adapters?.schift?.target, "workflow_v2", file);
  }
});

test("rejects policy-disabled code conformance example", () => {
  const source = readFileSync(
    new URL("../examples/conformance/unsupported-code.awp.yaml", import.meta.url),
    "utf8",
  );

  assert.throws(() => parseAwpYaml(source), /Code nodes are disabled by policy/);
});

test("CLI prints help for global and command help flags", () => {
  const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
  const globalHelp = execFileSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  const commandHelp = execFileSync(process.execPath, [cli, "validate", "--help"], { encoding: "utf8" });

  assert.match(globalHelp, /Usage:/);
  assert.match(globalHelp, /awp validate/);
  assert.match(commandHelp, /Usage:/);
  assert.match(commandHelp, /awp run/);
});
