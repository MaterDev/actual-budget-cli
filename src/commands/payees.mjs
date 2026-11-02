import { lookups } from '../lib/resolve.mjs';
import { previewOrApply } from '../lib/write.mjs';
import { table } from '../lib/format.mjs';
import { need } from '../lib/args.mjs';

export const actions = {
  list: {
    usage: 'payees list [--search TEXT]',
    async run(api, _cfg, _args, flags) {
      const lk = await lookups(api);
      const q = flags.search ? String(flags.search).toLowerCase() : '';
      const rows = lk.payees.filter((p) => !p.transfer_acct && p.name.toLowerCase().includes(q)).map((p) => [p.name, lk.names.category.get(p.category) ?? '']);
      console.log(table(rows, ['Payee', 'Default category']));
      console.log(`\n${rows.length} payees`);
    },
  },
  rename: {
    usage: 'payees rename "Old" "New" [--apply]',
    async run(api, cfg, args, flags) {
      need(args, 2, this.usage);
      const p = (await lookups(api)).payee(args[0]);
      await previewOrApply(api, cfg, flags, {
        title: `Rename payee "${p.name}" → "${args[1]}"`,
        apply: () => api.updatePayee(p.id, { name: args[1] }),
        log: { op: 'payee-rename', from: p.name, to: args[1] },
      });
    },
  },
  merge: {
    usage: 'payees merge "Keep" "Other" ... [--apply]   Fold the others into Keep; their transactions move to it',
    async run(api, cfg, args, flags) {
      need(args, 2, this.usage);
      const lk = await lookups(api);
      const keep = lk.payee(args[0]);
      const others = args.slice(1).map((n) => lk.payee(n));
      if (others.some((o) => o.id === keep.id)) throw new Error('A payee cannot be merged into itself');
      await previewOrApply(api, cfg, flags, {
        title: `Merge into "${keep.name}": ${others.map((o) => `"${o.name}"`).join(', ')}`,
        notes: ['The merged payees disappear; their transactions and rules point at the kept one.'],
        apply: () => api.mergePayees(keep.id, others.map((o) => o.id)),
        log: { op: 'payee-merge', keep: keep.name, merged: others.map((o) => o.name) },
      });
    },
  },
};
