'use client';
import { useState, useEffect } from 'react';
import { usePad } from '@/lib/store';

export default function SideMenu() {
  const { pad, d, undo, redo, canUndo, canRedo } = usePad();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  if (!pad) return null;
  const close = () => setOpen(false);
  const item = 'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[15px] font-medium text-[#3b2f26] hover:bg-[#f4ecd8] disabled:opacity-40 disabled:hover:bg-transparent';
  const keys = 'text-xs font-normal text-[#6b5844]';

  return (
    <div className="contents">
      <button type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}
        className="fixed left-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-[#cdb98f] bg-[#fffaf1] text-[#3b2f26] shadow-sm hover:bg-[#f4ecd8]">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 5h14M3 10h14M3 15h14" />
        </svg>
      </button>

      <div onClick={close} aria-hidden="true"
        className={`fixed inset-0 z-[60] bg-[#3b2f26]/30 transition-opacity duration-300 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} />

      <aside aria-label="Menu" aria-hidden={!open}
        className={`fixed left-0 top-0 z-[70] flex h-full w-72 max-w-[85vw] flex-col border-r border-[#cdb98f] bg-[#fffaf1] shadow-[8px_0_30px_rgba(90,36,29,0.25)] transition-[transform,visibility] duration-300 ease-out ${open ? 'translate-x-0' : '-translate-x-full invisible'}`}>
        <div className="flex items-center justify-between border-b border-[#e6dac4] px-4 py-3">
          <div>
            <p className="text-lg font-semibold text-[#3b2f26]">Menu</p>
            <p className="text-xs text-[#6b5844]">{pad.size}-column pad &middot; {pad.rows.length} {pad.rows.length === 1 ? 'row' : 'rows'}</p>
          </div>
          <button type="button" aria-label="Close menu" onClick={close}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-xl leading-none text-[#6b5844] hover:bg-[#f4ecd8]">&times;</button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          <button className={item} disabled={!canUndo} onClick={undo}>Undo <span className={keys}>Ctrl+Z</span></button>
          <button className={item} disabled={!canRedo} onClick={redo}>Redo <span className={keys}>Ctrl+Y</span></button>
          <div className="my-2 border-t border-[#e6dac4]" />
          <button className={item} onClick={() => { d({ t: 'blank' }); close(); }}>Add blank row</button>
          <button className={item} disabled={pad.rows.length === 0}
            onClick={() => { if (confirm('Remove all rows? Column names are kept.')) { d({ t: 'clear' }); close(); } }}>Clear all rows</button>
        </nav>

        <div className="border-t border-[#e6dac4] p-2">
          <button className={`${item} text-[#b3402f] hover:bg-[#f6dcd3]`}
            onClick={() => { if (confirm('Clear the pad and start over?')) { close(); d({ t: 'reset' }); } }}>Start over</button>
        </div>
      </aside>
    </div>
  );
}