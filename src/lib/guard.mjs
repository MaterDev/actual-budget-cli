import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Actual versions by year and month (26.11.0), and a month can change the
// database, so a write is only allowed when the library and the server share one.
const yearMonth = (v) => String(v).split('.').slice(0, 2).join('.');

export function libraryVersion() {
  const pkg = new URL('../../node_modules/@actual-app/api/package.json', import.meta.url);
  return JSON.parse(readFileSync(pkg, 'utf8')).version;
}

export async function versionCheck(api) {
  const server = await api.getServerVersion();
  const library = libraryVersion();
  const serverVersion = server?.version ?? 'unknown';
  return { library, server: serverVersion, match: yearMonth(library) === yearMonth(serverVersion) };
}

// Runs before every --apply: refuses on a version mismatch, then saves a full
// export of the budget, which Actual's "Import budget" can restore.
export async function beforeWrite(api, cfg) {
  const v = cfg.sandbox ? { match: true } : await versionCheck(api);
  if (!v.match) {
    throw new Error(`Refusing to write: library ${v.library} and Actual server ${v.server} differ. Pin @actual-app/api to the app's version first.`);
  }
  const dir = join(cfg.logDir, 'backups');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.zip`);
  writeFileSync(file, await api.exportBudget(), { mode: 0o600 });
  console.log(`Backup: ${file}`);
  return file;
}
