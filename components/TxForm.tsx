'use client';
import { useState } from 'react';
import { usePad, today } from '@/lib/store';
import { Entry } from '@/lib/types';

type Res = { entries: Entry[]; explanation: string; balanced: boolean };
const f = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DOT = { asset: 'bg-[#7fa27a]', liability: 'bg-[#e0a64a]', equity: 'bg-[#7a9cc0]' };
const SHOW_EXAMPLES = false; // true = show the "Try" example chips under the input
const EXAMPLES = ['Owner invested 10000 cash', 'Bought supplies for 800 cash', 'Bought equipment 5000 on credit', 'Paid rent 1200 cash', 'Earned 3000 service revenue in cash'];

export default function TxForm() {
  const { pad, d } = usePad();
  const [date, setDate] = useState(today());
  const [desc, setDesc] = useState('');
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const lastDate = pad && pad.rows.length ? pad.rows[pad.rows.length - 1].date : '';

  async function analyze(text: string = desc) {
    if (!text.trim() || busy) return;
    setBusy(true); setErr(''); setRes(null);
    try {
      const r = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: text.trim(), columns: pad!.cols.filter(c => c.name.trim()) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Request failed');
      setRes(j);
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }
  function post() {
    if (!res) return;
    d({ t: 'post', date: lastDate && date < lastDate ? lastDate : date, desc: desc.trim(), entries: res.entries });
    setRes(null); setDesc('');
  }

  return (
    <section className="sticky bottom-3 z-30 space-y-3 rounded-2xl border border-[#cdb98f] bg-[#fffaf1]/95 p-4 shadow-[0_6px_24px_rgba(120,90,50,0.18)] backdrop-blur">
      {err && <p className="rounded-xl bg-[#f6dcd3] p-3 text-sm text-[#b3402f]">{err}</p>}
      {res && (
        <div className="rise flex flex-wrap items-center gap-3 rounded-xl border border-[#e6dac4] bg-[#f4ecd8] px-4 py-3">
          <div className="min-w-[14rem] flex-1">
            <p className="hand text-xl leading-snug text-[#3b2f26]">{res.explanation}</p>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[15px]">
              {res.entries.map((e, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${DOT[e.type]}`} />{e.account}
                  <span className={`num ${e.amount < 0 ? 'text-[#b3402f]' : 'text-[#2f4590]'}`}>{e.amount > 0 ? '+' : ''}{f(e.amount)}</span>
                </li>
              ))}
            </ul>
            {!res.balanced && <p className="mt-2 text-sm text-[#b3402f]">This entry does not balance. Reword the transaction and analyze again.</p>}
          </div>
          <button onClick={post} disabled={!res.balanced} className="h-11 rounded-xl bg-[#3f6b45] px-6 text-[15px] font-semibold text-white hover:bg-[#345a3a] disabled:opacity-40">Post to pad</button>
          <button onClick={() => setRes(null)} className="h-11 rounded-xl border border-[#c2602f] px-4 text-[15px] text-[#a94f23] hover:bg-[#fffaf1]">Discard</button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <input type="date" value={date} min={lastDate || undefined}
          onChange={e => { const v = e.target.value; if (v && lastDate && v < lastDate) return; setDate(v); }}
          className="h-11 rounded-xl border border-[#d9c9a8] bg-white px-3 text-[15px]" />
        <input data-native-undo="true" value={desc} onChange={e => setDesc(e.target.value.replace(/^\s+/, ''))} onKeyDown={e => e.key === 'Enter' && analyze()}
          placeholder="What happened? e.g. Bought supplies for 800 paid in cash"
          className="h-11 min-w-[16rem] flex-1 rounded-xl border border-[#d9c9a8] bg-white px-3 text-base" />
        <button onClick={() => analyze()} disabled={busy || !desc.trim()}
          className={`h-11 rounded-xl bg-[#c2602f] px-6 text-[15px] font-semibold text-white shadow-sm hover:bg-[#a94f23] disabled:opacity-40 ${busy ? 'animate-pulse' : ''}`}>{busy ? 'Analyzing...' : 'Analyze'}</button>
        <button onClick={() => d({ t: 'blank' })} className="h-11 rounded-xl border border-[#c2602f] px-4 text-[15px] text-[#a94f23] hover:bg-[#fffaf1]">Add blank row</button>
      </div>
      <div className={`${SHOW_EXAMPLES ? 'flex' : 'hidden'} flex-wrap items-center gap-2 text-sm text-[#6b5844]`}>
        <span>Try</span>
        {EXAMPLES.map(x => (
          <button key={x} onClick={() => { setDesc(x); analyze(x); }} className="rounded-full border border-[#d9c9a8] bg-white px-3 py-1.5 hover:border-[#c2602f] hover:bg-[#fbeee3]">{x}</button>
        ))}
      </div>
    </section>
  );
}