import { buildInteractionMetadata } from '../../interactions/context';
import { normalizeEndpoint } from '../normalize';
import type { TrafficRegistry } from '../registry';
import {
  generateCorrelationId,
  readCorrelationIdFromHeaders,
  readRequestIdFromHeaders,
} from './request-headers';
import { runWithTraceContextAsync, withRuntimeInteractionContext, patchTraceContext } from '../../trace-context/context';
import { enrichTraceContext, mapTraceRootStatusToExecutionStatus } from '../../trace-context/execution-context';
import {
  completeTraceRoot,
  emitTraceRoot,
  isTraceBufferActive,
} from '../../trace-context/buffer';
import { emitProviderTraceInteraction } from '../../trace-context/runtime-interaction';
import { buildTraceContext } from '../../trace-context/root';
import {
  readCorrelationIdFromTraceHeaders,
  readParentTraceIdFromHeaders,
  readRequestIdFromTraceHeaders,
  readTraceIdFromHeaders,
} from '../../trace-context/headers';
import {
  formatHttpEntryName,
  httpTraceRootStatus,
  isHealthProbeRequest,
} from '../../trace-context/http';
import { resolveHttpProcessNameWithFallback } from '../../trace-context/process-name-resolver';
import { generateId } from '../../utils/id-generator';
import type { TraceContext } from '../../trace-context/types';

type ExpressLike = {
  use: (fn: (req: ExpressReq, res: ExpressRes, next: () => void) => void) => void;
};

type ExpressReq = {
  method?: string;
  path?: string;
  originalUrl?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
};
type ExpressRes = {
  statusCode: number;
  on: (event: string, fn: () => void) => void;
};

export type ExpressTraceOptions = {
  enabled: boolean;
  rootService: string;
  /** Explicit process name — highest priority. */
  processName?: (req: ExpressReq) => string | undefined | null;
};

export type ExpressAttachOptions = Pick<ExpressTraceOptions, 'processName'>;

function resolveInboundProcessName(
  req: ExpressReq,
  method: string,
  rawPath: string,
  entryName: string,
  processName?: ExpressTraceOptions['processName'],
): string {
  const explicit = processName?.(req);
  if (explicit != null && String(explicit).trim()) {
    return String(explicit).trim();
  }
  return resolveHttpProcessNameWithFallback(method, rawPath);
}

type ActiveInboundTrace = { context: TraceContext; isNewRoot: boolean };

function requestPath(req: ExpressReq): string {
  return req.originalUrl?.split('?')[0] ?? req.path ?? req.url ?? '/';
}

function buildInboundTraceContext(
  req: ExpressReq,
  rootService: string,
  entryName: string,
  processName: string,
): ActiveInboundTrace {
  const incomingTraceId = readTraceIdFromHeaders(req.headers);
  const parentTraceId = readParentTraceIdFromHeaders(req.headers);
  const requestId = readRequestIdFromTraceHeaders(req.headers);
  const correlationId = readCorrelationIdFromTraceHeaders(req.headers);

  if (incomingTraceId) {
    return {
      isNewRoot: false,
      context: enrichTraceContext({
        traceId: incomingTraceId,
        executionId: incomingTraceId,
        process: processName,
        parentTraceId: parentTraceId ?? null,
        requestId,
        correlationId,
        entryType: 'http',
        entryName,
        rootService,
        startedAt: Date.now(),
        hot: false,
      }),
    };
  }

  return {
    isNewRoot: true,
    context: buildTraceContext(
      {
        entryType: 'http',
        entryName,
        process: processName,
        parentTraceId: parentTraceId ?? null,
        requestId,
        correlationId,
      },
      rootService,
    ),
  };
}

/** Attach inbound HTTP middleware to Express-compatible apps. */
export function instrumentExpress(
  app: ExpressLike,
  registry: TrafficRegistry | null,
  traceOptions?: ExpressTraceOptions,
): void {
  const traceEnabled = Boolean(traceOptions?.enabled && isTraceBufferActive());
  const rootService = traceOptions?.rootService ?? 'unknown-service';

  app.use((req, res, next) => {
    const started = Date.now();
    const rawPath = requestPath(req);
    const method = String(req.method ?? 'GET').toUpperCase();
    const normalizedPath = normalizeEndpoint(rawPath);
    const entryName = formatHttpEntryName(method, rawPath);
    const processName = resolveInboundProcessName(
      req,
      method,
      rawPath,
      entryName,
      traceOptions?.processName,
    );
    const probe = isHealthProbeRequest({ method, rawPath, headers: req.headers });

    const onFinish = (
      active: ActiveInboundTrace | undefined,
      inboundInteractionId?: string,
    ): void => {
      const duration_ms = Date.now() - started;
      const statusCode = res.statusCode;

      if (traceEnabled && !probe && active && inboundInteractionId) {
        if (active.isNewRoot) {
          const status = httpTraceRootStatus(statusCode);
          if (status === 'failed') active.context.hot = true;
          patchTraceContext({
            executionStatus: mapTraceRootStatusToExecutionStatus(status),
            hot: status === 'failed',
          });
          completeTraceRoot(active.context, status);
        }
        emitProviderTraceInteraction(active.context, {
          interactionKind: 'http',
          interactionId: inboundInteractionId,
          parentRuntimeInteractionId: active.context.parentRuntimeInteractionId ?? null,
          runtimeInteractionType: 'http',
          provider: 'express',
          operation: method,
          target: normalizedPath,
          fingerprint: normalizedPath,
          startedAt: started,
          durationMs: duration_ms,
          statusCode,
          error: statusCode >= 500,
          direction: 'inbound',
          entryType: 'http',
          entryName,
        });
      }

      if (registry) {
        const correlationId = readCorrelationIdFromHeaders(req.headers) ?? generateCorrelationId();
        const requestId = readRequestIdFromHeaders(req.headers);
        const requestMeta = buildInteractionMetadata(
          {
            correlationId,
            ...(requestId ? { requestId } : {}),
          },
          inboundInteractionId,
        );
        registry.recordHttp({
          direction: 'inbound',
          provider: 'express',
          fingerprint: normalizedPath,
          method,
          status_code: statusCode,
          duration_ms,
          metadata: requestMeta,
        });
      }
    };

    if (!traceEnabled || probe) {
      res.on('finish', () => onFinish(undefined));
      next();
      return;
    }

    const active = buildInboundTraceContext(req, rootService, entryName, processName);
    if (active.isNewRoot) {
      emitTraceRoot(active.context);
    }

    const inboundInteractionId = generateId();
    void runWithTraceContextAsync(active.context, () =>
      new Promise<void>((resolve) => {
        withRuntimeInteractionContext('http', inboundInteractionId, () => {
          res.on('finish', () => {
            onFinish(active, inboundInteractionId);
            resolve();
          });
          next();
        });
      }),
    );
  });
}
