const plain = (s) => String(s).replace(/[^\p{L}\p{N} &+.-]/gu, '').trim().toLowerCase();

// Finds one item by exact name, then a unique emoji-insensitive match, then a
// unique substring match. Ambiguity is an error that lists the candidates.
export function byName(items, name, kind) {
  const exact = items.filter((x) => x.name === name);
  if (exact.length === 1) return exact[0];
  const want = plain(name);
  const same = items.filter((x) => plain(x.name) === want);
  if (same.length === 1) return same[0];
  const partial = items.filter((x) => plain(x.name).includes(want));
  if (partial.length === 1) return partial[0];
  const shown = (partial.length ? partial : items).slice(0, 25).map((x) => x.name).join(', ');
  throw new Error(`${kind} "${name}" matches ${partial.length || 'none'} of them${partial.length ? '' : ' by name'}. Options: ${shown}`);
}

export async function lookups(api) {
  const [accounts, groups, payees] = await Promise.all([api.getAccounts(), api.getCategoryGroups(), api.getPayees()]);
  const categories = groups.flatMap((g) => (g.categories ?? []).map((c) => ({ ...c, groupName: g.name })));
  return {
    accounts,
    groups,
    categories,
    payees,
    account: (n) => byName(accounts, n, 'account'),
    category: (n) => byName(categories.filter((c) => !c.hidden), n, 'category'),
    anyCategory: (n) => byName(categories, n, 'category'),
    group: (n) => byName(groups, n, 'group'),
    payee: (n) => byName(payees.filter((p) => !p.transfer_acct), n, 'payee'),
    names: {
      account: new Map(accounts.map((a) => [a.id, a.name])),
      category: new Map(categories.map((c) => [c.id, c.name])),
      group: new Map(groups.map((g) => [g.id, g.name])),
      payee: new Map(payees.map((p) => [p.id, p.name])),
    },
  };
}
