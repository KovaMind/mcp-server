import { describe, it, expect } from "vitest";
import { detectCredentials, redactCredentials } from "../src/credential-guard.js";

describe("credential-guard", () => {
  describe("detects real credentials", () => {
    it("detects OpenAI API keys", () => {
      const result = detectCredentials("Here is my key: sk-abcdefghij1234567890abcd");
      expect(result.detected).toBe(true);
      expect(result.type).toBe("OpenAI API Key");
    });

    it("detects OpenAI project keys", () => {
      const result = detectCredentials("sk-proj-abcdefghijklmnopqrstuvwx");
      expect(result.detected).toBe(true);
      expect(result.type).toBe("OpenAI Project Key");
    });

    it("detects Anthropic keys", () => {
      const result = detectCredentials("sk-ant-api03-abcdefghijklmnopqrstuvwx");
      expect(result.detected).toBe(true);
      expect(result.type).toBe("Anthropic API Key");
    });

    it("detects Kova Mind API keys", () => {
      const result = detectCredentials("km_live_abcdef1234567890abcdef1234567890");
      expect(result.detected).toBe(true);
      expect(result.type).toBe("Kova Mind API Key");
    });

    it("detects GitHub PATs", () => {
      const result = detectCredentials("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij");
      expect(result.detected).toBe(true);
      expect(result.type).toBe("GitHub PAT");
    });

    it("detects GitHub fine-grained PATs", () => {
      const result = detectCredentials("github_pat_11AAAAAAA0abcdefghijklmnopqrstuvwxyz1234567890");
      expect(result.detected).toBe(true);
      expect(result.type).toBe("GitHub Fine-Grained PAT");
    });

    it("detects AWS access keys", () => {
      const result = detectCredentials("AKIAIOSFODNN7EXAMPLE");
      expect(result.detected).toBe(true);
      expect(result.type).toBe("AWS Access Key");
    });

    it("detects Bearer tokens", () => {
      const result = detectCredentials("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc");
      expect(result.detected).toBe(true);
      expect(result.type).toBe("Bearer Token");
    });

    it("detects private keys", () => {
      const result = detectCredentials("-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIB...");
      expect(result.detected).toBe(true);
      expect(result.type).toBe("Private Key");
    });

    it("detects EC private keys", () => {
      const result = detectCredentials("-----BEGIN EC PRIVATE KEY-----");
      expect(result.detected).toBe(true);
      expect(result.type).toBe("Private Key");
    });

    it("detects SSNs", () => {
      const result = detectCredentials("My SSN is 123-45-6789");
      expect(result.detected).toBe(true);
      expect(result.type).toBe("SSN");
    });

    it("detects inline passwords", () => {
      const result = detectCredentials("password=mysecretpassword123");
      expect(result.detected).toBe(true);
      expect(result.type).toBe("Password Inline");
    });

    it("detects password with colon", () => {
      const result = detectCredentials("PASSWORD: supersecret");
      expect(result.detected).toBe(true);
      expect(result.type).toBe("Password Inline");
    });

    it("detects Stripe keys", () => {
      // Built at runtime so GitHub push protection doesn't flag the fixture
      const fakeStripeKey = ["sk", "live", "abcdefghijklmnopqrstuvwxyz"].join("_");
      const result = detectCredentials(fakeStripeKey);
      expect(result.detected).toBe(true);
      expect(result.type).toBe("Stripe Key");
    });

    it("detects Slack tokens", () => {
      const result = detectCredentials("xoxb-123456789012-abcdefghij");
      expect(result.detected).toBe(true);
      expect(result.type).toBe("Slack Token");
    });

    it("detects Google API keys", () => {
      const result = detectCredentials("AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe");
      expect(result.detected).toBe(true);
      expect(result.type).toBe("Google API Key");
    });

    it("detects npm tokens", () => {
      const result = detectCredentials("npm_abcdefghijklmnopqrstuvwxyz1234567890");
      expect(result.detected).toBe(true);
      expect(result.type).toBe("npm Token");
    });

    it("detects generic hex secrets (32+ chars)", () => {
      const result = detectCredentials("secret: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4");
      expect(result.detected).toBe(true);
      expect(result.type).toBe("Generic Hex Secret");
    });
  });

  describe("does NOT flag false positives", () => {
    it("allows normal text", () => {
      const result = detectCredentials("I prefer TypeScript over JavaScript for large projects.");
      expect(result.detected).toBe(false);
    });

    it("allows short strings", () => {
      const result = detectCredentials("sk-short");
      expect(result.detected).toBe(false);
    });

    it("allows code snippets", () => {
      const result = detectCredentials("const x = 42; function foo() { return bar; }");
      expect(result.detected).toBe(false);
    });

    it("allows URLs", () => {
      const result = detectCredentials("https://github.com/KovaMind/mcp-server");
      expect(result.detected).toBe(false);
    });

    it("allows file paths", () => {
      const result = detectCredentials("/home/user/.config/settings.json");
      expect(result.detected).toBe(false);
    });

    it("allows short hex values", () => {
      const result = detectCredentials("color: #ff0000; background: #333;");
      expect(result.detected).toBe(false);
    });

    it("allows password field names without values", () => {
      const result = detectCredentials("The password field is required");
      expect(result.detected).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles empty string", () => {
      const result = detectCredentials("");
      expect(result.detected).toBe(false);
    });

    it("handles multiline text with credential", () => {
      const text = `Here is some context.
My OpenAI key is sk-proj-abcdefghijklmnopqrstuvwx
Please remember this.`;
      const result = detectCredentials(text);
      expect(result.detected).toBe(true);
    });

    it("detects first matching type when multiple present", () => {
      const text = "sk-proj-abc123def456ghi789wxyz01 and also ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";
      const result = detectCredentials(text);
      expect(result.detected).toBe(true);
      // OpenAI Project Key should match first since it's earlier in pattern list
      expect(result.type).toBe("OpenAI Project Key");
    });
  });

  describe("redactCredentials (vault output masking)", () => {
    it("redacts an OpenAI key with a labeled placeholder", () => {
      const out = redactCredentials("key is sk-abcdefghij1234567890abcd ok");
      expect(out).not.toContain("sk-abcdefghij1234567890abcd");
      expect(out).toContain("[REDACTED OpenAI API Key]");
    });

    it("redacts a Bearer token echoed in an HTTP dump", () => {
      const out = redactCredentials('{"headers": {"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc"}}');
      expect(out).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
      expect(out).toContain("[REDACTED Bearer Token]");
    });

    it("redacts multiple credentials of different types", () => {
      const out = redactCredentials(
        "first ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij then AKIAIOSFODNN7EXAMPLE"
      );
      expect(out).toContain("[REDACTED GitHub PAT]");
      expect(out).toContain("[REDACTED AWS Access Key]");
    });

    it("redacts repeated occurrences of the same credential", () => {
      const out = redactCredentials("AKIAIOSFODNN7EXAMPLE and again AKIAIOSFODNN7EXAMPLE");
      expect(out).not.toContain("AKIAIOSFODNN7EXAMPLE");
      expect(out.match(/\[REDACTED AWS Access Key\]/g)).toHaveLength(2);
    });

    it("preserves surrounding text", () => {
      const out = redactCredentials("Status: 200 OK — token AKIAIOSFODNN7EXAMPLE accepted");
      expect(out).toContain("Status: 200 OK");
      expect(out).toContain("accepted");
    });

    it("leaves clean text unchanged", () => {
      const text = "Execution succeeded. Status: 200. Plain response body.";
      expect(redactCredentials(text)).toBe(text);
    });
  });
});
