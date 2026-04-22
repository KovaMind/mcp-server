import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = process.env.KOVAMIND_API_URL ?? "https://api.kovamind.io";
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
  version: "0.4.2",
});

function sanitizeErr(msg: string | undefined): string {
  return (msg ?? "unknown error").replace(/https?:\/\/[^\s]+/g, "[redacted]");
}

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
        content: [{ type: "text" as const, text: `Extract failed: ${sanitizeErr(err.message)}` }],
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
        content: [{ type: "text" as const, text: `Recall failed: ${sanitizeErr(err.message)}` }],
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
        content: [{ type: "text" as const, text: `Reinforce failed: ${sanitizeErr(err.message)}` }],
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
        content: [{ type: "text" as const, text: `Surprise failed: ${sanitizeErr(err.message)}` }],
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
            text: `Health check failed: ${sanitizeErr(err.message)}`,
          },
        ],
      };
    }
  }
);


// ── Vault v2 Tools ──────────────────────────────────────────────────

// Tool: vault_setup
server.tool(
  "vault_setup",
  "Set up the secrets vault for the first time. Returns 12 recovery words — store them safely. The vault stores credentials that agents can use without ever seeing the values.",
  {
    passphrase: z.string().min(8).describe("Vault passphrase (min 8 chars)"),
  },
  async ({ passphrase }) => {
    try {
      const data = await apiRequest("POST", "/vault/v2/setup", { passphrase });
      return {
        content: [{ type: "text" as const, text: `Vault created. Recovery words: ${(data.recovery_words as string[]).join(", ")}\n\nStore these words safely — they are the only way to recover the vault.` }],
      };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Vault setup failed: ${sanitizeErr(err.message)}` }] };
    }
  }
);

// Tool: vault_unlock
server.tool(
  "vault_unlock",
  "Unlock the secrets vault with your passphrase. Required before storing or using credentials.",
  {
    passphrase: z.string().min(8).describe("Vault passphrase"),
  },
  async ({ passphrase }) => {
    try {
      const data = await apiRequest("POST", "/vault/v2/unlock", { passphrase });
      return { content: [{ type: "text" as const, text: `Vault ${data.status}.` }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Vault unlock failed: ${sanitizeErr(err.message)}` }] };
    }
  }
);

// Tool: vault_lock
server.tool(
  "vault_lock",
  "Lock the secrets vault. Zeros the encryption key from memory.",
  {},
  async () => {
    try {
      const data = await apiRequest("POST", "/vault/v2/lock", {});
      return { content: [{ type: "text" as const, text: `Vault ${data.status}.` }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Vault lock failed: ${sanitizeErr(err.message)}` }] };
    }
  }
);

// Tool: vault_store
server.tool(
  "vault_store",
  "Store a new credential in the vault. Returns an opaque handle — you will never see the credential values.",
  {
    label: z.string().min(1).describe("Human-readable label for the credential"),
    schema_type: z.string().min(1).describe("Type: username_password, api_key, api_key_pair, database, ssh_key, oauth, custom"),
    fields: z.record(z.string()).describe("Credential fields (key-value pairs)"),
    tags: z.string().optional().describe("Comma-separated tags"),
  },
  async ({ label, schema_type, fields, tags }) => {
    try {
      const body: Record<string, unknown> = { label, schema_type, fields };
      if (tags) body.tags = tags;
      const data = await apiRequest("POST", "/vault/v2/credentials", body);
      return { content: [{ type: "text" as const, text: `Stored credential "${data.label}" with handle: ${data.handle}` }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Vault store failed: ${sanitizeErr(err.message)}` }] };
    }
  }
);

// Tool: vault_handles
server.tool(
  "vault_handles",
  "List available credential handles. You will never see the credential values — only the handle, label, and type.",
  {},
  async () => {
    try {
      const data = await apiRequest("GET", "/vault/v2/handles");
      const handles = (data.handles ?? []) as Array<{ handle: string; label: string; schema_type: string }>;
      if (handles.length === 0) {
        return { content: [{ type: "text" as const, text: "No credentials stored." }] };
      }
      const lines = handles.map((h, i) => `${i + 1}. [${h.schema_type}] ${h.label} (handle: ${h.handle})`);
      return { content: [{ type: "text" as const, text: `${handles.length} credential(s):\n${lines.join("\n")}` }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Vault handles failed: ${sanitizeErr(err.message)}` }] };
    }
  }
);


// Tool: vault_find
server.tool(
  "vault_find",
  "Find credentials matching a search query. Returns matching handles with relevance scores. You will never see credential values.",
  {
    query: z.string().min(1).describe("Search query (e.g., 'GitHub login', 'API key', 'database')"),
  },
  async ({ query }) => {
    try {
      const data = await apiRequest("GET", `/vault/v2/find?q=${encodeURIComponent(query)}`);
      const results = (data.results ?? []) as Array<{ handle: string; label: string; schema_type: string; score: number }>;
      if (results.length === 0) {
        return { content: [{ type: "text" as const, text: "No matching credentials found." }] };
      }
      const lines = results.map((r, i) => `${i + 1}. [${r.schema_type}] ${r.label} (handle: ${r.handle}, score: ${r.score.toFixed(2)})`);
      return { content: [{ type: "text" as const, text: `Found ${results.length} match(es):\n${lines.join("\n")}` }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Vault find failed: ${sanitizeErr(err.message)}` }] };
    }
  }
);

// Tool: vault_execute
server.tool(
  "vault_execute",
  "Execute an action using a credential. The credential is never exposed to you — it flows through a secure side channel.",
  {
    handle: z.string().optional().default("").describe("Credential handle from vault_handles (omit if using auto_detect)"),
    action: z.string().min(1).describe("Action: http_request or browser_fill"),
    target: z.string().min(1).describe("Target URL"),
    mapping: z.record(z.string()).optional().describe('Field-to-target mapping (e.g., {" key": "header:Authorization"})'),
    auto_detect: z.string().optional().describe("Query to auto-detect credential instead of providing handle"),
  },
  async ({ handle, action, target, mapping, auto_detect }) => {
    try {
      const body: Record<string, unknown> = { handle, action, target };
      if (mapping) body.mapping = mapping;
      if (auto_detect) body.auto_detect = auto_detect;
      const data = await apiRequest("POST", "/vault/v2/execute", body);
      const success = data.success as boolean;
      const output = data.output as string;
      const error = data.error as string | null;
      const statusCode = data.status_code as number | null;

      let text = success ? "Execution succeeded." : "Execution failed.";
      if (statusCode) text += ` Status: ${statusCode}.`;
      if (error) text += ` Error: ${error}.`;
      if (output) text += `\n\nOutput:\n${output.slice(0, 2000)}`;

      return { content: [{ type: "text" as const, text }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Vault execute failed: ${sanitizeErr(err.message)}` }] };
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
