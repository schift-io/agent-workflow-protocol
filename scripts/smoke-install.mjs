#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const packageJson = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8"),
);
const tmp = mkdtempSync(join(tmpdir(), "awp-install-smoke-"));
const projectDir = join(tmp, "project");

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    ...options,
  });
}

try {
  const installSpec = process.env.AWP_INSTALL_SPEC ?? packLocalPackage(tmp);
  mkdirSync(projectDir);
  run("npm", ["init", "-y"], { cwd: projectDir });
  run(
    "npm",
    [
      "install",
      installSpec,
      "--ignore-scripts",
    ],
    { cwd: projectDir, stdio: "inherit" },
  );

  run(
    "npm",
    [
      "ls",
      packageJson.name,
      "@schift-io/sdk",
      "@schift-io/workflow-vercel-ai",
      "@schift-io/workflow-google-genai",
      "@schift-io/workflow-langgraph",
      "--depth=1",
    ],
    { cwd: projectDir, stdio: "inherit" },
  );

  const checkPath = join(projectDir, "check.mjs");
  writeFileSync(
    checkPath,
    `
import assert from "node:assert/strict";
import { classifyAwpAdapterProjection } from "@schift-io/agent-workflow-protocol";
import { asVercelAI } from "@schift-io/agent-workflow-protocol/adapters/vercel-ai";
import { asGoogleGenAI } from "@schift-io/agent-workflow-protocol/adapters/google-genai";
import { asLangGraph } from "@schift-io/agent-workflow-protocol/adapters/langgraph";

assert.equal(typeof classifyAwpAdapterProjection, "function");
assert.equal(typeof asVercelAI, "function");
assert.equal(typeof asGoogleGenAI, "function");
assert.equal(typeof asLangGraph, "function");
`,
  );
  run(process.execPath, [checkPath], { cwd: projectDir, stdio: "inherit" });
  console.log(`Install smoke passed for ${packageJson.name}@${packageJson.version}`);
} finally {
  if (process.env.AWP_KEEP_SMOKE_DIR) {
    console.log(`Install smoke temp dir kept at ${tmp}`);
  } else {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function packLocalPackage(destination) {
  const output = run(
    "npm",
    ["pack", "--json", "--pack-destination", destination],
    { cwd: packageRoot },
  );
  const [pack] = JSON.parse(output);
  assert.ok(pack?.filename, "npm pack did not return a filename");
  return join(destination, pack.filename);
}
