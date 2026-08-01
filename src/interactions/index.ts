export type {
  InteractionKind,
  InteractionStatus,
  InteractionContextMetadata,
  InteractionObservation,
  InteractionTrafficCategory,
} from './types';
export {
  INTERACTION_ID_KEY,
  interactionKindToTrafficCategory,
} from './types';

export { createInteractionId, buildInteractionMetadata } from './context';

export {
  recordInteraction,
  createInteractionObservation,
  httpInteractionKind,
} from './record';

export type {
  RuntimeProviderId,
  ProviderCatalogEntry,
  PostgresAttachOptions,
  MysqlAttachOptions,
  RedisAttachOptions,
  InstrumentTargets,
} from './providers/types';
export { RUNTIME_PROVIDER_CATALOG } from './providers/types';
