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
  createAwpExecutionPlan,
  parseAwpYaml,
  renderAwpGraph,
  runAwpReference,
  runAwpReferenceAsync,
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

test("accepts chat_trigger as a workflow start node", () => {
  const template = {
    schema: AWP_SCHEMA,
    version: AWP_VERSION,
    id: "chat-start",
    name: "Chat Start",
    agents: {
      answer: { role: "answerer" },
    },
    graph: {
      start: "chat",
      layout: {
        react_flow: {
          nodes: {
            chat: { position: { x: 80, y: 160 }, source_handles: ["message"] },
            answer: { position: { x: 380, y: 160 }, target_handles: ["input"] },
            done: { position: { x: 680, y: 160 } },
          },
          edges: {
            "chat-answer": { source_handle: "message", target_handle: "input" },
          },
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      },
      nodes: {
        chat: {
          type: "chat_trigger",
          label: "Chat message",
          config: {
            input_field: "message",
            conversation_id_field: "conversation_id",
          },
        },
        answer: { type: "agent", ref: "answer" },
        done: { type: "end" },
      },
      edges: [
        { from: "chat", to: "answer" },
        { from: "answer", to: "done" },
      ],
    },
  };

  const validation = validateAwpTemplate(template);
  assert.equal(validation.valid, true, JSON.stringify(validation.diagnostics));
  assert.equal(template.graph.layout.react_flow.nodes.chat.position.x, 80);
  assert.equal(template.graph.layout.react_flow.viewport.zoom, 1);

  const plan = createAwpExecutionPlan(template);
  assert.deepEqual(plan.stages.map((stage) => stage.node_ids), [
    ["chat"],
    ["answer"],
    ["done"],
  ]);
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

test("reference runner plans same-stage QC fan-out and aggregates the barrier", async () => {
  const source = readFileSync(
    new URL("../examples/conformance/parallel-qc-aggregate.awp.yaml", import.meta.url),
    "utf8",
  );
  const template = parseAwpYaml(source);
  const plan = createAwpExecutionPlan(template);

  assert.deepEqual(plan.stages.map((stage) => stage.node_ids), [
    ["draft"],
    [
      "qc_factuality",
      "qc_citations",
      "qc_policy",
      "qc_security",
      "qc_completeness",
      "qc_style",
    ],
    ["qc_aggregate"],
    ["done"],
  ]);
  assert.equal(plan.policy.max_concurrency, 6);

  const result = await runAwpReferenceAsync(template, {
    runId: "awp_run_parallel_qc_test",
    input: { question: "What did the source say?" },
    now: () => new Date("2026-05-17T00:00:00.000Z"),
  });

  const stageEvents = result.events.filter((event) => event.type === "stage.started");
  assert.equal(stageEvents.length, 4);
  assert.equal(stageEvents[1].payload?.parallel, true);
  assert.deepEqual(stageEvents[1].payload?.node_ids, plan.stages[1].node_ids);

  const aggregate = result.intermediate_results.qc_aggregate;
  assert.equal(aggregate.type, "awp.reference.aggregate_result");
  assert.equal(aggregate.mode, "qc_report");
  assert.equal(aggregate.result_count, 6);
  assert.deepEqual(aggregate.missing_node_ids, []);
  assert.deepEqual(aggregate.source_node_ids, plan.stages[1].node_ids);

  const qcStepStarts = result.events.filter(
    (event) => event.type === "step.started" && event.payload?.parallel_group === "answer_qc",
  );
  assert.equal(qcStepStarts.length, 6);
});

test("renders a portable graph model as Mermaid and SVG", () => {
  const source = readFileSync(
    new URL("../examples/conformance/multi-step-graph.awp.yaml", import.meta.url),
    "utf8",
  );
  const template = parseAwpYaml(source);

  const mermaid = renderAwpGraph(template, { format: "mermaid" });
  assert.match(mermaid, /^flowchart LR/);
  assert.match(mermaid, /n_classify/);
  assert.match(mermaid, /n_classify --> n_answer/);
  assert.match(mermaid, /n_answer --> n_done/);

  const svg = renderAwpGraph(template, { format: "svg" });
  assert.match(svg, /<svg/);
  assert.match(svg, /Multi-step graph/);
  assert.match(svg, /classify/);
  assert.match(svg, /answer/);
});

test("CLI renders graph output to stdout or file", () => {
  const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
  const workflow = fileURLToPath(new URL("../examples/conformance/multi-step-graph.awp.yaml", import.meta.url));
  const mermaid = execFileSync(process.execPath, [
    cli,
    "render",
    workflow,
    "--format",
    "mermaid",
  ], { encoding: "utf8" });

  assert.match(mermaid, /^flowchart LR/);
  assert.match(mermaid, /n_classify --> n_answer/);

  const outDir = mkdtempSync(join(tmpdir(), "awp-render-"));
  try {
    const outFile = join(outDir, "graph.svg");
    const output = execFileSync(process.execPath, [
      cli,
      "render-graph",
      workflow,
      "--out",
      outFile,
    ], { encoding: "utf8" });
    assert.equal(output.trim(), outFile);
    assert.match(readFileSync(outFile, "utf8"), /<svg/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
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
    "contract-gates.awp.yaml",
    "multi-step-graph.awp.yaml",
    "outbound-webhook.awp.yaml",
    "parallel-qc-aggregate.awp.yaml",
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

test("validates input, data source, QC, and output contracts", () => {
  const template = parseAwpYaml(
    readFileSync(new URL("../examples/conformance/contract-gates.awp.yaml", import.meta.url), "utf8"),
  );

  assert.equal(template.data_sources?.source_record?.api?.endpoint, "https://api.example.com/v1/records/{record_id}");
  assert.equal(template.input_mapping_contract?.normalized_output.route_decision.entry_node, "map_input");
  assert.equal(template.quality_contract?.retry_policy?.no_graph_cycle, true);
  assert.equal(template.output_contract?.required_fields.includes("qc_summary"), true);

  const result = validateAwpTemplate(template);
  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
});

test("rejects invalid contract shapes before runtime", () => {
  const template = {
    schema: AWP_SCHEMA,
    version: AWP_VERSION,
    id: "invalid-contracts",
    name: "Invalid contracts",
    outputs: {
      result: { type: "object", required: true },
    },
    data_sources: {
      record: {
        kind: "api",
        api: { endpoint: "/records/{id}" },
      },
    },
    input_mapping_contract: {
      blocking_rules: [{ code: "MissingInput", message: "Missing input." }],
      normalized_output: {
        normalized_input: {
          request: { type: "string", required: true },
        },
        route_decision: { entry_node: "missing_node" },
        validation: { blocking_issue_codes: ["MissingInput"] },
      },
    },
    quality_contract: {
      mode: "blocking",
      targets: [{ artifact: "draft", checks: ["schema_validity"] }],
      retry_policy: { normal_attempts: -1, no_graph_cycle: false },
      result_shape: { blocking_issue_codes: ["BadCode"] },
    },
    output_contract: {
      required_fields: ["unknown_result"],
      blocking_rules: [{ code: "result_missing", message: "" }],
    },
    agents: {
      generate: { role: "generator" },
    },
    graph: {
      start: "start",
      nodes: {
        start: { type: "validate" },
        generate: { type: "agent", ref: "generate" },
      },
      edges: [
        { from: "start", to: "generate" },
      ],
    },
  };

  const result = validateAwpTemplate(template);
  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.path === "data_sources.record.return_schema"));
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.path === "input_mapping_contract.blocking_rules.0.code"));
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.path === "input_mapping_contract.normalized_output.route_decision.entry_node"));
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.path === "quality_contract.retry_policy.no_graph_cycle"));
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.path === "quality_contract.retry_policy.normal_attempts"));
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.path === "output_contract.required_fields.0"));
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.path === "output_contract.blocking_rules.0.message"));
});

test("rejects React Flow layout for unknown nodes", () => {
  const template = {
    schema: AWP_SCHEMA,
    version: AWP_VERSION,
    id: "invalid-layout",
    name: "Invalid Layout",
    agents: {
      answer: { role: "answerer" },
    },
    graph: {
      start: "chat",
      layout: {
        react_flow: {
          nodes: {
            missing: { position: { x: 10, y: 20 } },
          },
          viewport: { x: 0, y: 0, zoom: 0 },
        },
      },
      nodes: {
        chat: { type: "chat_trigger" },
        answer: { type: "agent", ref: "answer" },
      },
      edges: [{ from: "chat", to: "answer" }],
    },
  };

  const result = validateAwpTemplate(template);
  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.path === "graph.layout.react_flow.nodes.missing"));
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.path === "graph.layout.react_flow.viewport.zoom"));
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
  assert.match(globalHelp, /awp render/);
  assert.match(commandHelp, /Usage:/);
  assert.match(commandHelp, /awp run/);
});
