import type { TrafficRegistry } from './registry';
import type { FileTransferReport } from './lifecycle-types';

/** Sanitize destination — bucket/path only, never object contents or signed URLs. */
export function normalizeFileDestination(destination: string): string {
  let d = String(destination ?? '').trim();
  if (!d) return 'unknown';
  try {
    if (d.startsWith('http://') || d.startsWith('https://')) {
      const u = new URL(d);
      d = `${u.protocol}//${u.host}${u.pathname}`;
    }
  } catch {
    /* keep */
  }
  d = d.replace(/[?#].*$/, '');
  d = d.replace(/X-Amz-[A-Za-z-]+=[^&]+/gi, '');
  d = d.replace(/sig=[^&]+/gi, '');
  if (d.length > 256) d = `${d.slice(0, 253)}...`;
  return d;
}

export function recordFileTransfer(registry: TrafficRegistry, report: FileTransferReport): void {
  registry.recordFileTransfer({
    ...report,
    destination: normalizeFileDestination(report.destination),
    failure_reason: report.failure_reason?.slice(0, 120),
  });
}
