import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import type { MetricSnapshot } from './types';

/** Long enough for stable system CPU / network deltas (matches OS monitor smoothing). */
export const MIN_SAMPLE_ELAPSED_MS = 3000;

export type SystemCpuTimes = { idle: number; total: number };

let lastSystemCpuTimes = readSystemCpuTimes();
let lastSampleAt = Date.now();
let lastNetworkBytes = 0;
let lastDiskOps = 0;

/** Cumulative CPU jiffies from `os.cpus()` — sum across all cores. */
export function readSystemCpuTimes(): SystemCpuTimes {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    const t = cpu.times;
    const irq = t.irq ?? 0;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + irq;
  }
  return { idle, total };
}

/** System-wide CPU busy % (0–100), aligned with OS monitors (100% − idle share). */
export function computeSystemCpuUsagePct(prev: SystemCpuTimes, next: SystemCpuTimes): number {
  const idleDelta = next.idle - prev.idle;
  const totalDelta = next.total - prev.total;
  if (totalDelta <= 0) return 0;
  const usage = (1 - idleDelta / totalDelta) * 100;
  return Math.min(100, Math.max(0, usage));
}

function readLinuxNetworkBytesTotal(): number | null {
  try {
    const raw = fs.readFileSync('/proc/net/dev', 'utf8');
    let total = 0;
    for (const line of raw.split('\n').slice(2)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;
      total += Number(parts[1]) + Number(parts[9]);
    }
    return Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}

/** Non-loopback link bytes from `netstat -ibn` (macOS). */
function readDarwinNetworkBytesTotal(): number | null {
  try {
    const out = execSync('netstat -ibn', { encoding: 'utf8', timeout: 3000, maxBuffer: 512 * 1024 });
    let total = 0;
    for (const line of out.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;
      const name = parts[0] ?? '';
      if (name.startsWith('lo') || name.endsWith('*')) continue;
      if (!parts[2]?.startsWith('<Link')) continue;
      const ib = Number(parts[6]);
      const ob = Number(parts[9]);
      if (Number.isFinite(ib)) total += ib;
      if (Number.isFinite(ob)) total += ob;
    }
    return Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}

function readNetworkBytesTotal(): number | null {
  if (process.platform === 'linux') return readLinuxNetworkBytesTotal();
  if (process.platform === 'darwin') return readDarwinNetworkBytesTotal();
  return null;
}

function readLinuxDiskOpsTotal(): number | null {
  try {
    const raw = fs.readFileSync('/proc/diskstats', 'utf8');
    let ops = 0;
    for (const line of raw.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 14) continue;
      ops += Number(parts[3]) + Number(parts[7]);
    }
    return Number.isFinite(ops) ? ops : null;
  } catch {
    return null;
  }
}

/** Instantaneous aggregate tps from `iostat -d 1 1` (macOS). */
function readDarwinDiskIops(): number | null {
  try {
    const out = execSync('iostat -d 1 1', { encoding: 'utf8', timeout: 5000 });
    const lines = out.trim().split('\n').filter((l) => l.trim());
    const last = lines[lines.length - 1];
    if (!last || last.includes('KB/t')) return null;
    const nums = last.trim().split(/\s+/).map(Number);
    let total = 0;
    for (let i = 1; i < nums.length; i += 3) {
      if (Number.isFinite(nums[i])) total += nums[i]!;
    }
    return total > 0 ? total : Number.isFinite(nums[1]) ? nums[1]! : null;
  } catch {
    return null;
  }
}

/** macOS Activity Monitor–style used memory (active + wired + compressed). */
function readDarwinMemoryUsagePct(): number | null {
  try {
    const out = execSync('vm_stat', { encoding: 'utf8', timeout: 3000 });
    const pageMatch = out.match(/page size of (\d+) bytes/i);
    const pageSize = pageMatch ? Number(pageMatch[1]) : 4096;
    const pages: Record<string, number> = {};
    for (const line of out.split('\n')) {
      const m = line.match(/^Pages\s+([^:]+):\s+([\d.]+)/);
      if (m) pages[m[1]!.trim()] = Number(m[2]);
    }
    const usedPages =
      (pages.active ?? 0) + (pages['wired down'] ?? 0) + (pages['occupied by compressor'] ?? 0);
    const total = os.totalmem();
    if (total <= 0) return null;
    return Math.min(100, Math.max(0, ((usedPages * pageSize) / total) * 100));
  } catch {
    return null;
  }
}

function readMemoryUsagePct(): number | null {
  if (process.platform === 'darwin') return readDarwinMemoryUsagePct();
  const total = os.totalmem();
  if (total <= 0) return null;
  return Math.min(100, Math.max(0, ((total - os.freemem()) / total) * 100));
}

/** Reset baselines — call when the metrics collector starts. */
export function resetServiceMetricsBaseline(): void {
  lastSystemCpuTimes = readSystemCpuTimes();
  lastSampleAt = Date.now();
  lastNetworkBytes = readNetworkBytesTotal() ?? 0;
  lastDiskOps = readLinuxDiskOpsTotal() ?? 0;
}

/** Lightweight periodic host metrics — not high-frequency telemetry. */
export function sampleServiceMetrics(): MetricSnapshot | null {
  const now = Date.now();
  const elapsedMs = now - lastSampleAt;
  if (elapsedMs < MIN_SAMPLE_ELAPSED_MS) {
    return null;
  }

  const systemCpuNow = readSystemCpuTimes();
  const cpu_usage_pct = computeSystemCpuUsagePct(lastSystemCpuTimes, systemCpuNow);
  const memory_usage_pct = readMemoryUsagePct();

  const elapsedSec = elapsedMs / 1000;
  let network_bytes_per_sec: number | null = null;
  const networkNow = readNetworkBytesTotal();
  if (networkNow != null) {
    network_bytes_per_sec = Math.max(0, (networkNow - lastNetworkBytes) / elapsedSec);
    lastNetworkBytes = networkNow;
  }

  let disk_iops: number | null = null;
  if (process.platform === 'linux') {
    const diskNow = readLinuxDiskOpsTotal();
    if (diskNow != null) {
      disk_iops = Math.max(0, (diskNow - lastDiskOps) / elapsedSec);
      lastDiskOps = diskNow;
    }
  } else if (process.platform === 'darwin') {
    disk_iops = readDarwinDiskIops();
  }

  lastSystemCpuTimes = systemCpuNow;
  lastSampleAt = now;

  return {
    collected_at: now,
    cpu_usage_pct,
    memory_usage_pct: memory_usage_pct ?? 0,
    network_bytes_per_sec,
    disk_iops,
  };
}
