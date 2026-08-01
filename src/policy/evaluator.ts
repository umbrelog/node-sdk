import type { LogEntry } from '../types';
import { PolicyAction, type PolicyRule, type PolicySet } from './types';

export class PolicyEvaluator {
  static ruleHasSelectors(rule: PolicyRule): boolean {
    return rule.level !== undefined && rule.level !== null && String(rule.level).trim() !== '';
  }

  static evaluate(
    entry: LogEntry,
    policies: PolicySet,
    detectErrorLevelOrExplicitLevel: ((e: LogEntry) => boolean) | string,
  ): PolicyAction {
    const logLevel =
      typeof detectErrorLevelOrExplicitLevel === 'string'
        ? detectErrorLevelOrExplicitLevel
        : this.detectLogLevel(entry, detectErrorLevelOrExplicitLevel);

    for (const rule of policies) {
      if (!this.ruleHasSelectors(rule)) continue;
      if (this.matchesRule(entry, rule, logLevel)) {
        const actionStr = String(rule.action).toUpperCase();
        if (actionStr === 'SEND') return PolicyAction.SEND;
        if (actionStr === 'DROP') return PolicyAction.DROP;
        if (actionStr === 'BUFFER_ONLY') return PolicyAction.BUFFER_ONLY;
        return rule.action as PolicyAction;
      }
    }
    return PolicyAction.SEND;
  }

  static matchesRule(_entry: LogEntry, rule: PolicyRule, logLevel: string): boolean {
    if (rule.level !== undefined && rule.level !== 'ANY') {
      if (logLevel !== rule.level) return false;
    }
    return true;
  }

  static detectLogLevel(entry: LogEntry, detectErrorLevel: (e: LogEntry) => boolean): string {
    if (detectErrorLevel(entry)) return 'error';
    const attrs = entry.attributes || {};
    if (attrs.level) {
      const level = String(attrs.level).toLowerCase();
      if (['error', 'warn', 'info', 'debug'].includes(level)) return level;
    }
    if (
      attrs.warning || attrs.warn ||
      (typeof attrs.statusCode === 'number' && attrs.statusCode >= 400 && attrs.statusCode < 500)
    ) {
      return 'warn';
    }
    return 'info';
  }
}
