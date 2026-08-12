'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { fmtH, type Locale } from '@/lib/i18n';
import type { FmoEntry, FmoMember, WbsSubCategory } from '@/lib/types';

type Tab = 'hours' | 'percent' | 'unmapped';

// ─── Aggregation ──────────────────────────────────────────────────────────────

function buildPivot(
  entries: FmoEntry[],
  members: Record<string, FmoMember>,
  months: string[]
) {
  // { memberName → { month → { catKey → hours } } }
  const pivot = new Map<string, Map<string, Map<string, number>>>();

  for (const e of entries) {
    const catKey = e.billingClass === 'V' ? 'V' : (e.subCategory ?? 'unmapped');
    if (!pivot.has(e.user)) pivot.set(e.user, new Map());
    const byMonth = pivot.get(e.user)!;
    if (!byMonth.has(e.month)) byMonth.set(e.month, new Map());
    const byCat = byMonth.get(e.month)!;
    byCat.set(catKey, (byCat.get(catKey) ?? 0) + e.spentTime);
  }

  return pivot;
}

// ─── Label / colour helpers ───────────────────────────────────────────────────

const CAT_ORDER = ['V', 'admin', 'presales', 'opm', 'portfolio', 'training', 'absence', 'unmapped'];

function catLabel(key: string, subCategories: Record<string, WbsSubCategory>, billableLabel: string) {
  if (key === 'V') return billableLabel;
  return subCategories[key]?.label ?? key;
}

