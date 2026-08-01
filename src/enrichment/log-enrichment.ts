import { stripReservedEventFields } from './reserved-fields';

export type RuntimeMetadata = {
  hostname: string;
  pid: number;
  nodeVersion: string;
  platform: string;
  sdkVersion: string;
};

/** logger metadata < per-log metadata */
export function mergeLogMetadata(
  loggerMetadata: Record<string, unknown>,
  perLogMetadata: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...loggerMetadata,
    ...perLogMetadata,
  };
}

export function buildEnrichedAttributes(options: {
  loggerMetadata: Record<string, unknown>;
  perLogMetadata: Record<string, unknown>;
  runtimeMetadata?: RuntimeMetadata | null;
  functionName?: string;
}): Record<string, unknown> {
  const merged = mergeLogMetadata(options.loggerMetadata, options.perLogMetadata);
  const out: Record<string, unknown> = {};
  if (options.runtimeMetadata) {
    Object.assign(out, options.runtimeMetadata);
  }
  Object.assign(out, merged);
  if (options.functionName !== undefined && out.functionName === undefined) {
    out.functionName = options.functionName;
  }
  return stripReservedEventFields(out);
}

export function buildRuntimeMetadata(hostname: string, sdkVersion: string): RuntimeMetadata {
  return {
    hostname,
    pid: process.pid,
    nodeVersion: process.version,
    platform: process.platform,
    sdkVersion,
  };
}

export function buildServiceMetadata(
  baseContext: { service: string; env: string; region?: string },
  extra?: Record<string, string | number | boolean>,
): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    service: baseContext.service,
    env: baseContext.env,
  };
  if (baseContext.region) meta.region = baseContext.region;
  if (extra) Object.assign(meta, stripReservedEventFields(extra));
  return meta;
}
