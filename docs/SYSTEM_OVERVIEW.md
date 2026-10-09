# Accounting Pad - System Overview

## Goal
Web app to practice accounting on a columnar (analysis) pad and check your work. Session-only: no database, state lives in React memory and is lost on refresh/close.

## Stack
Next.js 14 (App Router) + TypeScript + Tailwind. AI via Anthropic Messages API, called server-side from a route handler (key in `.env.local`). No other dependencies.

## User flow
1. Setup screen: pick pad size (8/12/14/16/18/22/24 amount columns).
2. Pad screen: name each column and set its type (Asset / Liability / Equity); edit dates and cells.
3. Record transaction: type plain text -> `/api/analyze` returns signed entries + explanation -> user previews -> "Post to pad" adds a row. Unknown accounts auto-fill the next unnamed column.
4. Checker: per-row check (asset change = liability + equity change), column totals, and global banner for Assets = Liabilities + Equity.

## Data model (`lib/types.ts`)
- `Pad { size, cols: Col[], rows: Row[] }`, `Col { name, type }`, `Row { id, date, desc, vals: number[] }` (vals aligned to cols).
- Amounts are SIGNED CHANGES: + increases the account, - decreases it. Expenses are equity columns with negative amounts; revenue is equity positive.
- Balance rule: sum(asset) = sum(liability) + sum(equity), per row and overall.

## API
`POST /api/analyze` body `{ description, columns:[{name,type}] }` -> `{ entries:[{account,type,amount}], explanation, balanced }` or `{ error }`.

## Folder structure
```
accounting-pad/
  .env.local                  ANTHROPIC_API_KEY, ANTHROPIC_MODEL
  app/
    layout.tsx  globals.css   shell + paper-green styling
    page.tsx                  Setup screen + main screen
    api/analyze/route.ts      AI transaction analyzer (server only)
  components/
    PadView.tsx               columnar table, editable cells, totals, checker
    TxForm.tsx                transaction input, AI preview, post
  lib/
    types.ts                  shared types
    store.tsx                 React context + reducer (all pad logic, auto-posting)
  docs/SYSTEM_OVERVIEW.md
```

## Ideas for next steps
- Practice mode: AI generates a transaction, user fills the row, AI grades it.
- "Explain my error" button on unbalanced rows (new `/api/check` route).
- Optional sessionStorage persistence; export pad to CSV/PDF; print-friendly view.
- Support more pad sizes or custom size; split page into Journal / Ledger views.