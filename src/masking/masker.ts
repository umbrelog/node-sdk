export const DEFAULT_SENSITIVE_KEYS = [
  'password', 'passwd', 'pwd', 'token', 'access_token', 'refresh_token',
  'api_key', 'apikey', 'api-key', 'authorization', 'auth', 'credential', 'credentials',
  'credit_card', 'creditcard', 'credit-card', 'card_number', 'cardnumber', 'card-number',
  'cvv', 'cvc', 'ssn', 'social_security', 'secret', 'secret_key', 'secretkey',
  'private_key', 'privatekey', 'session', 'session_id', 'sessionid', 'cookie', 'cookies',
  'client_secret', 'bearer',
];

/** Built-in free-text patterns applied to message strings (in addition to customer maskPatterns). */
export const DEFAULT_MESSAGE_MASK_PATTERNS: string[] = [
  String.raw`\bBearer\s+[A-Za-z0-9\-._~+/]+=*`,
  String.raw`\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b`,
  String.raw`-----BEGIN(?:\s+\w+)?\s+PRIVATE KEY-----[\s\S]*?-----END(?:\s+\w+)?\s+PRIVATE KEY-----`,
  String.raw`\b(sk_live_|sk_test_|rk_live_|rk_test_)[A-Za-z0-9]{16,}\b`,
  String.raw`\bAKIA[0-9A-Z]{16}\b`,
  String.raw`\bghp_[A-Za-z0-9]{20,}\b`,
  String.raw`\bgithub_pat_[A-Za-z0-9_]{20,}\b`,
  String.raw`\bxox[baprs]-[A-Za-z0-9-]{10,}\b`,
  String.raw`\b(dl_|ubc_)[A-Za-z0-9_-]{16,}\b`,
  String.raw`\b(password|passwd|pwd|token|access_token|refresh_token|api_key|apikey|authorization|secret|client_secret)\s*[=:]\s*\S+`,
];

import type { LogEntry } from '../types';

export class Masker {
  private patterns: RegExp[];
  private sensitiveKeys: Set<string>;
  private replacement: string;
  private enabled: boolean;

  constructor(
    maskPatterns: string[] = [],
    sensitiveKeys: string[] = [],
    replacement = '***',
    enabled = true,
  ) {
    this.replacement = replacement;
    this.enabled = enabled;
    // Avoid /g on key-test patterns — RegExp.test() advances lastIndex and can flip-flop.
    this.patterns = [...DEFAULT_MESSAGE_MASK_PATTERNS, ...maskPatterns].map(
      (pattern) => new RegExp(pattern, 'gi'),
    );
    this.sensitiveKeys = new Set(
      [...DEFAULT_SENSITIVE_KEYS, ...sensitiveKeys].map((key) => key.toLowerCase()),
    );
  }

  enable(): void { this.enabled = true; }
  disable(): void { this.enabled = false; }
  isEnabled(): boolean { return this.enabled; }
  addSensitiveKey(key: string): void { this.sensitiveKeys.add(key.toLowerCase()); }
  removeSensitiveKey(key: string): void { this.sensitiveKeys.delete(key.toLowerCase()); }
  getSensitiveKeys(): string[] { return Array.from(this.sensitiveKeys); }

  maskObject(obj: unknown): unknown {
    if (!this.enabled) return obj;
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map((item) => this.maskObject(item));
    if (typeof obj === 'object') {
      const masked: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        masked[key] = this.isSensitiveKey(key) ? this.replacement : this.maskObject(value);
      }
      return masked;
    }
    if (typeof obj === 'string') return this.maskString(obj);
    return obj;
  }

  isSensitiveKey(key: string): boolean {
    const lowerKey = key.toLowerCase();
    if (this.sensitiveKeys.has(lowerKey)) return true;
    for (const sensitiveKey of this.sensitiveKeys) {
      if (lowerKey.includes(sensitiveKey)) return true;
    }
    for (const pattern of this.patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(key)) {
        pattern.lastIndex = 0;
        return true;
      }
    }
    return false;
  }

  maskString(value: string): string {
    if (!this.enabled) return value;
    let masked = value;
    for (const pattern of this.patterns) {
      pattern.lastIndex = 0;
      masked = masked.replace(pattern, this.replacement);
    }
    return masked;
  }

  maskLogEntry(entry: LogEntry): LogEntry {
    return {
      ...entry,
      attributes: this.maskObject(entry.attributes) as Record<string, unknown>,
      message: this.maskString(entry.message),
    };
  }
}
