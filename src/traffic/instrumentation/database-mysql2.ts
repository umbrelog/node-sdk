import { buildInteractionMetadata, createInteractionId } from '../../interactions/context';
import { getTraceContext, withRuntimeInteractionContext } from '../../trace-context/context';
import { emitProviderTraceInteraction } from '../../trace-context/runtime-interaction';
import { normalizeSqlQuery } from '../normalize';
import type { TrafficRegistry } from '../registry';

type Mysql2Connection = {
  query: (
    sql: string,
    values?: unknown[] | ((err: Error | null, result: unknown) => void),
    callback?: (err: Error | null, result: unknown) => void,
  ) => unknown;
};

/** Wrap mysql2 connection `.query` — V1 MySQL instrumentation. */
export function instrumentMysql2(
  conn: Mysql2Connection,
  registry: TrafficRegistry,
  databaseId?: string,
): void {
  const original = conn.query.bind(conn);
  conn.query = function instrumentedMysqlQuery(
    sql: string,
    values?: unknown[] | ((err: Error | null, result: unknown) => void),
    callback?: (err: Error | null, result: unknown) => void,
  ): unknown {
    const started = Date.now();
    const fingerprint = normalizeSqlQuery(sql);
    const interactionId = createInteractionId();
    const queryMeta = buildInteractionMetadata(undefined, interactionId);
    const cb = typeof values === 'function' ? values : callback;

    const done = (err: Error | null): void => {
      const duration_ms = Date.now() - started;
      const msg = err?.message ?? '';
      const timedOut = /timeout|ETIMEDOUT/i.test(msg);
      registry.recordDatabase({
        provider: 'mysql',
        fingerprint,
        database_id: databaseId,
        duration_ms,
        error: !!err,
        timeout: timedOut,
        retry: /retry/i.test(msg),
        metadata: queryMeta,
      });
      const active = getTraceContext();
      emitProviderTraceInteraction(active, {
        interactionKind: 'database',
        interactionId,
        parentRuntimeInteractionId: active?.parentRuntimeInteractionId ?? null,
        runtimeInteractionType: 'mysql',
        provider: 'mysql',
        operation: 'query',
        target: fingerprint,
        fingerprint,
        startedAt: started,
        durationMs: duration_ms,
        error: !!err,
        timeout: timedOut,
      });
    };

    if (typeof values === 'function') {
      const cbOnly = values;
      return withRuntimeInteractionContext('mysql', interactionId, () =>
        (original as (...args: unknown[]) => unknown)(sql, (err: Error | null, result: unknown) => {
          done(err);
          cbOnly(err, result);
        }),
      );
    }

    if (cb) {
      return withRuntimeInteractionContext('mysql', interactionId, () =>
        original(sql, values, (err: Error | null, result: unknown) => {
          done(err);
          cb(err, result);
        }),
      );
    }

    const result = withRuntimeInteractionContext('mysql', interactionId, () => original(sql, values));
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      return (result as Promise<unknown>)
        .then((r) => {
          done(null);
          return r;
        })
        .catch((err: Error) => {
          done(err);
          throw err;
        });
    }
    done(null);
    return result;
  };
}
