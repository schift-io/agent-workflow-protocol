import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  AWP_SCHEMA,
  AWP_VERSION,
  SUPPORTED_SDK_TARGETS,
  parseAwpYaml,
  stringifyAwpYaml,
  validateAwpTemplate,
} from "../dist/index.js";

test("parses and validates the example AWP YAML", () => {
  const source = readFileSync(new URL("../examples/research-router.awp.yaml", import.meta.url), "utf8");
  const template = parseAwpYaml(source);

  assert.equal(template.schema, AWP_SCHEMA);
  assert.equal(template.version, AWP_VERSION);
  assert.equal(template.native?.token_counter?.required, true);
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
