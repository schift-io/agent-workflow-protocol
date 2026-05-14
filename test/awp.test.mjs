import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  AWP_SCHEMA,
  AWP_VERSION,
  SUPPORTED_SDK_TARGETS,
  classifyAwpAdapterProjection,
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

test("classifies direct adapters and runtime-required projections", () => {
  const conformanceDir = new URL("../examples/conformance/", import.meta.url);
  const simple = parseAwpYaml(readFileSync(new URL("simple-llm.awp.yaml", conformanceDir), "utf8"));
  const approval = parseAwpYaml(readFileSync(new URL("approval-write.awp.yaml", conformanceDir), "utf8"));
  const multiStep = parseAwpYaml(readFileSync(new URL("multi-step-graph.awp.yaml", conformanceDir), "utf8"));

  const vercel = classifyAwpAdapterProjection(simple, "vercel-ai");
  assert.equal(vercel.adapter, "vercel_ai_sdk");
  assert.equal(vercel.status, "direct");
  assert.equal(vercel.source, "declared");
  assert.equal(vercel.target, "generateText");
  assert.equal(vercel.direct, true);
  assert.equal(vercel.requiresRuntime, false);
  assert.equal(vercel.supported, true);

  assert.equal(
    classifyAwpAdapterProjection(approval, "google-genai").requiresRuntime,
    true,
  );

  const inferred = {
    ...multiStep,
    adapters: undefined,
  };
  assert.equal(
    classifyAwpAdapterProjection(inferred, "vercel-ai").requiresRuntime,
    true,
  );
  assert.equal(
    classifyAwpAdapterProjection(inferred, "langgraph").direct,
    true,
  );
});

test("exposes bundled adapter subpath modules", async () => {
  const [
    { asVercelAI },
    { asGoogleGenAI },
    { asLangGraph },
    { classifyAwpAdapterProjection: classifyFromSubpath },
  ] = await Promise.all([
    import("@schift-io/agent-workflow-protocol/adapters/vercel-ai"),
    import("@schift-io/agent-workflow-protocol/adapters/google-genai"),
    import("@schift-io/agent-workflow-protocol/adapters/langgraph"),
    import("@schift-io/agent-workflow-protocol/adapters/classification"),
  ]);

  assert.equal(typeof asVercelAI, "function");
  assert.equal(typeof asGoogleGenAI, "function");
  assert.equal(typeof asLangGraph, "function");
  assert.equal(typeof classifyFromSubpath, "function");
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
  assert.equal(result.cost, undefined);
  assert.equal(result.quality, undefined);
  assert.equal(result.events.some((event) => event.type === "cost.observed"), false);
  assert.equal(result.events.some((event) => event.type === "quality.observed"), false);
});

test("reference runner carries explicit cost and quality observations to completion", () => {
  const source = readFileSync(new URL("../examples/conformance/simple-llm.awp.yaml", import.meta.url), "utf8");
  const template = parseAwpYaml(source);
  const cost = {
    source: "adapter_estimate",
    estimated: true,
    currency: "USD",
    prompt_cost: 0.0012,
    completion_cost: 0.0008515,
    total_cost: 0.0020515,
  };
  const quality = [
    {
      source: "evaluator",
      kind: "score",
      metric: "faithfulness",
      score: 90,
      scale_min: 0,
      scale_max: 100,
      passed: true,
      evaluator: "reference-smoke",
      notes: "Answer is aligned with the supplied passage.",
    },
    {
      source: "adapter",
      kind: "pass_fail",
      metric: "schema_validity",
      passed: true,
    },
  ];

  const result = runAwpReference(template, {
    runId: "awp_run_observations_test",
    input: { query: "one nonfiction question" },
    now: () => new Date("2026-05-14T00:00:00.000Z"),
    cost,
    quality,
  });

  assert.deepEqual(result.cost, cost);
  assert.deepEqual(result.quality, quality);
  assert.ok(result.events.some((event) => event.type === "token.usage" && event.usage?.total_tokens));

  const costEvent = result.events.find((event) => event.type === "cost.observed");
  assert.deepEqual(costEvent?.cost, cost);
  assert.equal(costEvent?.payload?.source, "adapter_estimate");

  const qualityEvent = result.events.find((event) => event.type === "quality.observed");
  assert.deepEqual(qualityEvent?.quality, quality);
  assert.deepEqual(qualityEvent?.payload?.metrics, ["faithfulness", "schema_validity"]);

  const completionEvent = result.events.find((event) => event.type === "run.completed");
  assert.deepEqual(completionEvent?.cost, cost);
  assert.deepEqual(completionEvent?.quality, quality);
});

test("CLI persists cost and quality observations in run files", () => {
  const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
  const workflow = fileURLToPath(new URL("../examples/conformance/simple-llm.awp.yaml", import.meta.url));
  const outDir = mkdtempSync(join(tmpdir(), "awp-observations-"));
  const cost = {
    source: "adapter_estimate",
    estimated: true,
    currency: "USD",
    total_cost: 0.0020515,
  };
  const quality = [{
    source: "evaluator",
    kind: "score",
    metric: "distractor_quality",
    score: 72,
    scale_min: 0,
    scale_max: 100,
    passed: true,
  }];

  try {
    const output = execFileSync(process.execPath, [
      cli,
      "run",
      workflow,
      "--target",
      "reference",
      "--input",
      JSON.stringify({ query: "one nonfiction question" }),
      "--cost",
      JSON.stringify(cost),
      "--quality",
      JSON.stringify(quality),
      "--out",
      outDir,
      "--json",
    ], { encoding: "utf8" });
    const summary = JSON.parse(output);

    assert.equal(summary.has_cost, true);
    assert.equal(summary.quality_count, 1);

    const run = JSON.parse(readFileSync(join(outDir, "run.json"), "utf8"));
    const events = readFileSync(join(outDir, "events.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    assert.deepEqual(run.cost, cost);
    assert.deepEqual(run.quality, quality);
    assert.ok(events.some((event) => event.type === "token.usage" && event.usage?.total_tokens));
    assert.ok(events.some((event) => event.type === "cost.observed" && event.cost?.total_cost === 0.0020515));
    assert.ok(events.some((event) => event.type === "quality.observed" && event.quality?.[0]?.metric === "distractor_quality"));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("cost and quality observation fixture stays portable", () => {
  const fixtureDir = new URL("../examples/run-observations/cost-quality/", import.meta.url);
  const run = JSON.parse(readFileSync(new URL("run.json", fixtureDir), "utf8"));
  const events = readFileSync(new URL("events.jsonl", fixtureDir), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  assert.deepEqual(run.events, events);
  assert.ok(events.some((event) => event.type === "token.usage"));
  assert.ok(events.some((event) => event.type === "cost.observed"));
  assert.ok(events.some((event) => event.type === "quality.observed"));
  assert.equal(run.cost.source, "adapter_estimate");
  assert.equal(run.cost.estimated, true);
  assert.ok(run.quality.some((observation) => observation.metric === "faithfulness"));
  assert.ok(run.quality.some((observation) => observation.metric === "distractor_quality"));
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
