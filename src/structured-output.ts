import type { AwpStructuredOutputSpec } from "./schemas.js";

export type { AwpStructuredOutputSpec } from "./schemas.js";

/** OpenAI-compatible `response_format` payload for a JSON-schema constrained call. */
export interface OpenAIResponseFormat {
  type: "json_schema";
  json_schema: {
    name: string;
    strict: boolean;
    schema: Record<string, unknown>;
  };
}

export interface ResponseFormatOptions {
  /** Schema name sent as `json_schema.name`. Defaults to `"structured_output"`. */
  name?: string;
  /** Whether to request strict schema adherence. Defaults to `true`. */
  strict?: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Resolve the effective structured-output spec for an `llm_generate`/agent node,
 * applying block > agent > workflow precedence. Later arguments are lower
 * priority (fallbacks). Returns `undefined` when nothing is declared.
 */
export function resolveStructuredOutputSpec(
  ...specs: Array<AwpStructuredOutputSpec | undefined | null>
): AwpStructuredOutputSpec | undefined {
  for (const spec of specs) {
    if (spec && (spec.mode !== undefined || spec.schema !== undefined || spec.required !== undefined)) {
      return spec;
    }
  }
  return undefined;
}

/**
 * Translate a declarative `structured_output` spec into an OpenAI-compatible
 * `response_format`. Only `mode: "json_schema"` with a concrete `schema`
 * produces a payload; `tool_result` / `adapter` modes and schema-less specs
 * return `undefined` (they are enforced by other means, not `response_format`).
 */
export function openAIResponseFormatFromStructuredOutput(
  spec: AwpStructuredOutputSpec | undefined | null,
  options: ResponseFormatOptions = {},
): OpenAIResponseFormat | undefined {
  if (!spec || spec.mode !== "json_schema" || !isPlainObject(spec.schema)) {
    return undefined;
  }
  return {
    type: "json_schema",
    json_schema: {
      name: options.name ?? "structured_output",
      strict: options.strict ?? true,
      schema: spec.schema,
    },
  };
}
