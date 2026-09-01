const REDACTED = '[REDACTED]';
const OMITTED_BINARY = '[BINARY OMITTED]';
const MAX_DEPTH = 4;
const MAX_KEYS = 50;
const MAX_ARRAY_ITEMS = 25;
const MAX_STRING_LENGTH = 1000;

const sensitiveKeys = [
  'password',
  'passwordhash',
  'token',
  'authorization',
  'secret',
  'apikey',
  'accesskey',
  'privatekey',
  'cpf',
];

function isSensitiveKey(key: string) {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return sensitiveKeys.some((sensitive) => normalized.includes(sensitive));
}

function sanitize(value: unknown, depth: number): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…`
      : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol') return value.description ?? '[SYMBOL]';
  if (typeof value === 'function') return '[FUNCTION]';
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return OMITTED_BINARY;
  if (depth >= MAX_DEPTH) return '[DEPTH LIMIT]';
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitize(item, depth + 1));
  }
  if (typeof value !== 'object') return '[UNSUPPORTED]';

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value).slice(0, MAX_KEYS)) {
    result[key] = isSensitiveKey(key) ? REDACTED : sanitize(nested, depth + 1);
  }
  return result;
}

export function sanitizeAuditPayload(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'object' && !Array.isArray(value)) {
    if (Object.keys(value).length === 0) return undefined;
  }
  return sanitize(value, 0);
}
