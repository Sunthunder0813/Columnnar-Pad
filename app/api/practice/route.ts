import { NextResponse } from 'next/server';

type T = 'asset' | 'liability' | 'equity';
type Level = 'easy' | 'normal' | 'hard';
type Col = { name: string; type: T };
type Entry = { account: string; type: T; amount: number };
type Raw = { description: string; gap: number; entries: Entry[]; explanation: string; equation: string };
type Item = { description: string; date: string; entries: Entry[]; explanation: string; equation: string };

const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const TYPES: T[] = ['asset', 'liability', 'equity'];
const nm = (s: string) => s.trim().toLowerCase();

const COUNTS: Record<Level, number> = { easy: 4, normal: 5, hard: 7 };

// What each difficulty may contain. Percentage work grows with the level.
const LEVEL_RULES: Record<Level, string> = {
  easy: `DIFFICULTY: EASY
- Only these kinds of transactions: the owner invests cash, buying an asset for cash, buying an asset on credit, paying part or all of an account payable in cash.
- Every transaction has exactly 2 entries.
- Use 3 or 4 accounts in total.
- Do NOT use percentages. Amounts are round numbers (multiples of 500).`,
  normal: `DIFFICULTY: NORMAL
- Kinds of transactions: the owner invests, buying assets for cash or on credit, paying part of a payable, earning service revenue in cash, paying an expense in cash.
- Use 2 or 3 entries per transaction and 4 to 6 accounts in total.
- Exactly ONE transaction uses a simple percentage that gives a whole number, for example "pays 25% of the 8000 price in cash and the rest on credit" or "pays a 10% commission on 4000 of service revenue".
- All other amounts are round numbers (multiples of 100).`,
  hard: `DIFFICULTY: DIFFICULT
- Kinds of transactions: split payments (part cash, part credit), service revenue on credit (use an Accounts Receivable asset), collecting receivables, expenses on credit, owner withdrawals, paying expenses, partial payments of payables.
- Use 2 to 4 entries per transaction and 5 to 7 accounts in total.
- AT LEAST HALF of the transactions must come from a percentage equation: a down payment of N% of a price, interest or commission of N% of an amount, a discount of N%, or VAT of 12%. The description states the percentage and the base amount, never the result.
- Amounts that come from percentages may have cents, but never more than two decimal places.`,
};

const SYSTEM = `You are an accounting tutor writing a practice worksheet for a beginner.
The student has a columnar pad. Some accounts may already be on the pad, and there may be free columns where you can add new accounts. Write the requested number of short business transactions in plain words, in a realistic order (for example the owner invests first, then purchases, then payments).

Accounts:
- Use the accounts already on the pad whenever they fit. Use their names exactly as given.
- If the pad lacks accounts the transactions need (or has none), add new ones in the "accounts" list, up to the number of free columns. Never repeat an account that is already on the pad in that list.
- Give new accounts standard textbook names (for example Cash, Equipment, Supplies, Accounts Receivable, Accounts Payable, Notes Payable, Owner's Capital, Owner's Withdrawals, Service Revenue, Rent Expense) and the correct type: asset, liability or equity.
- Expenses, revenue and owner withdrawals are recorded in EQUITY accounts (for example Rent Expense is type equity).
- The worksheet needs at least one asset account and at least one liability or equity account.

Transactions:
- Write amounts as plain numbers with no currency symbols.
- Each description must say how it was paid or received (cash or on credit) so there is only one correct answer.
- Every description MUST state its amount in digits, for example "Owner invests 10000 cash in the business". A description with no number is invalid. The first transaction never depends on earlier ones.
- Only when a percentage applies to a balance created by an EARLIER transaction (for example collecting 50% of a receivable), the base amount may be left out, but the description must name that balance and the amount must be stated in the earlier transaction.
- Keep every description under 90 characters so it fits on one pad row.
- Each entry's amount is the SIGNED CHANGE to that account's balance: positive increases it, negative decreases it.
- Use only accounts from the pad or your "accounts" list.
- Every transaction must balance on its own: sum of asset amounts = sum of liability amounts + sum of equity amounts.
- Expenses and owner withdrawals are NEGATIVE amounts on an equity account. Revenue is a POSITIVE amount on an equity account.
- Never let an account go below zero given the earlier transactions in the worksheet (an earlier transaction must provide the cash first).
- Every description must be different. Do not repeat or closely copy anything in the "avoid" list.
- "gap" is the number of days after the PREVIOUS transaction (0 to 10). Use 0 to 2 for the first one. Dates must move forward through the worksheet.
- "explanation" is 1 or 2 sentences saying which accounts change and why.
- "equation" is the worked arithmetic behind the amounts, kept short. When a percentage is used, show it, for example "25% x 8000 = 2000 cash; 8000 - 2000 = 6000 on credit". Otherwise show the balance, for example "Assets +5000 = Equity +5000".

Return ONLY JSON, no other text:
{"accounts": [{"name": string, "type": "asset"|"liability"|"equity"}], "items": [{"description": string, "gap": number, "entries": [{"account": string, "type": "asset"|"liability"|"equity", "amount": number}], "explanation": string, "equation": string}]}`;

