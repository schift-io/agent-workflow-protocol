import type {
  AwpAdapterProjectionStatus,
  AwpAdapterSpec,
  AwpNodeSpec,
  AwpTemplate,
  AwpToolSpec,
} from "../types.js";

export const AWP_COMPANION_ADAPTER_IDS = [
  "vercel_ai_sdk",
  "google_genai",
  "langgraph_js",
] as const;

export type AwpCompanionAdapterId = typeof AWP_COMPANION_ADAPTER_IDS[number];

export interface AwpAdapterClassification {
  adapter: string;
  status: AwpAdapterProjectionStatus;
  source: "declared" | "inferred";
  target?: string;
  runtime?: AwpAdapterSpec["runtime"];
  notes: string[];
  direct: boolean;
  requiresRuntime: boolean;
  supported: boolean;
}

const ADAPTER_ALIASES: Record<string, string> = {
  "google-genai": "google_genai",
  google_genai: "google_genai",
  gemini: "google_genai",
  "langgraph-js": "langgraph_js",
  langgraph: "langgraph_js",
  langgraph_js: "langgraph_js",
  "vercel-ai": "vercel_ai_sdk",
  "vercel-ai-sdk": "vercel_ai_sdk",
  vercel_ai: "vercel_ai_sdk",
  vercel_ai_sdk: "vercel_ai_sdk",
};

const DEFAULT_TARGETS: Record<string, string> = {
  google_genai: "models.generateContent",
  langgraph_js: "StateGraph",
  schift: "workflow_v2",
  vercel_ai_sdk: "generateText",
};

export function normalizeAwpAdapterId(adapter: string): string {
  return ADAPTER_ALIASES[adapter] ?? adapter;
}

export function classifyAwpAdapters(
  template: AwpTemplate,
): AwpAdapterClassification[] {
  const adapterIds = new Set([
    ...Object.keys(template.adapters ?? {}),
    "schift",
    ...AWP_COMPANION_ADAPTER_IDS,
  ]);
  return [...adapterIds]
    .sort()
    .map((adapterId) => classifyAwpAdapterProjection(template, adapterId));
}

export function classifyAwpAdapterProjection(
  template: AwpTemplate,
  adapter: string,
): AwpAdapterClassification {
  const adapterId = normalizeAwpAdapterId(adapter);
  const declared = template.adapters?.[adapterId];
  if (declared?.status) {
    return classification({
      adapter: adapterId,
      source: "declared",
      status: declared.status,
      target: declared.target,
      runtime: declared.runtime,
      notes: declared.notes ?? declaredReasons(declared),
    });
  }

  const unsupportedReasons = unsupportedPolicyReasons(template);
  if (unsupportedReasons.length > 0) {
    return classification({
      adapter: adapterId,
      source: "inferred",
      status: "unsupported",
      target: DEFAULT_TARGETS[adapterId],
      notes: unsupportedReasons,
    });
  }

  if (adapterId === "schift") {
    return classification({
      adapter: adapterId,
      source: "inferred",
      status: "direct",
      target: DEFAULT_TARGETS[adapterId],
      runtime: "schift",
      notes: ["Schift is the native managed Workflow v2 target."],
    });
  }

  const runtimeReasons = requiresRuntimeReasons(template, adapterId);
  if (runtimeReasons.length > 0) {
    return classification({
      adapter: adapterId,
      source: "inferred",
      status: "requires_runtime",
      target: DEFAULT_TARGETS[adapterId],
      runtime: "schift",
      notes: runtimeReasons,
    });
  }

  if (adapterId in DEFAULT_TARGETS) {
    return classification({
      adapter: adapterId,
      source: "inferred",
      status: "direct",
      target: DEFAULT_TARGETS[adapterId],
      notes: ["Template fits the adapter-safe direct projection subset."],
    });
  }

  return classification({
    adapter: adapterId,
    source: "inferred",
    status: "planned",
    notes: ["No declared adapter status is available for this target."],
  });
}

function classification(
  value: Omit<
    AwpAdapterClassification,
    "direct" | "requiresRuntime" | "supported"
  >,
): AwpAdapterClassification {
  return {
    ...value,
    direct: value.status === "direct",
    requiresRuntime: value.status === "requires_runtime",
    supported: value.status === "direct" || value.status === "requires_runtime",
  };
}

function declaredReasons(spec: AwpAdapterSpec): string[] {
  if (spec.status === "direct") {
    return ["Template declares direct adapter support."];
  }
  if (spec.status === "requires_runtime") {
    return ["Template declares that this target needs a host runtime."];
  }
  if (spec.status === "unsupported") {
    return ["Template declares this target unsupported."];
  }
  return ["Template declares this target planned."];
}

function unsupportedPolicyReasons(template: AwpTemplate): string[] {
  const reasons: string[] = [];
  for (const [nodeId, node] of Object.entries(template.graph.nodes ?? {})) {
    if (node.type === "code" && template.policies?.code?.enabled === false) {
      reasons.push(`Code node '${nodeId}' is disabled by policy.`);
    }
  }
  return reasons;
}

function requiresRuntimeReasons(
  template: AwpTemplate,
  adapterId: string,
): string[] {
  const reasons: string[] = [];
  const nodes = Object.entries(template.graph.nodes ?? {});
  const nonEndNodes = nodes.filter(([, node]) => node.type !== "end");

  for (const [nodeId, node] of nodes) {
    if (isRuntimeNode(node)) {
      reasons.push(`Node '${nodeId}' (${node.type}) needs runtime orchestration.`);
    }
    if (node.type === "tool" && node.ref) {
      const tool = template.tools?.[node.ref];
      if (tool && isRuntimeTool(tool)) {
        reasons.push(`Tool '${node.ref}' needs runtime-owned execution.`);
      }
    }
  }

  if (
    (adapterId === "vercel_ai_sdk" || adapterId === "google_genai") &&
    nonEndNodes.length > 1
  ) {
    reasons.push("Single-call model adapters cannot own multi-node graph traversal.");
  }

  return unique(reasons);
}

function isRuntimeNode(node: AwpNodeSpec): boolean {
  return (
    node.type === "connector" ||
    node.type === "human_approval" ||
    node.type === "subworkflow"
  );
}

function isRuntimeTool(tool: AwpToolSpec): boolean {
  return (
    tool.side_effect === "write" ||
    tool.side_effect === "external" ||
    tool.runtime === "schift" ||
    tool.runtime === "http" ||
    tool.runtime === "mcp" ||
    tool.execution?.mode === "server" ||
    tool.execution?.mode === "remote" ||
    tool.approval?.mode === "always" ||
    tool.approval?.mode === "conditional" ||
    tool.approval?.mode === "runtime"
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
