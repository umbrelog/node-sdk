import type { Logger } from '../logger';

type ProcessErrorHooks = {
  teardown: () => void;
};

let internalLogging = false;

export function isInternalSdkLog(): boolean {
  return internalLogging;
}

export function runInternalLog(fn: () => void): void {
  internalLogging = true;
  try {
    fn();
  } finally {
    internalLogging = false;
  }
}

function normalizeError(err: unknown): { message: string; stack?: string; name?: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack, name: err.name };
  }
  return { message: String(err) };
}

export function registerProcessErrorHooks(
  logger: Logger,
  options: { captureExceptions: boolean; captureRejections: boolean },
): ProcessErrorHooks {
  const onException = (err: unknown) => {
    if (isInternalSdkLog()) return;
    const normalized = normalizeError(err);
    runInternalLog(() => {
      logger.error('Uncaught exception', {
        source: 'uncaughtException',
        error: normalized.message,
        stack: normalized.stack,
        name: normalized.name,
      });
    });
  };

  const onRejection = (reason: unknown) => {
    if (isInternalSdkLog()) return;
    const normalized = normalizeError(reason);
    runInternalLog(() => {
      logger.error('Unhandled promise rejection', {
        source: 'unhandledRejection',
        reason: normalized.message,
        stack: normalized.stack,
        name: normalized.name,
      });
    });
  };

  if (options.captureExceptions) process.on('uncaughtException', onException);
  if (options.captureRejections) process.on('unhandledRejection', onRejection);

  return {
    teardown: () => {
      if (options.captureExceptions) process.removeListener('uncaughtException', onException);
      if (options.captureRejections) process.removeListener('unhandledRejection', onRejection);
    },
  };
}
