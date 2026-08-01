/**
 * Reserved field policy
 *
 * Event fields (timestamp, level, message) are owned by the SDK from the
 * logger call — they cannot be supplied or overridden via createLogger metadata
 * or per-log metadata. They are stripped before metadata merge.
 *
 * Identity fields (service, env, region) are intentionally overridable with precedence:
 *   createLogger < per-log metadata
 *
 * First-class createLogger keys (`service`, `env`, `region`, `serviceMetadata`) set
 * logger-level identity; they are not treated as spoofing.
 */
export const RESERVED_EVENT_FIELDS = [
  'timestamp',
  'level',
  'message',
  'log_type',
  'logType',
  'id',
  'metadata',
] as const;

export type ReservedEventField = (typeof RESERVED_EVENT_FIELDS)[number];

export function stripReservedEventFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...fields };
  for (const key of RESERVED_EVENT_FIELDS) {
    delete out[key];
  }
  return out;
}
