# Accounting Pad - UI update. Run from the accounting-pad folder:
#   powershell -ExecutionPolicy Bypass -File ..\update-ui.ps1
# (ASCII-only on purpose: fixes the garbled check marks.)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path 'app/page.tsx')) { Write-Host 'Run this inside the accounting-pad folder.' -ForegroundColor Red; exit }

function W($path, $content) {
  $full = Join-Path (Get-Location) $path
  New-Item -ItemType Directory -Force -Path (Split-Path $full) | Out-Null
  [IO.File]::WriteAllText($full, $content, (New-Object Text.UTF8Encoding($false)))
}

W 'app/globals.css' @'
@tailwind base;
@tailwind components;
@tailwind utilities;
body { background:#e7ece0; color:#1f2d24; font-family: Georgia, 'Times New Roman', serif; }
input, select, button, textarea { font-family: ui-monospace, Consolas, monospace; }
input:focus, select:focus, button:focus-visible { outline:2px solid #2f6b3a; outline-offset:-2px; }
input[type=number]::-webkit-inner-spin-button { display:none; }
input[type=number] { -moz-appearance:textfield; }
'@

W 'components/PadView.tsx' @'
'use client';
import { usePad } from '@/lib/store';
import { Row, AcctType } from '@/lib/types';

const f = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TINT: Record<AcctType, string> = { asset: 'bg-[#d9ecd2]', liability: 'bg-[#f6e7c8]', equity: 'bg-[#d6e4f3]' };
const line = 'border-b border-r border-[#a9c2ab]';
const PAPER = 'bg-[#f4f8ec]';

export default function PadView() {
  const { pad, d } = usePad();
  if (!pad) return null;
  const colTotal = (i: number) => pad.rows.reduce((a, r) => a + r.vals[i], 0);
  const sum = (t: AcctType) => pad.cols.reduce((a, c, i) => (c.type === t ? a + colTotal(i) : a), 0);
  const A = sum('asset'), L = sum('liability'), E = sum('equity');
  const ok = Math.abs(A - L - E) < 0.005;
  const diff = (r: Row) => pad.cols.reduce((a, c, i) => a + (c.type === 'asset' ? 1 : -1) * r.vals[i], 0);
  const cards: [string, number, AcctType][] = [['Assets', A, 'asset'], ['Liabilities', L, 'liability'], ['Equity', E, 'equity']];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {cards.map(([label, v, t]) => (
          <div key={label} className={`rounded-md p-3 ${TINT[t]}`}>
            <div className="text-sm">{label}</div>
            <div className="font-mono text-2xl">{f(v)}</div>
          </div>
        ))}
        <div className={`rounded-md p-3 text-white ${ok ? 'bg-green-800' : 'bg-red-700'}`}>
          <div className="text-sm">Assets = Liabilities + Equity</div>
          <div className="text-2xl">{ok ? 'Balanced' : `Off by ${f(A - L - E)}`}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border-2 border-[#5f8a63] shadow-sm">
        <table className={`min-w-max border-collapse text-sm ${PAPER}`}>
          <thead>
            <tr>
              <th className={`sticky left-0 z-10 w-36 bg-[#c9dcc0] p-2 text-left ${line}`}>Date</th>
              <th className={`sticky left-36 z-10 w-60 border-r-4 border-double bg-[#c9dcc0] p-2 text-left ${line}`}>Description</th>
              {pad.cols.map((c, i) => (
                <th key={i} className={`w-28 p-1 font-normal ${TINT[c.type]} ${line}`}>
                  <div className="text-xs text-black/50">{i + 1}</div>
                  <input value={c.name} placeholder="Account" onChange={e => d({ t: 'col', i, p: { name: e.target.value } })}
                    className="w-full bg-white/60 px-1 py-1 text-center text-xs font-bold placeholder:font-normal" />
                  <select value={c.type} onChange={e => d({ t: 'col', i, p: { type: e.target.value as AcctType } })}
                    className="mt-1 w-full bg-transparent text-xs">
                    <option value="asset">Asset</option><option value="liability">Liability</option><option value="equity">Equity</option>
                  </select>
                </th>
              ))}
              <th className={`w-24 bg-[#c9dcc0] p-2 ${line}`}>Row check</th>
              <th className="w-8 bg-[#c9dcc0]" />
            </tr>
          </thead>
          <tbody>
            {pad.rows.map(r => {
              const df = diff(r); const rok = Math.abs(df) < 0.005;
              return (
                <tr key={r.id} className="h-9">
                  <td className={`sticky left-0 ${PAPER} ${line}`}><input type="date" value={r.date} onChange={e => d({ t: 'text', id: r.id, k: 'date', v: e.target.value })} className="w-full bg-transparent px-1 text-xs" /></td>
                  <td className={`sticky left-36 border-r-4 border-double ${PAPER} ${line}`}><input value={r.desc} placeholder="Description" onChange={e => d({ t: 'text', id: r.id, k: 'desc', v: e.target.value })} className="w-full bg-transparent px-2" /></td>
                  {r.vals.map((v, i) => (
                    <td key={i} className={line}>
                      <input type="number" step="0.01" value={v || ''} onChange={e => d({ t: 'cell', id: r.id, i, v: parseFloat(e.target.value) || 0 })}
                        className={`w-full bg-transparent px-2 text-right ${v < 0 ? 'text-red-700' : ''}`} />
                    </td>
                  ))}
                  <td className={`${line} px-2 text-center font-mono ${rok ? 'text-green-700' : 'font-bold text-red-700'}`}>{rok ? '\u2714' : f(df)}</td>
                  <td><button onClick={() => d({ t: 'del', id: r.id })} aria-label="Delete row" className="px-2 text-lg text-red-700">&times;</button></td>
                </tr>
              );
            })}
            {pad.rows.length === 0 && (
              <tr><td colSpan={pad.size + 4} className="p-10 text-center italic text-[#4a6b4f]">
                Empty pad. Record a transaction above and the columns will fill themselves in.
              </td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="h-10 font-mono font-bold">
              <td className={`sticky left-0 bg-[#c9dcc0] ${line}`} />
              <td className={`sticky left-36 border-r-4 border-double bg-[#c9dcc0] px-2 font-serif ${line}`}>Total</td>
              {pad.cols.map((_, i) => <td key={i} className={`px-2 text-right ${TINT[pad.cols[i].type]} ${line}`}>{f(colTotal(i))}</td>)}
              <td colSpan={2} className="bg-[#c9dcc0]" />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-sm italic text-[#4a6b4f]">Every cell is editable. A row shows a check mark when its asset changes equal its liability plus equity changes. Negative numbers are red.</p>
    </div>
  );
}
'@

W 'components/TxForm.tsx' @'
'use client';
import { useState } from 'react';
import { usePad, today } from '@/lib/store';
import { Entry } from '@/lib/types';

type Res = { entries: Entry[]; explanation: string; balanced: boolean };
const f = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TINT = { asset: 'bg-[#d9ecd2]', liability: 'bg-[#f6e7c8]', equity: 'bg-[#d6e4f3]' };
const EXAMPLES = ['Owner invested 10000 cash', 'Bought supplies for 800 cash', 'Bought equipment 5000 on credit', 'Paid rent 1200 cash', 'Earned 3000 service revenue in cash'];

export default function TxForm() {
  const { pad, d } = usePad();
  const [date, setDate] = useState(today());
  const [desc, setDesc] = useState('');
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function analyze() {
    setBusy(true); setErr(''); setRes(null);
    try {
      const r = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc, columns: pad!.cols.filter(c => c.name.trim()) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Request failed');
      setRes(j);
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }
  function post() {
    if (!res) return;
    d({ t: 'post', date, desc, entries: res.entries });
    setRes(null); setDesc('');
  }

  return (
    <section className="rounded-md border border-[#a9c2ab] bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-bold">Record a transaction</h2>
      <div className="flex flex-wrap gap-2">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded border border-[#a9c2ab] p-2" />
        <input value={desc} onChange={e => setDesc(e.target.value)} onKeyDown={e => e.key === 'Enter' && desc.trim() && analyze()}
          placeholder="Describe it in plain words, e.g. Bought supplies for 800 paid in cash"
          className="min-w-[16rem] flex-1 rounded border border-[#a9c2ab] p-2" />
        <button onClick={analyze} disabled={busy || !desc.trim()} className="rounded bg-green-800 px-5 py-2 text-white disabled:opacity-40">
          {busy ? 'Analyzing...' : 'Analyze'}
        </button>
        <button onClick={() => d({ t: 'blank' })} className="rounded border border-green-800 px-4 py-2 text-green-900">Add blank row</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <span className="py-1 text-[#4a6b4f]">Try:</span>
        {EXAMPLES.map(x => <button key={x} onClick={() => setDesc(x)} className="rounded-full border border-[#a9c2ab] px-3 py-1 hover:bg-[#eef5e6]">{x}</button>)}
      </div>
      {err && <p className="mt-3 rounded bg-red-50 p-2 text-red-700">{err}</p>}
      {res && (
        <div className="mt-4 rounded-md border border-[#a9c2ab] bg-[#f4f8ec] p-4">
          <p className="mb-3 italic">{res.explanation}</p>
          <table className="w-full max-w-xl text-sm">
            <tbody>
              {res.entries.map((e, i) => (
                <tr key={i} className="border-b border-[#a9c2ab]/60">
                  <td className="py-1">{e.account}</td>
                  <td><span className={`rounded px-2 py-0.5 text-xs ${TINT[e.type]}`}>{e.type}</span></td>
                  <td className={`text-right font-mono ${e.amount < 0 ? 'text-red-700' : ''}`}>{e.amount > 0 ? '+' : ''}{f(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!res.balanced && <p className="mt-2 text-red-700">This entry does not balance. Reword the transaction and analyze again.</p>}
          <button onClick={post} disabled={!res.balanced} className="mt-3 rounded bg-green-800 px-5 py-2 text-white disabled:opacity-40">Post to pad</button>
        </div>
      )}
    </section>
  );
}
'@

W 'app/page.tsx' @'
'use client';
import { PadProvider, usePad } from '@/lib/store';
import PadView from '@/components/PadView';
import TxForm from '@/components/TxForm';

const SIZES: [number, string][] = [[8, 'Small'], [12, 'Standard'], [14, 'Standard'], [16, 'Wide'], [18, 'Wide'], [22, 'Extra wide'], [24, 'Extra wide']];

function Setup() {
  const { d } = usePad();
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-5xl font-bold tracking-tight">Accounting Pad</h1>
      <p className="mt-3 max-w-xl text-lg">Practice on a columnar pad. Record transactions in plain words and watch assets, liabilities and equity update. The checker tells you when something is off.</p>
      <h2 className="mt-10 text-xl font-bold">Choose your pad</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {SIZES.map(([n, label]) => (
          <button key={n} onClick={() => d({ t: 'init', size: n })}
            className="group rounded-md border-2 border-[#5f8a63] bg-[#f4f8ec] p-4 text-left hover:bg-green-800 hover:text-white">
            <div className="flex h-10 gap-px overflow-hidden">
              {Array.from({ length: n }).map((_, i) => <span key={i} className="flex-1 border-r border-[#a9c2ab] group-hover:border-white/40" />)}
            </div>
            <div className="mt-2 text-2xl font-bold">{n}</div>
            <div className="text-sm opacity-70">{label} columns</div>
          </button>
        ))}
      </div>
      <p className="mt-8 text-sm italic text-[#4a6b4f]">Nothing is saved. Closing the tab clears your pad.</p>
    </div>
  );
}

function App() {
  const { pad, d } = usePad();
  if (!pad) return <Setup />;
  return (
    <main className="mx-auto max-w-[110rem] space-y-4 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{pad.size}-column pad</h1>
        <button onClick={() => confirm('Clear the pad and start over?') && d({ t: 'reset' })} className="rounded border border-green-800 px-3 py-1 hover:bg-white">Start over</button>
      </header>
      <TxForm />
      <PadView />
    </main>
  );
}

export default function Page() { return <PadProvider><App /></PadProvider>; }
'@

Write-Host 'UI updated. If npm run dev is running, just refresh the browser.' -ForegroundColor Green
