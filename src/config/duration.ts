/** Parse `5000`, `"60s"`, `"5m"` into milliseconds. */
export function parseDurationMs(value: string | number | undefined, fallbackMs: number): number {
  if (value == null) return fallbackMs;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value !== 'string') return fallbackMs;
  const trimmed = value.trim().toLowerCase();
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(trimmed);
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return fallbackMs;
  const unit = match[2] ?? 'ms';
  const multipliers: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
  return Math.floor(amount * (multipliers[unit] ?? 1));
}
