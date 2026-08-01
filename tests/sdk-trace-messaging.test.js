const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMessagingTopic } = require('../dist/traffic/normalize');
const {
  formatMessagingEntryName,
  messagingFingerprint,
  extractTraceFromMessagingBag,
  injectTraceIntoKafkaHeaders,
  runWithKafkaMessage,
  runWithMessagingConsume,
} = require('../dist/trace-context/messaging');
const { getTraceContext } = require('../dist/trace-context/context');
const { startTraceBuffer, stopTraceBuffer } = require('../dist/trace-context/buffer');
const { setTraceIngestCaptureForTests } = require('../dist/trace-context/transport');
const { resetTraceSamplingForTests } = require('../dist/trace-context/sampling');
const { generateTraceId } = require('../dist/trace-context/ids');

const TRACE_CONFIG = {
  apiKey: 'test-key',
  service: 'orders-worker',
  env: 'test',
  baseUrl: 'http://localhost:9999',
};

function allRoots(payloads) {
  return payloads.flatMap((p) => p.roots);
}

function allInteractions(payloads) {
  return payloads.flatMap((p) => p.interactions);
}

describe('messaging topic normalization', () => {
  it('collapses hyphen-delimited numeric segments', () => {
    assert.equal(normalizeMessagingTopic('customer-123-created'), 'customer-created');
    assert.equal(normalizeMessagingTopic('customer-456-created'), 'customer-created');
    assert.equal(normalizeMessagingTopic('campaign-42-send'), 'campaign-send');
    assert.equal(normalizeMessagingTopic('campaign-99-send'), 'campaign-send');
  });

  it('collapses dot-delimited numeric segments', () => {
    assert.equal(normalizeMessagingTopic('customer.123.created'), 'customer.created');
  });

  it('formatMessagingEntryName uses dot notation for process discovery', () => {
    assert.equal(formatMessagingEntryName('customer-123-created'), 'customer.created');
    assert.equal(formatMessagingEntryName('campaign-42-send'), 'campaign.send');
    assert.equal(formatMessagingEntryName('customer.created'), 'customer.created');
  });

  it('messagingFingerprint matches normalized topic', () => {
    assert.equal(messagingFingerprint('customer-789-created'), 'customer-created');
  });
});

describe('messaging trace propagation', () => {
  const payloads = [];

  beforeEach(() => {
    payloads.length = 0;
    resetTraceSamplingForTests();
    setTraceIngestCaptureForTests((batch) => payloads.push(batch));
    startTraceBuffer({ ...TRACE_CONFIG, sampling: { enabled: false } });
  });

  afterEach(() => {
    stopTraceBuffer();
    setTraceIngestCaptureForTests(undefined);
  });

  it('creates trace_root for headerless Kafka message', async () => {
    await runWithKafkaMessage('customer-123-created', undefined, 'orders-worker', async () => {
      const ctx = getTraceContext();
      assert.ok(ctx?.traceId);
      assert.equal(ctx?.entryType, 'kafka');
      assert.equal(ctx?.entryName, 'customer.created');
      assert.equal(ctx?.rootService, 'orders-worker');
    });

    const roots = allRoots(payloads);
    const root = roots.find(
      (r) =>
        r.entry_type === 'kafka' &&
        r.entry_name === 'customer.created' &&
        r.status === 'ok',
    );
    assert.ok(root, 'expected completed kafka trace root');
    assert.equal(root.root_service, 'orders-worker');
    assert.ok(root.completed_at != null);
  });

  it('marks trace_root failed when consumer throws', async () => {
    await assert.rejects(
      runWithKafkaMessage('customer-456-created', undefined, 'orders-worker', async () => {
        throw new Error('consume failed');
      }),
      /consume failed/,
    );

    const roots = allRoots(payloads);
    const failed = roots.filter(
      (r) => r.entry_name === 'customer.created' && r.status === 'failed',
    );
    assert.ok(failed.length >= 1, 'expected failed trace root');
    assert.ok(failed.some((r) => r.completed_at != null));
  });

  it('stores service on every interaction', async () => {
    await runWithKafkaMessage('campaign-42-send', undefined, 'orders-worker', async () => {});

    const interactions = allInteractions(payloads);
    assert.ok(interactions.length >= 1);
    for (const i of interactions) {
      assert.ok(i.trace_id, 'interaction missing trace_id');
      assert.equal(i.service, 'orders-worker');
      assert.equal(i.root_service, 'orders-worker');
    }
  });

  it('continues existing trace from Kafka headers without new root completion', async () => {
    const parentTraceId = generateTraceId();
    const headers = injectTraceIntoKafkaHeaders({}, {
      traceId: parentTraceId,
      rootService: 'upstream',
      startedAt: Date.now(),
    });

    await runWithMessagingConsume({
      provider: 'kafka',
      topicOrQueue: 'customer-123-created',
      rootService: 'orders-worker',
      headers,
      fn: async () => {},
    });

    const roots = allRoots(payloads);
    assert.equal(roots.length, 0, 'continued trace should not emit new roots');

    const consume = allInteractions(payloads).find(
      (i) => i.interaction_kind === 'messaging' && i.direction === 'consume',
    );
    assert.equal(consume?.trace_id, parentTraceId);
    assert.equal(consume?.service, 'orders-worker');
  });

  it('extractTraceFromMessagingBag reads Buffer headers', () => {
    const traceId = generateTraceId();
    const bag = {
      'x-trace-id': Buffer.from(traceId, 'utf8'),
    };
    assert.equal(extractTraceFromMessagingBag(bag).traceId, traceId);
  });
});
