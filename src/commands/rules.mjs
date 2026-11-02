import { lookups } from '../lib/resolve.mjs';
import { leaves } from '../lib/ledger.mjs';
import { previewOrApply } from '../lib/write.mjs';
import { describe, effect, matches, parseAction, parseCondition } from '../lib/rules.mjs';
import { money, table } from '../lib/format.mjs';
import { list, need } from '../lib/args.mjs';

async function findRule(api, prefix) {
  const hits = (await api.getRules()).filter((r) => r.id.startsWith(prefix));
  if (hits.length !== 1) throw new Error(`Rule id "${prefix}" matched ${hits.length} rules`);
  return hits[0];
}

async function recent(api, lk, months) {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth() - (months - 1), 1);
  return leaves(api, lk, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10), { accounts: lk.accounts.filter((a) => !a.closed) });
}

function preview(lk, rule, txns, months) {
  const hit = matches(rule, txns, lk);
  const lines = [`Would match ${hit.length} transactions in the last ${months} months (approximate; Actual's engine decides on import):`];
  for (const t of hit.slice(0, 15)) lines.push(`  ${t.date}  ${t.payee.slice(0, 28).padEnd(28)}  ${money(t.amount).padStart(10)}  ${effect(lk, rule, t)}`);
  if (hit.length > 15) lines.push(`  … and ${hit.length - 15} more`);
  lines.push('A new or changed rule applies to future imports; existing transactions are not changed.');
  return lines;
}

function build(lk, flags, base = {}) {
  const ifs = list(flags.if);
  const thens = list(flags.then);
  const stage = flags.stage === undefined ? base.stage ?? null : flags.stage === 'default' ? null : flags.stage;
  if (![null, 'pre', 'post'].includes(stage)) throw new Error('--stage must be pre, default or post');
  return {
    ...base,
    stage,
    conditionsOp: flags.any ? 'or' : flags.all ? 'and' : base.conditionsOp ?? 'and',
    conditions: ifs.length ? ifs.map((c) => parseCondition(lk, c)) : base.conditions,
    actions: thens.length ? thens.map((a) => parseAction(lk, a)) : base.actions,
  };
}

export const actions = {
  list: {
    usage: 'rules list [--payee P] [--category C] [--search TEXT]',
    async run(api, _cfg, _args, flags) {
      const lk = await lookups(api);
      let rules = await api.getRules();
      if (flags.payee) {
        const ids = new Set((await api.getPayeeRules(lk.payee(flags.payee).id)).map((r) => r.id));
        rules = rules.filter((r) => ids.has(r.id));
      }
      if (flags.category) {
        const id = lk.anyCategory(flags.category).id;
        rules = rules.filter((r) => JSON.stringify(r).includes(id));
      }
      let rows = rules.map((r) => [r.id.slice(0, 8), describe(lk, r)]);
      if (flags.search) rows = rows.filter((r) => r[1].toLowerCase().includes(String(flags.search).toLowerCase()));
      console.log(table(rows, ['Id', 'Rule']));
      console.log(`\n${rows.length} rules`);
    },
  },
  show: {
    usage: 'rules show ID [--json]',
    async run(api, _cfg, args, flags) {
      need(args, 1, this.usage);
      const lk = await lookups(api);
      const r = await findRule(api, args[0]);
      console.log(flags.json ? JSON.stringify(r, null, 2) : `${r.id}\n${describe(lk, r)}`);
    },
  },
  test: {
    usage: 'rules test ID [--months N]   Which recent transactions an existing rule matches',
    async run(api, _cfg, args, flags) {
      need(args, 1, this.usage);
      const lk = await lookups(api);
      const r = await findRule(api, args[0]);
      const months = Number(flags.months ?? 3);
      console.log(describe(lk, r) + '\n');
      console.log(preview(lk, r, await recent(api, lk, months), months).join('\n'));
    },
  },
  add: {
    usage: 'rules add --if "field op value" ... --then "field = value" ... [--any] [--stage pre|post] [--months N] [--apply]',
    async run(api, cfg, _args, flags) {
      if (!flags.if || !flags.then) throw new Error(`Usage: ${this.usage}`);
      const lk = await lookups(api);
      const rule = build(lk, flags);
      const months = Number(flags.months ?? 3);
      await previewOrApply(api, cfg, flags, {
        title: `New rule: ${describe(lk, rule)}`,
        notes: preview(lk, rule, await recent(api, lk, months), months),
        apply: async () => console.log(`Created rule ${(await api.createRule(rule)).id.slice(0, 8)}`),
        log: { op: 'rule-add', rule },
      });
    },
  },
  update: {
    usage: 'rules update ID [--if ...] [--then ...] [--any|--all] [--stage pre|default|post] [--apply]   Given --if or --then lists replace the old ones',
    async run(api, cfg, args, flags) {
      need(args, 1, this.usage);
      const lk = await lookups(api);
      const old = await findRule(api, args[0]);
      const rule = build(lk, flags, old);
      const months = Number(flags.months ?? 3);
      await previewOrApply(api, cfg, flags, {
        title: `Update rule ${old.id.slice(0, 8)}:\n  was: ${describe(lk, old)}\n  new: ${describe(lk, rule)}`,
        notes: preview(lk, rule, await recent(api, lk, months), months),
        apply: () => api.updateRule(rule),
        log: { op: 'rule-update', id: old.id, from: old, to: rule },
      });
    },
  },
  delete: {
    usage: 'rules delete ID [--apply]   The rule is in the pre-change backup if it is ever wanted back',
    async run(api, cfg, args, flags) {
      need(args, 1, this.usage);
      const lk = await lookups(api);
      const r = await findRule(api, args[0]);
      await previewOrApply(api, cfg, flags, {
        title: `Delete rule ${r.id.slice(0, 8)}: ${describe(lk, r)}`,
        apply: () => api.deleteRule(r.id),
        log: { op: 'rule-delete', rule: r },
      });
    },
  },
};
