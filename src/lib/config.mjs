import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const expand = (p) => p.replace(/^~(?=\/|$)/, homedir());

export const CONFIG_PATH = expand(
  process.env.ACTUAL_BUDGET_CLI_CONFIG ?? join(process.env.XDG_CONFIG_HOME ?? '~/.config', 'actual-budget-cli/config.json'),
);
const STATE_DIR = expand(join(process.env.XDG_DATA_HOME ?? '~/.local/share', 'actual-budget-cli'));

// Settings are per machine and live outside the repository: the server address,
// the budget's sync ID and, on macOS, which Keychain item holds the password.
export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) throw new Error(`No config at ${CONFIG_PATH}. Run: actual-budget init --server <url> --sync-id <id>`);
  const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  for (const key of ['serverURL', 'syncId']) if (!raw[key]) throw new Error(`${CONFIG_PATH} is missing "${key}"`);
  const logDir = STATE_DIR;
  const dataDir = expand(raw.dataDir ?? join(STATE_DIR, 'data'));
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  return { ...raw, dataDir, logDir };
}

export function saveConfig(cfg) {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
}

export function keychainRead(service) {
  try {
    return execFileSync('security', ['find-generic-password', '-s', service, '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trimEnd();
  } catch {
    return null;
  }
}

// The password is never stored by this tool: it comes from the macOS Keychain
// item named in the config, or from ACTUAL_PASSWORD in the environment.
export function readPassword(cfg) {
  if (cfg.keychainService) {
    const pw = keychainRead(cfg.keychainService);
    if (pw) return pw;
    throw new Error(`No Keychain item "${cfg.keychainService}". Store it with: security add-generic-password -a "$USER" -s ${cfg.keychainService} -w`);
  }
  if (process.env.ACTUAL_PASSWORD) return process.env.ACTUAL_PASSWORD;
  throw new Error('No password: set "keychainService" in the config (macOS) or ACTUAL_PASSWORD in the environment');
}

export function readEncryptionPassword(cfg) {
  if (cfg.encryptionKeychainService) return keychainRead(cfg.encryptionKeychainService) ?? undefined;
  return process.env.ACTUAL_BUDGET_ENCRYPTION_PASSWORD || undefined;
}
