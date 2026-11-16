#!/usr/bin/env node
/**
 * Restores app:elsap in Redis from a local backup JSON file.
 * Usage:
 *   node scripts/restore-elsap.mjs --env test   <- DEV instance (safe)
 *   node scripts/restore-elsap.mjs --env prod   <- PROD instance
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BACKUP_PATH = resolve(__dirname, '../prod-backup-2026-08-17/app_elsap.json');
const KEY = 'app:elsap';

// Credentials — read from .env.local manually (no dotenv dependency needed)
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

async function redisGet(url, token, key) {
  const res = await fetch(`${url}/get/${key}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  return json.result;
}

async function redisSet(url, token, key, value) {
  const res = await fetch(`${url}/set/${key}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(value),
  });
  const json = await res.json();
  return json.result;
}

async function main() {
  const envArg = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1]
    ?? process.argv[process.argv.indexOf('--env') + 1];

  if (!envArg || !ENV_CONFIG[envArg]) {
    console.error('Usage: node scripts/restore-elsap.mjs --env test|prod');
    process.exit(1);
  }

  const { url, token, label } = ENV_CONFIG[envArg];
  if (!url || !token) {
    console.error(`Missing credentials for ${envArg} in .env.local`);
    process.exit(1);
  }

  // 1. Load backup
  const backup = JSON.parse(readFileSync(BACKUP_PATH, 'utf-8'));
  console.log(`\nBackup loaded: ${backup.rows.length} rows, lastImport: ${backup.lastImport}`);

  // 2. Read current state before overwriting
  console.log(`\nReading current state from ${label}...`);
  const current = await redisGet(url, token, KEY);
  if (current) {
    const currentRows = typeof current === 'string' ? JSON.parse(current) : current;
    const rows = currentRows?.rows ?? [];
    console.log(`  Current mirror: ${rows.length} rows`);
    if (rows.length > 0) {
      console.log(`  First row ID: ${rows[0]?.id}`);
    }
  } else {
    console.log('  Current mirror: empty');
  }

  // 3. Confirm
  console.log(`\n⚠️  About to write ${backup.rows.length} rows to ${label} (key: ${KEY})`);
  if (envArg === 'prod') {
    console.log('⚠️  THIS IS PRODUCTION — press Ctrl+C within 5 seconds to abort...');
    await new Promise((r) => setTimeout(r, 5000));
  }

  // 4. Write
  console.log('Writing backup to Redis...');
  const result = await redisSet(url, token, KEY, backup);
  if (result !== 'OK') {
    console.error(`Redis SET returned unexpected result: ${result}`);
    process.exit(1);
  }

  // 5. Verify
  console.log('Verifying...');
  const written = await redisGet(url, token, KEY);
  const writtenData = typeof written === 'string' ? JSON.parse(written) : written;
  const writtenRows = writtenData?.rows?.length ?? 0;

  if (writtenRows !== backup.rows.length) {
    console.error(`Verification FAILED: expected ${backup.rows.length} rows, got ${writtenRows}`);
    process.exit(1);
  }

  console.log(`\n✅ Restore successful on ${label}: ${writtenRows} rows written and verified.`);
  console.log(`   lastImport: ${writtenData.lastImport}`);
  console.log(`   lastApply:  ${writtenData.lastApply}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
