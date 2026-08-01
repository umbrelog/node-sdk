import type { LifecycleCollector } from './types';

type LifecycleHooks = {
  teardown: () => void;
};

export function registerLifecycleHooks(
  collector: LifecycleCollector | undefined,
  options: { captureExceptions: boolean; captureRejections: boolean; flushOnShutdown: boolean },
): LifecycleHooks {
  if (!collector) {
    return { teardown: () => {} };
  }

  let shutdownSent = false;

  const emitShutdown = (reason: string) => {
    if (shutdownSent) return;
    shutdownSent = true;
    collector.emitEvent({ event_type: 'service_shutdown', reason });
    void collector.flushPending();
  };

  const onSigterm = () => emitShutdown('SIGTERM');
  const onSigint = () => emitShutdown('SIGINT');

  const onException = (err: unknown) => {
    const normalized = err instanceof Error ? err : new Error(String(err));
    collector.emitEvent({
      event_type: 'service_crash',
      reason: 'uncaughtException',
      crash_detail: {
        message: normalized.message,
        name: normalized.name,
      },
    });
  };

  const onRejection = (reason: unknown) => {
    const normalized = reason instanceof Error ? reason : new Error(String(reason));
    collector.emitEvent({
      event_type: 'service_crash',
      reason: 'unhandledRejection',
      crash_detail: {
        message: normalized.message,
        name: normalized.name,
      },
    });
  };

  if (options.flushOnShutdown) {
    process.once('SIGTERM', onSigterm);
    process.once('SIGINT', onSigint);
  }
  if (options.captureExceptions) process.on('uncaughtException', onException);
  if (options.captureRejections) process.on('unhandledRejection', onRejection);

  return {
    teardown: () => {
      process.removeListener('SIGTERM', onSigterm);
      process.removeListener('SIGINT', onSigint);
      if (options.captureExceptions) process.removeListener('uncaughtException', onException);
      if (options.captureRejections) process.removeListener('unhandledRejection', onRejection);
    },
  };
}
