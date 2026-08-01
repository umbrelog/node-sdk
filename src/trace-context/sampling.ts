import type { TraceInteractionRecord } from './types';

export type TraceSamplingConfig = {
  enabled: boolean;
  baseHealthySampleRate: number;
  targetInteractionsPerMinute: number;
  minSampleRate: number;
  maxSampleRate: number;
};

export const DEFAULT_TRACE_SAMPLING: TraceSamplingConfig = {
  enabled: true,
  baseHealthySampleRate: 0.05,
  targetInteractionsPerMinute: 200,
  minSampleRate: 0.01,
  maxSampleRate: 0.1,
};

let interactionsInWindow = 0;
let windowStartedAt = Date.now();

function effectiveHealthyRate(config: TraceSamplingConfig): number {
  const now = Date.now();
  if (now - windowStartedAt > 60_000) {
    windowStartedAt = now;
    interactionsInWindow = 0;
  }
  interactionsInWindow += 1;
  const adaptive = Math.min(
    1,
    Math.max(0.1, interactionsInWindow / Math.max(1, config.targetInteractionsPerMinute)),
  );
  const rate = config.baseHealthySampleRate * adaptive;
  return Math.min(config.maxSampleRate, Math.max(config.minSampleRate, rate));
}

function hashTraceBucket(traceId: string): number {
  let h = 0;
  for (let i = 0; i < traceId.length; i += 1) {
    h = (h * 31 + traceId.charCodeAt(i)) >>> 0;
  }
  return h % 100;
}

export function shouldPersistInteraction(
  interaction: TraceInteractionRecord,
  options: { hotTrace: boolean; config: TraceSamplingConfig },
): boolean {
  if (interaction.interaction_kind === 'trace_root') return true;
  if (options.hotTrace) return true;
  if (interaction.error || interaction.timeout) return true;
  if (!options.config.enabled) return true;
  const bucket = hashTraceBucket(interaction.trace_id);
  return bucket < effectiveHealthyRate(options.config) * 100;
}

/** @internal */
export function resetTraceSamplingForTests(): void {
  interactionsInWindow = 0;
  windowStartedAt = Date.now();
}
