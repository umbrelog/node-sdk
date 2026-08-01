import { Logger } from './logger';
import type { LoggerConfig } from './types';

/**
 * Create an UmbreLog logger — single entry point for logging, runtime interactions,
 * resource metrics (default enabled), and runtime lifecycle (default enabled).
 */
export function createLogger(config: LoggerConfig = {}): Logger {
  return new Logger(config);
}
