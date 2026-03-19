import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { execSync, spawn } from "child_process";

const ROOT = join(__dirname, "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const src = readFileSync(join(ROOT, "src", "index.ts"), "utf-8");

// ── Package structure ────────────────────────────────────────────────

describe("package.json", () => {
  it("has correct name", () => {
    expect(pkg.name).toBe("@kovamind/mcp-server");
  });

  it("has bin entry pointing to dist/index.js", () => {
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin["kovamind-mcp"]).toBe("./dist/index.js");
  });

  it("has MCP SDK dependency", () => {
    expect(pkg.dependencies["@modelcontextprotocol/sdk"]).toBeDefined();
  });

  it("has zod dependency", () => {
    expect(pkg.dependencies["zod"]).toBeDefined();
  });

  it('has "type": "module" for ESM', () => {
    expect(pkg.type).toBe("module");
  });

  it("has valid semver version", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("has correct author", () => {
    expect(pkg.author).toContain("Kova Mind");
  });

  it("has repository URL", () => {
    expect(pkg.repository.url).toContain("KovaMind/mcp-server");
  });

  it("requires node >= 18", () => {
    expect(pkg.engines.node).toBe(">=18");
  });
});

// ── Source code validation ───────────────────────────────────────────

describe("source code", () => {
  it("imports McpServer from MCP SDK", () => {
    expect(src).toContain('from "@modelcontextprotocol/sdk/server/mcp.js"');
  });

  it("imports StdioServerTransport", () => {
    expect(src).toContain('from "@modelcontextprotocol/sdk/server/stdio.js"');
  });

  it("imports zod", () => {
    expect(src).toContain('from "zod"');
  });

  it("registers exactly 5 tools", () => {
    const toolMatches = src.match(/server\.tool\(/g);
    expect(toolMatches).toHaveLength(5);
  });

  it("registers memory_extract tool", () => {
    expect(src).toContain('"memory_extract"');
  });

  it("registers memory_recall tool", () => {
    expect(src).toContain('"memory_recall"');
  });

  it("registers memory_reinforce tool", () => {
    expect(src).toContain('"memory_reinforce"');
  });

  it("registers memory_surprise tool", () => {
    expect(src).toContain('"memory_surprise"');
  });

  it("registers memory_health tool", () => {
    expect(src).toContain('"memory_health"');
  });

  it("checks for KOVAMIND_API_KEY", () => {
    expect(src).toContain("KOVAMIND_API_KEY");
    expect(src).toContain("process.exit(1)");
  });

  it("defaults API URL to https://api.kovamind.ai", () => {
    expect(src).toContain('"https://api.kovamind.ai"');
  });

  it("uses Bearer auth in API requests", () => {
    expect(src).toContain("`Bearer ${API_KEY}`");
  });

  it("has error handling (try/catch) in extract tool", () => {
    const extractBlock = src.slice(
      src.indexOf('"memory_extract"'),
      src.indexOf('"memory_recall"')
    );
    expect(extractBlock).toContain("catch");
  });

  it("has error handling (try/catch) in recall tool", () => {
    const recallBlock = src.slice(
      src.indexOf('"memory_recall"'),
      src.indexOf('"memory_reinforce"')
    );
    expect(recallBlock).toContain("catch");
  });

  it("has error handling (try/catch) in reinforce tool", () => {
    const reinforceBlock = src.slice(
      src.indexOf('"memory_reinforce"'),
      src.indexOf('"memory_surprise"')
    );
    expect(reinforceBlock).toContain("catch");
  });

  it("has error handling (try/catch) in surprise tool", () => {
    const surpriseBlock = src.slice(
      src.indexOf('"memory_surprise"'),
      src.indexOf('"memory_health"')
    );
    expect(surpriseBlock).toContain("catch");
  });

  it("has error handling (try/catch) in health tool", () => {
    const healthBlock = src.slice(src.indexOf('"memory_health"'));
    expect(healthBlock).toContain("catch");
  });

  it("resolveUserId falls back to env var", () => {
    expect(src).toContain("DEFAULT_USER_ID");
    expect(src).toContain("KOVAMIND_USER_ID");
  });
});

// ── Integration: process behavior ───────────────────────────────────

describe("integration", () => {
  it("exits with error when KOVAMIND_API_KEY is missing", () => {
    try {
      execSync("node dist/index.js", {
        cwd: ROOT,
        timeout: 5000,
        env: { ...process.env, KOVAMIND_API_KEY: "" },
        stdio: "pipe",
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.status).not.toBe(0);
      expect(err.stderr.toString()).toContain("KOVAMIND_API_KEY");
    }
  });

  it("starts successfully when KOVAMIND_API_KEY is set", async () => {
    const child = spawn("node", ["dist/index.js"], {
      cwd: ROOT,
      env: { ...process.env, KOVAMIND_API_KEY: "km_test_fake" },
      stdio: "pipe",
    });

    let stderr = "";
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    // Give it 2 seconds to start — if it hasn't crashed, it's running
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        resolve();
      }, 2000);

      child.on("exit", (code) => {
        clearTimeout(timer);
        // If it exits immediately, that's a failure
        if (code !== null && code !== 0) {
          resolve();
        }
      });
    });

    // Server should NOT have printed fatal errors
    expect(stderr).not.toContain("Fatal error");
  }, 10000); // 10s timeout for this test
});

// ── Built output validation ─────────────────────────────────────────

describe("built output", () => {
  it("dist/index.js exists", () => {
    const distContent = readFileSync(join(ROOT, "dist", "index.js"), "utf-8");
    expect(distContent.length).toBeGreaterThan(0);
  });

  it("dist/index.js has shebang", () => {
    const distContent = readFileSync(join(ROOT, "dist", "index.js"), "utf-8");
    expect(distContent.startsWith("#!/usr/bin/env node")).toBe(true);
  });
});
