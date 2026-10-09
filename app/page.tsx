'use client';
import { useState } from 'react';
import { PadProvider, usePad } from '@/lib/store';
import PadView from '@/components/PadView';

const SIZES: [number, string][] = [[8, 'Small'], [12, 'Standard'], [14, 'Standard'], [16, 'Wide'], [18, 'Wide'], [22, 'Extra wide'], [24, 'Extra wide']];

function Setup() {
  const { d } = usePad();
  const [preset, setPreset] = useState(true);
  return (
    <div className="rise mx-auto max-w-3xl px-4 py-14">
      <h1 className="serif text-5xl text-[#3b2f26]">Accounting Pad</h1>
      <p className="mt-3 max-w-xl text-lg leading-relaxed text-[#6b5844]">Practice on a columnar pad. Describe a transaction in plain words and watch assets, liabilities and equity update. The checker tells you when something is off.</p>
      <h2 className="serif mt-10 text-2xl">Choose your pad</h2>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-[15px]">
        <input type="checkbox" checked={preset} onChange={e => setPreset(e.target.checked)} className="h-5 w-5 accent-[#c2602f]" />
        Start with sample accounts: Cash, Equipment, Supplies, Accounts Payable, Owner&apos;s Capital
      </label>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {SIZES.map(([n, label]) => (
          <button key={n} onClick={() => d({ t: 'init', size: n, preset })}
            className="group rounded-xl border-2 border-[#cdb98f] bg-[#fffaf1] p-4 text-left shadow-[0_2px_10px_rgba(120,90,50,0.10)] hover:-translate-y-0.5 hover:border-[#c2602f] hover:bg-[#c2602f] hover:text-white">
            <div className="flex h-10 overflow-hidden rounded-md border border-[#e6dac4] group-hover:border-white/50">
              {Array.from({ length: n }).map((_, i) => <span key={i} className="flex-1 border-r border-[#e6dac4] last:border-r-0 group-hover:border-white/50" />)}
            </div>
            <div className="hand mt-2 text-3xl leading-none">{n}</div>
            <div className="text-sm opacity-75">{label} &middot; up to {n} accounts</div>
          </button>
        ))}
      </div>
      <p className="mt-8 text-sm italic text-[#6b5844]">Nothing is saved. Closing the tab clears your pad.</p>
    </div>
  );
}

function App() {
  const { pad } = usePad();
  if (!pad) return <Setup />;

  return (
    <main className="mx-auto max-w-[110rem] space-y-4 p-4 sm:p-6">
      <PadView />
    </main>
  );
}

export default function Page() { return <PadProvider><App /></PadProvider>; }