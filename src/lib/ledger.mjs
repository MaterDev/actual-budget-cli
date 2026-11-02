// Flattens transactions to their leaves (split pieces replace their parent) and
// marks transfers, so reports can count spending without double counting.
export async function leaves(api, lk, from, to, { accounts } = {}) {
  const pool = accounts ?? lk.accounts.filter((a) => !a.offbudget && !a.closed);
  const onBudget = new Set(lk.accounts.filter((a) => !a.offbudget).map((a) => a.id));
  const out = [];
  for (const a of pool) {
    for (const t of await api.getTransactions(a.id, from, to)) {
      const parts = t.subtransactions?.length ? t.subtransactions : [t];
      for (const p of parts) {
        const transferAcct = p.transfer_id ? lk.payees.find((x) => x.id === (p.payee ?? t.payee))?.transfer_acct : null;
        out.push({
          id: p.id,
          date: t.date,
          month: t.date.slice(0, 7),
          account: a.name,
          accountId: a.id,
          payee: lk.names.payee.get(p.payee ?? t.payee) ?? '',
          categoryId: p.category ?? null,
          category: lk.names.category.get(p.category) ?? (p.transfer_id ? '(transfer)' : '(none)'),
          amount: p.amount,
          notes: p.notes ?? t.notes ?? '',
          payeeId: p.payee ?? t.payee ?? null,
          importedPayee: t.imported_payee ?? '',
          isTransfer: Boolean(p.transfer_id),
          internalTransfer: Boolean(p.transfer_id) && onBudget.has(a.id) && transferAcct != null && onBudget.has(transferAcct),
          isChild: Boolean(p.is_child),
          isParent: Boolean(t.subtransactions?.length) && p === t,
          transferId: p.transfer_id ?? null,
        });
      }
    }
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

export function monthsBetween(from, to) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export const monthEnd = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
