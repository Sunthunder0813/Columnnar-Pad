'use client';
import { useState, useEffect } from 'react';
import { usePad, today, place } from '@/lib/store';
import { Row, AcctType, Entry } from '@/lib/types';
import SideMenu from './SideMenu';
import { createPortal } from 'react-dom';

// true = show every column on the pad and scroll sideways
// false = show only named accounts plus one "+ Add account" column
const SHOW_ALL_COLUMNS = true;
const MIN_LINES = 12;   // blank ruled rows kept on the page (0 = none)
const SLOTS = 6;        // digit boxes per amount (grows automatically for bigger numbers)
const COMMAS = false;   // true = 10,000   false = 10000 (like the paper pad)

type Level = 'easy' | 'normal' | 'hard';
const LEVELS: { v: Level; label: string; count: number; hint: string; dot: string }[] = [
  { v: 'easy', label: 'Easy', count: 4, dot: 'bg-[#7fa27a]',
    hint: 'Owner investments, cash and credit purchases, and paying what you owe. No percentages.' },
  { v: 'normal', label: 'Normal', count: 5, dot: 'bg-[#e0a64a]',
    hint: 'Adds service revenue, expenses and partial payments, plus one simple percentage such as a down payment.' },
  { v: 'hard', label: 'Difficult', count: 7, dot: 'bg-[#b3402f]',
    hint: 'More accounts, split payments, receivables and withdrawals. Most amounts come from a percentage equation.' },
];

const f = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CHIP: Record<AcctType, string> = { asset: 'bg-[#e4ecd6] text-[#2f4a2c]', liability: 'bg-[#f8e6c1] text-[#6b4a12]', equity: 'bg-[#dde7f0] text-[#27435f]' };
const STRIP: Record<AcctType, string> = {
  asset: 'shadow-[inset_0_3px_0_0_#7fa27a]', liability: 'shadow-[inset_0_3px_0_0_#e0a64a]', equity: 'shadow-[inset_0_3px_0_0_#7a9cc0]',
};

// Columnar pad: blue ruled lines, blue column lines, red margin and cents lines.
const H = 'border-b border-b-[#9cc0e6]';
const VB = 'border-r-[3px] border-double border-r-[#8fb4dc]';
const VRED = 'border-r border-r-[#d4574f]';
const VDBL = 'border-r-[3px] border-double border-r-[#d4574f]';
const HEADB = 'border-b-2 border-b-[#6f9fd0]';
const TOPB = 'border-t-2 border-t-[#6f9fd0]';
const CHKB = 'border-l border-l-[#d4574f]';
const CELL = 'bg-[#fffdf6]';
const SHADE = 'bg-[#f4eee0]';
const DEF = { del: 56, date: 150, desc: 340, col: 170, chk: 110 };
const MIN = 56;
const INK = 'text-[#2f4590]';
const MUTED = 'text-[#6b5844]';

let ctx: CanvasRenderingContext2D | null = null;
const textW = (s: string, font: string) => {
  ctx = ctx || document.createElement('canvas').getContext('2d');
  ctx!.font = font;
  return ctx!.measureText(s).width;
};

function Grip({ onDrag, onReset }: { onDrag: (dx: number) => void; onReset: () => void }) {
  return (
    <div role="separator" aria-orientation="vertical" title="Drag to resize. Double-click to auto-fit."
      style={{ touchAction: 'none' }}
      onPointerDown={e => {
        e.preventDefault();
        const el = e.currentTarget;
        const now = Date.now();
        const prev = Number(el.dataset.t || 0);
        el.dataset.t = String(now);
        if (now - prev < 350) { onReset(); return; }
        el.setPointerCapture(e.pointerId);
        let last = e.clientX;
        const move = (ev: PointerEvent) => { onDrag(ev.clientX - last); last = ev.clientX; };
        const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
      }}
      className="absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize hover:bg-[#c2602f]/40 active:bg-[#c2602f]/60" />
  );
}

