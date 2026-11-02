import { beforeWrite } from './guard.mjs';
import { logWrite } from './session.mjs';
import { table } from './format.mjs';

// The one path every change takes: show the preview, stop unless --apply, then
// check versions, back up, make the change and log it.
export async function previewOrApply(api, cfg, flags, { title, rows, headers, notes = [], apply, log }) {
  console.log(title + '\n');
  if (rows?.length) console.log(table(rows, headers) + '\n');
  for (const n of notes) console.log(n);
  if (!flags.apply) {
    console.log('\nDry run, nothing written. Re-run with --apply to make this change.');
    return false;
  }
  const backup = await beforeWrite(api, cfg);
  const result = await apply();
  logWrite(cfg, { ...log, backup });
  console.log('\nApplied.');
  return result ?? true;
}
