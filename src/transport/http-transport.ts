import type { LogEntry } from '../types';
import { PolicyAction } from '../policy/types';
import { getSdkVersion } from '../version';

type StructuredLog = Record<string, unknown>;

export class HttpTransport {
  private ingestionUrl: string;
  private service: string;
  private env: string;
  private authToken?: string;
  private inFlight = new Set<Promise<void>>();

  constructor(ingestionUrl: string, service: string, env = 'production', authToken?: string) {
    this.ingestionUrl = ingestionUrl.replace(/\/$/, '');
    this.service = service;
    this.env = env;
    this.authToken = authToken;
  }

  send(
    entry: LogEntry,
    action: PolicyAction,
    explicitLevel?: 'error' | 'warn' | 'info' | 'debug' | 'fatal',
  ): void {
    const wireAction = action === PolicyAction.BUFFER_ONLY ? PolicyAction.BUFFER_ONLY : PolicyAction.SEND;
    const structuredLog = this.convertToStructuredLog(entry, explicitLevel);
    if (wireAction === PolicyAction.BUFFER_ONLY) {
      structuredLog._buffered_only = true;
    }
    const p = this.sendAsync(structuredLog).catch(() => {});
    this.inFlight.add(p);
    void p.finally(() => this.inFlight.delete(p));
  }

  async flush(timeoutMs = 3000): Promise<void> {
    if (this.inFlight.size === 0) return;
    await Promise.race([
      Promise.allSettled([...this.inFlight]),
      new Promise<void>((resolve) => {
        const t = setTimeout(resolve, timeoutMs);
        if (typeof t.unref === 'function') t.unref();
      }),
    ]);
  }

  private isErrorLevel(entry: LogEntry): boolean {
    const messageLower = entry.message.toLowerCase();
    if (
      messageLower.includes('error') ||
      messageLower.includes('exception') ||
      messageLower.includes('failed') ||
      messageLower.includes('failure')
    ) {
      return true;
    }
    const attrs = entry.attributes || {};
    if (attrs.error || attrs.err || attrs.exception || attrs.stack) return true;
    if (typeof attrs.statusCode === 'number' && attrs.statusCode >= 500) return true;
    if (attrs.queryError || attrs.databaseError) return true;
    return false;
  }

  private convertToStructuredLog(
    entry: LogEntry,
    explicitLevel?: 'error' | 'warn' | 'info' | 'debug' | 'fatal',
  ): StructuredLog {
    let level: string;
    if (explicitLevel) {
      level = explicitLevel;
    } else if (entry.level) {
      const lv = String(entry.level).toLowerCase();
      level = ['error', 'warn', 'info', 'debug', 'fatal'].includes(lv) ? lv : 'info';
    } else {
      level = this.isErrorLevel(entry) ? 'error' : 'info';
    }

    const attrs = entry.attributes || {};
    const rawMeta = entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
    const metadata: Record<string, unknown> = {
      service: typeof rawMeta.service === 'string' && rawMeta.service.trim() ? rawMeta.service : this.service,
      env: typeof rawMeta.env === 'string' && rawMeta.env.trim() ? rawMeta.env : this.env,
      host: typeof rawMeta.host === 'string' && rawMeta.host.trim() ? rawMeta.host : 'unknown-host',
      version:
        typeof rawMeta.version === 'string' && rawMeta.version.trim() ? rawMeta.version : 'unknown-version',
    };
    if (typeof rawMeta.region === 'string' && rawMeta.region.trim()) {
      metadata.region = rawMeta.region;
    }

    const {
      service: _s,
      env: _e,
      host: _h,
      version: _v,
      region: _r,
      metadata: _m,
      timestamp: _t,
      level: _l,
      message: _msg,
      log_type: _lt,
      ...restAttrs
    } = attrs as Record<string, unknown>;

    const structuredLog: StructuredLog = {
      timestamp: entry.timestamp,
      service: metadata.service as string,
      env: metadata.env as string,
      level,
      message: entry.message,
      metadata,
      runtime: 'node',
      platform: 'node',
      sdkVersion: getSdkVersion(),
      ...restAttrs,
    };

    // Product contract: every Node log identifies its runtime (LogEnvelope).
    if (structuredLog.source === undefined) {
      structuredLog.source = 'node';
    }

    if (entry.clientId) structuredLog.client_id = entry.clientId;
    if (entry.traceId) structuredLog.trace_id = entry.traceId;
    if (entry.executionId) structuredLog.execution_id = entry.executionId;
    if (entry.correlationId) structuredLog.correlation_id = entry.correlationId;
    if (entry.process) structuredLog.process = entry.process;
    if (entry.runtimeInteractionId) {
      structuredLog.runtime_interaction_id = entry.runtimeInteractionId;
    }
    if (entry.parentRuntimeInteractionId) {
      structuredLog.parent_runtime_interaction_id = entry.parentRuntimeInteractionId;
    }
    if (entry.runtimeInteractionType) {
      structuredLog.runtime_interaction_type = entry.runtimeInteractionType;
    }
    if (entry.runtimeInteractionVersion !== undefined) {
      structuredLog.runtime_interaction_version = entry.runtimeInteractionVersion;
    }
    if (entry.runtimeInteractionSource) {
      structuredLog.runtime_interaction_source = entry.runtimeInteractionSource;
    }
    if (entry.executionStatus) {
      structuredLog.execution_status = entry.executionStatus;
    }
    return structuredLog;
  }

  private async sendAsync(structuredLog: StructuredLog): Promise<void> {
    const url = `${this.ingestionUrl}/logs`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.authToken) {
        headers.Authorization = this.authToken.startsWith('dl_')
          ? this.authToken
          : `Bearer ${this.authToken}`;
      }
      await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(structuredLog),
        signal: controller.signal,
      });
    } catch {
      /* fire-and-forget */
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