// One amount space: whole amount | red line | cents. Negatives in parentheses.
function LedgerCell({ value, onChange, readOnly = false, showZero = false, preview = false }:
  { value: number; onChange?: (v: number) => void; readOnly?: boolean; showZero?: boolean; preview?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  if (editing && !readOnly) {
    return (
      <input autoFocus type="text" inputMode="decimal" value={text}
        onFocus={e => { const n = e.currentTarget.value.length; e.currentTarget.setSelectionRange(n, n); }}
        onChange={e => {
          const v = e.target.value.replace(/[^0-9.-]/g, '');
          setText(v);
          const num = parseFloat(v);
          onChange?.(Number.isNaN(num) ? 0 : num);
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }}
        className={`num h-12 w-full bg-white px-2 text-right ${value < 0 ? 'text-[#b3402f]' : INK}`} />
    );
  }
  const neg = value < 0;
  const blank = value === 0 && !showZero;
  const cents = Math.round(Math.abs(value) * 100);
  const whole = Math.floor(cents / 100);
  const cc = cents % 100;
  const digits = blank ? [] : String(whole).split('');
  const n = Math.max(SLOTS, digits.length);
  const off = n - digits.length;
  const color = neg ? 'text-[#b3402f]' : preview ? 'text-[#8a5a00]' : readOnly ? 'text-[#3b2f26]' : INK;
  const dbl = '';
  return (
    <div tabIndex={readOnly ? -1 : 0} onFocus={() => { if (!readOnly) { setText(value ? String(value) : ''); setEditing(true); } }}

      className={`num flex h-12 select-none items-center text-[15px] ${readOnly ? 'font-semibold' : 'cursor-text'} ${preview ? 'bg-[#fff0c9]' : ''} ${color}`}>
      <span className="flex h-full w-5 shrink-0 items-center justify-center border-r border-r-[#d4574f]">
        {neg && !blank ? '(' : ''}
      </span>
      <span className="flex h-full flex-1">
        {Array.from({ length: n }).map((_, k) => {
          const p = n - 1 - k; // boxes to the right of this one
          const ch = k - off >= 0 ? digits[k - off] : '';
          const edge = p === 0 ? '' : p % 3 === 0 ? 'border-r border-r-[#b9a47f]' : 'border-r border-r-[#d3dfec]';
          return <span key={k} className={`flex flex-1 items-center justify-center ${edge} ${ch ? dbl : ''}`}>{ch}</span>;
        })}
      </span>
      <span className={`flex h-full w-5 shrink-0 items-center justify-center border-l border-l-[#d4574f] ${dbl}`}>
        {blank ? null : cc === 0
          ? <span className="text-[13px]">-</span>
          : <span className="-translate-y-1.5 text-[10px] font-semibold leading-none tracking-tight">{String(cc).padStart(2, '0')}</span>}
        {neg && !blank && <span className="text-[13px]">)</span>}
      </span>
    </div>
  );
}

