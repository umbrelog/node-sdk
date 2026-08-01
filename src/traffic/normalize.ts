const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const NUMERIC_SEGMENT_RE = /\/\d+(?=\/|$)/g;
const HEX_SEGMENT_RE = /\/[0-9a-f]{16,}(?=\/|$)/gi;

/** Normalize HTTP paths to control cardinality — never capture bodies or auth headers. */
export function normalizeEndpoint(path: string): string {
  let p = String(path ?? '').trim();
  if (!p) return '/';
  try {
    if (p.startsWith('http://') || p.startsWith('https://')) {
      p = new URL(p).pathname;
    }
  } catch {
    /* keep raw path */
  }
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(UUID_RE, ':id');
  p = p.replace(NUMERIC_SEGMENT_RE, '/:id');
  p = p.replace(HEX_SEGMENT_RE, '/:id');
  if (p.length > 256) p = `${p.slice(0, 253)}...`;
  return p;
}

/** Normalize SQL fingerprints — literals replaced with placeholders. */
export function normalizeSqlQuery(sql: string): string {
  let q = String(sql ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!q) return '';
  q = q.replace(/'(?:''|[^'])*'/g, '?');
  q = q.replace(/"(?:[^"\\]|\\.)*"/g, '?');
  q = q.replace(/\b\d+\b/g, '?');
  q = q.replace(/\s+/g, ' ').trim();
  if (q.length > 512) q = `${q.slice(0, 509)}...`;
  return q;
}

const REDIS_KEY_UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

/** Normalize Redis keys for fingerprints — literals replaced, cardinality capped. */
export function normalizeRedisKey(key: string): string {
  let k = String(key ?? '').trim();
  if (!k) return '?';
  k = k.replace(REDIS_KEY_UUID_RE, '?');
  k = k.replace(/([:/._-])\d+(?=[:/._-]|$)/g, '$1?');
  k = k.replace(/\b\d+\b/g, '?');
  if (k.length > 128) k = `${k.slice(0, 125)}...`;
  return k;
}

/** Fingerprint for Redis commands — `GET user:123` → `GET user:?`. */
export function normalizeRedisCommand(operation: string, key?: string): string {
  const op = String(operation ?? '').trim().toUpperCase() || 'UNKNOWN';
  if (!key) return op;
  return `${op} ${normalizeRedisKey(key)}`;
}

export function normalizeMessagingTopic(topic: string): string {
  let t = String(topic ?? '').trim();
  if (!t) return 'unknown';
  t = t.replace(UUID_RE, ':id');
  // Dot-separated topics: customer.123.created → customer.created
  const dotParts = t.split('.').filter((seg) => seg.length > 0 && !/^\d+$/.test(seg) && seg !== ':id');
  if (dotParts.length > 0 && t.includes('.')) {
    t = dotParts.join('.');
  } else {
    // Hyphen-separated: customer-123-created → customer-created
    const hyphenParts = t
      .split('-')
      .filter((seg) => seg.length > 0 && !/^\d+$/.test(seg) && seg !== ':id');
    t = hyphenParts.length > 0 ? hyphenParts.join('-') : t;
  }
  t = t.replace(NUMERIC_SEGMENT_RE, '/:id');
  t = t.replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (t.length > 200) t = `${t.slice(0, 197)}...`;
  return t;
}
