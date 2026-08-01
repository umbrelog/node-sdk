import { randomUUID } from 'node:crypto';

export type RuntimeSession = {
  sessionId: string;
  startedAtMs: number;
  hostname: string;
  pid: number;
};

export function createRuntimeSession(hostname: string): RuntimeSession {
  return {
    sessionId: randomUUID(),
    startedAtMs: Date.now(),
    hostname,
    pid: process.pid,
  };
}
