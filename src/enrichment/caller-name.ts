const INTERNAL_PREFIXES = [
  '/packages/sdk/',
  '/node-sdk/',
  'node_modules/@umbrelog/sdk',
  'node:internal',
  'node:async_hooks',
  'enrichment/caller-name',
  'logger.ts',
  'logger.js',
];

export function captureCallerFunctionName(): string | undefined {
  try {
    const stack = new Error().stack;
    if (!stack) return undefined;
    const lines = stack.split('\n').slice(1);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('at ')) {
        const isInternal = INTERNAL_PREFIXES.some((p) => line.includes(p));
        if (isInternal) continue;
        const fnMatch = trimmed.match(/^at (?:async )?([\w$.<]+)?/);
        const name = fnMatch?.[1];
        if (!name || name === 'Object.<anonymous>' || name === '<anonymous>') continue;
        if (name.startsWith('Logger.')) continue;
        return name;
      }
    }
  } catch {
    /* never fail logging */
  }
  return undefined;
}
