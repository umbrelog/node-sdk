import { hostname } from 'node:os';
import { sampleRuntimeHeartbeat, startEventLoopMonitor, stopEventLoopMonitor } from './metrics';
import { createRuntimeSession, type RuntimeSession } from './session';
import { enqueueLifecyclePayload, flushLifecycleTransport, type LifecycleTransportConfig } from './transport';
import type { LifecycleCollector, LifecycleCollectorConfig, RuntimeLifecycleEvent, RuntimeLifecycleIngestBody } from './types';

export function createLifecycleCollector(config: LifecycleCollectorConfig): LifecycleCollector {
  const transport: LifecycleTransportConfig = {
    apiKey: config.apiKey,
    service: config.service,
    env: config.env,
    baseUrl: config.baseUrl,
    debug: config.debug,
  };

  const session: RuntimeSession = createRuntimeSession(hostname());
  let timer: ReturnType<typeof setInterval> | undefined;
  const pendingEvents: RuntimeLifecycleEvent[] = [];

  const post = (partial: Pick<RuntimeLifecycleIngestBody, 'heartbeats' | 'events'>) => {
    enqueueLifecyclePayload(transport, {
      service: config.service,
      env: config.env,
      heartbeats: partial.heartbeats,
      events: partial.events,
    });
  };

  const flushPendingEvents = () => {
    if (pendingEvents.length === 0) return;
    post({ events: pendingEvents.splice(0, pendingEvents.length) });
  };

  const sampleAndSend = () => {
    if (!config.enabled) return;
    flushPendingEvents();
    post({ heartbeats: [sampleRuntimeHeartbeat(session)] });
  };

  return {
    start() {
      if (!config.enabled) return;
      startEventLoopMonitor();
      post({
        events: [
          {
            occurred_at: Date.now(),
            session_id: session.sessionId,
            event_type: 'service_started',
          },
        ],
      });
      timer = setInterval(sampleAndSend, config.intervalMs);
      if (typeof timer.unref === 'function') timer.unref();
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
      stopEventLoopMonitor();
    },
    emitEvent(event) {
      if (!config.enabled) return;
      pendingEvents.push({
        occurred_at: event.occurred_at ?? Date.now(),
        session_id: event.session_id ?? session.sessionId,
        previous_session_id: event.previous_session_id,
        event_type: event.event_type,
        reason: event.reason,
        crash_detail: event.crash_detail,
      });
      if (event.event_type === 'service_crash' || event.event_type === 'service_shutdown') {
        flushPendingEvents();
      }
    },
    flushPending() {
      flushPendingEvents();
      post({ heartbeats: [sampleRuntimeHeartbeat(session)] });
      return flushLifecycleTransport();
    },
  };
}
