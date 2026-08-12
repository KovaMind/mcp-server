/**
 * Client-side credential detection — mirrors Kova Mind's blocklist.py.
 * Runs on text BEFORE it reaches the API, blocking accidental secret storage,
 * and on text coming BACK from the API (vault_execute output), redacting any
 * credential-shaped strings before they enter the AI context.
 */

interface CredentialPattern {
  type: string;
  regex: RegExp;
}

// Order matters: more specific prefixes must come before generic ones
const CREDENTIAL_PATTERNS: CredentialPattern[] = [
  { type: "OpenAI Project Key", regex: /sk-proj-[A-Za-z0-9_\-]{20,}/ },
  { type: "Anthropic API Key", regex: /sk-ant-[A-Za-z0-9_\-]{20,}/ },
  { type: "Stripe Key", regex: /sk_(live|test)_[0-9a-zA-Z]{24,}/ },
  { type: "OpenAI API Key", regex: /sk-[A-Za-z0-9_\-]{20,}/ },
  { type: "Kova Mind API Key", regex: /km_live_[A-Za-z0-9_\-]{16,}/ },
  { type: "Kova Mind Admin Key", regex: /km_admin_[A-Za-z0-9_\-]{16,}/ },
  { type: "GitHub Fine-Grained PAT", regex: /github_pat_[A-Za-z0-9_]{22,}/ },
  { type: "GitHub PAT", regex: /ghp_[A-Za-z0-9]{36}/ },
  { type: "AWS Access Key", regex: /AKIA[0-9A-Z]{16}/ },
  { type: "Bearer Token", regex: /Bearer\s+[A-Za-z0-9_\-\.]{20,}/ },
  { type: "Private Key", regex: /-----BEGIN\s+(RSA\s+|EC\s+)?PRIVATE KEY-----/ },
  { type: "SSN", regex: /(?!000|666|9\d{2})\d{3}[-\.]\d{2}[-\.]\d{4}/ },
  { type: "Password Inline", regex: /(?:password|passwd|pwd)\s*[=:]\s*\S{6,}/i },
  { type: "Slack Token", regex: /xox[bprs]-[0-9a-zA-Z\-]+/ },
  { type: "Google API Key", regex: /AIza[0-9A-Za-z\-_]{35}/ },
  { type: "npm Token", regex: /npm_[a-zA-Z0-9]{36}/ },
  { type: "Generic Hex Secret", regex: /\b[0-9a-fA-F]{32,64}\b/ },
];

export interface CredentialDetection {
  detected: boolean;
  type?: string;
}

export function detectCredentials(text: string): CredentialDetection {
  for (const pattern of CREDENTIAL_PATTERNS) {
    if (pattern.regex.test(text)) {
      return { detected: true, type: pattern.type };
    }
  }
  return { detected: false };
}

/**
 * Replace every credential-shaped substring with a labeled placeholder.
 * Used on vault_execute output so a target endpoint that echoes an injected
 * credential (headers, request dumps, error pages) can never leak the raw
 * value back into the AI's context.
 */
export function redactCredentials(text: string): string {
  let out = text;
  for (const pattern of CREDENTIAL_PATTERNS) {
    const flags = pattern.regex.flags.includes("g")
      ? pattern.regex.flags
      : pattern.regex.flags + "g";
    out = out.replace(new RegExp(pattern.regex.source, flags), `[REDACTED ${pattern.type}]`);
  }
  return out;
}
