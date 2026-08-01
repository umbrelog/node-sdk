export class AttributeExtractor {
  private enabled: boolean;

  constructor(enabled = false) {
    this.enabled = enabled;
  }

  enable(): void { this.enabled = true; }
  disable(): void { this.enabled = false; }
  isEnabled(): boolean { return this.enabled; }

  extract(message: string): Record<string, unknown> {
    if (!this.enabled || !message) return {};
    const attributes: Record<string, unknown> = {};
    const keyValuePattern = /(\w+(?:[_-]\w+)*)\s*:\s*([^,]+)/g;
    let match: RegExpExecArray | null;
    while ((match = keyValuePattern.exec(message)) !== null) {
      const key = match[1].trim();
      const value = this.parseValue(match[2].trim());
      if (key && value !== undefined && value !== '') attributes[key] = value;
    }
    return attributes;
  }

  private parseValue(value: string): unknown {
    const unquoted = value.replace(/^["']|["']$/g, '');
    if (/^-?\d+$/.test(unquoted)) return parseInt(unquoted, 10);
    if (/^-?\d*\.\d+$/.test(unquoted)) return parseFloat(unquoted);
    const lower = unquoted.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
    if (lower === 'null' || lower === 'undefined') return null;
    return unquoted;
  }

  extractAndMerge(message: string, existingAttributes: Record<string, unknown> = {}): Record<string, unknown> {
    return { ...existingAttributes, ...this.extract(message) };
  }
}
