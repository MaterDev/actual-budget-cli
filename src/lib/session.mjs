import api from '@actual-app/api';
import { appendFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, readEncryptionPassword } from './config.mjs';
import { freshToken, savedToken, tokenIsValid } from './auth.mjs';

// The API library logs freely to stdout; silence it so command output stays clean.
export async function quietly(fn) {
  const saved = { log: console.log, info: console.info, debug: console.debug, warn: console.warn };
  console.log = console.info = console.debug = console.warn = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, saved);
  }
}

// ACTUAL_BUDGET_CLI_SANDBOX=<dir> runs against a copied data dir with no server: nothing
// syncs, so --apply can be exercised without touching the real budget.
async function withSandbox(dir, fn) {
  const cfg = { ...loadConfig(), dataDir: dir, logDir: dir, sandbox: true };
  const local = readdirSync(dir).find((d) => existsSync(join(dir, d, 'metadata.json')));
  if (!local) throw new Error(`No budget copy in sandbox ${dir}`);
  await quietly(async () => {
    await api.init({ dataDir: dir });
    await api.loadBudget(local);
  });
  try {
    return await fn(api, cfg);
  } finally {
    await quietly(() => api.shutdown());
  }
}

export async function withBudget(fn) {
  if (process.env.ACTUAL_BUDGET_CLI_SANDBOX) return withSandbox(process.env.ACTUAL_BUDGET_CLI_SANDBOX, fn);
  const cfg = loadConfig();
  let sessionToken = savedToken(cfg);
  if (!sessionToken || !(await tokenIsValid(cfg, sessionToken))) sessionToken = await freshToken(cfg);
  await quietly(async () => {
    await api.init({ dataDir: cfg.dataDir, serverURL: cfg.serverURL, sessionToken });
    await api.downloadBudget(cfg.syncId, { password: readEncryptionPassword(cfg) });
  });
  try {
    return await fn(api, cfg);
  } finally {
    await quietly(async () => {
      await api.sync();
      await api.shutdown();
    });
  }
}

export function logWrite(cfg, entry) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  appendFileSync(join(cfg.logDir, 'writes.log'), line + '\n');
}
