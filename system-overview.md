# Accounting Pad - System Overview

Handoff document. Describes the current state of the project so another AI or developer can continue without re-reading the whole chat.

## 1. Purpose

A website for practicing accounting on a **columnar (analysis) pad**, with an automatic checker.

- User picks a pad size (8, 12, 14, 16, 18, 22 or 24 amount columns).
- User names columns and marks each as Asset, Liability or Equity.
- User types a transaction in plain words. AI works out the entries and the app posts them into the right columns automatically.
- A checker verifies that every row and the whole pad satisfy **Assets = Liabilities + Equity**.
- **Session only. No database.** State lives in React memory and disappears on refresh or tab close.

## 2. Stack

| Item | Choice |
|---|---|
| Framework | Next.js **14** (App Router), pinned with `create-next-app@14` |
| Language | TypeScript |
| Styling | Tailwind CSS (v3, from create-next-app 14) plus a few global CSS rules |
| Fonts | `next/font/google`: Fraunces (700), IBM Plex Mono (400, 500), Kalam (400) |
| State | React `useReducer` + Context (`lib/store.tsx`) |
| AI | **Groq** chat completions (OpenAI-compatible), called server-side only |
| Extra dependencies | None |

Environment (`.env.local`, never commit):

```
GROQ_API_KEY=...
GROQ_MODEL=openai/gpt-oss-120b
```

Groq retires models. `llama-3.3-70b-versatile` returned "model does not exist". If the model errors, list current ones: `curl.exe https://api.groq.com/openai/v1/models -H "Authorization: Bearer KEY"`. The route reads the model from `GROQ_MODEL`, so no code change is needed. Restart `npm run dev` after editing `.env.local`.

Run: `npm install` then `npm run dev`, open `http://localhost:3000`. (Note: the command is `npm run dev`, not `npm dev run`.)

## 3. Folder structure

```
accounting-pad/
  .env.local                   GROQ_API_KEY, GROQ_MODEL
  app/
    layout.tsx                 loads 3 Google fonts as CSS variables
    globals.css                base styles, .hand/.serif helpers, .rise animation
    page.tsx                   Setup screen + main screen (steps, hint, PadView, TxForm)
    api/analyze/route.ts       POST: AI transaction analyzer (server only)
  components/
    PadView.tsx                columnar table, resizable columns, checker, totals
    TxForm.tsx                 docked transaction box, AI preview, Post/Discard
  lib/
    types.ts                   shared types
    store.tsx                  context + reducer, auto-posting logic
  docs/SYSTEM_OVERVIEW.md      this file
```

## 4. Data model (`lib/types.ts`)

```ts
type AcctType = 'asset' | 'liability' | 'equity';
type Col = { name: string; type: AcctType };
type Row = { id: string; date: string; desc: string; vals: number[] }; // vals aligned to cols
type Pad = { size: number; cols: Col[]; rows: Row[] };
type Entry = { account: string; type: AcctType; amount: number };      // signed change
```

**Sign convention (important):** every amount is a **signed change to that account's balance**. Positive increases the account, negative decreases it.

- Expenses are Equity columns with negative amounts (e.g. "Rent Expense", type equity, -1200).
- Revenue is an Equity column with positive amounts.
- Balance rule, per row and overall: `sum(asset) = sum(liability) + sum(equity)`.

## 5. State (`lib/store.tsx`)

`PadProvider` and `usePad()` expose `{ pad, d }`. `pad` is `Pad | null` (null = setup screen).

Actions:

| Action | Effect |
|---|---|
| `{t:'init', size, preset?}` | Create empty pad. `preset` pre-fills Cash, Equipment, Supplies (asset), Accounts Payable (liability), Owner's Capital (equity) |
| `{t:'reset'}` | Back to setup (pad = null) |
| `{t:'blank'}` | Append an empty row dated today |
| `{t:'col', i, p}` | Patch column i (name and/or type) |
| `{t:'cell', id, i, v}` | Set one amount |
| `{t:'text', id, k:'date'\|'desc', v}` | Edit date or description |
| `{t:'del', id}` | Remove a row |
| `{t:'clear'}` | Remove all rows, keep columns |
| `{t:'post', date, desc, entries}` | Auto-post AI entries as a new row (see below) |

**Auto-posting:** for each entry, find the column whose name matches `entry.account` (case-insensitive, trimmed). If none matches, use the first column with an empty name and name it from the entry (name and type). If the pad has no free column, the entry is silently dropped, so the row will show as unbalanced in the checker.

## 6. AI route (`app/api/analyze/route.ts`)

`POST /api/analyze`

Request: `{ description: string, columns: {name, type}[] }` (only named columns are sent).

Response: `{ entries: Entry[], explanation: string, balanced: boolean }` or `{ error: string }` with HTTP 500.

Details:
- Calls `https://api.groq.com/openai/v1/chat/completions` with `Authorization: Bearer GROQ_API_KEY`, `temperature: 0`, `response_format: { type: 'json_object' }`.
- System prompt: accounting tutor, Assets = Liabilities + Equity, return only JSON, signed amounts, expenses reduce equity, reuse existing account names, entries must balance, 1-2 sentence explanation.
- Server recomputes `balanced` (sum asset minus liability minus equity within 0.005). The client disables **Post to pad** when `balanced` is false.
- Parsing failures return a friendly error.

## 7. UI behavior

