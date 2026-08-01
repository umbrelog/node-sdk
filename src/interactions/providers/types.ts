import type { InteractionKind, InteractionTrafficCategory } from '../types';
import type { instrumentExpress } from '../../traffic/instrumentation/http-express';
import type { instrumentPg } from '../../traffic/instrumentation/database-pg';
import type { instrumentMysql2 } from '../../traffic/instrumentation/database-mysql2';
import type { instrumentRedis } from '../../traffic/instrumentation/database-redis';

/**
 * Provider plugin contract — each `attach*` registers instrumentation that emits
 * `InteractionObservation` values via `recordInteraction`.
 */
export type RuntimeProviderId =
  | 'express'
  | 'fetch'
  | 'postgresql'
  | 'mysql'
  | 'mongodb'
  | 'redis'
  | 'kafka'
  | 'rabbitmq'
  | 'sqs'
  | 'sns'
  | 'pubsub'
  | 's3'
  | 'blob'
  | 'elasticsearch';

export type ProviderCatalogEntry = {
  id: RuntimeProviderId;
  /** Traffic category this provider contributes to when attached. */
  category: InteractionTrafficCategory;
  /** Primary interaction kind(s) emitted. */
  kinds: InteractionKind[];
  /** Config category flag that must be allowed (see RuntimeInteractionsConfig). */
  configCategory: 'outbound' | 'database' | 'messaging' | 'downloads' | 'inboundHttp';
};

/** Registry of known providers — extend when adding attach* APIs. */
export const RUNTIME_PROVIDER_CATALOG: Record<RuntimeProviderId, ProviderCatalogEntry> = {
  express: {
    id: 'express',
    category: 'http',
    kinds: ['http.inbound'],
    configCategory: 'inboundHttp',
  },
  fetch: {
    id: 'fetch',
    category: 'http',
    kinds: ['http.outbound'],
    configCategory: 'outbound',
  },
  postgresql: {
    id: 'postgresql',
    category: 'database',
    kinds: ['db.query'],
    configCategory: 'database',
  },
  mysql: {
    id: 'mysql',
    category: 'database',
    kinds: ['db.query'],
    configCategory: 'database',
  },
  mongodb: {
    id: 'mongodb',
    category: 'database',
    kinds: ['db.query'],
    configCategory: 'database',
  },
  redis: {
    id: 'redis',
    category: 'database',
    kinds: ['db.query'],
    configCategory: 'database',
  },
  kafka: {
    id: 'kafka',
    category: 'messaging',
    kinds: ['messaging.publish', 'messaging.consume'],
    configCategory: 'messaging',
  },
  rabbitmq: {
    id: 'rabbitmq',
    category: 'messaging',
    kinds: ['messaging.publish', 'messaging.consume'],
    configCategory: 'messaging',
  },
  sqs: {
    id: 'sqs',
    category: 'messaging',
    kinds: ['messaging.publish', 'messaging.consume'],
    configCategory: 'messaging',
  },
  sns: {
    id: 'sns',
    category: 'messaging',
    kinds: ['messaging.publish'],
    configCategory: 'messaging',
  },
  pubsub: {
    id: 'pubsub',
    category: 'messaging',
    kinds: ['messaging.publish', 'messaging.consume'],
    configCategory: 'messaging',
  },
  s3: {
    id: 's3',
    category: 'files',
    kinds: ['file.upload', 'file.download'],
    configCategory: 'downloads',
  },
  blob: {
    id: 'blob',
    category: 'files',
    kinds: ['file.upload', 'file.download'],
    configCategory: 'downloads',
  },
  elasticsearch: {
    id: 'elasticsearch',
    category: 'database',
    kinds: ['db.query'],
    configCategory: 'database',
  },
};

export type PostgresAttachOptions = { databaseId?: string };
export type MysqlAttachOptions = { databaseId?: string };
export type RedisAttachOptions = { redisId?: string };

/** Targets for `logger.instrument()`. */
export type InstrumentTargets = {
  express?: Parameters<typeof instrumentExpress>[0];
  postgres?: { client: Parameters<typeof instrumentPg>[0]; databaseId?: string };
  mysql2?: { pool: Parameters<typeof instrumentMysql2>[0]; databaseId?: string };
  redis?: { client: Parameters<typeof instrumentRedis>[0]; redisId?: string };
};
