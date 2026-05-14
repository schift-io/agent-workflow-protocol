#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const packageJson = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8"),
);
const dryRun = process.argv.includes("--dry-run");

const packageSpec = `${packageJson.name}@${packageJson.version}`;

run("npm", ["run", "lint"]);
run("npm", ["test"]);
run("npm", ["pack", "--dry-run", "--json"]);
run("npm", ["run", "smoke:install"]);

if (dryRun) {
  console.log(`Dry run complete for ${packageSpec}`);
  process.exit(0);
}

run("npm", ["publish", "--access", "public"]);
retryView();
run("npm", [
  "run",
  "smoke:install",
], {
  env: {
    ...process.env,
    AWP_INSTALL_SPEC: packageSpec,
  },
});

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(" ")}`);
  execFileSync(command, args, {
    cwd: packageRoot,
    env: options.env ?? process.env,
    stdio: "inherit",
  });
}

function retryView() {
  const args = ["view", packageSpec, "version", "dependencies", "--json"];
  let lastError;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      run("npm", args);
      return;
    } catch (error) {
      lastError = error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 2500);
    }
  }
  throw lastError;
}
