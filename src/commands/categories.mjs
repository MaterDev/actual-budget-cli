import { lookups } from '../lib/resolve.mjs';
import { previewOrApply } from '../lib/write.mjs';
import { table } from '../lib/format.mjs';
import { need } from '../lib/args.mjs';

export const actions = {
  list: {
    usage: 'categories list [--hidden]   Groups and categories',
    async run(api, _cfg, _args, flags) {
      const lk = await lookups(api);
      const rows = lk.categories.filter((c) => flags.hidden || !c.hidden).map((c) => [c.groupName, c.name, c.is_income ? 'income' : '', c.hidden ? 'hidden' : '']);
      console.log(table(rows, ['Group', 'Category', '', '']));
    },
  },
  add: {
    usage: 'categories add "Name" --group "Group" [--apply]',
    async run(api, cfg, args, flags) {
      need(args, 1, this.usage);
      if (!flags.group) throw new Error(`Usage: ${this.usage}`);
      const lk = await lookups(api);
      const g = lk.group(flags.group);
      if (lk.categories.some((c) => c.name.toLowerCase() === args[0].toLowerCase())) throw new Error(`A category named "${args[0]}" already exists`);
      await previewOrApply(api, cfg, flags, {
        title: `New category "${args[0]}" in ${g.name}`,
        apply: () => api.createCategory({ name: args[0], group_id: g.id, is_income: Boolean(g.is_income), hidden: false }),
        log: { op: 'category-add', name: args[0], group: g.name },
      });
    },
  },
  rename: {
    usage: 'categories rename "Old" "New" [--apply]',
    async run(api, cfg, args, flags) {
      need(args, 2, this.usage);
      const c = (await lookups(api)).anyCategory(args[0]);
      await previewOrApply(api, cfg, flags, {
        title: `Rename category "${c.name}" → "${args[1]}"`,
        apply: () => api.updateCategory(c.id, { name: args[1] }),
        log: { op: 'category-rename', from: c.name, to: args[1] },
      });
    },
  },
  move: {
    usage: 'categories move "Category" --group "Group" [--apply]',
    async run(api, cfg, args, flags) {
      need(args, 1, this.usage);
      const lk = await lookups(api);
      const c = lk.anyCategory(args[0]);
      const g = lk.group(flags.group ?? '');
      await previewOrApply(api, cfg, flags, {
        title: `Move "${c.name}" from ${c.groupName} → ${g.name}`,
        apply: () => api.updateCategory(c.id, { group_id: g.id }),
        log: { op: 'category-move', category: c.name, from: c.groupName, to: g.name },
      });
    },
  },
  hide: {
    usage: 'categories hide "Category" [--apply]   Hide instead of deleting; history stays intact',
    run: (api, cfg, args, flags) => setHidden(api, cfg, args, flags, true),
  },
  unhide: {
    usage: 'categories unhide "Category" [--apply]',
    run: (api, cfg, args, flags) => setHidden(api, cfg, args, flags, false),
  },
  'group-add': {
    usage: 'categories group-add "Name" [--apply]',
    async run(api, cfg, args, flags) {
      need(args, 1, this.usage);
      await previewOrApply(api, cfg, flags, {
        title: `New category group "${args[0]}"`,
        apply: () => api.createCategoryGroup({ name: args[0], is_income: false, hidden: false }),
        log: { op: 'group-add', name: args[0] },
      });
    },
  },
  'group-rename': {
    usage: 'categories group-rename "Old" "New" [--apply]',
    async run(api, cfg, args, flags) {
      need(args, 2, this.usage);
      const g = (await lookups(api)).group(args[0]);
      await previewOrApply(api, cfg, flags, {
        title: `Rename group "${g.name}" → "${args[1]}"`,
        apply: () => api.updateCategoryGroup(g.id, { name: args[1] }),
        log: { op: 'group-rename', from: g.name, to: args[1] },
      });
    },
  },
};

async function setHidden(api, cfg, args, flags, hidden) {
  need(args, 1, `categories ${hidden ? 'hide' : 'unhide'} "Category"`);
  const c = (await lookups(api)).anyCategory(args[0]);
  await previewOrApply(api, cfg, flags, {
    title: `${hidden ? 'Hide' : 'Unhide'} category "${c.name}"`,
    apply: () => api.updateCategory(c.id, { hidden }),
    log: { op: hidden ? 'category-hide' : 'category-unhide', category: c.name },
  });
}
