'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import { fmtH, type Locale } from '@/lib/i18n';
import type { FmoTicket, FmoEntry, FmoMember, FmoWbsEntry } from '@/lib/types';
import { ChartTimeFilter, initChartRange, type TimeRange } from '@/components/ChartTimeFilter';
import { SortableTh } from '@/components/SortableTh';

const COLORS = [
  '#4338ca', '#0f766e', '#c2410c', '#1d4ed8',
  '#7c3aed', '#a16207', '#b91c1c', '#475569', '#0e7490', '#9d174d',
];

const TOOLTIP_STYLE = {
  contentStyle: { fontSize: 12, borderRadius: 6, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,.06)' },
};

export default function TicketDetailClient({
  ticket,
  entries,
  members,
  wbs,
}: {
  ticket: FmoTicket;
  entries: FmoEntry[];
  members: Record<string, FmoMember>;
  wbs: Record<string, FmoWbsEntry>;
}) {
  const locale = useLocale() as Locale;

  const [chartRange, setChartRange] = useState<TimeRange>(() => initChartRange(entries));
  const [memberSk, setMemberSk] = useState<'name' | 'hours' | 'pct'>('hours');
  const [memberSd, setMemberSd] = useState<'asc' | 'desc'>('desc');
  function onMemberSort(col: string) {
    const k = col as typeof memberSk;
    if (memberSk === k) setMemberSd(d => d === 'desc' ? 'asc' : 'desc');
    else { setMemberSk(k); setMemberSd(k === 'name' ? 'asc' : 'desc'); }
  }

  const chartEntries = useMemo(
    () => chartRange.from
      ? entries.filter(e => e.month >= chartRange.from && e.month <= chartRange.to)
      : entries,
    [entries, chartRange],
  );

  const totalHours = useMemo(() => entries.reduce((s, e) => s + e.spentTime, 0), [entries]);

  // Hours per member
  const memberSummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) map.set(e.user, (map.get(e.user) ?? 0) + e.spentTime);
    return [...map.entries()]
      .map(([name, hours]) => ({ name, hours }))
      .sort((a, b) => b.hours - a.hours);
  }, [entries]);

  const sortedMemberSummary = useMemo(() =>
    [...memberSummary].sort((a, b) => {
      let cmp = 0;
      if      (memberSk === 'name')  cmp = a.name.localeCompare(b.name);
      else if (memberSk === 'hours') cmp = a.hours - b.hours;
      else if (memberSk === 'pct')   cmp = a.hours - b.hours;
      return memberSd === 'desc' ? -cmp : cmp;
    }),
  [memberSummary, memberSk, memberSd]);

  // Hours per month, stacked by member (top 5 only for chart clarity)
  const topMembers = useMemo(() => memberSummary.slice(0, 5).map(m => m.name), [memberSummary]);

  const monthlyData = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const e of chartEntries) {
      if (!map.has(e.month)) map.set(e.month, new Map());
      const m = map.get(e.month)!;
      m.set(e.user, (m.get(e.user) ?? 0) + e.spentTime);
    }
    return [...map.entries()].sort().map(([month, byUser]) => {
      const row: Record<string, any> = { month: month.slice(0, 7) };
      for (const name of topMembers) row[name] = byUser.get(name) ?? 0;
      row['others'] = [...byUser.entries()]
        .filter(([n]) => !topMembers.includes(n))
        .reduce((s, [, h]) => s + h, 0);
      return row;
    });
  }, [chartEntries, topMembers]);

  // Cumulative hours over time
  const cumulativeData = useMemo(() => {
    let cum = 0;
    return monthlyData.map(d => {
      const monthTotal = topMembers.reduce((s, n) => s + (d[n] ?? 0), 0) + (d['others'] ?? 0);
      cum += monthTotal;
      return { month: d.month, total: monthTotal, cumulative: cum };
    });
  }, [monthlyData, topMembers]);

  const dateRange = useMemo(() => {
    if (!entries.length) return null;
    const dates = entries.map(e => e.date).sort();
    return { from: dates[0], to: dates[dates.length - 1] };
  }, [entries]);

  const wbsEntry = ticket.wbsCode ? wbs[ticket.wbsCode] : null;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link href="/fmo/tickets" className="text-slate-400 hover:text-slate-600 text-sm">← Tickets</Link>
          <span className="text-slate-300">/</span>
          <span className="font-mono text-slate-500">#{ticket.id}</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{ticket.name}</h1>
        <p className="text-sm text-slate-500 mt-1">{ticket.project}</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Hours', value: fmtH(totalHours, locale) },
          { label: 'Team Members', value: String(memberSummary.length) },
          { label: 'WBS', value: ticket.wbsCode ?? '—' },
          { label: 'Period', value: dateRange ? `${dateRange.from.slice(0,7)} → ${dateRange.to.slice(0,7)}` : '—' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-400 mb-1">{kpi.label}</p>
            <p className={`font-bold text-slate-800 ${kpi.label === 'WBS' ? 'text-xs font-mono' : 'text-xl'}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* WBS info */}
      {wbsEntry && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 text-sm">
          <span className="font-medium text-indigo-800">{wbsEntry.label}</span>
          <span className="mx-2 text-indigo-300">·</span>
          <span className="text-indigo-600">{ticket.billingClass === 'V' ? 'Billable' : 'Internal'}</span>
          {ticket.subCategory && (
            <>
              <span className="mx-2 text-indigo-300">·</span>
              <span className="text-indigo-600">{ticket.subCategory}</span>
            </>
          )}
        </div>
      )}

      <ChartTimeFilter value={chartRange} defaultRange={initChartRange(entries)} onChange={setChartRange} />

      <div className="space-y-6">
        {/* Members table */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">Hours by Team Member</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <SortableTh col="name"  label="Member" sortKey={memberSk} sortDir={memberSd} onSort={onMemberSort} />
                <SortableTh col="hours" label="Hours"  sortKey={memberSk} sortDir={memberSd} onSort={onMemberSort} right />
                <SortableTh col="pct"   label="%"      sortKey={memberSk} sortDir={memberSd} onSort={onMemberSort} right />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sortedMemberSummary.map(({ name, hours }, i) => {
                const memberObj = Object.values(members).find(m => m.name === name);
                return (
                  <tr key={name} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        {memberObj ? (
                          <Link href={`/fmo/members/${memberObj.id}`} className="text-indigo-600 hover:text-indigo-800">{name}</Link>
                        ) : (
                          <span className="text-slate-700">{name}</span>
                        )}
                        {memberObj && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${memberObj.type === 'intern' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}`}>
                            {memberObj.type}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-700">{fmtH(hours, locale)}</td>
                    <td className="px-4 py-2 text-right text-slate-400 text-xs">
                      {totalHours > 0 ? `${Math.round((hours / totalHours) * 100)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td className="px-4 py-2 font-medium text-slate-700">Total</td>
                <td className="px-4 py-2 text-right font-bold text-slate-800">{fmtH(totalHours, locale)}</td>
                <td className="px-4 py-2 text-right text-slate-500 text-xs">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Cumulative line chart */}
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Cumulative Hours</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={cumulativeData} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}h`} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v) => typeof v === 'number' ? fmtH(v, locale) : v} />
              <Line type="monotone" dataKey="cumulative" stroke="#4338ca" strokeWidth={2} dot={{ r: 3 }} name="Cumulative" />
              <Bar dataKey="total" fill="#dde1ff" name="Monthly" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly stacked bar */}
      {monthlyData.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Monthly Breakdown by Member</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}h`} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v) => typeof v === 'number' ? fmtH(v, locale) : v} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              {topMembers.map((name, i) => (
                <Bar key={name} dataKey={name} stackId="a" fill={COLORS[i % COLORS.length]} opacity={0.88} />
              ))}
              {monthlyData.some(d => (d['others'] ?? 0) > 0) && (
                <Bar dataKey="others" stackId="a" fill="#cbd5e1" name="Others" />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {entries.length === 0 && (
        <div className="bg-white rounded-lg border border-slate-200 px-4 py-12 text-center text-slate-400">
          No time entries for this ticket yet. Import a CSV to see data.
        </div>
      )}
    </div>
  );
}
