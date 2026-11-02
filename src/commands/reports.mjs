import { lookups } from '../lib/resolve.mjs';
import { leaves, monthEnd, monthsBetween } from '../lib/ledger.mjs';
import { dateArg, money, monthArg, table } from '../lib/format.mjs';
import { need } from '../lib/args.mjs';

const thisMonth = () => new Date().toISOString().slice(0, 7);
const back = (n) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - (n - 1));
  return d.toISOString().slice(0, 7);
};
// --from/--to as months, defaulting to the last N months (--months, default 6).
const range = (flags) => {
  const to = monthArg(flags.to ?? thisMonth());
  const from = monthArg(flags.from ?? back(Number(flags.months ?? 6)));
  return { from, to, months: monthsBetween(from, to) };
};
const pct = (part, whole) => (whole ? `${Math.round((100 * part) / whole)}%` : '');

export const actions = {
  spending: {
    usage: 'reports spending FROM TO [--by category|group|payee] [--top N] [--json]   Net spending by expense category (dates YYYY-MM-DD)',
    async run(api, _cfg, args, flags) {
      need(args, 2, this.usage);
      const lk = await lookups(api);
      const by = flags.by ?? 'category';
      const income = new Set(lk.categories.filter((c) => c.is_income).map((c) => c.id));
      const group = new Map(lk.categories.map((c) => [c.id, c.groupName]));
      const txns = (await leaves(api, lk, dateArg(args[0]), dateArg(args[1]))).filter((t) => !t.internalTransfer && !income.has(t.categoryId));
      const totals = new Map();
      for (const t of txns) {
        const key = by === 'payee' ? t.payee || '(none)' : by === 'group' ? group.get(t.categoryId) ?? '(none)' : t.category;
        totals.set(key, (totals.get(key) ?? 0) + t.amount);
      }
      const sorted = [...totals].sort((a, b) => a[1] - b[1]).slice(0, Number(flags.top ?? 1000));
      const total = [...totals.values()].reduce((s, v) => s + v, 0);
      if (flags.json) return console.log(JSON.stringify(Object.fromEntries(sorted), null, 2));
      console.log(table(sorted.map(([k, v]) => [k, money(-v), pct(v, total)]), [by, 'Spent', 'Share']));
      console.log(`\nTotal ${money(-total)} across ${txns.length} transactions, ${args[0]} to ${args[1]}`);
    },
  },
  cashflow: {
    usage: 'reports cashflow [--from YYYY-MM] [--to YYYY-MM] [--months N]   Income, spending and net per month (on budget)',
    async run(api, _cfg, _args, flags) {
      const { from, to, months } = range(flags);
      const lk = await lookups(api);
      const income = new Set(lk.categories.filter((c) => c.is_income).map((c) => c.id));
      const txns = (await leaves(api, lk, `${from}-01`, monthEnd(to))).filter((t) => !t.internalTransfer);
      const rows = months.map((m) => {
        const inMonth = txns.filter((t) => t.month === m);
        const inc = inMonth.filter((t) => income.has(t.categoryId)).reduce((s, t) => s + t.amount, 0);
        const out = inMonth.filter((t) => !income.has(t.categoryId)).reduce((s, t) => s + t.amount, 0);
        return [m, money(inc), money(-out), money(inc + out)];
      });
      console.log(table(rows, ['Month', 'Income', 'Spending', 'Net']));
    },
  },
  'budget-vs-actual': {
    usage: 'reports budget-vs-actual [--from YYYY-MM] [--to YYYY-MM] [--months N]   Per category: budgeted, spent, months over',
    async run(api, _cfg, _args, flags) {
      const { from, to, months } = range(flags);
      const agg = new Map();
      for (const m of months) {
        const b = await api.getBudgetMonth(m);
        for (const g of b.categoryGroups.filter((g) => !g.is_income)) {
          for (const c of g.categories) {
            const a = agg.get(c.id) ?? { name: c.name, group: g.name, budgeted: 0, spent: 0, over: 0 };
            a.budgeted += c.budgeted;
            a.spent += c.spent;
            if (c.balance < 0) a.over += 1;
            agg.set(c.id, a);
          }
        }
      }
      const rows = [...agg.values()].filter((a) => a.budgeted || a.spent).map((a) => [a.group, a.name, money(a.budgeted), money(-a.spent), money(a.budgeted + a.spent), a.over ? `${a.over}/${months.length}` : '']);
      console.log(`${from} to ${to}\n`);
      console.log(table(rows, ['Group', 'Category', 'Budgeted', 'Spent', 'Left', 'Months over']));
    },
  },
  overspent: {
    usage: 'reports overspent [--from YYYY-MM] [--to YYYY-MM] [--months N]   Overspent categories per month',
    async run(api, _cfg, _args, flags) {
      const { months } = range(flags);
      for (const m of months) {
        const b = await api.getBudgetMonth(m);
        const over = b.categoryGroups.filter((g) => !g.is_income).flatMap((g) => g.categories).filter((c) => c.balance < 0);
        const total = over.reduce((s, c) => s + c.balance, 0);
        console.log(`${m}: ${over.length ? `${money(-total)} — ` + over.map((c) => `${c.name} ${money(-c.balance)}`).join(', ') : 'nothing overspent'}`);
      }
    },
  },
  trend: {
    usage: 'reports trend "Category" [--from YYYY-MM] [--to YYYY-MM] [--months N]   One category month by month',
    async run(api, _cfg, args, flags) {
      need(args, 1, this.usage);
      const { months } = range(flags);
      const c = (await lookups(api)).anyCategory(args[0]);
      const rows = [];
      for (const m of months) {
        const cat = (await api.getBudgetMonth(m)).categoryGroups.flatMap((g) => g.categories).find((x) => x.id === c.id);
        rows.push([m, money(cat?.budgeted ?? 0), money(-(cat?.spent ?? 0)), money(cat?.balance ?? 0)]);
      }
      console.log(`${c.name}\n`);
      console.log(table(rows, ['Month', 'Budgeted', 'Spent', 'Balance']));
    },
  },
  networth: {
    usage: 'reports networth [--from YYYY-MM] [--to YYYY-MM] [--months N]   Month-end balances, on and off budget',
    async run(api, _cfg, _args, flags) {
      const { months } = range(flags);
      const accounts = await api.getAccounts();
      const rows = [];
      for (const m of months) {
        const cutoff = new Date(`${monthEnd(m)}T23:59:59`);
        let on = 0;
        let off = 0;
        for (const a of accounts) {
          const bal = await api.getAccountBalance(a.id, cutoff);
          a.offbudget ? (off += bal) : (on += bal);
        }
        rows.push([m, money(on), money(off), money(on + off)]);
      }
      console.log(table(rows, ['Month', 'On budget', 'Off budget', 'Net worth']));
    },
  },
};
