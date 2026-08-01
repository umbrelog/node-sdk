import { normalizeMessagingTopic } from './normalize';
import type { TrafficRegistry } from './registry';
import type { MessagingLifecycleReport } from './lifecycle-types';

/**
 * Record a full messaging consumer lifecycle (receive → processing → ack/commit).
 * Call once per message when ACK/commit completes or on terminal failure.
 */
export function recordMessagingLifecycle(
  registry: TrafficRegistry,
  report: MessagingLifecycleReport,
): void {
  registry.recordMessagingLifecycle({
    ...report,
    queue_or_topic: normalizeMessagingTopic(report.queue_or_topic),
  });
}
