import type { Logger } from '../logger';
import { isInternalSdkLog } from './process-errors';

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error';

type ConsoleCaptureHooks = {
  teardown: () => void;
};

function serializeArg(arg: unknown): unknown {
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'string') return arg.length > 2000 ? `${arg.slice(0, 2000)}…` : arg;
  if (typeof arg === 'number' || typeof arg === 'boolean' || arg === null) return arg;
  try {
    const seen = new WeakSet<object>();
    const json = JSON.stringify(arg, (_key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    });
    return json.length > 2000 ? `${json.slice(0, 2000)}…` : json;
  } catch {
    return String(arg);
  }
}

export function registerConsoleCapture(logger: Logger): ConsoleCaptureHooks {
  const originals: Partial<Record<ConsoleMethod, (...args: unknown[]) => void>> = {};
  const methods: ConsoleMethod[] = ['log', 'info', 'warn', 'error'];

  for (const method of methods) {
    originals[method] = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      originals[method]!(...args);
      if (isInternalSdkLog()) return;
      const level = method === 'log' ? 'info' : method;
      const message = args.map(serializeArg).join(' ');
      try {
        if (level === 'error') logger.error(message, { source: 'console', consoleLevel: method });
        else if (level === 'warn') logger.warn(message, { source: 'console', consoleLevel: method });
        else logger.info(message, { source: 'console', consoleLevel: method });
      } catch {
        /* never break console */
      }
    };
  }

  return {
    teardown: () => {
      for (const method of methods) {
        if (originals[method]) console[method] = originals[method] as typeof console.log;
      }
    },
  };
}