type Res = { entries: Entry[]; explanation: string; balanced: boolean };
// vec = answer key by column position, equation = worked arithmetic (percentages shown here)
type Item = { description: string; date: string; entries: Entry[]; explanation: string; equation: string; vec: number[] };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function DateCell({ value, showMonth, onChange, min, max }: { value: string; showMonth: boolean; onChange: (v: string) => void; min?: string; max?: string }) {
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const m = ok ? Number(value.slice(5, 7)) : 0;
  const y = ok ? Number(value.slice(0, 4)) : 0;
  const dd = ok ? Number(value.slice(8, 10)) : 0;
  const label = ok ? `${MONTHS[m - 1]} ${y}` : '';
  const open = (el: HTMLInputElement) => { try { el.showPicker(); } catch { el.focus(); } };
  return (
    <div className="relative flex h-12 cursor-pointer items-stretch transition-colors hover:bg-[#f4ecd8]/70">
      <div className="flex flex-1 items-center justify-center border-r border-r-[#9cc0e6] text-[13px] font-medium text-[#2f4590]">
        {showMonth && label}
      </div>
      <div className="num flex w-11 items-center justify-center text-[15px] text-[#2f4590]">{ok ? dd : ''}</div>
      <input type="date" value={ok ? value : ''} min={min} max={max} aria-label="Pick a date" title="Click to pick a date"
        onClick={e => open(e.currentTarget)}
        onKeyDown={e => {
          if (e.key === 'Tab') return;
          e.preventDefault();
          if (e.key === 'Enter' || e.key === ' ') open(e.currentTarget);
        }}
        onChange={e => {
          const v = e.target.value;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
          if ((min && v < min) || (max && v > max)) return;
          onChange(v);
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
    </div>
  );
}

const TYPES: { v: AcctType; label: string; hint: string; dot: string }[] = [
  { v: 'asset', label: 'Asset', hint: 'What you own', dot: 'bg-[#7fa27a]' },
  { v: 'liability', label: 'Liability', hint: 'What you owe', dot: 'bg-[#e0a64a]' },
  { v: 'equity', label: 'Equity', hint: "Owner's stake", dot: 'bg-[#7a9cc0]' },
];

function TypePicker({ value, onChange }: { value: AcctType; onChange: (t: AcctType) => void }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', esc);
    };
  }, [pos]);
  const cur = TYPES.find(t => t.v === value)!;
  return (
    <>
      <button type="button" aria-label="Change account type"
        onMouseDown={e => e.stopPropagation()}
        onClick={e => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos(pos ? null : { x: r.left + r.width / 2, y: r.bottom + 6 });
        }}
        className={`pop inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP[value]}`}>
        <span className={`h-2 w-2 rounded-full ${cur.dot}`} />
        {cur.label}
        <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform duration-200 ${pos ? 'rotate-180' : ''}`}>
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {pos && createPortal(
        <div style={{ left: Math.min(Math.max(8, pos.x - 96), window.innerWidth - 200), top: pos.y }}
          onMouseDown={e => e.stopPropagation()}
          className="menu-in fixed z-50 w-48 rounded-xl border border-[#cdb98f] bg-[#fffaf1] p-1 shadow-[0_8px_24px_rgba(90,36,29,0.25)]">
          {TYPES.map(t => (
            <button key={t.v} type="button" aria-label={t.label}
              onClick={() => { onChange(t.v); setPos(null); }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[#f4ecd8] ${t.v === value ? 'bg-[#f4ecd8]' : ''}`}>
              <span className={`h-3 w-3 shrink-0 rounded-full ${t.dot}`} />
              <span className="flex-1">
                <span className="block text-sm font-semibold leading-tight text-[#3b2f26]">{t.label}</span>
                <span className="block text-xs leading-tight text-[#6b5844]">{t.hint}</span>
              </span>
              {t.v === value && <span className="text-sm text-[#3f6b45]">{'\u2714'}</span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

function LevelModal({ current, onPick, onClose }: { current: Level | null; onPick: (l: Level) => void; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return createPortal(
    <div onMouseDown={onClose} className="fixed inset-0 z-[80] flex items-center justify-center bg-[#3b2f26]/40 p-4">
      <div role="dialog" aria-modal="true" aria-label="Choose a difficulty" onMouseDown={e => e.stopPropagation()}
        className="menu-in w-full max-w-md rounded-2xl border border-[#cdb98f] bg-[#fffaf1] p-5 shadow-[0_12px_40px_rgba(90,36,29,0.35)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[#3b2f26]">Choose a difficulty</h2>
            <p className="mt-0.5 text-sm text-[#6b5844]">The AI writes the transactions and sets up the account columns for you.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-[#6b5844] hover:bg-[#f4ecd8]">&times;</button>
        </div>
        <div className="mt-4 space-y-2">
          {LEVELS.map(l => (
            <button key={l.v} type="button" onClick={() => onPick(l.v)}
              className={`flex w-full items-start gap-3 rounded-xl border-2 p-3 text-left hover:border-[#c2602f] hover:bg-[#f4ecd8] ${current === l.v ? 'border-[#c2602f] bg-[#f4ecd8]' : 'border-[#e6dac4]'}`}>
              <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${l.dot}`} />
              <span className="flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <b className="text-base text-[#3b2f26]">{l.label}</b>
                  <span className="text-xs text-[#6b5844]">{l.count} transactions</span>
                </span>
                <span className="block text-sm leading-snug text-[#6b5844]">{l.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function PadView() {
  const { pad, d } = usePad();
  const [w, setW] = useState<Record<string, number>>({});
  const [menu, setMenu] = useState<{ x: number; y: number; id: string; n: number } | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [draft, setDraft] = useState({ date: today(), desc: '' });
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [target, setTarget] = useState<{ id: string; desc: string } | null>(null);

  // Practice mode: the AI writes a set of transactions (with a hidden answer key),
  // they are placed on the pad as empty rows, and the student fills in the amounts.
  const [prOn, setPrOn] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [showRes, setShowRes] = useState(false);
  const [open, setOpen] = useState<string[]>([]);     // row ids whose answer key is revealed
  const [seen, setSeen] = useState<string[]>([]);
  const [pbusy, setPbusy] = useState(false);
  const [level, setLevel] = useState<Level>('normal');
  const [pickOpen, setPickOpen] = useState(false);

  useEffect(() => {
    if (!res) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setRes(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [res]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', esc);
    };
  }, [menu]);
  if (!pad) return null;

  const prev = res ? place(pad, res.entries) : null;
  const live = res && !target ? prev : null;
  const lastDate = pad.rows.length ? pad.rows[pad.rows.length - 1].date : '';
  const draftDate = lastDate && draft.date < lastDate ? lastDate : draft.date;
  const analyze = async (rowId?: string) => {
    const text = (rowId ? (pad.rows.find(r => r.id === rowId)?.desc ?? '') : draft.desc).trim();
    if (!text || busy) return;
    setBusy(true); setErr(''); setRes(null);
    setTarget(rowId ? { id: rowId, desc: text } : null);
    try {
      const r = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: text, columns: pad.cols.filter(c => c.name.trim()) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Request failed');
      if (!j.balanced) throw new Error('The AI entry does not balance. Reword the transaction and try again.');
      setRes(j);
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  const attach = () => {
    if (!res) return;
    if (target) {
      d({ t: 'fill', id: target.id, desc: target.desc, entries: res.entries });
      setRes(null); setTarget(null);
      return;
    }
    d({ t: 'post', date: draftDate, desc: draft.desc.trim(), entries: res.entries });
    setRes(null);
    setDraft(p => ({ ...p, desc: '' }));
  };

  // ---- Practice mode ----
  const nm = (s: string) => s.trim().toLowerCase();
  // Practice rows are found by their (locked) description.
  const pset = new Map<string, Item>(prOn ? items.map(it => [it.description, it] as [string, Item]) : []);
  const prRows = pad.rows.filter(r => pset.has(r.desc));
  const gradeOk = (r: Row) => {
    const it = pset.get(r.desc);
    if (!it) return false;
    const x = it.vec;
    return r.vals.every((v, i) => Math.abs(v - x[i]) < 0.005);
  };
  const filled = prRows.filter(r => r.vals.some(v => v !== 0)).length;
  const ready = prOn && !pbusy && prRows.length > 0 && filled === prRows.length;
  const good = showRes ? prRows.filter(gradeOk).length : 0;
  const toggleOpen = (id: string) => setOpen(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const dropPr = () => prRows.forEach(r => d({ t: 'del', id: r.id }));

  // Ask the AI for a set, then put every transaction on the pad as an empty row.
  const loadSet = async (lv: Level = level) => {
    if (pbusy) return;
    setPbusy(true); setErr(''); setShowRes(false); setOpen([]); setItems([]);
    try {
      // Dates start after the last row that is NOT part of the old practice set.
      const keep = pad.rows.filter(r => !pset.has(r.desc));
      const lastKeep = keep.length ? keep[keep.length - 1].date : '';
      const start = lastKeep && draft.date < lastKeep ? lastKeep : draft.date;
      const r = await fetch('/api/practice', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columns: pad.cols.filter(c => c.name.trim()),
          free: pad.cols.filter(c => !c.name.trim()).length,
          level: lv, count: LEVELS.find(l => l.v === lv)!.count, start, avoid: seen.slice(-10),
        }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Request failed');

      // The AI names any extra accounts it needs. Put them in the first free columns (they stay editable).
      const cols = pad.cols.map(c => ({ ...c }));
      (j.add as { name: string; type: AcctType }[]).forEach(a => {
        const i = cols.findIndex(c => !c.name.trim());
        if (i < 0) return;
        cols[i] = { name: a.name, type: a.type };
        d({ t: 'col', i, p: { name: a.name, type: a.type } });
      });
      // Answer key by column position, so renaming a column later does not break grading.
      const list: Item[] = (j.items as Omit<Item, 'vec'>[]).map(it => {
        const vec: number[] = Array(pad.size).fill(0);
        it.entries.forEach(e => {
          const i = cols.findIndex(c => nm(c.name) === nm(e.account));
          if (i >= 0) vec[i] += e.amount;
        });
        return { ...it, vec };
      });
      setItems(list);
      setSeen(p => [...p, ...list.map(x => x.description)]);
      list.forEach(it => d({ t: 'post', date: it.date, desc: it.description, entries: [] }));
    } catch (e: any) { setErr(e.message); }
    setPbusy(false);
  };
  const newSet = (lv: Level = level) => {
    if (pbusy) return;
    if (!showRes && filled > 0 && !confirm('Discard this set and get a new one?')) return;
    dropPr();
    loadSet(lv);
  };
  // Chosen in the difficulty modal: starts practice, or switches level while practising.
  const pickLevel = (lv: Level) => {
    setPickOpen(false);
    setLevel(lv);
    if (prOn) { newSet(lv); return; }
    setRes(null); setTarget(null); setErr(''); setPrOn(true);
    loadSet(lv);
  };
  const exitPractice = () => {
    if (prRows.length && confirm('Remove the practice rows from the pad? (Cancel keeps them.)')) dropPr();
    setPrOn(false); setItems([]); setShowRes(false); setOpen([]);
  };
  const togglePractice = () => {
    if (prOn) { exitPractice(); return; }
    setPickOpen(true);
  };

  const removeRow = (id: string) => {
    setLeaving(id);
    setTimeout(() => { d({ t: 'del', id }); setLeaving(null); }, 200);
  };
  const get = (k: string, def: number) => w[k] ?? def;
  const resize = (k: string, def: number) => (dx: number) => setW(p => ({ ...p, [k]: Math.max(MIN, (p[k] ?? def) + dx) }));
  const FONT = '15px Inter, system-ui, "Segoe UI", sans-serif';
  const colTotal = (i: number) => pad.rows.reduce((a, r) => a + r.vals[i], 0);

  const firstEmpty = pad.cols.findIndex(c => !c.name.trim());
  const vis = pad.cols.map((_, i) => i).filter(i =>
    SHOW_ALL_COLUMNS || pad.cols[i].name.trim() || pad.rows.some(r => r.vals[i] !== 0) || i === firstEmpty);

  const fit = (k: string) => {
    let px = MIN;
    if (k === 'date') px = 150;
    else if (k === 'desc') px = Math.max(textW('Description', FONT), ...pad.rows.map(r => textW(r.desc, FONT) / 2)) + 40;
    else {
      const i = Number(k.slice(1));
      px = Math.max(
        ...(pad.cols[i].name || 'Account').split(' ').map(word => textW(word, FONT)),
        textW(f(colTotal(i)), FONT),
        ...pad.rows.map(r => textW(String(r.vals[i] || ''), FONT)),
      ) + 60;
    }
    setW(p => ({ ...p, [k]: Math.max(k.startsWith('c') ? 160 : MIN, Math.ceil(px)) }));
  };
  const dateW = get('date', DEF.date), descW = get('desc', DEF.desc);
  const total = DEF.del + dateW + descW + DEF.chk + vis.reduce((a, i) => a + get('c' + i, DEF.col), 0);

  const sum = (t: AcctType) => pad.cols.reduce((a, c, i) => (c.type === t ? a + colTotal(i) : a), 0);
  const A = sum('asset'), L = sum('liability'), E = sum('equity');
  const ok = Math.abs(A - L - E) < 0.005;
  const diff = (r: Row) => pad.cols.reduce((a, c, i) => a + (c.type === 'asset' ? 1 : -1) * r.vals[i], 0);
  const sticky = { del: { left: 0 }, date: { left: DEF.del }, desc: { left: DEF.del + dateW } };
  const blanks = Math.max(0, MIN_LINES - pad.rows.length - 1); // one line is the live input row

  return (
    <div className="space-y-3">
      {menu && (
        <div style={{ left: Math.min(menu.x, window.innerWidth - 190), top: Math.min(menu.y, window.innerHeight - 170) }}
          onMouseDown={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}
          className="menu-in fixed z-50 w-44 overflow-hidden rounded-xl border border-[#cdb98f] bg-[#fffaf1] py-1 text-sm shadow-[0_8px_24px_rgba(90,36,29,0.3)]">
          <div className="px-3 py-1 text-xs text-[#6b5844]">Row {menu.n}</div>
          <button onClick={() => { d({ t: 'insert', id: menu.id, where: 'above' }); setMenu(null); }}
            className="block w-full px-3 py-2 text-left font-medium text-[#3b2f26] hover:bg-[#f4ecd8]">{'\u2191'} Insert row above</button>
          <button onClick={() => { d({ t: 'insert', id: menu.id, where: 'below' }); setMenu(null); }}
            className="block w-full px-3 py-2 text-left font-medium text-[#3b2f26] hover:bg-[#f4ecd8]">{'\u2193'} Insert row below</button>
          <div className="my-1 border-t border-[#e6dac4]" />
          <button onClick={() => { removeRow(menu.id); setMenu(null); }}
            className="block w-full px-3 py-2 text-left font-medium text-[#b3402f] hover:bg-[#f6dcd3]">Delete row</button>
        </div>
      )}

      {err && <p className="rounded-xl bg-[#f6dcd3] p-3 text-sm text-[#b3402f]">{err}</p>}
      {res && (
        <p className="rounded-xl bg-[#fff0c9] p-3 text-sm text-[#8a5a00]">
          <b>Preview:</b> {res.explanation} Press Confirm (or Enter) to attach, or edit the transaction to cancel.
        </p>
      )}

      <div className="grid overflow-hidden rounded-xl border border-[#c9bb9c] bg-[#fffaf1] shadow-[0_2px_10px_rgba(120,90,50,0.10)] md:grid-cols-2">
        <div className="flex flex-col justify-center gap-1 border-b border-[#e6dac4] px-5 py-4 md:border-b-0 md:border-r">
          <h1 className="text-2xl font-semibold leading-tight text-[#3b2f26]">Accounting Pad</h1>
          <p className="text-sm text-[#6b5844]">Room for up to {pad.size} accounts</p>
          {prOn && (
            <div className="rise mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#c2602f] px-3 py-1 font-semibold text-white">
                <span className={`h-2 w-2 rounded-full bg-white ${pbusy ? 'animate-pulse' : ''}`} />
                Practice &middot; {LEVELS.find(l => l.v === level)!.label}
              </span>
              <span className={`text-[#6b5844] ${pbusy ? 'animate-pulse' : ''}`}>
                {pbusy ? 'Writing your transactions\u2026'
                  : prRows.length === 0 ? 'No transactions loaded. Press New set.'
                  : showRes ? `Score: ${good} of ${prRows.length} correct`
                  : `${filled} of ${prRows.length} rows filled in`}
              </span>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => d({ t: 'blank' })} className="h-8 rounded-lg border border-[#c2602f] px-3 text-sm text-[#a94f23] hover:bg-[#fffaf1]">Add blank row</button>
            <button onClick={() => setW({})} className="h-8 rounded-lg border border-[#c2602f] px-3 text-sm text-[#a94f23] hover:bg-[#fffaf1]">Reset widths</button>
            {prOn ? (
              <>
                {showRes && (
                  <button onClick={() => setResOpen(true)}
                    className="h-8 rounded-lg bg-[#3f6b45] px-3 text-sm font-semibold text-white hover:bg-[#345a3a]">Review results</button>
                )}
                <button onClick={() => setPickOpen(true)} disabled={pbusy}
                  className="h-8 rounded-lg border border-[#c2602f] px-3 text-sm text-[#a94f23] hover:bg-[#fffaf1] disabled:opacity-40">Change level</button>
                <button onClick={() => newSet()} disabled={pbusy}
                  className="h-8 rounded-lg border border-[#c2602f] px-3 text-sm text-[#a94f23] hover:bg-[#fffaf1] disabled:opacity-40">New set</button>
                <button onClick={exitPractice}
                  className="h-8 rounded-lg border border-[#b3402f] px-3 text-sm text-[#b3402f] hover:bg-[#f6dcd3]">Exit practice</button>
              </>
            ) : (
              <button onClick={togglePractice}
                className="h-8 rounded-lg border border-[#c2602f] px-3 text-sm text-[#a94f23] hover:bg-[#fffaf1]">Practice mode</button>
            )}
            {pad.rows.length > 0 && (
              <button onClick={() => confirm('Remove all rows? Column names are kept.') && d({ t: 'clear' })}
                className="h-8 rounded-lg border border-[#b3402f] px-3 text-sm text-[#b3402f] hover:bg-[#f6dcd3]">Clear all rows</button>
            )}
          </div>
        </div>
        <div className="flex flex-col justify-center gap-3 px-5 py-4">
          <div className="flex items-stretch gap-2.5">
            <div className="min-w-0 flex-1 rounded-lg bg-[#e4ecd6] px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-sm text-[#2f4a2c]"><span className="h-2.5 w-2.5 rounded-full bg-[#7fa27a]" />Assets</div>
              <div title={f(A)} className={`num truncate text-right text-xl font-semibold ${A < 0 ? 'text-[#b3402f]' : 'text-[#2f4a2c]'}`}>{f(A)}</div>
            </div>
            <span className={`self-center text-xl font-semibold transition-colors duration-500 ${ok ? 'text-[#3f6b45]' : 'text-[#b3402f]'}`}>=</span>
            <div className="min-w-0 flex-1 rounded-lg bg-[#f8e6c1] px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-sm text-[#6b4a12]"><span className="h-2.5 w-2.5 rounded-full bg-[#e0a64a]" />Liabilities</div>
              <div title={f(L)} className={`num truncate text-right text-xl font-semibold ${L < 0 ? 'text-[#b3402f]' : 'text-[#6b4a12]'}`}>{f(L)}</div>
            </div>
            <span className="self-center text-xl font-semibold text-[#6b5844]">+</span>
            <div className="min-w-0 flex-1 rounded-lg bg-[#dde7f0] px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-sm text-[#27435f]"><span className="h-2.5 w-2.5 rounded-full bg-[#7a9cc0]" />Equity</div>
              <div title={f(E)} className={`num truncate text-right text-xl font-semibold ${E < 0 ? 'text-[#b3402f]' : 'text-[#27435f]'}`}>{f(E)}</div>
            </div>
          </div>
          <div className="text-right">
            <span className={`inline-flex items-center rounded-lg px-3 py-1 text-sm font-medium transition-colors duration-500 ${!ok ? 'bg-[#f6dcd3] text-[#b3402f]' : pad.rows.length ? 'bg-[#e4ecd6] text-[#3f6b45]' : 'bg-[#f4ecd8] text-[#6b5844]'}`}>
              {!ok ? `Off by ${f(Math.abs(A - L - E))} \u2013 check the red row` : pad.rows.length ? '\u2714 Balanced' : 'Nothing posted yet'}
            </span>
          </div>
        </div>
      </div>

      <div className={`overflow-x-auto rounded-lg border shadow-[0_2px_10px_rgba(120,90,50,0.10)] transition-shadow ${prOn ? 'border-[#c2602f] ring-2 ring-[#c2602f]/50' : 'border-[#c9bb9c]'} ${CELL}`}>
        <table className="sheet table-fixed border-separate border-spacing-0 text-[15px]" style={{ width: total }}>
          <colgroup>
            <col style={{ width: DEF.del }} /><col style={{ width: dateW }} /><col style={{ width: descW }} />
            {vis.map(i => <col key={i} style={{ width: get('c' + i, DEF.col) }} />)}
            <col style={{ width: DEF.chk }} />
          </colgroup>
          <thead>
            <tr>
              <th style={sticky.del} className={`sticky z-10 ${SHADE} ${HEADB} ${VRED}`} />
              <th style={sticky.date} className={`sticky z-10 p-2 text-center text-xs font-semibold uppercase tracking-wide ${MUTED} ${SHADE} ${HEADB} ${VRED}`}>
                Date<Grip onDrag={resize('date', DEF.date)} onReset={() => fit('date')} />
              </th>
              <th style={sticky.desc} className={`sticky z-10 p-2 text-center text-xs font-semibold uppercase tracking-wide ${MUTED} ${SHADE} ${HEADB} ${VDBL}`}>
                Transactions<Grip onDrag={resize('desc', DEF.desc)} onReset={() => fit('desc')} />
              </th>
              {vis.map((i, n) => {
                const c = pad.cols[i];
                const named = !!c.name.trim();
                const pc = prev?.cols[i];
                const isNew = !named && !!pc?.name.trim();
                return (
                  <th key={i} className={`relative z-0 p-1.5 font-normal ${SHADE} ${HEADB} ${VB} ${named ? STRIP[c.type] : ''}`}>
                    <div className="text-[10px] text-[#9aa9bd]">{n + 1}</div>
                    <div className="relative flex h-11 items-center justify-center">
                      {isNew && <span className="absolute inset-0 z-10 flex items-center justify-center rounded bg-[#fff0c9] text-[15px] font-semibold text-[#8a5a00]">{pc!.name}</span>}
                      <textarea rows={1} value={c.name} placeholder={i === firstEmpty ? '+ Add account' : 'Account'}
                        ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                        onChange={e => d({ t: 'col', i, p: { name: e.target.value.replace(/\n/g, '') } })}
                        onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
                        className="hand block max-h-11 w-full resize-none overflow-hidden bg-transparent text-center text-[15px] font-semibold leading-snug text-[#3b2f26] placeholder:font-normal placeholder:text-[#a8957a]" />
                    </div>
                    <div className="flex min-h-[22px] justify-center">
                      {named && <TypePicker value={c.type} onChange={t => d({ t: 'col', i, p: { type: t } })} />}
                      {isNew && <span className="rounded-full bg-[#fff0c9] px-2.5 py-0.5 text-xs font-semibold text-[#8a5a00]">{TYPES.find(t => t.v === pc!.type)!.label}</span>}
                    </div>
                    <Grip onDrag={resize('c' + i, DEF.col)} onReset={() => fit('c' + i)} />
                  </th>
                );
              })}
              <th className={`sticky right-0 z-10 p-2 text-xs font-semibold uppercase ${MUTED} ${SHADE} ${HEADB} ${CHKB}`}>Check</th>
            </tr>
          </thead>
          <tbody>
            {pad.rows.map((r, n) => {
              const df = diff(r); const rok = Math.abs(df) < 0.005;
              const empty = r.vals.every(v => v === 0);
              const pv = res && target?.id === r.id ? prev : null;
              const pr = pset.has(r.desc);                       // a practice row
              const x = pr ? pset.get(r.desc)!.vec : [];      // its answer key
              const graded = pr && showRes;
              const wrong = graded && !gradeOk(r);
              const isOpen = pr && open.includes(r.id);
              return (
                <tr key={r.id} className={`rise group h-12 ${leaving === r.id ? 'row-out' : ''}`}
                  onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: r.id, n: n + 1 }); }}>
                  <td style={sticky.del} className={`sticky z-10 ${SHADE} ${H} ${VRED}`}>
                    <div className="flex h-full items-center justify-between px-1 text-[11px] text-[#9aa9bd]">
                      <span className="w-4 text-center">{n + 1}</span>
                      <button onClick={() => removeRow(r.id)} title="Delete this row (or right-click the row)" aria-label="Delete row"
                        className="rounded px-1.5 text-lg leading-none text-[#b3402f] opacity-60 hover:bg-[#f6dcd3] hover:opacity-100">&times;</button>
                    </div>
                  </td>
                  <td style={sticky.date} className={`sticky ${CELL} ${H} ${VRED} p-0`}>
                    <DateCell value={r.date} min={n > 0 ? pad.rows[n - 1].date : undefined} max={n < pad.rows.length - 1 ? pad.rows[n + 1].date : undefined}
                      showMonth={n === 0 || pad.rows[n - 1].date.slice(0, 7) !== r.date.slice(0, 7)}
                      onChange={v => d({ t: 'text', id: r.id, k: 'date', v })} />
                  </td>
                  <td style={sticky.desc} className={`sticky ${CELL} ${H} ${VDBL}`}>
                    <textarea rows={2} value={r.desc} placeholder="Transaction" readOnly={pr}
                      onChange={e => { if (res) setRes(null); d({ t: 'text', id: r.id, k: 'desc', v: e.target.value.replace(/\n/g, ' ') }); }}
                      onKeyDownCapture={e => { if (e.key === 'Enter' && empty && !pr) { e.preventDefault(); if (pv) attach(); else analyze(r.id); } }}
                      onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
                      title={pr ? r.desc : undefined}
                      className={`hand block w-full resize-none bg-transparent px-2 ${pr ? 'overflow-y-auto py-1 text-[14px] leading-5 [scrollbar-width:thin]' : 'overflow-hidden text-[15px] leading-6'} ${INK}`} />
                  </td>
                  {vis.map(i => {
                    const bad = wrong && !isOpen && Math.abs(r.vals[i] - (x[i] ?? 0)) >= 0.005;
                    return (
                      <td key={i} className={`${H} ${VB} ${bad ? 'bg-[#f6dcd3]' : CELL} p-0`}>
                        <LedgerCell value={pv ? pv.vals[i] : isOpen ? (x[i] ?? 0) : r.vals[i]}
                          readOnly={!!pv || graded}
                          preview={(!!pv && pv.vals[i] !== 0) || (isOpen && (x[i] ?? 0) !== 0)}
                          onChange={nv => d({ t: 'cell', id: r.id, i, v: nv })} />
                      </td>
                    );
                  })}
                  <td className={`num sticky right-0 ${SHADE} ${H} ${CHKB} ${empty && !graded ? 'px-1.5' : 'px-2 text-center'} ${rok ? 'text-[#3f6b45]' : 'font-semibold text-[#b3402f]'}`}>
                    {pv ? (
                      <div className="flex gap-1">
                        <button onClick={attach} className="h-8 flex-1 rounded-lg bg-[#3f6b45] text-xs font-semibold text-white hover:bg-[#345a3a]">Confirm</button>
                        <button onClick={() => setRes(null)} aria-label="Cancel" title="Cancel (Esc)"
                          className="h-8 w-8 rounded-lg border border-[#c2602f] text-sm text-[#a94f23] hover:bg-[#fffaf1]">&times;</button>
                      </div>
                    ) : graded ? (
                      wrong ? (
                        <button onClick={() => toggleOpen(r.id)}
                          className="h-8 w-full rounded-lg border border-[#b3402f] text-xs font-semibold text-[#b3402f] hover:bg-[#f6dcd3]">{isOpen ? 'Mine' : 'Answer'}</button>
                      ) : (
                        <span className="text-sm font-semibold text-[#3f6b45]">{'\u2714'} Right</span>
                      )
                    ) : pr && empty ? null : empty ? (
                      <button onClick={() => analyze(r.id)} disabled={busy || !r.desc.trim()}
                        className={`h-8 w-full rounded-lg bg-[#c2602f] text-xs font-semibold text-white hover:bg-[#a94f23] disabled:opacity-40 ${busy && target?.id === r.id ? 'animate-pulse' : ''}`}>
                        {busy && target?.id === r.id ? 'Analyzing' : 'Analyze'}
                      </button>
                    ) : rok ? '\u2714' : f(df)}
                  </td>
                </tr>
              );
            })}
            <tr className="h-12">
              <td style={sticky.del} className={`sticky z-10 ${SHADE} ${H} ${VRED}`}>
                <span className="block text-center text-[11px] text-[#9aa9bd]">{pad.rows.length + 1}</span>
              </td>
              <td style={sticky.date} className={`sticky bg-[#fff6e3] ${H} ${VRED} p-0`}>
                <DateCell value={draftDate} min={lastDate || undefined}
                  showMonth={!lastDate || lastDate.slice(0, 7) !== draftDate.slice(0, 7)}
                  onChange={v => setDraft(p => ({ ...p, date: v }))} />
              </td>
              <td style={sticky.desc} className={`sticky bg-[#fff6e3] ${H} ${VDBL}`}>
                <textarea data-native-undo="true" rows={2} value={draft.desc} readOnly={prOn}
                  placeholder={prOn ? 'Practice mode: fill in the rows above' : 'Type a transaction, e.g. Bought supplies for 800 paid in cash'}
                  onChange={e => { if (res) setRes(null); setDraft(p => ({ ...p, desc: e.target.value.replace(/\n/g, ' ').replace(/^\s+/, '') })); }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (prOn) return; if (live) attach(); else analyze(); } }}
                  className={`hand block w-full resize-none overflow-hidden bg-transparent px-2 text-[15px] leading-6 ${live ? 'text-[#8a5a00]' : INK} placeholder:text-[#a8957a]`} />
              </td>
              {vis.map(i => (
                <td key={i} className={`${H} ${VB} ${CELL} p-0`}>
                  <LedgerCell value={live ? live.vals[i] : 0} readOnly preview={!!live && live.vals[i] !== 0} />
                </td>
              ))}
              <td className={`sticky right-0 ${SHADE} ${H} ${CHKB} px-1.5`}>
                {prOn ? null : live ? (
                  <div className="flex gap-1">
                    <button onClick={attach} className="h-8 flex-1 rounded-lg bg-[#3f6b45] text-xs font-semibold text-white hover:bg-[#345a3a]">Confirm</button>
                    <button onClick={() => setRes(null)} aria-label="Cancel" title="Cancel (Esc)"
                      className="h-8 w-8 rounded-lg border border-[#c2602f] text-sm text-[#a94f23] hover:bg-[#fffaf1]">&times;</button>
                  </div>
                ) : (
                  <button onClick={() => analyze()} disabled={busy || !draft.desc.trim()}
                    className={`h-8 w-full rounded-lg bg-[#c2602f] text-xs font-semibold text-white hover:bg-[#a94f23] disabled:opacity-40 ${busy && !target ? 'animate-pulse' : ''}`}>
                    {busy && !target ? 'Analyzing' : 'Analyze'}
                  </button>
                )}
              </td>
            </tr>
            {Array.from({ length: blanks }).map((_, n) => (
              <tr key={'blank' + n} className="h-12">
                <td style={sticky.del} className={`sticky z-10 ${SHADE} ${H} ${VRED}`}>
                  <span className="block text-center text-[11px] text-[#9aa9bd]">{pad.rows.length + n + 2}</span>
                </td>
                <td style={sticky.date} className={`sticky ${CELL} ${H} ${VRED} p-0`}>
                  <div className="flex h-12"><span className="flex-1 border-r border-r-[#9cc0e6]" /><span className="w-11" /></div>
                </td>
                <td style={sticky.desc} className={`sticky ${CELL} ${H} ${VDBL}`} />
                {vis.map(i => (
                  <td key={i} className={`${H} ${VB} ${CELL} p-0`}>
                    <LedgerCell value={0} readOnly />
                  </td>
                ))}
                <td className={`sticky right-0 ${SHADE} ${H} ${CHKB}`} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="h-12">
              <td style={sticky.del} className={`sticky z-10 ${SHADE} ${TOPB} ${VRED}`} />
              <td style={sticky.date} className={`sticky ${SHADE} ${TOPB} ${VRED}`} />
              <td style={sticky.desc} className={`hand sticky px-2 text-lg font-semibold ${SHADE} ${TOPB} ${VDBL}`}>Total</td>
              {vis.map(i => (
                <td key={i} className={`overflow-hidden p-0 ${CHIP[pad.cols[i].type]} ${TOPB} ${VB}`}>
                  <LedgerCell value={colTotal(i)} readOnly showZero={pad.rows.some(r => r.vals[i] !== 0)} />
                </td>
              ))}
              <td className={`sticky right-0 ${SHADE} ${TOPB} ${CHKB} px-1.5`}>
                {prOn && prRows.length > 0 && (
                  showRes ? (
                    <span className="block text-center text-sm font-semibold text-[#2f4590]">{good} / {prRows.length}</span>
                  ) : ready ? (
                    <button onClick={() => setShowRes(true)}
                      className="h-8 w-full rounded-lg bg-[#3f6b45] text-xs font-semibold text-white hover:bg-[#345a3a]">Show result</button>
                  ) : (
                    <span className="block text-center text-xs text-[#9aa9bd]">{filled} / {prRows.length} filled</span>
                  )
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <SideMenu />
      {pickOpen && <LevelModal current={prOn ? level : null} onPick={pickLevel} onClose={() => setPickOpen(false)} />}
    </div>
  );
}