import { describe, it, expect } from "vitest";
import { readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DEFAULT_API_URL,
  HEALTH_PATH,
  buildEnvObject,
  buildServerEntry,
  mergeMcpConfig,
  buildClaudeCodeArgs,
  maskValue,
  renderPlan,
  writeJsonConfig,
  type SetupConfig,
  type ClientInfo,
} from "../src/setup.js";

const testConfig: SetupConfig = {
  apiUrl: "https://test.example.com",
  apiKey: "km_live_testkey1234567890",
  userId: "test-user",
};

describe("setup wizard", () => {
  describe("constants", () => {
    it("defaults to the .io API URL (never the dead .ai TLD)", () => {
      expect(DEFAULT_API_URL).toBe("https://api.kovamind.io");
    });

    it("health-checks the /api/health endpoint", () => {
      expect(HEALTH_PATH).toBe("/api/health");
    });
  });

  describe("buildEnvObject", () => {
    it("sets this server's env vars", () => {
      const env = buildEnvObject(testConfig);
      expect(env.KOVAMIND_API_URL).toBe("https://test.example.com");
      expect(env.KOVAMIND_API_KEY).toBe("km_live_testkey1234567890");
      expect(env.KOVAMIND_USER_ID).toBe("test-user");
    });

    it("omits KOVAMIND_USER_ID when empty", () => {
      const env = buildEnvObject({ ...testConfig, userId: "" });
      expect(env.KOVAMIND_USER_ID).toBeUndefined();
    });

    it("uses no donor-era env vars (agent id / vault passphrase)", () => {
      const env = buildEnvObject(testConfig);
      expect(Object.keys(env).sort()).toEqual([
        "KOVAMIND_API_KEY",
        "KOVAMIND_API_URL",
        "KOVAMIND_USER_ID",
      ]);
    });
  });

  describe("buildServerEntry", () => {
    it("runs the published package via npx", () => {
      const entry = buildServerEntry(testConfig) as any;
      expect(entry.command).toBe("npx");
      expect(entry.args).toEqual(["-y", "@kovamind/mcp-server"]);
      expect(entry.env.KOVAMIND_API_KEY).toBe("km_live_testkey1234567890");
    });
  });

  describe("mergeMcpConfig", () => {
    it("creates the kovamind entry from scratch", () => {
      const merged = mergeMcpConfig({}, testConfig) as any;
      expect(merged.mcpServers.kovamind.command).toBe("npx");
    });

    it("preserves other configured servers", () => {
      const existing = {
        mcpServers: { "other-server": { command: "node", args: ["other.js"] } },
      };
      const merged = mergeMcpConfig(existing, testConfig) as any;
      expect(merged.mcpServers["other-server"]).toBeDefined();
      expect(merged.mcpServers.kovamind).toBeDefined();
    });

    it("overwrites an existing kovamind entry", () => {
      const existing = { mcpServers: { kovamind: { command: "old", args: [] } } };
      const merged = mergeMcpConfig(existing, testConfig) as any;
      expect(merged.mcpServers.kovamind.command).toBe("npx");
      expect(merged.mcpServers.kovamind.env.KOVAMIND_API_URL).toBe("https://test.example.com");
    });

    it("does not mutate the input object", () => {
      const existing: Record<string, unknown> = { mcpServers: {} };
      mergeMcpConfig(existing, testConfig);
      expect(existing.mcpServers).toEqual({});
    });
  });

  describe("buildClaudeCodeArgs", () => {
    it("builds a user-scoped `claude mcp add` command", () => {
      const args = buildClaudeCodeArgs(testConfig);
      expect(args.slice(0, 3)).toEqual(["claude", "mcp", "add"]);
      expect(args).toContain("--scope");
      expect(args).toContain("user");
      expect(args).toContain("-e");
      expect(args).toContain("KOVAMIND_API_KEY=km_live_testkey1234567890");
      expect(args.slice(-3)).toEqual(["npx", "-y", "@kovamind/mcp-server"]);
    });
  });

  describe("maskValue", () => {
    it("shows only the first 4 and last 2 characters", () => {
      expect(maskValue("km_live_testkey1234567890")).toBe("km_l...90");
    });

    it("fully masks short values", () => {
      expect(maskValue("secret")).toBe("****");
    });
  });

  describe("renderPlan (dry-run)", () => {
    const clients: ClientInfo[] = [
      { name: "Claude Code", detected: true, configPath: null },
      { name: "Claude Desktop", detected: true, configPath: "/fake/claude_desktop_config.json" },
      { name: "Cursor", detected: false, configPath: "/fake/cursor/mcp.json" },
    ];

    it("lists only detected clients", () => {
      const plan = renderPlan(clients, testConfig);
      expect(plan).toContain("Claude Code");
      expect(plan).toContain("Claude Desktop");
      expect(plan).not.toContain("Cursor");
    });

    it("never contains the raw API key", () => {
      const plan = renderPlan(clients, testConfig);
      expect(plan).not.toContain("km_live_testkey1234567890");
      expect(plan).toContain(maskValue(testConfig.apiKey));
    });

    it("shows the CLI command for Claude Code and the target path for JSON clients", () => {
      const plan = renderPlan(clients, testConfig);
      expect(plan).toContain("claude mcp add");
      expect(plan).toContain("/fake/claude_desktop_config.json");
    });

    it("says so when nothing is detected", () => {
      const plan = renderPlan(
        [{ name: "Cursor", detected: false, configPath: "/fake" }],
        testConfig
      );
      expect(plan).toContain("No MCP clients detected.");
    });
  });

  describe("writeJsonConfig (against a temp dir, never real client configs)", () => {
    it("creates parent directories and merges into existing config", async () => {
      const testDir = join(tmpdir(), `kovamind-mcp-test-${Date.now()}`);
      try {
        const configPath = join(testDir, "a", "b", "config.json");
        await mkdir(join(testDir, "a", "b"), { recursive: true });
        await writeFile(
          configPath,
          JSON.stringify({ mcpServers: { other: { command: "node" } } }),
          "utf-8"
        );

        await writeJsonConfig(configPath, testConfig);

        const content = JSON.parse(await readFile(configPath, "utf-8"));
        expect(content.mcpServers.other).toBeDefined();
        expect(content.mcpServers.kovamind.command).toBe("npx");
        expect(content.mcpServers.kovamind.env.KOVAMIND_API_KEY).toBe("km_live_testkey1234567890");
      } finally {
        await rm(testDir, { recursive: true, force: true });
      }
    });

    it("starts fresh when the file does not exist", async () => {
      const testDir = join(tmpdir(), `kovamind-mcp-test-${Date.now()}-fresh`);
      try {
        const configPath = join(testDir, "nested", "config.json");
        await writeJsonConfig(configPath, testConfig);

        const content = JSON.parse(await readFile(configPath, "utf-8"));
        expect(content.mcpServers.kovamind).toBeDefined();
      } finally {
        await rm(testDir, { recursive: true, force: true });
      }
    });
  });
});
