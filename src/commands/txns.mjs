import { lookups } from '../lib/resolve.mjs';
import { leaves } from '../lib/ledger.mjs';
import { previewOrApply } from '../lib/write.mjs';
import { dateArg, money, table, toCents } from '../lib/format.mjs';
import { need } from '../lib/args.mjs';
import { quietly } from '../lib/session.mjs';

async function findOne(api, lk, from, to, prefix) {
  const hits = (await leaves(api, lk, from, to, { accounts: lk.accounts })).filter((t) => t.id.startsWith(prefix));
  if (hits.length !== 1) throw new Error(`Id "${prefix}" matched ${hits.length} transactions between ${from} and ${to}`);
  return hits[0];
}

// The API docs warn that transfers and single split pieces do not update reliably.
function editable(t) {
  if (t.isTransfer) throw new Error('That transaction is a transfer; change it in the app.');
  if (t.isChild || t.isParent) throw new Error('That transaction is part of a split; change it in the app.');
}

export const actions = {
  list: {
    usage: 'txns list FROM TO [--account A] [--category C] [--payee P] [--search TEXT] [--json]   Dates are YYYY-MM-DD',
    async run(api, _cfg, args, flags) {
      need(args, 2, this.usage);
      const lk = await lookups(api);
      const accounts = flags.account ? [lk.account(flags.account)] : undefined;
      let rows = await leaves(api, lk, dateArg(args[0]), dateArg(args[1]), { accounts });
      if (flags.category) rows = rows.filter((t) => t.categoryId === lk.anyCategory(flags.category).id);
      if (flags.payee) rows = rows.filter((t) => t.payee === lk.payee(flags.payee).name);
      if (flags.search) rows = rows.filter((t) => `${t.payee} ${t.notes}`.toLowerCase().includes(String(flags.search).toLowerCase()));
      if (flags.json) return console.log(JSON.stringify(rows, null, 2));
      console.log(table(rows.map((t) => [t.date, t.account.slice(0, 22), t.payee.slice(0, 30), t.category, money(t.amount), t.id.slice(0, 8)]), ['Date', 'Account', 'Payee', 'Category', 'Amount', 'Id']));
      console.log(`\n${rows.length} transactions, total ${money(rows.reduce((s, t) => s + t.amount, 0))}`);
    },
  },
  add: {
    usage: 'txns add "Account" YYYY-MM-DD AMOUNT "Payee" [--category C] [--notes TEXT] [--apply]   Negative AMOUNT is spending; your rules run on it',
    async run(api, cfg, args, flags) {
      need(args, 4, this.usage);
      const lk = await lookups(api);
      const a = lk.account(args[0]);
      const cat = flags.category ? lk.category(flags.category) : null;
      const txn = { date: dateArg(args[1]), amount: toCents(args[2]), payee_name: args[3], category: cat?.id, notes: flags.notes };
      const dry = await quietly(() => api.importTransactions(a.id, [txn], { dryRun: true }));
      await previewOrApply(api, cfg, flags, {
        title: `Add to ${a.name}: ${txn.date}  ${args[3]}  ${money(txn.amount)}${cat ? `  → ${cat.name}` : ''}`,
        notes: [
          dry.added?.length ? 'Actual would add it as a new transaction (your rules may set or change its category).' : '',
          dry.updated?.length ? 'Actual would MATCH it to an existing transaction instead of adding one.' : '',
          ...(dry.errors ?? []).map((e) => `Error: ${e.message ?? e}`),
        ].filter(Boolean),
        apply: () => quietly(() => api.importTransactions(a.id, [txn])),
        log: { op: 'txn-add', account: a.name, ...txn, category: cat?.name },
      });
    },
  },
  categorize: {
    usage: 'txns categorize FROM TO ID "Category" [--apply]   ID is the 8-character id from txns list',
    async run(api, cfg, args, flags) {
      need(args, 4, this.usage);
      const lk = await lookups(api);
      const t = await findOne(api, lk, dateArg(args[0]), dateArg(args[1]), args[2]);
      editable(t);
      const cat = lk.category(args[3]);
      await previewOrApply(api, cfg, flags, {
        title: `${t.date}  ${t.payee}  ${money(t.amount)}: ${t.category} → ${cat.name}`,
        apply: () => api.updateTransaction(t.id, { category: cat.id }),
        log: { op: 'txn-categorize', id: t.id, from: t.category, to: cat.name },
      });
    },
  },
  note: {
    usage: 'txns note FROM TO ID "text" [--apply]',
    async run(api, cfg, args, flags) {
      need(args, 4, this.usage);
      const lk = await lookups(api);
      const t = await findOne(api, lk, dateArg(args[0]), dateArg(args[1]), args[2]);
      editable(t);
      await previewOrApply(api, cfg, flags, {
        title: `${t.date}  ${t.payee}  ${money(t.amount)}: notes "${t.notes}" → "${args[3]}"`,
        apply: () => api.updateTransaction(t.id, { notes: args[3] }),
        log: { op: 'txn-note', id: t.id, from: t.notes, to: args[3] },
      });
    },
  },
  payee: {
    usage: 'txns payee FROM TO ID "Payee" [--apply]   Set the payee (an existing one, by name)',
    async run(api, cfg, args, flags) {
      need(args, 4, this.usage);
      const lk = await lookups(api);
      const t = await findOne(api, lk, dateArg(args[0]), dateArg(args[1]), args[2]);
      editable(t);
      const p = lk.payee(args[3]);
      await previewOrApply(api, cfg, flags, {
        title: `${t.date}  ${money(t.amount)}: payee ${t.payee} → ${p.name}`,
        apply: () => api.updateTransaction(t.id, { payee: p.id }),
        log: { op: 'txn-payee', id: t.id, from: t.payee, to: p.name },
      });
    },
  },
};
