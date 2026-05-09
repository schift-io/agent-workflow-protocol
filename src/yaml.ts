import { parse, stringify } from "yaml";
import type { AwpTemplate } from "./types.js";
import { validateAwpTemplate } from "./validate.js";

export function parseAwpYaml(source: string): AwpTemplate {
  const parsed = parse(source) as AwpTemplate;
  const result = validateAwpTemplate(parsed);
  if (!result.valid) {
    const details = result.diagnostics
      .filter((diagnostic) => diagnostic.level === "error")
      .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
      .join("; ");
    throw new Error(`Invalid AWP YAML: ${details}`);
  }
  return parsed;
}

export function stringifyAwpYaml(template: AwpTemplate): string {
  const result = validateAwpTemplate(template);
  if (!result.valid) {
    const details = result.diagnostics
      .filter((diagnostic) => diagnostic.level === "error")
      .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
      .join("; ");
    throw new Error(`Invalid AWP template: ${details}`);
  }
  return stringify(template, { lineWidth: 100 });
}
