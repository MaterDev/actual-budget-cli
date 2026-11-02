import { money, toCents } from './format.mjs';

const ID_FIELDS = new Set(['payee', 'account', 'category', 'category_group']);
const OPS = ['is', 'isNot', 'contains', 'doesNotContain', 'oneOf', 'notOneOf', 'matches', 'gt', 'gte', 'lt', 'lte', 'isapprox', 'isbetween', 'onBudget', 'offBudget'];
const FIELDS = ['payee', 'imported_payee', 'notes', 'amount', 'account', 'category', 'category_group', 'date', 'cleared', 'transfer'];
// Older rules store the database names for these two fields.
const ALIAS = { description: 'payee', imported_description: 'imported_payee' };

const resolverFor = (lk, field) => ({ payee: lk.payee, account: lk.account, category: lk.anyCategory, category_group: lk.group })[field];

function typed(lk, field, op, raw) {
  if (field === 'amount') {
    if (op === 'isbetween') {
      const [a, b] = raw.split('..').map(toCents);
      return { value: { num1: a, num2: b }, type: 'number' };
    }
    return { value: toCents(raw), type: 'number' };
  }
  if (field === 'date') return { value: raw, type: 'date' };
  if (field === 'cleared' || field === 'transfer') return { value: raw === 'true', type: 'boolean' };
  if (ID_FIELDS.has(field) && ['is', 'isNot'].includes(op)) return { value: resolverFor(lk, field)(raw).id, type: 'id' };
  if (ID_FIELDS.has(field) && ['oneOf', 'notOneOf'].includes(op)) return { value: raw.split('|').map((n) => resolverFor(lk, field)(n.trim()).id), type: 'id' };
  return { value: raw, type: 'string' };
}

// "payee contains Shell" / "amount lt -100" / "category oneOf Gym|Pets"
export function parseCondition(lk, text) {
  const m = text.match(/^\s*(\S+)\s+(\S+)\s*(.*)$/s);
  if (!m) throw new Error(`Condition must be "field op value", got: ${text}`);
  const [, field, op, raw] = m;
  if (!FIELDS.includes(field)) throw new Error(`Unknown condition field "${field}". Fields: ${FIELDS.join(', ')}`);
  if (!OPS.includes(op)) throw new Error(`Unknown operator "${op}". Operators: ${OPS.join(', ')}`);
  return { field, op, ...typed(lk, field, op, raw.trim()) };
}

// "category = Car Expenses" / "notes = text" / "append-notes text" / "prepend-notes text"
export function parseAction(lk, text) {
  const note = text.match(/^\s*(append-notes|prepend-notes)\s+(.*)$/s);
  if (note) return { op: note[1], value: note[2] };
  const m = text.match(/^\s*(\S+)\s*=\s*(.*)$/s);
  if (!m) throw new Error(`Action must be "field = value" or "append-notes text", got: ${text}`);
  const [, field, raw] = m;
  const value = raw.trim();
  if (ID_FIELDS.has(field)) return { op: 'set', field, value: resolverFor(lk, field)(value).id, type: 'id' };
  if (field === 'amount') return { op: 'set', field, value: toCents(value), type: 'number' };
  if (field === 'cleared') return { op: 'set', field, value: value === 'true', type: 'boolean' };
  if (field === 'date') return { op: 'set', field, value, type: 'date' };
  return { op: 'set', field, value, type: 'string' };
}

function showValue(lk, field, value) {
  const names = { payee: lk.names.payee, account: lk.names.account, category: lk.names.category, category_group: lk.names.group }[field];
  if (Array.isArray(value)) return value.map((v) => showValue(lk, field, v)).join(' | ');
  if (value && typeof value === 'object' && 'num1' in value) return `${money(value.num1)}..${money(value.num2)}`;
  if (field === 'amount' && typeof value === 'number') return money(value);
  if (names?.has(value)) return names.get(value);
  return JSON.stringify(value);
}

export function describe(lk, rule) {
  const conds = rule.conditions.map((c) => {
    const field = ALIAS[c.field] ?? c.field;
    return `${field} ${c.op} ${showValue(lk, field, c.value)}`;
  });
  const acts = rule.actions.map((a) => {
    if (a.op === 'set') return `${ALIAS[a.field] ?? a.field} = ${showValue(lk, ALIAS[a.field] ?? a.field, a.value)}`;
    if (a.op === 'link-schedule') return 'link to schedule';
    return `${a.op} ${a.value ?? ''}`.trim();
  });
  const stage = rule.stage ? `[${rule.stage}] ` : '';
  return `${stage}if ${conds.join(rule.conditionsOp === 'or' ? ' OR ' : ' AND ')}  →  ${acts.join('; ')}`;
}

const lower = (v) => String(v ?? '').toLowerCase();

// An approximation of Actual's rule engine for the common operators, used only to
// preview which existing transactions a rule would match. Actual's own engine
// decides what happens on import.
function matchOne(t, c, onBudget) {
  const field = ALIAS[c.field] ?? c.field;
  const actual = {
    payee: field === 'payee' ? (c.type === 'id' ? t.payeeId : t.payee) : null,
    imported_payee: t.importedPayee,
    notes: t.notes,
    amount: t.amount,
    account: c.type === 'id' ? t.accountId : t.account,
    category: c.type === 'id' ? t.categoryId : t.category,
    date: t.date,
    transfer: t.isTransfer,
  }[field];
  const v = c.value;
  switch (c.op) {
    case 'is': return c.type === 'id' || typeof v !== 'string' ? actual === v : lower(actual) === lower(v);
    case 'isNot': return c.type === 'id' ? actual !== v : lower(actual) !== lower(v);
    case 'contains': return lower(actual).includes(lower(v));
    case 'doesNotContain': return !lower(actual).includes(lower(v));
    case 'oneOf': return v.includes(actual);
    case 'notOneOf': return !v.includes(actual);
    case 'matches': try { return new RegExp(v, 'i').test(String(actual ?? '')); } catch { return false; }
    case 'gt': return actual > v;
    case 'gte': return actual >= v;
    case 'lt': return actual < v;
    case 'lte': return actual <= v;
    case 'isapprox': return field === 'amount' ? Math.abs(actual - v) <= Math.abs(v) * 0.075 : actual === v;
    case 'isbetween': return actual >= Math.min(v.num1, v.num2) && actual <= Math.max(v.num1, v.num2);
    case 'onBudget': return onBudget.has(t.accountId);
    case 'offBudget': return !onBudget.has(t.accountId);
    default: return false;
  }
}

export function matches(rule, txns, lk) {
  const onBudget = new Set(lk.accounts.filter((a) => !a.offbudget).map((a) => a.id));
  return txns.filter((t) => {
    const results = rule.conditions.map((c) => matchOne(t, c, onBudget));
    return rule.conditionsOp === 'or' ? results.some(Boolean) : results.every(Boolean);
  });
}

export function effect(lk, rule, t) {
  return rule.actions
    .filter((a) => a.op === 'set')
    .map((a) => {
      const field = ALIAS[a.field] ?? a.field;
      const now = { category: t.category, payee: t.payee, notes: t.notes, account: t.account }[field] ?? '';
      const next = showValue(lk, field, a.value).replace(/^"|"$/g, '');
      return now === next ? `${field}: ${now} (already)` : `${field}: ${now} → ${next}`;
    })
    .join('; ');
}
