type AttributionConfig = {
  apiKeyHeaders?: string[];
  clientIdHeader?: string;
  ipAddressFields?: string[];
  enableIpAttribution?: boolean;
};

export class AttributionExtractor {
  private config: Required<AttributionConfig>;
  private enabled: boolean;

  constructor(config: AttributionConfig = {}, enabled = true) {
    this.config = {
      apiKeyHeaders: config.apiKeyHeaders ?? ['X-API-Key', 'Authorization', 'Api-Key'],
      clientIdHeader: config.clientIdHeader ?? 'X-Client-Id',
      ipAddressFields: config.ipAddressFields ?? ['ip', 'ipAddress', 'remoteAddress', 'clientIp'],
      enableIpAttribution: config.enableIpAttribution ?? false,
    };
    this.enabled = enabled;
  }

  enable(): void { this.enabled = true; }
  disable(): void { this.enabled = false; }
  isEnabled(): boolean { return this.enabled; }

  extract(attributes: Record<string, unknown> | undefined): string | undefined {
    if (!this.enabled || !attributes) return undefined;
    return (
      this.extractFromCustomHeader(attributes) ||
      this.extractFromApiKey(attributes) ||
      (this.config.enableIpAttribution ? this.extractFromIpAddress(attributes) : undefined)
    );
  }

  private extractFromCustomHeader(attributes: Record<string, unknown>): string | undefined {
    const headerName = this.config.clientIdHeader;
    for (const source of [attributes.requestHeaders, attributes.headers]) {
      if (source && typeof source === 'object') {
        const value = this.getHeaderValue(source as Record<string, unknown>, headerName);
        if (value) return this.normalizeClientId(value);
      }
    }
    for (const [key, value] of Object.entries(attributes)) {
      if (key.toLowerCase() === headerName.toLowerCase() && value) {
        return this.normalizeClientId(String(value));
      }
    }
    return undefined;
  }

  private extractFromApiKey(attributes: Record<string, unknown>): string | undefined {
    for (const source of [attributes.requestHeaders, attributes.headers]) {
      if (source && typeof source === 'object') {
        for (const headerName of this.config.apiKeyHeaders) {
          const headerValue = this.getHeaderValue(source as Record<string, unknown>, headerName);
          if (headerValue) {
            const clientId = this.extractClientIdFromApiKey(headerValue);
            if (clientId) return clientId;
          }
        }
      }
    }
    if (attributes.queryParams && typeof attributes.queryParams === 'object') {
      for (const [key, value] of Object.entries(attributes.queryParams as Record<string, unknown>)) {
        const lowerKey = key.toLowerCase();
        if ((lowerKey === 'apikey' || lowerKey === 'api_key' || lowerKey === 'key') && value) {
          const clientId = this.extractClientIdFromApiKey(String(value));
          if (clientId) return clientId;
        }
      }
    }
    return undefined;
  }

  private extractClientIdFromApiKey(apiKeyValue: string): string | undefined {
    if (!apiKeyValue) return undefined;
    let key = apiKeyValue.trim();
    if (key.toLowerCase().startsWith('bearer ')) key = key.substring(7).trim();
    const colonIndex = key.indexOf(':');
    if (colonIndex > 0) return this.normalizeClientId(key.substring(0, colonIndex));
    if (key.length > 0) {
      return this.normalizeClientId(
        `key_${key.substring(0, Math.min(8, key.length))}${key.length > 8 ? key.substring(key.length - 4) : ''}`,
      );
    }
    return undefined;
  }

  private extractFromIpAddress(attributes: Record<string, unknown>): string | undefined {
    for (const fieldName of this.config.ipAddressFields) {
      const ipValue = this.getNestedValue(attributes, fieldName);
      if (ipValue && typeof ipValue === 'string') {
        const ip = ipValue.split(':')[0].trim();
        if (this.isValidIpAddress(ip)) return `ip_${ip}`;
      }
    }
    return undefined;
  }

  private getHeaderValue(headers: Record<string, unknown>, headerName: string): string | undefined {
    if (headers[headerName]) return String(headers[headerName]);
    const lowerHeaderName = headerName.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === lowerHeaderName) return String(value);
    }
    return undefined;
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return current;
  }

  private normalizeClientId(clientId: string): string {
    return clientId.trim();
  }

  private isValidIpAddress(ip: string): boolean {
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Pattern.test(ip)) {
      return ip.split('.').every((part) => {
        const num = parseInt(part, 10);
        return num >= 0 && num <= 255;
      });
    }
    return /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(ip);
  }
}
