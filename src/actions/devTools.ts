'use server';

import { Redis } from '@upstash/redis';

const KEYS = ['app:db', 'app:elsap', 'app:timesheets'] as const;

export async function pushDevToProd(): Promise<{ ok: boolean; error?: string }> {
  if (process.env.NODE_ENV !== 'development') {
    return { ok: false, error: 'Only available in development mode' };
  }

  const prodUrl   = process.env.UPSTASH_REDIS_REST_URL_PROD;
  const prodToken = process.env.UPSTASH_REDIS_REST_TOKEN_PROD;
  if (!prodUrl || !prodToken) {
    return { ok: false, error: 'UPSTASH_REDIS_REST_URL_PROD / TOKEN_PROD not set in .env.local' };
  }

  const dev  = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!,  token: process.env.UPSTASH_REDIS_REST_TOKEN! });
  const prod = new Redis({ url: prodUrl, token: prodToken });

  const values = await Promise.all(KEYS.map((k) => dev.get(k)));

  await Promise.all(
    KEYS.map((k, i) =>
      values[i] !== null ? prod.set(k, values[i]) : prod.del(k)
    )
  );

  return { ok: true };
}
