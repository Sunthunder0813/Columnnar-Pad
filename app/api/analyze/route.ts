import { NextResponse } from 'next/server';

const SYSTEM = `You are an accounting tutor. Analyze one transaction under Assets = Liabilities + Equity.
Return ONLY JSON, no markdown: {"entries":[{"account":string,"type":"asset"|"liability"|"equity","amount":number}],"explanation":string}
amount is the SIGNED change to that account's balance (positive increases the account, negative decreases it).
Expenses reduce equity (e.g. account "Rent Expense", type equity, negative amount); revenue increases equity.
Reuse existing account names when they fit. Entries MUST satisfy: sum(asset) = sum(liability) + sum(equity).
Explanation: 1-2 plain sentences naming the debit/credit logic.`;

export async function POST(req: Request) {
  const { description, columns } = await req.json();
  const key = process.env.GROQ_API_KEY;
  if (!key || key === 'your_groq_key_here') return NextResponse.json({ error: 'Add GROQ_API_KEY to .env.local and restart.' }, { status: 500 });
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Existing accounts: ${JSON.stringify(columns)}\nTransaction: ${description}` },
      ],
    }),
  });
  const j = await r.json();
  if (!r.ok) return NextResponse.json({ error: j.error?.message || 'API error' }, { status: 500 });
  try {
    const p = JSON.parse(j.choices[0].message.content);
    const s = (t: string) => p.entries.filter((e: any) => e.type === t).reduce((a: number, e: any) => a + Number(e.amount), 0);
    p.balanced = Math.abs(s('asset') - s('liability') - s('equity')) < 0.005;
    return NextResponse.json(p);
  } catch { return NextResponse.json({ error: 'Could not parse AI response. Try rewording.' }, { status: 500 }); }
}