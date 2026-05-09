export type AwpSdkTargetStatus = "native" | "planned";

export interface AwpSdkTarget {
  id: string;
  label: string;
  language: "typescript" | "python" | "http" | "protocol";
  status: AwpSdkTargetStatus;
  supportLevel: "full_workflow" | "tool_surface" | "connector_surface";
  adapterTarget: string;
  notes: string[];
}

export const SUPPORTED_SDK_TARGETS: AwpSdkTarget[] = [
  {
    id: "schift",
    label: "Schift API and UI",
    language: "http",
    status: "native",
    supportLevel: "full_workflow",
    adapterTarget: "Managed agents, hosted workflows, and dashboard builder state",
    notes: [
      "Preserve AWP ids and graph node ids in execution traces.",
      "Emit token, logging, and audit events using native AWP event names.",
    ],
  },
  {
    id: "langgraph-python",
    label: "LangGraph Python",
    language: "python",
    status: "planned",
    supportLevel: "full_workflow",
    adapterTarget: "StateGraph",
    notes: [
      "Compile graph nodes and edges into StateGraph nodes and transitions.",
      "Use checkpointers when human approval or audit checkpoints are required.",
      "Map subworkflow nodes to LangGraph subgraphs.",
    ],
  },
  {
    id: "langgraph-js",
    label: "LangGraph JS",
    language: "typescript",
    status: "planned",
    supportLevel: "full_workflow",
    adapterTarget: "StateGraph",
    notes: [
      "Compile graph nodes and edges into a StateGraph.",
      "Map AWP events to LangGraph stream/custom events.",
      "Use persistence and interrupts for approval checkpoints.",
    ],
  },
  {
    id: "vercel-ai-sdk",
    label: "Vercel AI SDK",
    language: "typescript",
    status: "planned",
    supportLevel: "full_workflow",
    adapterTarget: "generateText, streamText, tool, and bounded step loops",
    notes: [
      "Compile tool declarations into AI SDK tool definitions.",
      "Use max_steps as a stop condition for multi-step agent loops.",
      "Emit comparable AWP events around model and tool calls.",
    ],
  },
  {
    id: "openai-responses-agents",
    label: "OpenAI Responses and Agents SDK",
    language: "http",
    status: "planned",
    supportLevel: "tool_surface",
    adapterTarget: "Responses function tools, built-in tools, MCP tools, and Agents SDK orchestration",
    notes: [
      "Map OpenAI call_id to provider_call_id and always mint protocol_call_id.",
      "Preserve response id, output item id, strict schema mode, and usage fields.",
      "Treat approval as host/runtime policy around tool execution.",
    ],
  },
  {
    id: "anthropic-messages",
    label: "Anthropic Messages",
    language: "http",
    status: "planned",
    supportLevel: "tool_surface",
    adapterTarget: "Claude tools and tool_result blocks",
    notes: [
      "Map tool_use.id to provider_call_id.",
      "Return complete tool_result blocks for parallel tool uses.",
      "Map streaming content blocks and usage deltas into AWP events.",
    ],
  },
  {
    id: "gemini-function-calling",
    label: "Gemini Function Calling",
    language: "http",
    status: "planned",
    supportLevel: "tool_surface",
    adapterTarget: "Function declarations and function response parts",
    notes: [
      "Generate protocol_call_id because per-call provider ids are not always exposed consistently.",
      "Map function_calling_config modes to AWP tool_choice modes.",
      "Preserve response id, model version, safety ratings, and usage metadata.",
    ],
  },
  {
    id: "mcp-tools",
    label: "Model Context Protocol tools",
    language: "protocol",
    status: "planned",
    supportLevel: "connector_surface",
    adapterTarget: "MCP tool list and call surfaces",
    notes: [
      "Map MCP tool schemas into AWP tools with schema_format=mcp_tool.",
      "Preserve server identity in tool audit metadata.",
      "Use connector scopes to represent MCP server capabilities.",
    ],
  },
];
