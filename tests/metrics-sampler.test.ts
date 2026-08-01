import assert from 'node:assert/strict';
import {
  computeSystemCpuUsagePct,
  MIN_SAMPLE_ELAPSED_MS,
  readSystemCpuTimes,
  type SystemCpuTimes,
} from '../src/metrics/sampler';

function testComputeSystemCpuUsagePct(): void {
  const prev: SystemCpuTimes = { idle: 800, total: 1000 };
  const busy: SystemCpuTimes = { idle: 850, total: 1100 };
  const pct = computeSystemCpuUsagePct(prev, busy);
  // idle grew 50, total grew 100 → busy share = 50/100 = 50%
  assert.ok(Math.abs(pct - 50) < 0.1, `expected ~50%, got ${pct}`);

  const saturated: SystemCpuTimes = { idle: 800, total: 1000 };
  const allBusy: SystemCpuTimes = { idle: 800, total: 1100 };
  assert.ok(Math.abs(computeSystemCpuUsagePct(saturated, allBusy) - 100) < 0.1);

  const flat: SystemCpuTimes = { idle: 500, total: 800 };
  assert.equal(computeSystemCpuUsagePct(flat, flat), 0);
}

function testReadSystemCpuTimesTotalNotInflated(): void {
  const snap = readSystemCpuTimes();
  const cores = require('os').cpus().length;
  assert.ok(snap.total > 0 && snap.idle > 0);
  // total must be per-core sums, not cumulative idle inflation (regression guard)
  assert.ok(snap.total < snap.idle * cores + 1, `total ${snap.total} looks inflated vs idle ${snap.idle}`);
}

function testMinSampleWindow(): void {
  assert.equal(MIN_SAMPLE_ELAPSED_MS, 3000);
}

testComputeSystemCpuUsagePct();
testReadSystemCpuTimesTotalNotInflated();
testMinSampleWindow();
console.log('metrics-sampler tests passed');
