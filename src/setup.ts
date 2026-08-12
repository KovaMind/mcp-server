/**
 * `kovamind-mcp setup` — interactive setup wizard.
 *
 * Health-checks the API, then writes the kovamind MCP server entry into every
 * detected client (Claude Code, Claude Desktop, Cursor, Windsurf, Cline,
 * Antigravity, Gemini CLI). Ported from the private kovamind-mcp build and
 * adapted to this server: env vars KOVAMIND_API_URL / KOVAMIND_API_KEY /
 * KOVAMIND_USER_ID, default URL https://api.kovamind.io, health check at
 * /api/health.
 *
 * `--dry-run` (alias `--print`) renders exactly what would be written —
 * with the API key masked — without touching any client config.
 */

import { createInterface } from "node:readline";
import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir, platform, userInfo, hostname } from "node:os";
import { execSync } from "node:child_process";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { URL } from "node:url";

export const DEFAULT_API_URL = "https://api.kovamind.io";
export const HEALTH_PATH = "/api/health";
const PACKAGE_NAME = "@kovamind/mcp-server";

export interface SetupConfig {
  apiUrl: string;
  apiKey: string;
  userId: string;
}

export interface ClientInfo {
  name: string;
  detected: boolean;
  configPath: string | null;
}

// ── Pure config-generation helpers (unit-tested, no I/O) ────────────

export function buildEnvObject(config: SetupConfig): Record<string, string> {
  const env: Record<string, string> = {
    KOVAMIND_API_URL: config.apiUrl,
    KOVAMIND_API_KEY: config.apiKey,
  };
  if (config.userId) {
    env.KOVAMIND_USER_ID = config.userId;
  }
  return env;
}

export function buildServerEntry(config: SetupConfig): Record<string, unknown> {
  return {
    command: "npx",
    args: ["-y", PACKAGE_NAME],
    env: buildEnvObject(config),
  };
}

/** Merge the kovamind entry into an existing MCP config object (non-mutating). */
export function mergeMcpConfig(
  existing: Record<string, unknown>,
  config: SetupConfig
): Record<string, unknown> {
  const merged = { ...existing };
  const mcpServers = { ...((merged.mcpServers as Record<string, unknown>) ?? {}) };
  mcpServers.kovamind = buildServerEntry(config);
  merged.mcpServers = mcpServers;
  return merged;
}

/** The `claude mcp add` invocation used for Claude Code (which has no JSON file to edit). */
export function buildClaudeCodeArgs(config: SetupConfig): string[] {
  const envArgs = Object.entries(buildEnvObject(config)).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
  return [
    "claude", "mcp", "add",
    "kovamind",
    "--scope", "user",
    ...envArgs,
    "--",
    "npx", "-y", PACKAGE_NAME,
  ];
}

/** Same masking pattern as the vault: first 4 chars + last 2, never the middle. */
export function maskValue(value: string): string {
  if (value.length <= 6) return "****";
  return value.slice(0, 4) + "..." + value.slice(-2);
}

