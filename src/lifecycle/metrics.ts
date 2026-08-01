import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
import type { RuntimeHeartbeat } from './types';
import type { RuntimeSession } from './session';
import { getSdkVersion } from '../version';

let eventLoopMonitor: IntervalHistogram | null = null;
let lastCpuUsage = process.cpuUsage();

export function startEventLoopMonitor(): void {
  if (eventLoopMonitor) return;
  eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
  eventLoopMonitor.enable();
}

export function stopEventLoopMonitor(): void {
  eventLoopMonitor?.disable();
  eventLoopMonitor = null;
}

export function sampleRuntimeHeartbeat(session: RuntimeSession): RuntimeHeartbeat {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage(lastCpuUsage);
  lastCpuUsage = process.cpuUsage();

  const elMean = eventLoopMonitor ? eventLoopMonitor.mean / 1e6 : 0;
  const elP99 = eventLoopMonitor ? eventLoopMonitor.percentile(99) / 1e6 : 0;
  eventLoopMonitor?.reset();

  return {
    collected_at: Date.now(),
    session_id: session.sessionId,
    started_at: session.startedAtMs,
    uptime_sec: process.uptime(),
    hostname: session.hostname,
    pid: session.pid,
    sdk_version: getSdkVersion(),
    memory: {
      heap_used_mb: round2(mem.heapUsed / (1024 * 1024)),
      heap_total_mb: round2(mem.heapTotal / (1024 * 1024)),
      rss_mb: round2(mem.rss / (1024 * 1024)),
    },
    cpu: {
      user_us: cpu.user,
      system_us: cpu.system,
    },
    event_loop_delay_ms: {
      mean: round2(elMean),
      p99: round2(elP99),
    },
  };
}

export function heapPressurePct(heartbeat: RuntimeHeartbeat): number {
  const total = heartbeat.memory.heap_total_mb;
  if (total <= 0) return 0;
  return (heartbeat.memory.heap_used_mb / total) * 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
