import { randomBytes } from 'node:crypto';
import { generateId } from '../utils/id-generator';

/** 32-char lowercase hex trace id. */
export function generateTraceId(): string {
  return randomBytes(16).toString('hex');
}

export function generateRequestId(): string {
  return generateId();
}

export function generateCorrelationId(): string {
  return generateId();
}
