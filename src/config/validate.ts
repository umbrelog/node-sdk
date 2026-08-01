import type { ResolvedLoggerConfig } from './types';

export type ConfigValidationIssue = {
  path: string;
  message: string;
  level: 'warn' | 'error';
};

export function validateLoggerConfig(resolved: ResolvedLoggerConfig): ConfigValidationIssue[] {
  const issues: ConfigValidationIssue[] = [];

  if (!resolved.service.trim()) {
    issues.push({
      path: 'service',
      message: 'service name is missing — SDK will fall back to package.json or "unknown-service"',
      level: 'warn',
    });
  }

  if (!resolved.hardDisableNetwork && !resolved.apiKey && !resolved.authToken) {
    issues.push({
      path: 'apiKey',
      message: 'apiKey (or authToken) is recommended when network features are enabled',
      level: 'warn',
    });
  }

  if (resolved.logging.bufferSize < 1) {
    issues.push({
      path: 'logging.bufferSize',
      message: 'bufferSize must be at least 1',
      level: 'error',
    });
  }

  if (resolved.resourceMetrics.enabled && !resolved.apiKey && !resolved.authToken) {
    issues.push({
      path: 'resourceMetrics.enabled',
      message: 'resource metrics require apiKey — set resourceMetrics.enabled: false or provide apiKey',
      level: 'warn',
    });
  }

  return issues;
}

export function emitConfigValidationIssues(
  issues: ConfigValidationIssue[],
  debug: boolean,
): void {
  for (const issue of issues) {
    if (issue.level === 'error') {
      console.error(`[UmbreLog SDK] ${issue.path}: ${issue.message}`);
    } else if (debug || issue.path === 'service' || issue.path === 'apiKey') {
      console.warn(`[UmbreLog SDK] ${issue.path}: ${issue.message}`);
    }
  }
}
