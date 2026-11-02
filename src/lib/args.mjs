// Flags that never take a value; every other --flag takes the next token.
const BOOLEAN = new Set(['apply', 'json', 'offbudget', 'onbudget', 'any', 'all', 'closed', 'hidden']);

// `--key=value` or `--key value`; a repeated flag collects into an array.
export function parse(argv) {
  const args = [];
  const flags = {};
  const put = (k, v) => {
    if (k in flags) flags[k] = [].concat(flags[k], v);
    else flags[k] = v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { args.push(a); continue; }
    const [key, value] = a.slice(2).split(/=(.*)/s);
    if (value !== undefined) put(key, value);
    else if (BOOLEAN.has(key) || argv[i + 1] === undefined || argv[i + 1].startsWith('--')) put(key, true);
    else put(key, argv[++i]);
  }
  return { args, flags };
}

export const list = (v) => (v === undefined ? [] : [].concat(v));

export function need(args, n, usage) {
  if (args.length < n) throw new Error(`Usage: ${usage}`);
  return args;
}
