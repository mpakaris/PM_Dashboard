'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { fmtH, type Locale } from '@/lib/i18n';
import type { FmoMember, FmoEntry, WbsSubCategory } from '@/lib/types';
import { updateFmoMember } from '@/actions/fmo';

const SUB_COLORS: Record<string, string> = {
  V:         '#22c55e',
  admin:     '#64748b',
  presales:  '#3b82f6',
  opm:       '#f97316',
  portfolio: '#a855f7',
  training:  '#eab308',
  absence:   '#ef4444',
  unmapped:  '#fb7185',
};

function getColor(subCategory: string | null, billingClass: string | null): string {
  if (billingClass === 'V') return SUB_COLORS['V'];
  if (subCategory && SUB_COLORS[subCategory]) return SUB_COLORS[subCategory];
  return SUB_COLORS['unmapped'];
}

export default function MemberDetailClient({
  member,
  entries,
  subCategories,
}: {
  member: FmoMember;
  entries: FmoEntry[];
  subCategories: Record<string, WbsSubCategory>;
}) {
  const t = useTranslations('members');
  const tCommon = useTranslations('common');
  const tUtil = useTranslations('utilization');
  const locale = useLocale() as Locale;

  const [type, setType]     = useState(member.type);
  const [company, setCompany] = useState(member.partnerCompany);
  const [costRate, setCostRate] = useState(String(member.costRate));
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaved(false); setError('');
    const r = await updateFmoMember(member.id, {
      type,
      partnerCompany: type === 'extern' ? company : '',
      costRate: parseFloat(costRate) || 0,
    });
    setSaving(false);
    if (r.ok) setSaved(true);
    else setError(r.error ?? tCommon('error'));
  }

  function getLabel(subCategory: string | null, billingClass: string | null): string {
    if (billingClass === 'V') return tUtil('billable');
    if (subCategory) return subCategories[subCategory]?.label ?? subCategory;
    return tUtil('unmapped');
  }

  const { chartData, categories } = useMemo(() => {
    const monthMap = new Map<string, Map<string, number>>();
    const catSet   = new Set<string>();
    for (const e of entries) {
      if (!monthMap.has(e.month)) monthMap.set(e.month, new Map());
      const key = e.billingClass === 'V' ? 'V' : (e.subCategory ?? 'unmapped');
      catSet.add(key);
      const m = monthMap.get(e.month)!;
      m.set(key, (m.get(key) ?? 0) + e.spentTime);
    }
    const months = [...monthMap.keys()].sort();
    const cats   = [...catSet];
    const data = months.map((month) => {
      const row: Record<string, any> = { month: month.slice(0, 7) };
      const m = monthMap.get(month)!;
      for (const cat of cats) row[cat] = m.get(cat) ?? 0;
      return row;
    });
    return { chartData: data, categories: cats };
  }, [entries]);

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/fmo/members" className="text-slate-400 hover:text-slate-700 text-sm">{t('backLink')}</Link>
        <h1 className="text-2xl font-bold text-slate-900">{member.name}</h1>
      </div>

      <form onSubmit={save} className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
        <h2 className="font-semibold text-slate-700">{t('profile')}</h2>

        <div className="flex items-center gap-4">
          <label className="text-sm text-slate-600">{t('type')}</label>
          <div className="flex gap-3">
            {(['intern', 'extern'] as const).map((tp) => (
              <label key={tp} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" name="type" value={tp} checked={type === tp} onChange={() => setType(tp)} />
                <span>{tp === 'intern' ? t('intern') : t('extern')}</span>
              </label>
            ))}
          </div>
        </div>

        {type === 'extern' && (
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t('partnerCompany')}</label>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="border border-slate-300 rounded px-3 py-1.5 text-sm w-64"
              placeholder={t('companyPlaceholder')}
            />
          </div>
        )}

        <div>
          <label className="block text-sm text-slate-600 mb-1">{t('costRate')}</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={costRate}
            onChange={(e) => setCostRate(e.target.value)}
            className="border border-slate-300 rounded px-3 py-1.5 text-sm w-32"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-slate-800 text-white text-sm rounded hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? tCommon('saving') : tCommon('save')}
          </button>
          {saved  && <span className="text-sm text-green-600">{tCommon('success')}</span>}
          {error  && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </form>

      {entries.length === 0 ? (
        <p className="text-slate-400 text-sm">{t('noData')}</p>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
          <h2 className="font-semibold text-slate-700">{t('chartTitle')}</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => typeof v === 'number' ? fmtH(v, locale) : v} />
              <Legend />
              {categories.map((cat) => (
                <Bar
                  key={cat}
                  dataKey={cat}
                  stackId="a"
                  fill={getColor(cat === 'V' ? null : cat, cat === 'V' ? 'V' : 'I')}
                  name={getLabel(cat === 'V' ? null : cat, cat === 'V' ? 'V' : 'I')}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>

          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-1.5 text-left font-medium text-slate-600">{t('category')}</th>
                  {chartData.map((d) => (
                    <th key={d.month} className="py-1.5 px-2 text-right font-medium text-slate-600">{d.month.slice(5)}</th>
                  ))}
                  <th className="py-1.5 px-2 text-right font-medium text-slate-600">{tCommon('total')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {categories.map((cat) => {
                  const total = chartData.reduce((s, d) => s + (d[cat] ?? 0), 0);
                  return (
                    <tr key={cat}>
                      <td className="py-1 text-slate-700">{getLabel(cat === 'V' ? null : cat, cat === 'V' ? 'V' : 'I')}</td>
                      {chartData.map((d) => (
                        <td key={d.month} className="py-1 px-2 text-right text-slate-600">{fmtH(d[cat] ?? 0, locale)}</td>
                      ))}
                      <td className="py-1 px-2 text-right font-medium text-slate-800">{fmtH(total, locale)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