**Setup screen (`page.tsx`)**: size cards (each shows a strip of ruled columns), checkbox "Start with sample accounts" (on by default).

**Main screen**
- Header with title, pad size, **Start over**.
- Progress pills: Name your accounts, Record a transaction, Check it balances, plus a hint line that changes with state.
- `PadView`, then `TxForm` (docked, sticky at the bottom of the viewport).

**PadView**
- Chips: Assets, Liabilities, Equity totals and a Balanced / Off by X badge (transitions between green and red).
- Table with `table-layout: fixed` and explicit widths:
  - Sticky left: margin column (row number + red x delete), Date, Description (double rule after Description).
  - Account columns: header has column number, handwritten name input, type select, color strip (green asset, amber liability, blue equity).
  - Sticky right: **Check** column (check mark when the row balances, else the difference in red).
  - Footer: totals per column.
- **Column resizing (Excel-style):** drag the right edge of any header (`Grip` component, pointer events). **Double-click or double-tap** (two pointerdowns within 350 ms) auto-fits to content using canvas `measureText` (`fit()`), +40 px padding, minimum 56 px. Date auto-fits to 150 px. Widths are component state (`w`), lost on refresh. **Reset widths** button clears them.
- Cells are editable (number inputs). Negative values are red.
- **Clear all rows** (confirm) appears when rows exist.

**TxForm**
- Date, free-text description (Enter submits), **Analyze**, **Add blank row** (manual practice), example chips.
- AI result appears as a bubble above the input: explanation, entries with colored type dots, **Post to pad** (disabled if unbalanced) and **Discard**.

## 8. Design system (current)

Look: ruled blue-gray analysis paper, based on a photo of a real columnar notebook the user supplied.

| Token | Value |
|---|---|
| Page background | `#dfe5d8` |
| Paper | `#f3f4ef`, margin column `#e9ece7` |
| Rules | `#bcc7cd`, double rule `#6f7f89` |
| Pad border | `#7d8d96` |
| Primary green | `#2f6b3a` (`green-800`) |
| Asset / Liability / Equity strips | `#5f9e63` / `#d9a441` / `#5b8fc7` |
| Asset / Liability / Equity chips | `#d9ecd2` / `#f6e7c8` / `#d6e4f3` |
| Ink (amounts, descriptions) | `#1f3a8a` (ballpoint blue); negatives `#b3261e` |
| Fonts | `.serif` Fraunces (titles), `.hand` Kalam (headings, descriptions), IBM Plex Mono (everything else) |
| Motion | `.rise` entrance animation, button press scale, color transitions; all disabled under `prefers-reduced-motion` |

A Claude Design canvas mockup of a **two-page notebook spread** (left page: Date, Payee, Ref, first accounts; right page: more accounts and check column) exists at https://claude.ai/artifact/B9od9vVzjPr7uuDKS4JDiQ. It is a reference only and is **not implemented** in the app.

## 9. Test data

Use an 8-column pad with sample accounts on, then post these in order:

1. Owner invested 10000 cash
2. Bought equipment 4000 paid in cash
3. Bought supplies 1500 on credit
4. Paid 500 of accounts payable in cash
5. Owner invested equipment worth 2000

Expected totals: Cash 5,500; Equipment 6,000; Supplies 1,500; Accounts Payable 1,000; Owner's Capital 12,000. Assets 13,000 = Liabilities 1,000 + Equity 12,000, Balanced.

Checker test: add a blank row, type 300 in Cash only. The row turns red and the badge shows "Off by 300.00". Add 300 to Owner's Capital and it recovers.

## 10. Known limitations

- Pad full: auto-posting drops entries that have no free column (checker flags it).
- Account matching is by exact name (case-insensitive). "Owner Capital" and "Owner's Capital" are different accounts.
- Small models can pick wrong signs or types on tricky transactions. The balance check catches imbalance but not wrong-but-balanced entries (for example wrong account type).
- Widths and pad state are not persisted.
- No tests.
- Floating-point amounts are compared with a 0.005 tolerance.

## 11. Suggested next steps

1. **Practice mode:** AI generates a transaction, the user fills the row by hand, AI grades it and explains mistakes (new `/api/grade` route).
2. **Explain my error** button on unbalanced rows (new `/api/check` route).
3. Retry on imbalance: send the AI its own wrong answer and ask for a fix.
4. **Journal tab:** show each transaction as Debit and Credit lines next to the pad.
5. Optional two-page spread view and 36-row paper (see the mockup), plus hiding empty columns with a "+" to add one.
6. Export to CSV and a print-friendly view.
7. Optional `sessionStorage` persistence of pad and widths.

## 12. Notes for whoever continues

- The user is on **Windows with PowerShell**, project at `Desktop\Projects\accounting-pad`. They prefer **exact find/replace blocks or full-file replacements** they paste into VS Code, not scripts.
- If you generate `.ps1` files, keep them **ASCII-only**. Windows PowerShell 5.1 misreads UTF-8 without a BOM, which previously turned check marks into `âœ"`. Source files use `\u2714` escapes for check marks for the same reason.
- When adding store actions, update both the `Action` union and the `reduce` switch in `lib/store.tsx` or TypeScript will error.
- Keep the **no-database, session-only** constraint unless the user changes it.
- Keep amounts as **signed changes**; the checker, AI prompt and posting logic all depend on it.
- Do not run `npm audit fix --force` (can break the Next 14 setup).