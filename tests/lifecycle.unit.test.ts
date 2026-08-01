import assert from 'node:assert';
import { describe, it } from 'node:test';
import { createRuntimeSession } from '../src/lifecycle/session';
import { heapPressurePct, sampleRuntimeHeartbeat, startEventLoopMonitor, stopEventLoopMonitor } from '../src/lifecycle/metrics';

describe('sdk lifecycle', () => {
  it('creates unique session ids', () => {
    const a = createRuntimeSession('host-a');
    const b = createRuntimeSession('host-a');
    assert.notEqual(a.sessionId, b.sessionId);
    assert.ok(a.startedAtMs > 0);
  });

  it('samples heartbeat with session and uptime fields', () => {
    startEventLoopMonitor();
    const session = createRuntimeSession('test-host');
    const heartbeat = sampleRuntimeHeartbeat(session);
    stopEventLoopMonitor();
    assert.equal(heartbeat.session_id, session.sessionId);
    assert.equal(heartbeat.started_at, session.startedAtMs);
    assert.ok(heartbeat.uptime_sec >= 0);
    assert.equal(heartbeat.hostname, 'test-host');
    assert.ok(heartbeat.memory.heap_total_mb > 0);
  });

  it('computes heap pressure percentage', () => {
    const pct = heapPressurePct({
      collected_at: Date.now(),
      session_id: 's',
      started_at: Date.now(),
      uptime_sec: 1,
      hostname: 'h',
      pid: 1,
      sdk_version: '1',
      memory: { heap_used_mb: 85, heap_total_mb: 100, rss_mb: 100 },
      cpu: { user_us: 0, system_us: 0 },
      event_loop_delay_ms: { mean: 0, p99: 0 },
    });
    assert.equal(pct, 85);
  });
});
