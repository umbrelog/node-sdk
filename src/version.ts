import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let cached: string | undefined;

export function getSdkVersion(): string {
  if (cached !== undefined) return cached;
  try {
    const raw = readFileSync(join(__dirname, '..', 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    cached = typeof parsed.version === 'string' ? parsed.version : 'unknown';
  } catch {
    cached = 'unknown';
  }
  return cached;
}
