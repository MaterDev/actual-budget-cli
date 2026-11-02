import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { keychainRead, readPassword } from './config.mjs';

// Each password login counts against the server's login rate limit, so a session
// token is kept (Keychain on macOS, otherwise a user-only file) and the password
// is only used to get a new one.
const tokenFile = (cfg) => join(cfg.logDir, 'session-token');

export function savedToken(cfg) {
  if (cfg.keychainService) return keychainRead(`${cfg.keychainService}-cli-token`);
  return existsSync(tokenFile(cfg)) ? readFileSync(tokenFile(cfg), 'utf8').trim() : null;
}

function saveToken(cfg, token) {
  if (cfg.keychainService) {
    execFileSync('security', ['add-generic-password', '-U', '-a', process.env.USER ?? 'actual', '-s', `${cfg.keychainService}-cli-token`, '-w', token], { stdio: 'ignore' });
  } else {
    writeFileSync(tokenFile(cfg), token + '\n', { mode: 0o600 });
  }
}

export async function freshToken(cfg) {
  const res = await fetch(new URL('/account/login', cfg.serverURL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginMethod: 'password', password: readPassword(cfg) }),
  });
  const body = await res.json().catch(() => ({}));
  const token = body?.data?.token;
  if (!res.ok || !token) throw new Error(`Login to ${cfg.serverURL} failed: ${body.reason ?? res.status}`);
  saveToken(cfg, token);
  return token;
}

export async function tokenIsValid(cfg, token) {
  const res = await fetch(new URL('/account/validate', cfg.serverURL), { headers: { 'X-ACTUAL-TOKEN': token } });
  const body = await res.json().catch(() => ({}));
  return res.ok && body?.data?.validated === true;
}