function sortCats(cats: string[]) {
  return [...cats].sort((a, b) => {
    const ia = CAT_ORDER.indexOf(a);
    const ib = CAT_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

// ─── Table cell ───────────────────────────────────────────────────────────────

function Cell({ value, mode }: { value: number; mode: Tab }) {
  const locale = useLocale() as Locale;
  function fmt(v: number) {
    return v.toLocaleString(locale === 'de' ? 'de-DE' : 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  if (mode === 'percent') {
    if (value === 0) return <td className="px-3 py-1.5 text-right text-slate-400 text-xs">—</td>;
    return <td className="px-3 py-1.5 text-right text-xs text-slate-700">{fmt(value * 100)} %</td>;
  }
  if (value === 0) return <td className="px-3 py-1.5 text-right text-slate-400 text-xs">—</td>;
  return <td className="px-3 py-1.5 text-right text-xs text-slate-700">{fmt(value)}</td>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function UtilizationClient({
  entries,
  members,
  subCategories,
}: {
  entries: FmoEntry[];
  members: Record<string, FmoMember>;
  subCategories: Record<string, WbsSubCategory>;
}) {
  const t = useTranslations('utilization');
  const tMembers = useTranslations('members');
  const tCommon = useTranslations('common');
  const tTickets = useTranslations('tickets');
  const tWbs = useTranslations('wbs');
  const tImport = useTranslations('import');
  const [tab, setTab]         = useState<Tab>('hours');
  const [expanded, setExpanded] = useState<Set<string>>(new Set([tMembers('extern'), tMembers('intern')]));
  const [collapsedMembers, setCollapsedMembers] = useState<Set<string>>(new Set());

  // Derive all months from data
  const allMonths = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(e.month);
    return [...set].sort();
  }, [entries]);

  const unmappedEntries = useMemo(
    () => entries.filter((e) => !e.wbsCode),
    [entries]
  );

  const pivot = useMemo(() => buildPivot(entries, members, allMonths), [entries, members, allMonths]);

  // Group members by type
  const groups = useMemo(() => {
    const extern: string[] = [];
    const intern: string[] = [];
    for (const [name] of pivot) {
      const memberId = Object.values(members).find((m) => m.name === name)?.id;
      const type     = memberId ? members[memberId]?.type : 'extern';
      if (type === 'intern') intern.push(name);
      else extern.push(name);
    }
    extern.sort((a, b) => a.localeCompare(b));
    intern.sort((a, b) => a.localeCompare(b));
    return [
      { label: tMembers('extern'), members: extern },
      { label: tMembers('intern'), members: intern },
    ];
  }, [pivot, members]);

  // All categories seen in data
  const allCats = useMemo(() => {
    const set = new Set<string>();
    for (const byMonth of pivot.values()) for (const byCat of byMonth.values()) for (const k of byCat.keys()) set.add(k);
    return sortCats([...set]);
  }, [pivot]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleMember(name: string) {
    setCollapsedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  // Grand total per month
  const grandTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const byMonth of pivot.values()) {
      for (const [month, byCat] of byMonth) {
        for (const h of byCat.values()) map.set(month, (map.get(month) ?? 0) + h);
      }
    }
    return map;
  }, [pivot]);

  const locale = useLocale() as Locale;
  const billableLabel = t('billable');

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'hours',    label: t('hours') },
    { id: 'percent',  label: t('percent') },
    { id: 'unmapped', label: `${t('unmapped')} (${unmappedEntries.length})` },
  ];

  if (entries.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-4">{t('title')}</h1>
        <p className="text-slate-400">{tImport('never')}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {tabs.map((tab_) => (
          <button
            key={tab_.id}
            onClick={() => setTab(tab_.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === tab_.id
                ? 'border-slate-800 text-slate-900'
                : `border-transparent text-slate-500 hover:text-slate-700 ${tab_.id === 'unmapped' && unmappedEntries.length > 0 ? 'text-rose-500 hover:text-rose-700' : ''}`
            }`}
          >
            {tab_.label}
          </button>
        ))}
      </div>

      {/* Unmapped tab */}
      {tab === 'unmapped' && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {unmappedEntries.length === 0 ? (
            <p className="px-4 py-8 text-center text-green-700">{t('allClassified')}</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">{tCommon('source')}</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">{tMembers('name')}</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">{tTickets('id')}</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">{tTickets('name')}</th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-600">{t('hours')}</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">{tWbs('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {unmappedEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-600">{e.date}</td>
                    <td className="px-4 py-2 text-slate-700">{e.user}</td>
                    <td className="px-4 py-2 font-mono text-slate-600">{e.ticketId ?? '—'}</td>
                    <td className="px-4 py-2 text-slate-700 max-w-xs truncate">{e.ticketName}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{fmtH(e.spentTime, locale)}</td>
                    <td className="px-4 py-2">
                      <Link href="/fmo/tickets" className="text-blue-600 hover:underline text-xs">{tTickets('assignWbs')}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Hours / Percent pivot table */}
      {(tab === 'hours' || tab === 'percent') && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
          <table className="text-xs w-full">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-slate-600 w-48">{tMembers('name')} / {t('unmapped')}</th>
                {allMonths.map((m) => (
                  <th key={m} className="px-3 py-2 text-right font-semibold text-slate-600 whitespace-nowrap">
                    {m.slice(0, 7)}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-semibold text-slate-600">Total</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                if (group.members.length === 0) return null;

                const groupTotals = new Map<string, number>();
                for (const name of group.members) {
                  const byMonth = pivot.get(name);
                  if (!byMonth) continue;
                  for (const [month, byCat] of byMonth) {
                    for (const h of byCat.values()) groupTotals.set(month, (groupTotals.get(month) ?? 0) + h);
                  }
                }

                return (
                  <>
                    {/* Group header */}
                    <tr key={group.label} className="bg-slate-100 cursor-pointer" onClick={() => toggle(group.label)}>
                      <td className="px-4 py-2 font-bold text-slate-700">
                        {expanded.has(group.label) ? '▼' : '▶'} {group.label}
                      </td>
                      {allMonths.map((m) => {
                        const total = groupTotals.get(m) ?? 0;
                        return tab === 'hours'
                          ? <td key={m} className="px-3 py-2 text-right font-semibold text-slate-700">{total > 0 ? total.toFixed(1) : '—'}</td>
                          : <td key={m} className="px-3 py-2 text-right font-semibold text-slate-700">{total > 0 ? '100 %' : '—'}</td>;
                      })}
                      <td className="px-3 py-2 text-right font-semibold text-slate-700">
                        {[...groupTotals.values()].reduce((s, v) => s + v, 0).toFixed(1)}
                      </td>
                    </tr>

                    {expanded.has(group.label) && group.members.map((name) => {
                      const byMonth = pivot.get(name);
                      if (!byMonth) return null;

                      const memberMonthTotals = new Map<string, number>();
                      for (const [month, byCat] of byMonth) {
                        for (const h of byCat.values()) memberMonthTotals.set(month, (memberMonthTotals.get(month) ?? 0) + h);
                      }
                      const memberTotal = [...memberMonthTotals.values()].reduce((s, v) => s + v, 0);

                      const catsForMember = sortCats([...new Set([...byMonth.values()].flatMap((m) => [...m.keys()]))]);
                      const isCollapsed   = collapsedMembers.has(name);

                      return (
                        <>
                          {/* Member row */}
                          <tr
                            key={name}
                            className="bg-slate-50 cursor-pointer hover:bg-slate-100"
                            onClick={() => toggleMember(name)}
                          >
                            <td className="px-6 py-1.5 font-semibold text-slate-700">
                              {isCollapsed ? '▶' : '▼'} {name}
                            </td>
                            {allMonths.map((m) => {
                              const total = memberMonthTotals.get(m) ?? 0;
                              return tab === 'hours'
                                ? <td key={m} className="px-3 py-1.5 text-right font-semibold text-slate-700">{total > 0 ? total.toFixed(1) : '—'}</td>
                                : <td key={m} className="px-3 py-1.5 text-right font-semibold text-slate-700">{total > 0 ? '100 %' : '—'}</td>;
                            })}
                            <td className="px-3 py-1.5 text-right font-semibold text-slate-700">{memberTotal.toFixed(1)}</td>
                          </tr>

                          {/* Category rows */}
                          {!isCollapsed && catsForMember.map((cat) => {
                            const catTotal = allMonths.reduce((s, m) => s + (byMonth.get(m)?.get(cat) ?? 0), 0);
                            return (
                              <tr key={`${name}-${cat}`} className="hover:bg-slate-50">
                                <td className="px-10 py-1 text-slate-600 italic">
                                  {catLabel(cat, subCategories, billableLabel)}
                                </td>
                                {allMonths.map((m) => {
                                  const h     = byMonth.get(m)?.get(cat) ?? 0;
                                  const total = memberMonthTotals.get(m) ?? 0;
                                  const v     = tab === 'percent' ? (total > 0 ? h / total : 0) : h;
                                  return <Cell key={m} value={v} mode={tab} />;
                                })}
                                {tab === 'hours'
                                  ? <td className="px-3 py-1 text-right font-medium text-slate-700">{catTotal.toFixed(1)}</td>
                                  : <td className="px-3 py-1 text-right text-slate-400">—</td>
                                }
                              </tr>
                            );
                          })}
                        </>
                      );
                    })}
                  </>
                );
              })}

              {/* Grand total */}
              <tr className="border-t-2 border-slate-300 bg-slate-100">
                <td className="px-4 py-2 font-bold text-slate-800">{t('grandTotal')}</td>
                {allMonths.map((m) => {
                  const total = grandTotals.get(m) ?? 0;
                  return tab === 'hours'
                    ? <td key={m} className="px-3 py-2 text-right font-bold text-slate-800">{total > 0 ? total.toFixed(1) : '—'}</td>
                    : <td key={m} className="px-3 py-2 text-right font-bold text-slate-800">{total > 0 ? '100 %' : '—'}</td>;
                })}
                <td className="px-3 py-2 text-right font-bold text-slate-800">
                  {[...grandTotals.values()].reduce((s, v) => s + v, 0).toFixed(1)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
