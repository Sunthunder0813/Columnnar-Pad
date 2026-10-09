'use client';
import { createContext, useContext, useReducer, useRef, useCallback, useEffect, ReactNode, Dispatch } from 'react';
import { Pad, Col, Entry } from './types';

export type Action =
  | { t: 'init'; size: number; preset?: boolean } | { t: 'reset' } | { t: 'blank' }
  | { t: 'col'; i: number; p: Partial<Col> }
  | { t: 'cell'; id: string; i: number; v: number }
  | { t: 'text'; id: string; k: 'date' | 'desc'; v: string }
  | { t: 'del'; id: string }
  | { t: 'insert'; id: string; where: 'above' | 'below' }
  | { t: 'clear' }
  | { t: 'fill'; id: string; desc: string; entries: Entry[] }
  | { t: 'post'; date: string; desc: string; entries: Entry[] };

const uid = () => Math.random().toString(36).slice(2, 9);
export const today = () => new Date().toISOString().slice(0, 10);

const PRESET: Col[] = [
  { name: 'Cash', type: 'asset' }, { name: 'Equipment', type: 'asset' }, { name: 'Supplies', type: 'asset' },
  { name: 'Accounts Payable', type: 'liability' }, { name: "Owner's Capital", type: 'equity' },
];

// Put AI entries into one row's amounts. Names a free column when the account is new.
export function place(s: Pad, entries: Entry[]) {
  const cols = [...s.cols]; const vals: number[] = Array(s.size).fill(0);
  for (const e of entries) {
    let i = cols.findIndex(c => c.name.trim().toLowerCase() === e.account.trim().toLowerCase());
    if (i < 0) i = cols.findIndex(c => !c.name.trim());
    if (i < 0) continue;
    if (!cols[i].name.trim()) cols[i] = { name: e.account, type: e.type };
    vals[i] += e.amount;
  }
  return { cols, vals };
}

function reduce(s: Pad | null, a: Action): Pad | null {
    if (a.t === 'init') return { size: a.size, cols: Array.from({ length: a.size }, (_, i) => (a.preset && PRESET[i]) || { name: '', type: 'asset' as const }), rows: [] };
    if (a.t === 'reset') return null;
  if (!s) return s;
  switch (a.t) {
    case 'col': return { ...s, cols: s.cols.map((c, i) => (i === a.i ? { ...c, ...a.p } : c)) };
    case 'cell': return { ...s, rows: s.rows.map(r => r.id === a.id ? { ...r, vals: r.vals.map((v, i) => (i === a.i ? a.v : v)) } : r) };
    case 'text': return { ...s, rows: s.rows.map(r => (r.id === a.id ? { ...r, [a.k]: a.v } : r)) };
    case 'del': return { ...s, rows: s.rows.filter(r => r.id !== a.id) };
    case 'insert': {
      const idx = s.rows.findIndex(r => r.id === a.id);
      if (idx < 0) return s;
      const row = { id: uid(), date: s.rows[idx].date, desc: '', vals: Array(s.size).fill(0) };
      const at = a.where === 'above' ? idx : idx + 1;
      return { ...s, rows: [...s.rows.slice(0, at), row, ...s.rows.slice(at)] };
    }
    case 'clear': return { ...s, rows: [] };
    case 'fill': {
      if (!s.rows.some(r => r.id === a.id)) return s;
      const { cols, vals } = place(s, a.entries);
      return { ...s, cols, rows: s.rows.map(r => (r.id === a.id ? { ...r, desc: a.desc, vals } : r)) };
    }
    case 'blank': return { ...s, rows: [...s.rows, { id: uid(), date: today(), desc: '', vals: Array(s.size).fill(0) }] };
    case 'post': {
      const cols = [...s.cols]; const vals: number[] = Array(s.size).fill(0);
      for (const e of a.entries) {
        let i = cols.findIndex(c => c.name.trim().toLowerCase() === e.account.trim().toLowerCase());
        if (i < 0) i = cols.findIndex(c => !c.name.trim());   // auto-name next free column
        if (i < 0) continue;                                    // pad is full -> checker will flag imbalance
        if (!cols[i].name.trim()) cols[i] = { name: e.account, type: e.type };
        vals[i] += e.amount;
      }
      return { ...s, cols, rows: [...s.rows, { id: uid(), date: a.date, desc: a.desc, vals }] };
    }
  }
}

// ---- Undo / redo history wrapped around the reducer ----
const LIMIT = 100;
type H = { past: (Pad | null)[]; present: Pad | null; future: (Pad | null)[] };
type HAction = { t: 'do'; a: Action; merge: boolean } | { t: 'undo' } | { t: 'redo' };

function hist(h: H, x: HAction): H {
  if (x.t === 'undo') {
    if (!h.past.length) return h;
    return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
  }
  if (x.t === 'redo') {
    if (!h.future.length) return h;
    return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
  }
  const next = reduce(h.present, x.a);
  if (next === h.present) return h;
  if (x.a.t === 'init' || x.a.t === 'reset') return { past: [], present: next, future: [] };
  const past = x.merge && h.past.length ? h.past : [...h.past, h.present].slice(-LIMIT);
  return { past, present: next, future: [] };
}

const Ctx = createContext<{ pad: Pad | null; d: Dispatch<Action>; undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }>(null as never);

export function PadProvider({ children }: { children: ReactNode }) {
  const [h, hd] = useReducer(hist, { past: [], present: null, future: [] });
  const last = useRef({ key: '', at: 0 });

  // Typing in the same cell / name within 0.8s counts as ONE undo step.
  const d = useCallback((a: Action) => {
    const key = a.t === 'cell' ? `cell:${a.id}:${a.i}`
      : a.t === 'text' ? `text:${a.id}:${a.k}`
      : a.t === 'col' ? `col:${a.i}:${Object.keys(a.p).join(',')}` : '';
    const now = Date.now();
    const merge = !!key && key === last.current.key && now - last.current.at < 800;
    last.current = { key, at: now };
    hd({ t: 'do', a, merge });
  }, []);
  const undo = useCallback(() => { last.current = { key: '', at: 0 }; hd({ t: 'undo' }); }, []);
  const redo = useCallback(() => { last.current = { key: '', at: 0 }; hd({ t: 'redo' }); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if ((e.target as HTMLElement | null)?.dataset?.nativeUndo) return; // let the description box keep its own text undo
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return (
    <Ctx.Provider value={{ pad: h.present, d, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 }}>
      {children}
    </Ctx.Provider>
  );
}
export const usePad = () => useContext(Ctx);