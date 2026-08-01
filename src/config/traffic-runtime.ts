import type { TrafficConfig } from '../traffic/types';

/** Enabled traffic categories (grows when attach* is called). */
export type TrafficCategoryState = {
  http: boolean;
  database: boolean;
  messaging: boolean;
  files: boolean;
};

const EMPTY_TRAFFIC_CATEGORIES: TrafficCategoryState = {
  http: false,
  database: false,
  messaging: false,
  files: false,
};

export function buildTrafficConfigFromState(
  state: TrafficCategoryState,
  advanced?: TrafficConfig,
): TrafficConfig {
  const httpEnabled = state.http;
  const merged: TrafficConfig = {
    http: { enabled: httpEnabled, ...advanced?.http },
    database: { enabled: state.database, ...advanced?.database },
    messaging: { enabled: state.messaging, ...advanced?.messaging },
    files: { enabled: state.files, ...advanced?.files },
  };
  if (advanced?.http) merged.http = { ...merged.http, ...advanced.http, enabled: httpEnabled };
  if (advanced?.database) {
    merged.database = { ...merged.database, ...advanced.database, enabled: state.database };
  }
  if (advanced?.messaging) {
    merged.messaging = { ...merged.messaging, ...advanced.messaging, enabled: state.messaging };
  }
  if (advanced?.files) {
    merged.files = { ...merged.files, ...advanced.files, enabled: state.files };
  }
  return merged;
}

/** All categories off until logger.attach* / messaging wrappers opt in. */
export function initialTrafficCategoryState(): TrafficCategoryState {
  return { ...EMPTY_TRAFFIC_CATEGORIES };
}

export function mergeTrafficCategoryState(
  current: TrafficCategoryState,
  partial: Partial<TrafficCategoryState>,
): { next: TrafficCategoryState; changed: boolean } {
  const next = { ...current };
  let changed = false;
  for (const key of ['http', 'database', 'messaging', 'files'] as const) {
    if (partial[key] && !next[key]) {
      next[key] = true;
      changed = true;
    }
  }
  return { next, changed };
}
