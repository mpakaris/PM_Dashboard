'use client';

import { useState } from 'react';

export type TimeRange = { from: string; to: string };

function monthOffset(n: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const PRESETS = [
  { key: '3m',  label: 'Last 3M',  offset: -3 },
  { key: '6m',  label: 'Last 6M',  offset: -6 },
  { key: '12m', label: 'Last 12M', offset: -12 },
] as const;

type Preset = typeof PRESETS[number]['key'] | null;

export function ChartTimeFilter({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (r: TimeRange) => void;
}) {
  const [active, setActive] = useState<Preset>(null);

  function applyPreset(key: Preset, offset: number) {
    setActive(key);
    onChange({ from: monthOffset(offset), to: monthOffset(-1) });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs text-slate-400 shrink-0">Period</span>
      <div className="flex gap-1">
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => applyPreset(p.key, p.offset)}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
              active === p.key
                ? 'bg-slate-800 text-white border-slate-800'
                : 'text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="month"
          value={value.from}
          onChange={e => { setActive(null); onChange({ ...value, from: e.target.value }); }}
          className="border border-slate-200 rounded px-2 py-1 text-xs text-slate-600 focus:outline-none focus:border-slate-400"
        />
        <span className="text-slate-300 text-xs">→</span>
        <input
          type="month"
          value={value.to}
          min={value.from}
          onChange={e => { setActive(null); onChange({ ...value, to: e.target.value }); }}
          className="border border-slate-200 rounded px-2 py-1 text-xs text-slate-600 focus:outline-none focus:border-slate-400"
        />
      </div>
    </div>
  );
}

export function initChartRange(entries: { month: string }[]): TimeRange {
  if (!entries.length) return { from: '', to: '' };
  const months = entries.map(e => e.month).sort();
  return { from: months[0], to: months[months.length - 1] };
}
