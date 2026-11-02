#!/usr/bin/env node
// `actual-budget <area> <action> [args] [--flags]`. Reads change nothing; every
// change previews by default and only writes with --apply (see src/lib/write.mjs).
import { withBudget } from '../src/lib/session.mjs';
import { parse } from '../src/lib/args.mjs';
import { versionCheck } from '../src/lib/guard.mjs';
import { CONFIG_PATH, saveConfig } from '../src/lib/config.mjs';
import * as budget from '../src/commands/budget.mjs';
import * as categories from '../src/commands/categories.mjs';
import * as accounts from '../src/commands/accounts.mjs';
import * as txns from '../src/commands/txns.mjs';
import * as payees from '../src/commands/payees.mjs';
import * as rules from '../src/commands/rules.mjs';
import * as reports from '../src/commands/reports.mjs';

const AREAS = { budget, categories, accounts, txns, payees, rules, reports };

const status = {
  usage: 'status   Library and server versions, and whether writes are allowed',
  async run(api, cfg) {
    const v = await versionCheck(api);
    console.log(`server ${cfg.serverURL}  ·  Actual server ${v.server}  ·  library ${v.library}`);
    console.log(v.match ? 'Versions match: writes allowed.' : 'Versions differ: writes refused until @actual-app/api is pinned to the server version.');
  },
};

const init = {
  usage: 'init --server URL --sync-id ID [--keychain-service NAME]   Write the config file (no connection made)',
  run(flags) {
    if (!flags.server || !flags['sync-id']) throw new Error(`Usage: actual-budget ${this.usage}`);
    const cfg = { serverURL: flags.server, syncId: flags['sync-id'] };
    if (flags['keychain-service']) cfg.keychainService = flags['keychain-service'];
    saveConfig(cfg);
    console.log(`Wrote ${CONFIG_PATH}`);
  },
};

function help(area) {
  const areas = area ? { [area]: AREAS[area] } : AREAS;
  const lines = area ? [] : ['Usage: actual-budget <area> <action> [args] [--flags]', '', '  ' + init.usage, '  ' + status.usage, ''];
  for (const [name, mod] of Object.entries(areas)) {
    lines.push(`${name}:`, ...Object.values(mod.actions).map((a) => '  ' + a.usage), '');
  }
  console.log(lines.join('\n'));
}

const [areaName, actionName, ...rest] = process.argv.slice(2);
const fail = (err) => {
  console.error(`actual-budget: ${err.message}`);
  process.exit(1);
};

if (!areaName || areaName === 'help' || areaName === '--help') {
  help();
  process.exit(0);
}
if (areaName === 'init') {
  try { init.run(parse([actionName, ...rest].filter(Boolean)).flags); } catch (err) { fail(err); }
  process.exit(0);
}
let command;
if (areaName === 'status') command = status;
else if (!AREAS[areaName]) { console.error(`actual-budget: unknown area "${areaName}"`); help(); process.exit(1); }
else command = AREAS[areaName].actions[actionName];
if (!command) { help(areaName); process.exit(actionName ? 1 : 0); }

const { args, flags } = parse(areaName === 'status' ? [actionName, ...rest].filter(Boolean) : rest);
try {
  await withBudget((api, cfg) => command.run(api, cfg, args, flags));
} catch (err) {
  fail(err);
}
