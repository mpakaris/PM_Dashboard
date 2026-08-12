'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { fmtH, type Locale } from '@/lib/i18n';
import type { FmoMember, FmoEntry, WbsSubCategory } from '@/lib/types';
import { updateFmoMember } from '@/actions/fmo';
import { ChartTimeFilter, initChartRange, type TimeRange } from '@/components/ChartTimeFilter';

type Tab = 'profile' | 'tickets' | 'charts';

const COLORS = ['#6366f1','#22c55e','#f97316','#3b82f6','#a855f7','#eab308','#ef4444','#64748b','#06b6d4','#ec4899'];

function fmtEur(v: number) {
  return v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}

const SUB_COLORS: Record<string, string> = {
  V:'#22c55e', admin:'#64748b', presales:'#3b82f6', opm:'#f97316',
  portfolio:'#a855f7', training:'#eab308', absence:'#ef4444', unmapped:'#fb7185',
};

function getColor(subCategory: string | null, billingClass: string | null) {
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

  const [activeTab, setActiveTab] = useState<Tab>('tickets');
  const [chartRange, setChartRange] = useState<TimeRange>(() => initChartRange(entries));
  const [type, setType]           = useState(member.type);
  const [company, setCompany]     = useState(member.partnerCompany);
  const [costRate, setCostRate]   = useState(String(member.costRate));
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState('');

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

  // ── Derived data ─────────────────────────────────────────────────────────

  const totalHours = useMemo(() => entries.reduce((s, e) => s + e.spentTime, 0), [entries]);

  const chartEntries = useMemo(
    () => chartRange.from
      ? entries.filter(e => e.month >= chartRange.from && e.month <= chartRange.to)
      : entries,
    [entries, chartRange],
  );

  const ticketSummary = useMemo(() => {
    const map = new Map<number | string, { name: string; wbsCode: string | null; billingClass: string | null; subCategory: string | null; hours: number }>();
    for (const e of entries) {
      const key = e.ticketId ?? e.ticketName;
      const ex = map.get(key);
      if (ex) { ex.hours += e.spentTime; }
      else map.set(key, { name: e.ticketName, wbsCode: e.wbsCode, billingClass: e.billingClass, subCategory: e.subCategory, hours: e.spentTime });
    }
    return [...map.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.hours - a.hours);
  }, [entries]);

  // For bar chart: category/month
  const { chartData, categories } = useMemo(() => {
    const monthMap = new Map<string, Map<string, number>>();
    const catSet = new Set<string>();
    for (const e of chartEntries) {
      if (!monthMap.has(e.month)) monthMap.set(e.month, new Map());
      const key = e.billingClass === 'V' ? 'V' : (e.subCategory ?? 'unmapped');
      catSet.add(key);
      const m = monthMap.get(e.month)!;
      m.set(key, (m.get(key) ?? 0) + e.spentTime);
    }
    const months = [...monthMap.keys()].sort();
    const cats = [...catSet];
    const data = months.map(month => {
      const row: Record<string, any> = { month: month.slice(0, 7) };
      const m = monthMap.get(month)!;
      for (const cat of cats) row[cat] = m.get(cat) ?? 0;
      return row;
    });
    return { chartData: data, categories: cats };
  }, [chartEntries]);

  // For pie: billable vs internal total
  const billablePie = useMemo(() => {
    let billable = 0, internal = 0;
    for (const e of chartEntries) {
      if (e.billingClass === 'V') billable += e.spentTime;
      else internal += e.spentTime;
    }
    return [
      { name: tUtil('billable'), value: billable, color: '#22c55e' },
      { name: tUtil('internal'), value: internal, color: '#64748b' },
    ].filter(d => d.value > 0);
  }, [chartEntries, tUtil]);

  // Top tickets chart (horizontal bar) — derived from chartEntries
  const topTicketsChart = useMemo(() => {
    const map = new Map<number | string, { name: string; hours: number }>();
    for (const e of chartEntries) {
      const key = e.ticketId ?? e.ticketName;
      const ex = map.get(key);
      if (ex) ex.hours += e.spentTime;
      else map.set(key, { name: e.ticketName, hours: e.spentTime });
    }
    return [...map.values()]
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10)
      .map((t, i) => ({
        name: t.name.length > 35 ? t.name.slice(0, 35) + '…' : t.name,
        hours: t.hours,
        fill: COLORS[i % COLORS.length],
      }));
  }, [chartEntries]);

  const getLabel = (subCategory: string | null, billingClass: string | null) => {
    if (billingClass === 'V') return tUtil('billable');
    if (subCategory) return subCategories[subCategory]?.label ?? subCategory;
    return tUtil('unmapped');
  };

  const dateRange = useMemo(() => {
    if (!entries.length) return null;
    const dates = entries.map(e => e.date).sort();
    return { from: dates[0], to: dates[dates.length - 1] };
  }, [entries]);

  const TABS: { id: Tab; label: string }[] = [
    { id: 'tickets', label: 'Tickets' },
    { id: 'charts',  label: 'Charts' },
    { id: 'profile', label: t('profile') },
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/fmo/members" className="text-slate-400 hover:text-slate-700 text-sm">{t('backLink')}</Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-2xl font-bold text-slate-900">{member.name}</h1>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${member.type === 'intern' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>
          {member.type === 'intern' ? t('intern') : t('extern')}
        </span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('totalHours'), value: fmtH(totalHours, locale) },
          { label: 'Tickets', value: String(ticketSummary.length) },
          { label: tUtil('billable'), value: fmtH(entries.filter(e => e.billingClass === 'V').reduce((s, e) => s + e.spentTime, 0), locale) },
          { label: 'Internal', value: fmtH(entries.filter(e => e.billingClass !== 'V').reduce((s, e) => s + e.spentTime, 0), locale) },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-400 mb-1">{kpi.label}</p>
            <p className="text-xl font-bold text-slate-800">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-slate-700 text-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tickets Tab ── */}
      {activeTab === 'tickets' && (
        <div className="space-y-3">
          {dateRange && (
            <p className="text-xs text-slate-400">
              {dateRange.from} → {dateRange.to}
            </p>
          )}
          {entries.length === 0 ? (
            <p className="text-slate-400 text-sm">{t('noData')}</p>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-medium">
                  <tr>
                    <th className="px-4 py-3 text-left">Ticket</th>
                    <th className="px-4 py-3 text-left">WBS</th>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-right">{t('totalHours')}</th>
                    <th className="px-4 py-3 text-right">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {ticketSummary.map(tk => (
                    <tr key={String(tk.id)} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {typeof tk.id === 'number' && (
                            <Link
                              href={`/fmo/tickets/${tk.id}`}
                              className="font-mono text-xs text-indigo-600 hover:text-indigo-800 shrink-0"
                            >
                              #{tk.id}
                            </Link>
                          )}
                          <span className="text-slate-700 truncate max-w-xs" title={tk.name}>{tk.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{tk.wbsCode ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                          style={{ background: getColor(tk.subCategory, tk.billingClass) + '20', color: getColor(tk.subCategory, tk.billingClass) }}>
                          {getLabel(tk.subCategory, tk.billingClass)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{fmtH(tk.hours, locale)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-400 text-xs">
                        {totalHours > 0 ? `${Math.round((tk.hours / totalHours) * 100)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                  <tr>
                    <td colSpan={3} className="px-4 py-2.5 font-medium text-slate-700">{tCommon('total')}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-800">{fmtH(totalHours, locale)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500 text-xs">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Charts Tab ── */}
      {activeTab === 'charts' && entries.length > 0 && (
        <div className="space-y-6">
          <ChartTimeFilter value={chartRange} onChange={setChartRange} />
          {/* Hours by Category per Month */}
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">{t('chartTitle')}</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => typeof v === 'number' ? fmtH(v, locale) : v} />
                <Legend />
                {categories.map(cat => (
                  <Bar key={cat} dataKey={cat} stackId="a"
                    fill={getColor(cat === 'V' ? null : cat, cat === 'V' ? 'V' : 'I')}
                    name={getLabel(cat === 'V' ? null : cat, cat === 'V' ? 'V' : 'I')}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Billable vs Internal Pie */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Billable vs Internal</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={billablePie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                    label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}>
                    {billablePie.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => typeof v === 'number' ? fmtH(v, locale) : v} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Top Tickets */}
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Top Tickets by Hours</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topTicketsChart} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={140} />
                  <Tooltip formatter={(v) => typeof v === 'number' ? fmtH(v, locale) : v} />
                  <Bar dataKey="hours" radius={[0, 3, 3, 0]}>
                    {topTicketsChart.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── Profile Tab ── */}
      {activeTab === 'profile' && (
        <form onSubmit={save} className="bg-white rounded-lg border border-slate-200 p-4 space-y-4 max-w-lg">
          <h2 className="font-semibold text-slate-700">{t('profile')}</h2>
          <div className="flex items-center gap-4">
            <label className="text-sm text-slate-600">{t('type')}</label>
            <div className="flex gap-3">
              {(['intern', 'extern'] as const).map(tp => (
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
              <input value={company} onChange={e => setCompany(e.target.value)}
                className="border border-slate-300 rounded px-3 py-1.5 text-sm w-64"
                placeholder={t('companyPlaceholder')} />
            </div>
          )}
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t('costRate')}</label>
            <input type="number" min="0" step="0.01" value={costRate}
              onChange={e => setCostRate(e.target.value)}
              className="border border-slate-300 rounded px-3 py-1.5 text-sm w-32" />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-slate-800 text-white text-sm rounded hover:bg-slate-700 disabled:opacity-50">
              {saving ? tCommon('saving') : tCommon('save')}
            </button>
            {saved && <span className="text-sm text-green-600">{tCommon('success')}</span>}
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </form>
      )}
    </div>
  );
}
