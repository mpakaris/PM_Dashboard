export type Role = 'viewer' | 'admin';

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(process.env.AUTH_SECRET!),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

export async function makeSessionValue(role: Role): Promise<string> {
  const key = await hmacKey();
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(role));
  return `${role}:${toHex(sig)}`;
}

export async function parseSession(value: string | undefined): Promise<Role | null> {
  if (!value) return null;
  const colon = value.indexOf(':');
  if (colon === -1) return null;
  const role = value.slice(0, colon);
  if (role !== 'viewer' && role !== 'admin') return null;
  const sig = value.slice(colon + 1);

  const key = await hmacKey();
  const expected = await crypto.subtle.sign('HMAC', key, enc.encode(role));
  const expectedHex = toHex(expected);

  if (sig.length !== expectedHex.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  return diff === 0 ? (role as Role) : null;
}
