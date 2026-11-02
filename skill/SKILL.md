---
name: actual-budget
description: Read and change an Actual Budget through actual-budget-cli — budgets, categories, accounts, transactions, payees, rules and reports — with a dry-run preview before every change. Use for budget reviews, moving budgeted money, account changes, recategorizing, writing or testing rules, and spending, cashflow, overspend, trend or net-worth reports. Never write Actual's database file directly.
---

# Actual Budget

Run the CLI (adjust the path to your clone, or use `actual-budget` if it is linked):

```bash
node ~/path/to/actual-budget-cli/bin/actual-budget.mjs <area> <action> [args] [--flags]
node ~/path/to/actual-budget-cli/bin/actual-budget.mjs          # every command
node ~/path/to/actual-budget-cli/bin/actual-budget.mjs status   # versions; writes allowed?
```

Areas: `budget`, `categories`, `accounts`, `txns`, `payees`, `rules`, `reports`. The README in
the repository documents every command.

## Changing anything

1. Run the command **without** `--apply`. It prints before → after and writes nothing.
2. Show the user that preview and get a clear yes for those exact changes.
3. Re-run the same command with `--apply`. The tool version-checks, backs the budget up, makes
   the change and logs it.

To try a change without touching the real budget, set `ACTUAL_BUDGET_CLI_SANDBOX` to a copy of
the data directory (see the README).

## Rules for the assistant

- Never ask for the server password in chat. It comes from the macOS Keychain or
  `ACTUAL_PASSWORD`, which the user sets up.
- If a command reports `too-many-requests`, stop and wait rather than retrying.
- If `status` says the versions differ, tell the user to re-pin `@actual-app/api`; do not write.
- Budgeting help only: no investment advice.
