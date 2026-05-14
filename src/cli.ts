#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import {
  parseAwpYaml,
  runAwpReference,
  validateAwpTemplate,
} from "./index.js";
import type {
  AwpCostObservation,
  AwpQualityObservation,
} from "./types.js";

interface ParsedArgs {
  command?: string;
  file?: string;
  flags: Record<string, string | boolean>;
}

async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (!args.command || args.flags.help === true || args.flags.h === true) {
    printHelp();
    return;
  }

  if (!args.file) {
    throw new Error(`Missing AWP YAML file for '${args.command}'`);
  }

  switch (args.command) {
    case "validate":
      await validateCommand(args);
      break;
    case "run":
      await runCommand(args);
      break;
    default:
      throw new Error(`Unknown command '${args.command}'`);
  }
}

async function validateCommand(args: ParsedArgs): Promise<void> {
  const template = readTemplate(requireFile(args));
  const result = validateAwpTemplate(template);
  if (args.flags.json === true) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.valid) {
    console.log(`valid: ${template.id}`);
  } else {
    for (const diagnostic of result.diagnostics) {
      console.error(`${diagnostic.level}: ${diagnostic.path}: ${diagnostic.message}`);
    }
  }
  if (!result.valid) {
    process.exitCode = 1;
  }
}

async function runCommand(args: ParsedArgs): Promise<void> {
  const target = String(args.flags.target ?? "reference");
  if (target !== "reference") {
    throw new Error(`Target '${target}' is not implemented yet. Use '--target reference'.`);
  }

  const template = readTemplate(requireFile(args));
  const input = typeof args.flags.input === "string" ? JSON.parse(args.flags.input) : {};
  const cost = parseCostFlag(args.flags.cost);
  const quality = parseQualityFlag(args.flags.quality);
  const result = runAwpReference(template, {
    input,
    target: "reference",
    ...(cost ? { cost } : {}),
    ...(quality ? { quality } : {}),
  });
  const outDir = String(args.flags.out ?? join(".awp-runs", result.run_id));

  await writeRunFiles(outDir, result);

  const summary = {
    run_id: result.run_id,
    status: result.status,
    target: result.target,
    event_count: result.events.length,
    artifact_count: result.artifacts.length,
    has_cost: result.cost !== undefined,
    quality_count: result.quality?.length ?? 0,
    run_path: join(outDir, "run.json"),
    log_path: join(outDir, "events.jsonl"),
    artifacts_path: join(outDir, "artifacts.json"),
  };

  if (args.flags.json === true) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`run_id: ${summary.run_id}`);
    console.log(`status: ${summary.status}`);
    console.log(`events: ${summary.event_count}`);
    console.log(`artifacts: ${summary.artifact_count}`);
    if (summary.has_cost) {
      console.log(`cost: recorded`);
    }
    if (summary.quality_count > 0) {
      console.log(`quality: ${summary.quality_count}`);
    }
    console.log(`log: ${summary.log_path}`);
    console.log(`summary: ${summary.run_path}`);
  }
}

function requireFile(args: ParsedArgs): string {
  if (!args.file) {
    throw new Error(`Missing AWP YAML file for '${args.command ?? "command"}'`);
  }
  return args.file;
}

function readTemplate(path: string) {
  return parseAwpYaml(readFileSync(path, "utf8"));
}

function parseCostFlag(value: string | boolean | undefined): AwpCostObservation | undefined {
  const parsed = parseJsonFlag(value, "cost");
  if (parsed === undefined) {
    return undefined;
  }
  if (!isRecord(parsed)) {
    throw new Error("--cost must be a JSON object");
  }
  return parsed as AwpCostObservation;
}

function parseQualityFlag(value: string | boolean | undefined): AwpQualityObservation[] | undefined {
  const parsed = parseJsonFlag(value, "quality");
  if (parsed === undefined) {
    return undefined;
  }

  const observations = Array.isArray(parsed) ? parsed : [parsed];
  if (!observations.every(isQualityObservation)) {
    throw new Error("--quality must be a JSON object or array of objects with non-empty metric fields");
  }
  return observations;
}

function parseJsonFlag(value: string | boolean | undefined, flagName: string): unknown {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "boolean") {
    throw new Error(`--${flagName} requires a JSON value`);
  }
  return JSON.parse(value);
}

function isQualityObservation(value: unknown): value is AwpQualityObservation {
  return isRecord(value) && typeof value.metric === "string" && value.metric.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function writeRunFiles(outDir: string, result: ReturnType<typeof runAwpReference>): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "run.json"), JSON.stringify(result, null, 2));
  await writeFile(join(outDir, "events.jsonl"), result.events.map((event) => JSON.stringify(event)).join("\n") + "\n");
  await writeFile(join(outDir, "artifacts.json"), JSON.stringify(result.artifacts, null, 2));
  await writeFile(join(outDir, "intermediate-results.json"), JSON.stringify(result.intermediate_results, null, 2));
  await mkdir(dirname(join(outDir, "run.json")), { recursive: true });
}

function parseArgs(argv: string[]): ParsedArgs {
  let command: string | undefined;
  let file: string | undefined;
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "-h") {
      flags.h = true;
      continue;
    }

    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        index += 1;
      }
      continue;
    }

    if (!command) {
      command = token;
    } else if (!file) {
      file = token;
    }
  }

  return { command, file, flags };
}

function printHelp(): void {
  console.log(`AWP CLI

Usage:
  awp validate <workflow.awp.yaml> [--json]
  awp run <workflow.awp.yaml> [--target reference] [--input '{"query":"..."}'] [--cost '{...}'] [--quality '[...]'] [--out .awp-runs/<id>] [--json]

Targets:
  reference  Protocol reference runner. Emits run_id, events.jsonl, artifacts, and intermediate results without calling real models or tools.
`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
