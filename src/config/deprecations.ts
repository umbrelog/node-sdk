import type { LoggerConfig } from './types';

const warned = new Set<string>();

const REMOVED_RUNTIME_INTERACTION_KEYS = [
  'outbound',
  'database',
  'storage',
  'messaging',
  'downloads',
  'inbound',
] as const;

export function warnDeprecatedConfig(config: LoggerConfig): void {
  const ri = config.runtimeInteractions as Record<string, unknown> | undefined;
  if (ri) {
    for (const key of REMOVED_RUNTIME_INTERACTION_KEYS) {
      if (ri[key] !== undefined && !warned.has(`ri-${key}`)) {
        warned.add(`ri-${key}`);
        console.warn(
          `[UmbreLog SDK] runtimeInteractions.${key} was removed — use logger.attach* / runWith* helpers instead`,
        );
      }
    }
  }
  if (config.operationalSystems !== undefined && !warned.has('operationalSystems')) {
    warned.add('operationalSystems');
    console.warn(
      '[UmbreLog SDK] operationalSystems is deprecated and ignored — configure databases, caches, and brokers in the Umbrelog platform (Operational Systems)',
    );
  }
}
