import { lookups } from '../lib/resolve.mjs';
import { previewOrApply } from '../lib/write.mjs';
import { dateArg, money, table, toCents } from '../lib/format.mjs';
import { need } from '../lib/args.mjs';

export const actions = {
  list: {
    usage: 'accounts list [--closed]   Accounts with on/off budget and balance',
    async run(api, _cfg, _args, flags) {
      const accounts = (await api.getAccounts()).filter((a) => flags.closed || !a.closed);
      const rows = [];
      let on = 0;
      let off = 0;
      for (const a of accounts) {
        const bal = await api.getAccountBalance(a.id);
        if (!a.closed) a.offbudget ? (off += bal) : (on += bal);
        rows.push([a.name, a.offbudget ? 'off budget' : 'on budget', a.closed ? 'closed' : '', money(bal)]);
      }
      console.log(table(rows, ['Account', 'Type', '', 'Balance']));
      console.log(`\nOn budget ${money(on)}  ·  off budget ${money(off)}  ·  all ${money(on + off)}`);
    },
  },
  balance: {
    usage: 'accounts balance "Account" [--on YYYY-MM-DD]   Balance today or at the end of a date',
    async run(api, _cfg, args, flags) {
      need(args, 1, this.usage);
      const a = (await lookups(api)).account(args[0]);
      const cutoff = flags.on ? new Date(`${dateArg(flags.on)}T23:59:59`) : undefined;
      console.log(`${a.name}${flags.on ? ` on ${flags.on}` : ''}: ${money(await api.getAccountBalance(a.id, cutoff))}`);
    },
  },
  add: {
    usage: 'accounts add "Name" [--offbudget] [--balance AMOUNT] [--apply]',
    async run(api, cfg, args, flags) {
      need(args, 1, this.usage);
      const lk = await lookups(api);
      if (lk.accounts.some((a) => a.name.toLowerCase() === args[0].toLowerCase())) throw new Error(`An account named "${args[0]}" already exists`);
      const balance = flags.balance ? toCents(flags.balance) : 0;
      await previewOrApply(api, cfg, flags, {
        title: `New ${flags.offbudget ? 'off-budget' : 'on-budget'} account "${args[0]}" with starting balance ${money(balance)}`,
        notes: !flags.offbudget && balance ? ['The starting balance arrives as income in this month\'s budget.'] : [],
        apply: () => api.createAccount({ name: args[0], offbudget: Boolean(flags.offbudget) }, balance),
        log: { op: 'account-add', name: args[0], offbudget: Boolean(flags.offbudget), balance },
      });
    },
  },
  rename: {
    usage: 'accounts rename "Old" "New" [--apply]',
    async run(api, cfg, args, flags) {
      need(args, 2, this.usage);
      const a = (await lookups(api)).account(args[0]);
      await previewOrApply(api, cfg, flags, {
        title: `Rename account "${a.name}" → "${args[1]}"`,
        apply: () => api.updateAccount(a.id, { name: args[1] }),
        log: { op: 'account-rename', from: a.name, to: args[1] },
      });
    },
  },
  close: {
    usage: 'accounts close "Account" [--transfer-to "Account"] [--category "Category"] [--apply]   A non-zero balance must be moved first',
    async run(api, cfg, args, flags) {
      need(args, 1, this.usage);
      const lk = await lookups(api);
      const a = lk.account(args[0]);
      if (a.closed) throw new Error(`${a.name} is already closed`);
      const bal = await api.getAccountBalance(a.id);
      const target = flags['transfer-to'] ? lk.account(flags['transfer-to']) : null;
      const cat = flags.category ? lk.category(flags.category) : null;
      if (bal !== 0 && !target) throw new Error(`${a.name} holds ${money(bal)}; pass --transfer-to "Account" to move it before closing`);
      if (target && !a.offbudget && target.offbudget && !cat) throw new Error('Moving money from an on-budget to an off-budget account needs --category');
      await previewOrApply(api, cfg, flags, {
        title: `Close "${a.name}" (balance ${money(bal)})${target ? `, moving the balance to ${target.name}` : ''}${cat ? ` as ${cat.name}` : ''}`,
        apply: () => api.closeAccount(a.id, target?.id, cat?.id),
        log: { op: 'account-close', account: a.name, balance: bal, transferTo: target?.name, category: cat?.name },
      });
    },
  },
  reopen: {
    usage: 'accounts reopen "Account" [--apply]',
    async run(api, cfg, args, flags) {
      need(args, 1, this.usage);
      const a = (await lookups(api)).account(args[0]);
      if (!a.closed) throw new Error(`${a.name} is not closed`);
      await previewOrApply(api, cfg, flags, {
        title: `Reopen "${a.name}"`,
        apply: () => api.reopenAccount(a.id),
        log: { op: 'account-reopen', account: a.name },
      });
    },
  },
};
