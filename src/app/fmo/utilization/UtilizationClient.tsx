'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { fmtH, type Locale } from '@/lib/i18n';
import type { FmoEntry, FmoMember } from '@/lib/types';
import { ChartTimeFilter, initChartRange, type TimeRange } from '@/components/ChartTimeFilter';

type SortKey = 'name' | 'capUtil' | 'billUtil';

function UtilBadge({ pct }: { pct: number }) {
  const cls =
    pct >= 100 ? 'bg-green-50 text-green-700' :
    pct >= 80  ? 'bg-slate-100 text-slate-700' :
                 'bg-red-50 text-red-600';
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded tabular-nums ${cls}`}>
      {pct}%
    </span>
  );
}

function VsDelta({ delta, months }: { delta: number; months: number }) {
  if (months === 0) return <span className="text-xs text-slate-400">—</span>;
  const above = delta > 0;
  const cls = above ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700';
  return (
    <div className="text-right">
      <span className={`text-xs font-medium px-2 py-0.5 rounded tabular-nums ${cls}`}>
        {above ? '↑' : '↓'} {delta > 0 ? '+' : ''}{delta}%
      </span>
      <p className="text-[10px] text-slate-400 mt-0.5">{months}m avg</p>
    </div>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span className={`ml-1 text-[10px] ${active ? 'text-slate-700' : 'text-slate-300'}`}>
      {active ? (dir === 'desc' ? '↓' : '↑') : '↕'}
    </span>
  );
}

export default function UtilizationClient({
  entries,
  members,
}: {
  entries: FmoEntry[];
  members: Record<string, FmoMember>;
}) {
  const locale = useLocale() as Locale;
  const [range, setRange]     = useState<TimeRange>(() => initChartRange(entries));
  const [sort, setSort]       = useState<SortKey>('billUtil');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const rangedEntries = useMemo(
    () => range.from
      ? entries.filter(e => e.month >= range.from && e.month <= range.to)
      : entries,
    [entries, range],
  );

  // Per-member aggregation
  const memberStats = useMemo(() => {
    const byMember = new Map<string, Map<string, { total: number; billable: number; vacation: number }>>();
    for (const e of rangedEntries) {
      if (!byMember.has(e.user)) byMember.set(e.user, new Map());
      const byMonth = byMember.get(e.user)!;
      if (!byMonth.has(e.month)) byMonth.set(e.month, { total: 0, billable: 0, vacation: 0 });
      const m = byMonth.get(e.month)!;
      m.total    += e.spentTime;
      if (e.billingClass === 'V')      m.billable += e.spentTime;
      if (e.subCategory === 'absence') m.vacation += e.spentTime;
    }

    const result: Array<{
      member: FmoMember;
      avgCapUtil: number;
      avgBillUtil: number;
      avgBookedH: number;
      avgBillableH: number;
      monthCount: number;
    }> = [];

    for (const member of Object.values(members)) {
      const byMonth = byMember.get(member.name);
      if (!byMonth || byMonth.size === 0) continue;

      const cap        = member.monthlyCapacity       ?? 160;
      const billTarget = member.monthlyBillableTarget ?? 120;
      const isIntern   = member.type === 'intern';

      const monthly  = [...byMonth.values()];
      let sumCap = 0, sumBill = 0, sumBooked = 0, sumBillable = 0;

      for (const { total, billable, vacation } of monthly) {
        const trueBillable   = isIntern ? Math.max(0, billable - vacation) : billable;
        const effectiveBillT = isIntern ? Math.max(0, billTarget - vacation) : billTarget;
        sumCap     += cap > 0            ? (total        / cap)            * 100 : 0;
        sumBill    += effectiveBillT > 0 ? (trueBillable / effectiveBillT) * 100 : 0;
        sumBooked   += total;
        sumBillable += trueBillable;
      }

      const n = monthly.length;
      result.push({
        member,
        avgCapUtil:   Math.round(sumCap  / n),
        avgBillUtil:  Math.round(sumBill / n),
        avgBookedH:   Math.round(sumBooked   / n * 10) / 10,
        avgBillableH: Math.round(sumBillable / n * 10) / 10,
        monthCount: n,
      });
    }

    return result;
  }, [rangedEntries, members]);

  const teamAvgCapUtil  = useMemo(() => {
    if (!memberStats.length) return 0;
    return Math.round(memberStats.reduce((s, r) => s + r.avgCapUtil, 0)  / memberStats.length);
  }, [memberStats]);

  const teamAvgBillUtil = useMemo(() => {
    if (!memberStats.length) return 0;
    return Math.round(memberStats.reduce((s, r) => s + r.avgBillUtil, 0) / memberStats.length);
  }, [memberStats]);

  const rows = useMemo(() => {
    return [...memberStats].sort((a, b) => {
      let cmp = 0;
      if (sort === 'name')     cmp = a.member.name.localeCompare(b.member.name);
      if (sort === 'capUtil')  cmp = a.avgCapUtil  - b.avgCapUtil;
      if (sort === 'billUtil') cmp = a.avgBillUtil - b.avgBillUtil;
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [memberStats, sort, sortDir]);

  function toggleSort(col: SortKey) {
    if (sort === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSort(col); setSortDir('desc'); }
  }

  const atCap  = rows.filter(r => r.avgCapUtil  >= 100).length;
  const atBill = rows.filter(r => r.avgBillUtil >= 100).length;

  if (entries.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-4">Team Utilization</h1>
        <p className="text-slate-400">No data imported yet.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team Utilization</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {rows.filter(r => r.member.type === 'intern').length} intern ·{' '}
            {rows.filter(r => r.member.type === 'extern').length} extern
          </p>
        </div>
      </div>

      <ChartTimeFilter value={range} onChange={setRange} />

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Team Avg Capacity Util.',  value: `${teamAvgCapUtil}%` },
          { label: 'Team Avg Billable Util.',   value: `${teamAvgBillUtil}%` },
          { label: 'Members ≥ Capacity',        value: `${atCap} / ${rows.length}` },
          { label: 'Members ≥ Billable Target', value: `${atBill} / ${rows.length}` },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-400 mb-1">{k.label}</p>
            <p className="text-xl font-bold text-slate-800">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Leaderboard */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-medium">
            <tr>
              <th className="px-4 py-3 text-left cursor-pointer select-none" onClick={() => toggleSort('name')}>
                Member <SortIcon active={sort === 'name'} dir={sortDir} />
              </th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-right">Capacity</th>
              <th className="px-4 py-3 text-right">Avg Booked</th>
              <th className="px-4 py-3 text-right cursor-pointer select-none" onClick={() => toggleSort('capUtil')}>
                Cap Util <SortIcon active={sort === 'capUtil'} dir={sortDir} />
              </th>
              <th className="px-4 py-3 text-right">Bill. Target</th>
              <th className="px-4 py-3 text-right">Avg Billable</th>
              <th className="px-4 py-3 text-right cursor-pointer select-none" onClick={() => toggleSort('billUtil')}>
                Bill Util <SortIcon active={sort === 'billUtil'} dir={sortDir} />
              </th>
              <th className="px-4 py-3 text-right">vs Team Avg</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ member, avgCapUtil, avgBillUtil, avgBookedH, avgBillableH, monthCount }) => {
              const delta      = avgBillUtil - teamAvgBillUtil;
              const cap        = member.monthlyCapacity       ?? 160;
              const billTarget = member.monthlyBillableTarget ?? 120;
              return (
                <tr key={member.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <Link href={`/fmo/members/${member.id}`} className="hover:text-indigo-600 hover:underline">
                      {member.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      member.type === 'intern'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-orange-100 text-orange-800'
                    }`}>
                      {member.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400 text-xs tabular-nums">{cap}h</td>
                  <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{fmtH(avgBookedH, locale)}</td>
                  <td className="px-4 py-3 text-right"><UtilBadge pct={avgCapUtil} /></td>
                  <td className="px-4 py-3 text-right text-slate-400 text-xs tabular-nums">{billTarget}h</td>
                  <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{fmtH(avgBillableH, locale)}</td>
                  <td className="px-4 py-3 text-right"><UtilBadge pct={avgBillUtil} /></td>
                  <td className="px-4 py-3 text-right">
                    <VsDelta delta={Math.round(delta)} months={monthCount} />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  No data for this period.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-xs font-semibold">
              <tr>
                <td className="px-4 py-2.5 text-slate-700">Team Average</td>
                <td colSpan={3} />
                <td className="px-4 py-2.5 text-right"><UtilBadge pct={teamAvgCapUtil} /></td>
                <td colSpan={2} />
                <td className="px-4 py-2.5 text-right"><UtilBadge pct={teamAvgBillUtil} /></td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
