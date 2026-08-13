'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export type TimeRange = { from: string; to: string };

function monthOffset(n: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentYearRange(): TimeRange {
  const now  = new Date();
  const year = now.getFullYear();
  const mo   = String(now.getMonth() + 1).padStart(2, '0');
  return { from: `${year}-01`, to: `${year}-${mo}` };
}

type PresetKey = 'ytd' | '3m' | '6m' | '12m' | 'all';

export function ChartTimeFilter({
  value,
  onChange,
  defaultPreset = 'ytd',
}: {
  value: TimeRange;
  defaultRange?: TimeRange; // kept for call-site compatibility
  onChange: (r: TimeRange) => void;
  defaultPreset?: PresetKey;
}) {
  const t = useTranslations('charts');
  const [active, setActive] = useState<PresetKey | null>(defaultPreset);

  const PRESETS: { key: PresetKey; label: string; getRange: () => TimeRange }[] = [
    { key: 'ytd', label: t('thisYear'), getRange: currentYearRange },
    { key: '3m',  label: t('last3m'),   getRange: () => ({ from: monthOffset(-3),  to: monthOffset(0) }) },
    { key: '6m',  label: t('last6m'),   getRange: () => ({ from: monthOffset(-6),  to: monthOffset(0) }) },
    { key: '12m', label: t('last12m'),  getRange: () => ({ from: monthOffset(-12), to: monthOffset(0) }) },
    { key: 'all', label: t('allTime'),  getRange: () => ({ from: '', to: '' }) },
  ];

  function applyPreset(p: typeof PRESETS[number]) {
    setActive(p.key);
    onChange(p.getRange());
  }

  const isCustom = active === null;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs text-slate-400 shrink-0">{t('period')}</span>
      <div className="flex gap-1">
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => applyPreset(p)}
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
      {/* Custom date pickers — hidden when All Time is active */}
      {active !== 'all' && (
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
      )}
      {isCustom && (
        <button
          onClick={() => applyPreset(PRESETS[0])}
          className="text-xs text-slate-400 hover:text-slate-700 underline underline-offset-2 transition-colors"
        >
          {t('resetToYear')}
        </button>
      )}
    </div>
  );
}

export function initChartRange(entries: { month: string }[]): TimeRange {
  const ytd = currentYearRange();
  if (!entries.length) return ytd;
  const hasCurrentYearData = entries.some(e => e.month >= ytd.from);
  if (hasCurrentYearData) return ytd;
  const months = [...entries.map(e => e.month)].sort();
  return { from: months[0], to: months[months.length - 1] };
}
