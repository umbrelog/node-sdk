import { generateId } from '../utils/id-generator';
import { INTERACTION_ID_KEY } from './types';

export { INTERACTION_ID_KEY };

/** New interaction instance id. */
export function createInteractionId(): string {
  return generateId();
}

/**
 * Metadata bag for runtime interaction events.
 * Pass explicit fields (e.g. correlationId from inbound HTTP headers) when available.
 */
export function buildInteractionMetadata(
  explicit?: Record<string, string | number | boolean>,
  interactionId?: string,
): Record<string, string | number | boolean> {
  const merged: Record<string, string | number | boolean> = { ...explicit };
  merged[INTERACTION_ID_KEY] =
    (typeof explicit?.[INTERACTION_ID_KEY] === 'string' &&
    explicit[INTERACTION_ID_KEY].trim().length > 0
      ? explicit[INTERACTION_ID_KEY]
      : undefined) ??
    interactionId ??
    createInteractionId();
  return merged;
}
