import type { HttpTransport } from '../transport/http-transport';

type ShutdownHooks = {
  teardown: () => void;
};

export function registerShutdownHooks(
  transport: HttpTransport | undefined,
  options: { enabled: boolean; timeoutMs: number },
): ShutdownHooks {
  if (!options.enabled || !transport) {
    return { teardown: () => {} };
  }

  let flushing = false;
  const handler = () => {
    if (flushing) return;
    flushing = true;
    void transport.flush(options.timeoutMs).catch(() => {});
  };

  process.once('SIGTERM', handler);
  process.once('SIGINT', handler);

  return {
    teardown: () => {
      process.removeListener('SIGTERM', handler);
      process.removeListener('SIGINT', handler);
    },
  };
}
