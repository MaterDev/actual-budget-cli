import { lookups } from '../lib/resolve.mjs';
import { previewOrApply } from '../lib/write.mjs';
import { money, monthArg, onOff, table, toCents } from '../lib/format.mjs';
import { need } from '../lib/args.mjs';
import { quietly } from '../lib/session.mjs';

const flat = (m) => new Map(m.categoryGroups.flatMap((g) => g.categories).map((c) => [c.id, c]));

export const actions = {
  month: {
    usage: 'budget month [YYYY-MM] [--json]   To-budget, totals and every category',
    async run(api, _cfg, args, flags) {
      const m = await api.getBudgetMonth(monthArg(args[0]));
      if (flags.json) return console.log(JSON.stringify(m, null, 2));
      console.log(`${m.month}  to budget ${money(m.toBudget)}  ·  income ${money(m.totalIncome)}  ·  budgeted ${money(Math.abs(m.totalBudgeted))}  ·  spent ${money(m.totalSpent)}  ·  overspent last month ${money(m.lastMonthOverspent)}  ·  held for next month ${money(m.forNextMonth)}\n`);
      const rows = [];
      for (const g of m.categoryGroups.filter((g) => !g.is_income)) {
        for (const c of g.categories.filter((c) => !c.hidden && (c.budgeted || c.spent || c.balance))) {
          rows.push([g.name, c.name, money(c.budgeted), money(c.spent), money(c.balance), [c.balance < 0 ? 'OVER' : '', c.carryover ? 'carryover' : ''].filter(Boolean).join(' ')]);
        }
      }
      console.log(table(rows, ['Group', 'Category', 'Budgeted', 'Spent', 'Balance', '']));
    },
  },
  months: {
    usage: 'budget months   Months that have a budget',
    async run(api) {
      const months = await api.getBudgetMonths();
      console.log(`${months[0]} … ${months.at(-1)} (${months.length} months)`);
    },
  },
  set: {
    usage: 'budget set YYYY-MM "Category=amount" ... [--apply]   Set budgeted amounts',
    async run(api, cfg, args, flags) {
      need(args, 2, this.usage);
      const month = monthArg(args[0]);
      const lk = await lookups(api);
      const before = await api.getBudgetMonth(month);
      const cur = flat(before);
      const changes = args.slice(1).map((p) => {
        const i = p.lastIndexOf('=');
        if (i < 1) throw new Error(`Expected "Category=amount", got ${p}`);
        const c = lk.category(p.slice(0, i));
        const was = cur.get(c.id);
        return { id: c.id, name: c.name, from: was?.budgeted ?? 0, to: toCents(p.slice(i + 1)), balance: was?.balance ?? 0 };
      });
      await applyBudget(api, cfg, flags, month, before, changes);
    },
  },
  move: {
    usage: 'budget move YYYY-MM AMOUNT "From category" "To category" [--apply]   Move budgeted money',
    async run(api, cfg, args, flags) {
      need(args, 4, this.usage);
      const month = monthArg(args[0]);
      const amount = toCents(args[1]);
      const lk = await lookups(api);
      const before = await api.getBudgetMonth(month);
      const cur = flat(before);
      const [from, to] = [lk.category(args[2]), lk.category(args[3])];
      const changes = [from, to].map((c, i) => {
        const was = cur.get(c.id);
        const b = was?.budgeted ?? 0;
        return { id: c.id, name: c.name, from: b, to: b + (i === 0 ? -amount : amount), balance: was?.balance ?? 0 };
      });
      await applyBudget(api, cfg, flags, month, before, changes);
    },
  },
  carryover: {
    usage: 'budget carryover YYYY-MM "Category" on|off [--apply]   Roll an overspend into next month instead of to-budget',
    async run(api, cfg, args, flags) {
      need(args, 3, this.usage);
      const month = monthArg(args[0]);
      const lk = await lookups(api);
      const c = lk.category(args[1]);
      const flag = onOff(args[2]);
      const was = flat(await api.getBudgetMonth(month)).get(c.id)?.carryover ?? false;
      await previewOrApply(api, cfg, flags, {
        title: `${month}: carryover for ${c.name}: ${was ? 'on' : 'off'} → ${flag ? 'on' : 'off'}`,
        apply: () => api.setBudgetCarryover(month, c.id, flag),
        log: { op: 'budget-carryover', month, category: c.name, from: was, to: flag },
      });
    },
  },
  hold: {
    usage: 'budget hold YYYY-MM AMOUNT [--apply]   Hold to-budget money for next month',
    async run(api, cfg, args, flags) {
      need(args, 2, this.usage);
      const month = monthArg(args[0]);
      const amount = toCents(args[1]);
      const m = await api.getBudgetMonth(month);
      await previewOrApply(api, cfg, flags, {
        title: `${month}: hold ${money(amount)} for next month (held now ${money(m.forNextMonth)}, to budget ${money(m.toBudget)} → ${money(m.toBudget - amount)})`,
        notes: amount > m.toBudget ? ['Warning: that is more than this month has left to budget.'] : [],
        apply: () => api.holdBudgetForNextMonth(month, amount),
        log: { op: 'budget-hold', month, amount },
      });
    },
  },
  'hold-reset': {
    usage: 'budget hold-reset YYYY-MM [--apply]   Release money held for next month',
    async run(api, cfg, args, flags) {
      const month = monthArg(args[0]);
      const m = await api.getBudgetMonth(month);
      await previewOrApply(api, cfg, flags, {
        title: `${month}: release ${money(m.forNextMonth)} held for next month`,
        apply: () => api.resetBudgetHold(month),
        log: { op: 'budget-hold-reset', month, released: m.forNextMonth },
      });
    },
  },
  note: {
    usage: 'budget note "Category" ["text"] [--apply]   Read, or set, a category note (where #template goals live)',
    async run(api, cfg, args, flags) {
      need(args, 1, this.usage);
      const lk = await lookups(api);
      const c = lk.anyCategory(args[0]);
      const was = (await api.getNote?.(c.id))?.note ?? '';
      if (args.length < 2) return console.log(was || '(no note)');
      await previewOrApply(api, cfg, flags, {
        title: `Note for ${c.name}:\n  was: ${was || '(none)'}\n  new: ${args[1] || '(cleared)'}`,
        apply: () => api.updateNote(c.id, args[1]),
        log: { op: 'budget-note', category: c.name, from: was, to: args[1] },
      });
    },
  },
};

async function applyBudget(api, cfg, flags, month, before, changes) {
  const delta = changes.reduce((s, c) => s + (c.to - c.from), 0);
  await previewOrApply(api, cfg, flags, {
    title: `${month} budget changes`,
    headers: ['Category', 'Budgeted now', 'New', 'Balance after'],
    rows: changes.map((c) => [c.name, money(c.from), money(c.to), money(c.balance + c.to - c.from)]),
    notes: [`${month} to budget: ${money(before.toBudget)} → ${money(before.toBudget - delta)}`, ...changes.filter((c) => c.to < 0).map((c) => `Warning: ${c.name} would be budgeted below zero.`)],
    apply: async () => {
      await quietly(() => api.batchBudgetUpdates(async () => {
        for (const c of changes) await api.setBudgetAmount(month, c.id, c.to);
      }));
      console.log(`${month} to budget is now ${money((await api.getBudgetMonth(month)).toBudget)}.`);
    },
    log: { op: 'budget-set', month, changes: changes.map(({ name, from, to }) => ({ name, from, to })) },
  });
}