function clean(raw: any, allowed: Col[]): Raw[] {
  const out: Raw[] = [];
  const used = new Set<string>();
  if (!Array.isArray(raw)) return out;
  for (const p of raw) {
    if (!p || typeof p.description !== 'string' || !Array.isArray(p.entries)) continue;
    const description = p.description.trim().replace(/\s+/g, ' ');
    if (!description || used.has(description.toLowerCase())) continue;

    // Snap every entry to a real account (exact name and type). Drop the whole item if any entry is bad.
    const entries: Entry[] = [];
    let bad = false;
    for (const e of p.entries) {
      const col = allowed.find(c => nm(c.name) === nm(String(e?.account ?? '')));
      const amount = Math.round(Number(e?.amount) * 100) / 100;
      if (!col || !Number.isFinite(amount) || amount === 0) { bad = true; break; }
      entries.push({ account: col.name, type: col.type, amount });
    }
    if (bad || entries.length < 2) continue;

    // The student must be able to see the amount. Numbers written in the description:
    const nums = (description.match(/\d[\d,]*\.?\d*/g) ?? []).map(s => Number(s.replace(/,/g, '')));
    const hasPct = description.includes('%');
    if (hasPct) {
      // A percentage needs a base amount, unless it refers to an earlier transaction's balance.
      if (!nums.length && out.length === 0) continue;
    } else if (!entries.some(e => nums.some(n => Math.abs(Math.abs(e.amount) - n) < 0.005))) {
      continue; // no amount shown in the text
    }

    const bal = entries.reduce((a, e) => a + (e.type === 'asset' ? 1 : -1) * e.amount, 0);
    if (Math.abs(bal) > 0.005) continue;

    used.add(description.toLowerCase());
    const gap = Math.min(10, Math.max(0, Math.round(Number(p.gap) || 0)));
    out.push({
      description, gap, entries,
      explanation: String(p.explanation ?? '').trim(),
      equation: String(p.equation ?? '').trim(),
    });
  }
  return out;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { columns?: Col[]; free?: number; level?: Level; count?: number; start?: string; avoid?: string[] };
    const columns = (Array.isArray(body.columns) ? body.columns : []).filter(c => c && String(c.name ?? '').trim());
    const free = Math.max(0, Math.min(8, Math.floor(Number(body.free) || 0)));
    if (columns.length + free < 3) {
      return NextResponse.json({ error: 'The pad needs room for at least three accounts.' }, { status: 400 });
    }
    const level: Level = body.level === 'easy' || body.level === 'hard' ? body.level : 'normal';
    const count = Math.min(8, Math.max(3, Number(body.count) || COUNTS[level]));
    const start = body.start && ISO.test(body.start) ? body.start : new Date().toISOString().slice(0, 10);
    const list = columns.map(c => `${c.name} (${c.type})`).join('\n') || '(none)';
    const avoid = (body.avoid ?? []).map(a => `- ${a}`).join('\n') || '(none)';
    const user = `Write ${count} transactions.\n\n${LEVEL_RULES[level]}\n\nAccounts already on the pad:\n${list}\n\nFree columns for new accounts: ${free}\n\navoid:\n${avoid}`;

    let best: { items: Raw[]; add: Col[] } = { items: [], add: [] };
    let lastErr = '';
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.6,
          max_completion_tokens: 8000,                       // room for reasoning AND the answer
          ...(MODEL.includes('gpt-oss') ? { reasoning_effort: 'low' } : {}),
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        lastErr = t.slice(0, 200);
        // Bad or empty JSON from the model, or a temporary server error: try again.
        if (t.includes('json_validate_failed') || r.status >= 500) continue;
        return NextResponse.json({ error: `AI request failed: ${lastErr}` }, { status: 500 });
      }
      const j = await r.json();
      let p: any;
      const text: string = j.choices?.[0]?.message?.content ?? '';
      try { p = JSON.parse(text); } catch {
        // Last resort: pull out the first {...} block.
        const m = text.match(/\{[\s\S]*\}/);
        try { p = m ? JSON.parse(m[0]) : null; } catch { p = null; }
        if (!p) continue;
      }

      // New accounts the AI wants: valid type, not already on the pad, no duplicates, limited to free columns.
      const fresh: Col[] = [];
      for (const a of Array.isArray(p?.accounts) ? p.accounts : []) {
        const name = String(a?.name ?? '').trim();
        const type = String(a?.type ?? '').toLowerCase() as T;
        if (!name || !TYPES.includes(type)) continue;
        if ([...columns, ...fresh].some(c => nm(c.name) === nm(name))) continue;
        if (fresh.length >= free) break;
        fresh.push({ name, type });
      }

      const items = clean(p?.items, [...columns, ...fresh]).slice(0, count);
      // Only add accounts that a valid transaction really uses.
      const usedNames = new Set(items.flatMap(it => it.entries.map(e => nm(e.account))));
      const add = fresh.filter(a => usedNames.has(nm(a.name)));

      if (items.length > best.items.length) best = { items, add };
      if (items.length >= Math.min(3, count)) break;
    }

    if (best.items.length < 2) {
      return NextResponse.json({
        error: lastErr
          ? 'The AI could not produce a valid practice set. Press New set to try again, or pick an easier level.'
          : 'Could not write a good practice set. Try again.',
      }, { status: 500 });
    }

    // Dates move forward from the start date by each transaction's gap.
    let cur = start;
    const items: Item[] = best.items.map(({ gap, ...it }) => {
      cur = addDays(cur, gap);
      return { ...it, date: cur };
    });
    return NextResponse.json({ add: best.add, items });
  } catch {
    return NextResponse.json({ error: 'Something went wrong writing the practice set.' }, { status: 500 });
  }
}