/** Render the dry-run plan. The API key is always masked here — the full value never hits the terminal. */
export function renderPlan(clients: ClientInfo[], config: SetupConfig): string {
  const masked: SetupConfig = { ...config, apiKey: maskValue(config.apiKey) };
  const lines: string[] = ["Dry run — nothing will be written.", ""];
  const detected = clients.filter((c) => c.detected);
  if (detected.length === 0) {
    lines.push("No MCP clients detected.");
    return lines.join("\n");
  }
  for (const client of detected) {
    lines.push(`${client.name}:`);
    if (client.name === "Claude Code") {
      lines.push(`  would run: ${buildClaudeCodeArgs(masked).join(" ")}`);
    } else if (client.configPath) {
      lines.push(`  would merge into: ${client.configPath}`);
      const entry = JSON.stringify({ mcpServers: { kovamind: buildServerEntry(masked) } }, null, 2);
      lines.push(...entry.split("\n").map((l) => `  ${l}`));
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ── Client detection ────────────────────────────────────────────────

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function getClaudeDesktopConfigPath(): string {
  const os = platform();
  if (os === "darwin") {
    return join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (os === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  }
  return join(homedir(), ".config", "claude", "claude_desktop_config.json");
}

function getCursorConfigPath(): string {
  const os = platform();
  if (os === "darwin") {
    return join(homedir(), "Library", "Application Support", "Cursor", "User", "globalStorage", "cursor.mcp", "mcp.json");
  }
  if (os === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Cursor", "User", "globalStorage", "cursor.mcp", "mcp.json");
  }
  return join(homedir(), ".config", "Cursor", "User", "globalStorage", "cursor.mcp", "mcp.json");
}

function getWindsurfConfigPath(): string {
  return join(homedir(), ".codeium", "windsurf", "mcp_config.json");
}

function getClineConfigPath(): string {
  const os = platform();
  if (os === "darwin") {
    return join(homedir(), "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json");
  }
  if (os === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json");
  }
  return join(homedir(), ".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json");
}

function getAntigravityConfigPath(): string {
  return join(homedir(), ".gemini", "antigravity", "mcp_config.json");
}

function getGeminiCLIConfigPath(): string {
  return join(homedir(), ".gemini", "settings.json");
}

function hasCLI(command: string): boolean {
  try {
    execSync(`${command} --version`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export async function detectClients(): Promise<ClientInfo[]> {
  const desktopPath = getClaudeDesktopConfigPath();
  const cursorPath = getCursorConfigPath();
  const windsurfPath = getWindsurfConfigPath();
  const clinePath = getClineConfigPath();
  const antigravityPath = getAntigravityConfigPath();
  const geminiPath = getGeminiCLIConfigPath();

  return [
    { name: "Claude Code", detected: hasCLI("claude"), configPath: null },
    {
      name: "Claude Desktop",
      detected: (await exists(desktopPath)) || (await exists(join(desktopPath, ".."))),
      configPath: desktopPath,
    },
    {
      name: "Cursor",
      detected: (await exists(join(cursorPath, ".."))) || (await exists(join(homedir(), ".cursor"))),
      configPath: cursorPath,
    },
    {
      name: "Windsurf",
      detected: await exists(join(windsurfPath, "..")),
      configPath: windsurfPath,
    },
    {
      name: "Cline",
      detected: await exists(join(clinePath, "..")),
      configPath: clinePath,
    },
    {
      name: "Antigravity",
      detected: await exists(join(homedir(), ".gemini", "antigravity")),
      configPath: antigravityPath,
    },
    {
      name: "Gemini CLI",
      detected: hasCLI("gemini") || (await exists(geminiPath)),
      configPath: geminiPath,
    },
  ];
}

// ── Config writers ──────────────────────────────────────────────────

export async function writeJsonConfig(configPath: string, config: SetupConfig): Promise<void> {
  await mkdir(join(configPath, ".."), { recursive: true });

  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(configPath, "utf-8"));
  } catch {
    // File doesn't exist or is invalid — start fresh
  }

  await writeFile(configPath, JSON.stringify(mergeMcpConfig(existing, config), null, 2) + "\n", "utf-8");
}

async function writeClaudeCodeConfig(config: SetupConfig): Promise<void> {
  try {
    execSync(buildClaudeCodeArgs(config).join(" "), { stdio: "pipe" });
  } catch (err) {
    throw new Error(`Failed to configure Claude Code: ${(err as Error).message}`);
  }
}

// ── Health check ────────────────────────────────────────────────────

// Same node:https transport as the server itself — Cloudflare Bot Fight Mode
// on api.kovamind.io rejects undici's TLS fingerprint, so no fetch here either.
export function healthCheck(
  apiUrl: string,
  apiKey: string,
  timeoutMs = 10000
): Promise<{ status: string; version?: string }> {
  const fullUrl = new URL(`${apiUrl.replace(/\/+$/, "")}${HEALTH_PATH}`);
  const transport = fullUrl.protocol === "http:" ? httpRequest : httpsRequest;

  const options = {
    method: "GET",
    hostname: fullUrl.hostname,
    port: fullUrl.port || (fullUrl.protocol === "http:" ? 80 : 443),
    path: `${fullUrl.pathname}${fullUrl.search}`,
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      Accept: "application/json",
      "User-Agent": `Mozilla/5.0 (compatible; kovamind-mcp-setup; +https://github.com/KovaMind/mcp-server)`,
      "X-Kovamind-Client": "mcp-server-setup",
    },
  };

  return new Promise((resolve, reject) => {
    const req = transport(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          reject(new Error(`API error ${status}`));
          return;
        }
        try {
          const data = JSON.parse(raw);
          resolve({ status: data.status ?? "unknown", version: data.version });
        } catch {
          reject(new Error("Invalid JSON response from health endpoint"));
        }
      });
    });
    req.on("error", (err: Error) => reject(err));
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Health check timed out after ${timeoutMs}ms`));
    });
    req.end();
  });
}

// ── Interactive wizard ──────────────────────────────────────────────

function log(msg: string) {
  console.error(msg);
}

export async function runSetup(args: string[] = []): Promise<void> {
  const dryRun = args.includes("--dry-run") || args.includes("--print");

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const ask = (question: string, defaultValue?: string): Promise<string> => {
    const suffix = defaultValue ? ` (${defaultValue})` : "";
    return new Promise((resolve) => {
      rl.question(`${question}${suffix}: `, (answer) => {
        resolve(answer.trim() || defaultValue || "");
      });
    });
  };

  log("\n╔══════════════════════════════════════════╗");
  log("║      Kova Mind MCP Server Setup          ║");
  log("╚══════════════════════════════════════════╝\n");

  // Step 1: API URL
  const apiUrl = await ask("API URL", DEFAULT_API_URL);

  // Step 2: API Key
  let apiKey = "";
  while (!apiKey) {
    apiKey = await ask("API Key (km_live_* or km_admin_*)");
    if (!apiKey.match(/^km_(live|admin)_/)) {
      log("Invalid API key format. Expected km_live_* or km_admin_*");
      apiKey = "";
    }
  }

  // Step 3: User ID
  let defaultUser: string;
  try {
    defaultUser = userInfo().username;
  } catch {
    defaultUser = hostname();
  }
  const userId = await ask("User ID", defaultUser);

  const config: SetupConfig = { apiUrl, apiKey, userId };

  // Step 4: Test connection
  log("\nTesting connection...");
  try {
    const health = await healthCheck(apiUrl, apiKey);
    log(`  Health: ${health.status}${health.version ? ` (v${health.version})` : ""}`);
  } catch (err) {
    log(`  Health check failed: ${(err as Error).message}`);
    const retry = await ask("Continue anyway? (y/n)", "n");
    if (retry.toLowerCase() !== "y") {
      log("Setup cancelled.");
      rl.close();
      return;
    }
  }

  // Step 5: Detect clients
  log("\nDetecting installed MCP clients...");
  const clients = await detectClients();
  const detected = clients.filter((c) => c.detected);

  if (detected.length === 0) {
    log("  No MCP clients detected.");
    log("  You can manually configure your client with these env vars:");
    log(`    KOVAMIND_API_URL=${config.apiUrl}`);
    log(`    KOVAMIND_API_KEY=${maskValue(config.apiKey)}  (use your full key)`);
    if (config.userId) {
      log(`    KOVAMIND_USER_ID=${config.userId}`);
    }
    rl.close();
    return;
  }

  for (const client of detected) {
    log(`  Found: ${client.name}`);
  }

  // Step 6: Write configs (or print the plan)
  if (dryRun) {
    log("");
    log(renderPlan(clients, config));
    rl.close();
    return;
  }

  log("\nWriting configurations...");
  let successCount = 0;

  for (const client of detected) {
    try {
      if (client.name === "Claude Code") {
        await writeClaudeCodeConfig(config);
      } else if (client.configPath) {
        await writeJsonConfig(client.configPath, config);
      }
      log(`  ${client.name}: configured`);
      successCount++;
    } catch (err) {
      log(`  ${client.name}: failed — ${(err as Error).message}`);
    }
  }

  log(`\nSetup complete. ${successCount} client(s) configured.`);
  log("Restart your MCP client(s) to activate Kova Mind.\n");

  rl.close();
}
