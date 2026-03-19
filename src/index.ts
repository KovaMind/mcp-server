import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = process.env.KOVAMIND_API_URL ?? "https://api.kovamind.ai";
const API_KEY = process.env.KOVAMIND_API_KEY ?? "";
const DEFAULT_USER_ID = process.env.KOVAMIND_USER_ID ?? "";

if (!API_KEY) {
  console.error("KOVAMIND_API_KEY environment variable is required");
  process.exit(1);
}

async function apiRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<Record<string, any>> {
  const url = `${API_URL.replace(/\/+$/, "")}${path}`;
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json();
}

function resolveUserId(user_id?: string): string | null {
  const uid = user_id || DEFAULT_USER_ID;
  return uid || null;
}

const server = new McpServer({
  name: "kovamind",
  version: "0.1.0",
});

// Tool: memory_extract
server.tool(
  "memory_extract",
  "Extract memory patterns from a conversation. Parses messages and stores learned patterns about the user.",
  {
    conversation: z
      .array(z.object({ role: z.string(), content: z.string() }))
      .describe("Array of conversation messages with role and content"),
    user_id: z
      .string()
      .optional()
      .describe("User ID (defaults to KOVAMIND_USER_ID env var)"),
    session_id: z
      .string()
      .optional()
      .describe("Optional session ID for grouping extractions"),
  },
  async ({ conversation, user_id, session_id }) => {
    const uid = resolveUserId(user_id);
    if (!uid) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: user_id is required. Provide it as a parameter or set KOVAMIND_USER_ID.",
          },
        ],
      };
    }

    try {
      const body: Record<string, unknown> = { conversation, user_id: uid };
      if (session_id) body.session_id = session_id;

      const data = await apiRequest("POST", "/memory/extract", body);
      const patterns = (data.patterns ?? data.results ?? []) as any[];

      const lines = [`Extracted ${patterns.length} pattern(s):\n`];
      for (const p of patterns) {
        lines.push(
          `- [${p.category ?? "unknown"}] ${p.pattern} (confidence: ${((p.confidence ?? 1) * 100).toFixed(0)}%)`
        );
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Extract failed: ${err.message?.replace(/https?:\/\/[^\s]+/g, "[redacted]")}` }],
      };
    }
  }
);

// Tool: memory_recall
server.tool(
  "memory_recall",
  "Retrieve relevant memory patterns for a given context. Use this to recall what you know about a user.",
  {
    context: z
      .string()
      .describe(
        "Natural language context or query to search memories for"
      ),
    user_id: z
      .string()
      .optional()
      .describe("User ID (defaults to KOVAMIND_USER_ID env var)"),
    max_patterns: z
      .number()
      .optional()
      .default(10)
      .describe("Maximum number of patterns to return (1-100)"),
    min_confidence: z
      .number()
      .optional()
      .default(0.3)
      .describe("Minimum confidence threshold (0.0-1.0)"),
  },
  async ({ context, user_id, max_patterns, min_confidence }) => {
    const uid = resolveUserId(user_id);
    if (!uid) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: user_id is required. Provide it as a parameter or set KOVAMIND_USER_ID.",
          },
        ],
      };
    }

    try {
      const data = await apiRequest("POST", "/memory/retrieve", {
        context,
        user_id: uid,
        max_patterns,
        min_confidence,
      });

      const patterns = (data.patterns ??
        data.results ??
        data.memories ??
        []) as any[];

      if (patterns.length === 0) {
        return {
          content: [
            { type: "text" as const, text: "No matching memories found." },
          ],
        };
      }

      const lines = [`Found ${patterns.length} memory pattern(s):\n`];
      for (const p of patterns) {
        lines.push(
          `- [${p.category ?? "unknown"}] ${p.pattern} (confidence: ${((p.confidence ?? 1) * 100).toFixed(0)}%, id: ${p.id})`
        );
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Recall failed: ${err.message?.replace(/https?:\/\/[^\s]+/g, "[redacted]")}` }],
      };
    }
  }
);

// Tool: memory_reinforce
server.tool(
  "memory_reinforce",
  "Reinforce or deny a stored memory pattern. Use 'confirmed' when the user validates a memory, 'denied' when they contradict it.",
  {
    pattern_id: z.string().describe("The ID of the pattern to reinforce"),
    reinforcement_type: z
      .enum(["confirmed", "denied", "strengthened", "weakened"])
      .describe("Type of reinforcement to apply"),
    context: z
      .string()
      .optional()
      .describe("Optional explanation for the reinforcement"),
  },
  async ({ pattern_id, reinforcement_type, context }) => {
    try {
      const body: Record<string, unknown> = {
        pattern_id,
        reinforcement_type,
      };
      if (context) body.context = context;

      const data = await apiRequest("POST", "/memory/reinforce", body);
      const success = data.success ?? true;

      return {
        content: [
          {
            type: "text" as const,
            text: success
              ? `Pattern ${pattern_id} ${reinforcement_type} successfully.`
              : `Failed to reinforce pattern ${pattern_id}.`,
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Reinforce failed: ${err.message?.replace(/https?:\/\/[^\s]+/g, "[redacted]")}` }],
      };
    }
  }
);

// Tool: memory_surprise
server.tool(
  "memory_surprise",
  "Score how surprising/novel new content is compared to existing memories. High scores indicate contradictions with stored knowledge.",
  {
    content: z.string().describe("The content to evaluate for novelty"),
    user_id: z
      .string()
      .optional()
      .describe("User ID (defaults to KOVAMIND_USER_ID env var)"),
  },
  async ({ content, user_id }) => {
    const uid = resolveUserId(user_id);
    if (!uid) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: user_id is required. Provide it as a parameter or set KOVAMIND_USER_ID.",
          },
        ],
      };
    }

    try {
      const data = await apiRequest("POST", "/memory/surprise", {
        content,
        user_id: uid,
      });

      const score = (data.surprise_score ?? data.score ?? 0) as number;
      const route = data.route ?? "update";

      let interpretation: string;
      if (score < 0.3) {
        interpretation = "Familiar — reinforces existing memory";
      } else if (score < 0.7) {
        interpretation = "New information — stored as update";
      } else {
        interpretation = "Contradicts existing memory — flagged";
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Surprise score: ${score.toFixed(2)}\nRoute: ${route}\nInterpretation: ${interpretation}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Surprise failed: ${err.message?.replace(/https?:\/\/[^\s]+/g, "[redacted]")}` }],
      };
    }
  }
);

// Tool: memory_health
server.tool(
  "memory_health",
  "Check if the Kova Mind API is healthy and responding.",
  {},
  async () => {
    try {
      const data = await apiRequest("GET", "/health");
      return {
        content: [
          {
            type: "text" as const,
            text: `Status: ${data.status ?? "unknown"}\nVersion: ${data.version ?? "unknown"}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Health check failed: ${err.message}`,
          },
        ],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
