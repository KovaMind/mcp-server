import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("MCP Server package", () => {
  it("package.json has correct bin entry", () => {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "..", "package.json"), "utf-8")
    );
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin["kovamind-mcp"]).toBe("./dist/index.js");
  });

  it("package.json has correct name", () => {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "..", "package.json"), "utf-8")
    );
    expect(pkg.name).toBe("@kovamind/mcp-server");
  });

  it("package.json has MCP SDK dependency", () => {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "..", "package.json"), "utf-8")
    );
    expect(pkg.dependencies["@modelcontextprotocol/sdk"]).toBeDefined();
  });
});
