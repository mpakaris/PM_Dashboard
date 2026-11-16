#!/usr/bin/env node
/**
 * Dumps all known Redis keys from TEST or PROD to a timestamped JSON file.
 * Usage:
 *   node scripts/dump-db.mjs --env test
 *   node scripts/dump-db.mjs --env prod
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const envFile = readFileSync(resolve(__dirname, '../.env.local'), 'utf-8');
const getEnvVar = (name) => {
  const match = envFile.match(new RegExp(`^${name}="?([^"\n]+)"?`, 'm'));
  return match ? match[1].trim() : null;
};

const ENV_CONFIG = {
  test: {
    url:   getEnvVar('UPSTASH_REDIS_REST_URL'),
    token: getEnvVar('UPSTASH_REDIS_REST_TOKEN'),
    label: 'TEST (DEV instance)',
  },
  prod: {
    url:   getEnvVar('UPSTASH_REDIS_REST_URL_PROD'),
    token: getEnvVar('UPSTASH_REDIS_REST_TOKEN_PROD'),
    label: 'PROD',
  },
};

const KEYS = [
  'app:db',
  'app:elsap',
  'app:timesheets',
  'app:invoicing',
  'app:subcontractors',
  'app:projekt-analysis',
  'app:fmo:store',
  'app:fmo:mappings',
  'app:fmo:projects',
  'app:planning',
];

async function redisGet(url, token, key) {
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  return json.result ?? null;
}

async function main() {
  const envArg = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1]
    ?? process.argv[process.argv.indexOf('--env') + 1];

  if (!envArg || !ENV_CONFIG[envArg]) {
    console.error('Usage: node scripts/dump-db.mjs --env test|prod');
    process.exit(1);
  }

  const { url, token, label } = ENV_CONFIG[envArg];
  if (!url || !token) {
    console.error(`Missing credentials for ${envArg} in .env.local`);
    process.exit(1);
  }

  console.log(`\nDumping ${label}...`);

  const dump = { env: envArg, timestamp: new Date().toISOString(), keys: {} };

  for (const key of KEYS) {
    process.stdout.write(`  ${key} ... `);
    const value = await redisGet(url, token, key);
    if (value === null) {
      console.log('empty');
    } else {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      const count = Array.isArray(parsed) ? parsed.length
        : typeof parsed === 'object' && parsed !== null
          ? (parsed.rows?.length ?? parsed.entries?.length ?? parsed.plans?.length ?? Object.keys(parsed).length)
          : '?';
      dump.keys[key] = parsed;
      console.log(`ok (${count} items)`);
    }
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = resolve(__dirname, '../backups');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `dump_${envArg}_${ts}.json`);
  writeFileSync(outPath, JSON.stringify(dump, null, 2));

  console.log(`\n✅ Saved to backups/dump_${envArg}_${ts}.json`);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
