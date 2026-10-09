export type AcctType = 'asset' | 'liability' | 'equity';
export type Col = { name: string; type: AcctType };
export type Row = { id: string; date: string; desc: string; vals: number[] };
export type Pad = { size: number; cols: Col[]; rows: Row[] };
// amount = signed change to that account's balance (+ increases, - decreases)
export type Entry = { account: string; type: AcctType; amount: number };