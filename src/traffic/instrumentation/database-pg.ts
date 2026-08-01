import { buildInteractionMetadata, createInteractionId } from '../../interactions/context';
import { getTraceContext, withRuntimeInteractionContext } from '../../trace-context/context';
import { emitProviderTraceInteraction } from '../../trace-context/runtime-interaction';
import { normalizeSqlQuery } from '../normalize';
import type { TrafficRegistry } from '../registry';

type PgClient = {
  query: (
    text: string,
    values?: unknown[],
    callback?: (err: Error | null, result: unknown) => void,
  ) => unknown;
};

/** Wrap a pg Pool/Client `.query` — V1 PostgreSQL instrumentation. */
export function instrumentPg(client: PgClient, registry: TrafficRegistry, databaseId?: string): void {
  const original = client.query.bind(client);
  client.query = function instrumentedPgQuery(
    text: string,
    values?: unknown[] | ((err: Error | null, result: unknown) => void),
    callback?: (err: Error | null, result: unknown) => void,
  ): unknown {
    const started = Date.now();
    const sql = typeof text === 'string' ? text : '';
    const fingerprint = normalizeSqlQuery(sql);
    const interactionId = createInteractionId();
    const queryMeta = buildInteractionMetadata(undefined, interactionId);
    const cb = typeof values === 'function' ? values : callback;

    const done = (err: Error | null): void => {
      const duration_ms = Date.now() - started;
      const msg = err?.message ?? '';
      const timedOut = /timeout|ETIMEDOUT/i.test(msg);
      registry.recordDatabase({
        provider: 'postgresql',
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
        runtimeInteractionType: 'postgres',
        provider: 'postgresql',
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
      return withRuntimeInteractionContext('postgres', interactionId, () =>
        (original as (...args: unknown[]) => unknown)(text, (err: Error | null, result: unknown) => {
          done(err);
          cbOnly(err, result);
        }),
      );
    }

    if (cb) {
      return withRuntimeInteractionContext('postgres', interactionId, () =>
        original(text, values, (err: Error | null, result: unknown) => {
          done(err);
          cb(err, result);
        }),
      );
    }

    const result = withRuntimeInteractionContext('postgres', interactionId, () => original(text, values));
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
