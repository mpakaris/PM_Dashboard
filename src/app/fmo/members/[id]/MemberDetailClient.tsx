'use client';

import { useState, useMemo, Fragment } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid,
  ComposedChart, Line,
} from 'recharts';
import { fmtH, fmtEur, type Locale } from '@/lib/i18n';
import type { FmoMember, FmoEntry, WbsSubCategory, FmoProject, FmoWbsEntry } from '@/lib/types';
import { entryBelongsToProject } from '@/lib/utils';
import { updateFmoMember } from '@/actions/fmo';
import { ChartTimeFilter, initChartRange, type TimeRange } from '@/components/ChartTimeFilter';

type Tab = 'profile' | 'tickets' | 'charts' | 'utilization' | 'profitability';

// Muted, dignified palette — 700-level Tailwind equivalents
const COLORS = [
  '#4338ca', '#0f766e', '#c2410c', '#1d4ed8',
  '#7c3aed', '#a16207', '#b91c1c', '#475569', '#0e7490', '#9d174d',
];

const SUB_COLORS: Record<string, string> = {
  V:         '#0f766e', // teal-700   (billable)
  admin:     '#475569', // slate-600
  presales:  '#1d4ed8', // blue-700
  opm:       '#c2410c', // orange-700
  portfolio: '#7c3aed', // violet-600
  training:  '#a16207', // yellow-700
  absence:   '#b91c1c', // red-700
  unmapped:  '#9d174d', // pink-800
};

const TOOLTIP_STYLE = {
  contentStyle: { fontSize: 12, borderRadius: 6, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,.06)' },
};

function getColor(subCategory: string | null, billingClass: string | null) {
  if (billingClass === 'V') return SUB_COLORS['V'];
  if (subCategory && SUB_COLORS[subCategory]) return SUB_COLORS[subCategory];
  return SUB_COLORS['unmapped'];
}

function PieLabel({ cx, cy, midAngle, outerRadius, name, percent }: any) {
  const RADIAN = Math.PI / 180;
  const r = outerRadius + 22;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  const pct = Math.round((percent ?? 0) * 100);
  if (pct < 4) return null;
  return (
    <text x={x} y={y} fill="#6b7280" textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central" fontSize={11}>
      {name} {pct}%
    </text>
  );
}

export default function MemberDetailClient({
  member,
  entries,
  allEntries,
  subCategories,
  wbs,
  projects,
  prevId,
  nextId,
}: {
  member: FmoMember;
  entries: FmoEntry[];
  allEntries: FmoEntry[];
  subCategories: Record<string, WbsSubCategory>;
  wbs: Record<string, FmoWbsEntry>;
  projects: FmoProject[];
  prevId: string | null;
  nextId: string | null;
}) {
  const t = useTranslations('members');
  const tCommon = useTranslations('common');
  const tUtil = useTranslations('utilization');
  const locale = useLocale() as Locale;

  const [activeTab, setActiveTab] = useState<Tab>('tickets');
  const [chartRange, setChartRange] = useState<TimeRange>(() => initChartRange(entries));
  const [ticketRange, setTicketRange] = useState<TimeRange>({ from: '', to: '' });
  const [expandedTickets, setExpandedTickets] = useState<Set<number | string>>(new Set());
  const [pieView, setPieView] = useState<'category' | 'ticket'>('category');
  const [type, setType]                 = useState(member.type);
  const [company, setCompany]           = useState(member.partnerCompany);
  const [costRate, setCostRate]         = useState(String(member.costRate));
  const [capacity, setCapacity]         = useState(String(member.monthlyCapacity ?? 160));
  const [billableTarget, setBillTarget] = useState(String(member.monthlyBillableTarget ?? 120));
  const [utilRange, setUtilRange]       = useState<TimeRange>({ from: '', to: '' });
  const [profitRange, setProfitRange]   = useState<TimeRange>(() => initChartRange(entries));
  const [wbsLocalRates, setWbsLocalRates] = useState<Record<string, number>>({});
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
      monthlyCapacity: parseFloat(capacity) || 160,
      monthlyBillableTarget: parseFloat(billableTarget) || 120,
    });
    setSaving(false);
    if (r.ok) setSaved(true);
    else setError(r.error ?? tCommon('error'));
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const totalHours = useMemo(() => entries.reduce((s, e) => s + e.spentTime, 0), [entries]);

  const chartEntries = useMemo(
    () => chartRange.from
      ? entries.filter(e => e.month >= chartRange.from && e.month <= chartRange.to)
      : entries,
    [entries, chartRange],
  );

  const ticketEntries = useMemo(
    () => ticketRange.from
      ? entries.filter(e => e.month >= ticketRange.from && e.month <= ticketRange.to)
      : entries,
    [entries, ticketRange],
  );

  const ticketMonthly = useMemo(() => {
    const map = new Map<number | string, Map<string, number>>();
    for (const e of ticketEntries) {
      const key = e.ticketId ?? e.ticketName;
      if (!map.has(key)) map.set(key, new Map());
      const m = map.get(key)!;
      m.set(e.month, (m.get(e.month) ?? 0) + e.spentTime);
    }
    return map;
  }, [ticketEntries]);

  const ticketTotalHours = useMemo(
    () => ticketEntries.reduce((s, e) => s + e.spentTime, 0),
    [ticketEntries],
  );

  // ── Utilization per month ────────────────────────────────────────────────────
  const utilizationData = useMemo(() => {
    const cap        = member.monthlyCapacity      ?? 160;
    const billTarget = member.monthlyBillableTarget ?? 120;
    const isIntern   = member.type === 'intern';

    const ranged = utilRange.from
      ? entries.filter(e => e.month >= utilRange.from && e.month <= utilRange.to)
      : entries;

    const monthMap = new Map<string, { total: number; billable: number; vacation: number }>();
    for (const e of ranged) {
      if (!monthMap.has(e.month)) monthMap.set(e.month, { total: 0, billable: 0, vacation: 0 });
      const m = monthMap.get(e.month)!;
      m.total += e.spentTime;
      if (e.billingClass === 'V') m.billable += e.spentTime;
      if (isIntern && e.subCategory === 'absence') m.vacation += e.spentTime;
    }

    const months = [...monthMap.keys()].sort();
    return months.map(month => {
      const { total, billable, vacation } = monthMap.get(month)!;
      const trueBillable   = isIntern ? Math.max(0, billable - vacation) : billable;
      const effectiveBillT = isIntern ? Math.max(0, billTarget - vacation) : billTarget;
      const capUtil  = cap > 0          ? Math.round((total        / cap)          * 100) : 0;
      const billUtil = effectiveBillT > 0 ? Math.round((trueBillable / effectiveBillT) * 100) : 0;
      return {
        month: month.slice(0, 7),
        total: Math.round(total * 10) / 10,
        billable: Math.round(trueBillable * 10) / 10,
        admin: Math.round(Math.max(0, total - billable) * 10) / 10,
        vacation: isIntern ? Math.round(vacation * 10) / 10 : 0,
        cap,
        billTarget: effectiveBillT,
        capUtil,
        billUtil,
      };
    });
  }, [entries, member, utilRange]);

  const ticketSummary = useMemo(() => {
    const map = new Map<number | string, { name: string; wbsCode: string | null; billingClass: string | null; subCategory: string | null; hours: number }>();
    for (const e of ticketEntries) {
      const key = e.ticketId ?? e.ticketName;
      const ex = map.get(key);
      if (ex) { ex.hours += e.spentTime; }
      else map.set(key, { name: e.ticketName, wbsCode: e.wbsCode, billingClass: e.billingClass, subCategory: e.subCategory, hours: e.spentTime });
    }
    return [...map.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.hours - a.hours);
  }, [ticketEntries]);

  // 1. Hours by Category per Month
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
      const billH = m.get('V') ?? 0;
      const totalH = [...m.values()].reduce((s, h) => s + h, 0);
      row['adminPct'] = totalH > 0 ? Math.round(((totalH - billH) / totalH) * 100) : null;
      return row;
    });
    return { chartData: data, categories: cats };
  }, [chartEntries]);

  // 2. Velocity + 3M rolling average
  const velocityData = useMemo(() => {
    const monthTotals = new Map<string, number>();
    for (const e of chartEntries) monthTotals.set(e.month, (monthTotals.get(e.month) ?? 0) + e.spentTime);
    const months = [...monthTotals.keys()].sort();
    return months.map((month, i) => {
      const h = monthTotals.get(month)!;
      const slice = months.slice(Math.max(0, i - 2), i + 1);
      const avg = slice.reduce((s, m) => s + (monthTotals.get(m) ?? 0), 0) / slice.length;
      return { month: month.slice(0, 7), hours: h, avg3m: Math.round(avg * 10) / 10 };
    });
  }, [chartEntries]);

  // 2b. Admin % vs team average per month
  const teamAdminChart = useMemo(() => {
    // members with >= 1h non-billable across all time
    const nonBillMap = new Map<string, number>();
    for (const e of allEntries) {
      if (e.billingClass !== 'V') nonBillMap.set(e.user, (nonBillMap.get(e.user) ?? 0) + e.spentTime);
    }
    const qualified = new Set([...nonBillMap.entries()].filter(([, h]) => h >= 1).map(([u]) => u));

    const ranged = (chartRange.from
      ? allEntries.filter(e => e.month >= chartRange.from && e.month <= chartRange.to)
      : allEntries
    ).filter(e => qualified.has(e.user));

    // build month → member → { bill, total }
    const monthMap = new Map<string, Map<string, { bill: number; total: number }>>();
    for (const e of ranged) {
      if (!monthMap.has(e.month)) monthMap.set(e.month, new Map());
      const mm = monthMap.get(e.month)!;
      if (!mm.has(e.user)) mm.set(e.user, { bill: 0, total: 0 });
      const u = mm.get(e.user)!;
      u.total += e.spentTime;
      if (e.billingClass === 'V') u.bill += e.spentTime;
    }

    const months = [...monthMap.keys()].sort();
    let overallBill = 0, overallTotal = 0;
    for (const e of ranged) { overallTotal += e.spentTime; if (e.billingClass === 'V') overallBill += e.spentTime; }
    const globalAvg = overallTotal > 0 ? Math.round(((overallTotal - overallBill) / overallTotal) * 100) : null;

    const rows = months.map(month => {
      const mm = monthMap.get(month)!;
      const pcts: number[] = [];
      for (const [, { bill, total }] of mm) {
        if (total > 0) pcts.push(((total - bill) / total) * 100);
      }
      const teamAvg = pcts.length > 0 ? Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length) : null;
      const me = mm.get(member.name);
      const memberPct = me && me.total > 0 ? Math.round(((me.total - me.bill) / me.total) * 100) : null;
      return { month: month.slice(0, 7), teamAvg, memberPct };
    });

    return { rows, globalAvg, qualifiedCount: qualified.size };
  }, [allEntries, chartRange, member.name]);

  // 3. Hours by Ticket per Month (stacked, top 8)
  const { ticketBarData, top8Keys, ticketHasOthers } = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of chartEntries) totals.set(e.ticketName, (totals.get(e.ticketName) ?? 0) + e.spentTime);
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const top8Keys = sorted.slice(0, 8).map(([n]) => n);
    const ticketHasOthers = sorted.length > 8;

    const monthMap = new Map<string, Map<string, number>>();
    for (const e of chartEntries) {
      if (!monthMap.has(e.month)) monthMap.set(e.month, new Map());
      const m = monthMap.get(e.month)!;
      const key = top8Keys.includes(e.ticketName) ? e.ticketName : 'Others';
      m.set(key, (m.get(key) ?? 0) + e.spentTime);
    }
    const months = [...monthMap.keys()].sort();
    const data = months.map(month => {
      const row: Record<string, any> = { month: month.slice(0, 7) };
      const m = monthMap.get(month)!;
      for (const k of top8Keys) row[k] = m.get(k) ?? 0;
      if (ticketHasOthers) row['Others'] = m.get('Others') ?? 0;
      return row;
    });
    return { ticketBarData: data, top8Keys, ticketHasOthers };
  }, [chartEntries]);

  // 4. Category breakdown pie (all subcategories)
  const categoryPie = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of chartEntries) {
      const key = e.billingClass === 'V' ? 'V' : (e.subCategory ?? 'unmapped');
      map.set(key, (map.get(key) ?? 0) + e.spentTime);
    }
    return [...map.entries()]
      .filter(([, h]) => h > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([key, value]) => ({
        name: key === 'V'
          ? tUtil('billable')
          : (subCategories[key]?.label ?? (key === 'unmapped' ? tUtil('unmapped') : key)),
        value,
        color: key === 'V' ? SUB_COLORS.V : (SUB_COLORS[key] ?? SUB_COLORS.unmapped),
      }));
  }, [chartEntries, subCategories, tUtil]);

  // 4b. Pie by ticket (top 12, rest grouped)
  const ticketPie = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of chartEntries) {
      const key = e.ticketName;
      map.set(key, (map.get(key) ?? 0) + e.spentTime);
    }
    const sorted = [...map.entries()].filter(([, h]) => h > 0).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 12);
    const othersH = sorted.slice(12).reduce((s, [, h]) => s + h, 0);
    const slices = top.map(([name, value], i) => ({
      name: name.length > 32 ? name.slice(0, 32) + '…' : name,
      value,
      color: COLORS[i % COLORS.length],
    }));
    if (othersH > 0) slices.push({ name: 'Others', value: othersH, color: '#94a3b8' });
    return slices;
  }, [chartEntries]);

  // 5. Top Tickets horizontal bar
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
      .map((tk, i) => ({
        name: tk.name.length > 28 ? tk.name.slice(0, 28) + '…' : tk.name,
        hours: tk.hours,
        fill: COLORS[i % COLORS.length],
      }));
  }, [chartEntries]);

  const getLabel = (subCategory: string | null, billingClass: string | null) => {
    if (billingClass === 'V') return tUtil('billable');
    if (subCategory) return subCategories[subCategory]?.label ?? subCategory;
    return tUtil('unmapped');
  };

  // ── Profitability ──────────────────────────────────────────────────────────
  const profitability = useMemo(() => {
    const rangedEntries = profitRange.from
      ? entries.filter(e => e.month >= profitRange.from && e.month <= profitRange.to)
      : entries;

    const byProject = new Map<string, { project: FmoProject; isFixprice: boolean; wbsCode: string | null; totalHours: number; billableHours: number; internalHours: number; cost: number; revenue: number }>();

    for (const e of rangedEntries) {
      const project    = projects.find(p => entryBelongsToProject(e, p));
      const isFixprice = project?.projectType === 'fixprice';

      let key: string;
      let displayName: string;
      let rowWbsCode: string | null = null;
      if (project) {
        key = project.id;
        displayName = project.name;
      } else if (e.wbsCode) {
        key = `__wbs__${e.wbsCode}`;
        rowWbsCode = e.wbsCode;
        const wbsEntry = wbs[e.wbsCode];
        displayName = wbsEntry ? `${wbsEntry.label} [${e.wbsCode}]` : `[${e.wbsCode}]`;
      } else {
        key = '__nowbs__';
        displayName = 'No WBS / no project';
      }

      if (!byProject.has(key)) {
        byProject.set(key, {
          project: project ?? { id: key, name: displayName, wbsCodes: [], ticketIds: [], excludedTicketIds: [], createdAt: '', projectType: 'tm', contractValue: 0, contractHours: 0, memberRates: {}, operationContracts: [] },
          isFixprice,
          wbsCode: rowWbsCode,
          totalHours: 0, billableHours: 0, internalHours: 0, cost: 0, revenue: 0,
        });
      }
      const s = byProject.get(key)!;
      s.totalHours += e.spentTime;
      s.cost       += e.spentTime * member.costRate;
      if (e.billingClass === 'V') {
        let billingRate = 0;
        if (!isFixprice) {
          if (project) {
            billingRate = project.memberRates[member.id]?.billingRate ?? 0;
          } else if (e.wbsCode) {
            // Use locally-set rate for WBS rows
            billingRate = wbsLocalRates[e.wbsCode] ?? 0;
          }
        }
        s.billableHours += e.spentTime;
        s.revenue       += e.spentTime * billingRate;
      } else {
        s.internalHours += e.spentTime;
      }
    }

    const rows = [...byProject.values()]
      .map(s => ({
        ...s,
        profit: s.isFixprice ? null : s.revenue - s.cost,
        margin: s.isFixprice ? null : (s.cost === 0 ? null : s.revenue === 0 ? -100 : Math.round((s.revenue - s.cost) / s.revenue * 100)),
        missingRate: !s.isFixprice && s.billableHours > 0 && s.revenue === 0 && !s.wbsCode,
      }))
      .sort((a, b) => {
        // Fixprice rows last, then by profit desc
        if (a.isFixprice !== b.isFixprice) return a.isFixprice ? 1 : -1;
        return (b.profit ?? 0) - (a.profit ?? 0);
      });

    // Monthly chart — T&M only: exclude fixed price entries entirely
    const monthMap = new Map<string, { cost: number; revenue: number }>();
    for (const e of rangedEntries) {
      const project    = projects.find(p => entryBelongsToProject(e, p));
      const isFixprice = project?.projectType === 'fixprice';
      if (isFixprice) continue; // fixed price cost excluded — revenue is contract-based, not per hour
      if (!monthMap.has(e.month)) monthMap.set(e.month, { cost: 0, revenue: 0 });
      const m = monthMap.get(e.month)!;
      m.cost += e.spentTime * member.costRate;
      if (e.billingClass === 'V') {
        const billingRate = project ? (project.memberRates[member.id]?.billingRate ?? 0) : 0;
        m.revenue += e.spentTime * billingRate;
      }
    }
    const monthly = [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([month, m]) => ({ month, cost: Math.round(m.cost), revenue: Math.round(m.revenue), profit: Math.round(m.revenue - m.cost) }));

    // Totals — fixprice excluded from revenue/profit (cost still counts)
    const tmRows       = rows.filter(r => !r.isFixprice);
    const totalCost    = rows.reduce((s, r) => s + r.cost,    0);
    const tmRevenue    = tmRows.reduce((s, r) => s + r.revenue, 0);
    const tmProfit     = tmRevenue - tmRows.reduce((s, r) => s + r.cost, 0);
    const tmCost      = tmRows.reduce((s, r) => s + r.cost, 0);
    const totalMargin = tmCost === 0 ? null : tmRevenue === 0 ? -100 : Math.round(tmProfit / tmRevenue * 100);
    const fixpriceCost = rows.filter(r => r.isFixprice).reduce((s, r) => s + r.cost, 0);

    return { rows, monthly, totalCost, tmRevenue, tmProfit, totalMargin, fixpriceCost, hasFixprice: fixpriceCost > 0 };
  }, [entries, projects, member, profitRange, wbs, wbsLocalRates]);

  const TABS: { id: Tab; label: string }[] = [
    { id: 'tickets',       label: 'Tickets' },
    { id: 'utilization',   label: 'Utilization' },
    { id: 'charts',        label: 'Charts' },
    { id: 'profitability', label: 'Profitability' },
    { id: 'profile',       label: t('profile') },
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
        <div className="ml-auto flex items-center gap-1">
          <Link
            href={prevId ? `/fmo/members/${prevId}` : '#'}
            aria-disabled={!prevId}
            className={`p-1.5 rounded border text-sm transition-colors ${prevId ? 'border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700' : 'border-slate-100 text-slate-300 pointer-events-none'}`}
            title="Previous member"
          >
            ←
          </Link>
          <Link
            href={nextId ? `/fmo/members/${nextId}` : '#'}
            aria-disabled={!nextId}
            className={`p-1.5 rounded border text-sm transition-colors ${nextId ? 'border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700' : 'border-slate-100 text-slate-300 pointer-events-none'}`}
            title="Next member"
          >
            →
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('totalHours'), value: fmtH(totalHours, locale) },
          { label: 'Tickets', value: String(ticketSummary.length) },
          { label: tUtil('billable'), value: fmtH(entries.filter(e => e.billingClass === 'V').reduce((s, e) => s + e.spentTime, 0), locale) },
          { label: tUtil('internal'), value: fmtH(entries.filter(e => e.billingClass !== 'V').reduce((s, e) => s + e.spentTime, 0), locale) },
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
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-slate-700 text-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tickets Tab ── */}
      {activeTab === 'tickets' && (
        <div className="space-y-3">
          <ChartTimeFilter value={ticketRange} onChange={setTicketRange} defaultPreset="all" />
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
                    <th className="px-4 py-3 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {ticketSummary.map(tk => {
                    const isExpanded = expandedTickets.has(tk.id);
                    const monthly = ticketMonthly.get(tk.id);
                    return (
                      <Fragment key={String(tk.id)}>
                        <tr
                          onClick={() => setExpandedTickets(prev => {
                            const next = new Set(prev);
                            if (next.has(tk.id)) next.delete(tk.id); else next.add(tk.id);
                            return next;
                          })}
                          className="hover:bg-slate-50 cursor-pointer"
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              {typeof tk.id === 'number' && (
                                <Link
                                  href={`/fmo/tickets/${tk.id}`}
                                  onClick={e => e.stopPropagation()}
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
                              style={{ background: getColor(tk.subCategory, tk.billingClass) + '22', color: getColor(tk.subCategory, tk.billingClass) }}>
                              {getLabel(tk.subCategory, tk.billingClass)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-slate-700">{fmtH(tk.hours, locale)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-400 text-xs">
                            {ticketTotalHours > 0 ? `${Math.round((tk.hours / ticketTotalHours) * 100)}%` : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-center text-slate-400">
                            <svg className={`w-3.5 h-3.5 mx-auto transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          </td>
                        </tr>
                        {isExpanded && monthly && (() => {
                          const bars = [...monthly.entries()]
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([month, hours]) => ({ month: month.slice(0, 7), hours }));
                          return (
                            <tr className="bg-indigo-50/30">
                              <td colSpan={6} className="px-6 py-4">
                                <ResponsiveContainer width="100%" height={160}>
                                  <BarChart data={bars} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                                    <XAxis dataKey="month" tick={{ fontSize: 9 }} interval={0} angle={-35} textAnchor="end" height={36} />
                                    <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => `${v}h`} width={32} />
                                    <Tooltip {...TOOLTIP_STYLE} formatter={(v) => typeof v === 'number' ? fmtH(v, locale) : v} />
                                    <Bar dataKey="hours" fill="#6366f1" radius={[3, 3, 0, 0]} opacity={0.85} />
                                  </BarChart>
                                </ResponsiveContainer>
                              </td>
                            </tr>
                          );
                        })()}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                  <tr>
                    <td colSpan={3} className="px-4 py-2.5 font-medium text-slate-700">{tCommon('total')}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-800">{fmtH(ticketTotalHours, locale)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500 text-xs">100%</td>
                    <td />
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
          <ChartTimeFilter value={chartRange} defaultRange={initChartRange(entries)} onChange={setChartRange} />

          {/* 1. Hours by Category per Month + Admin % line */}
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">{t('chartTitle')}</h3>
            <p className="text-xs text-gray-400 mb-4">Stacked hours (left) · Admin % of total per month (right, amber)</p>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 48, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}h`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} width={36} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v, name) =>
                    name === 'Admin %'
                      ? [`${v}%`, 'Admin %']
                      : [typeof v === 'number' ? fmtH(v, locale) : v, name]
                  }
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                {categories.map(cat => (
                  <Bar key={cat} yAxisId="left" dataKey={cat} stackId="a" opacity={0.9}
                    fill={getColor(cat === 'V' ? null : cat, cat === 'V' ? 'V' : 'I')}
                    name={getLabel(cat === 'V' ? null : cat, cat === 'V' ? 'V' : 'I')}
                  />
                ))}
                <Line yAxisId="right" type="monotone" dataKey="adminPct" stroke="#f59e0b" strokeWidth={2.5}
                  dot={{ r: 3, fill: '#f59e0b' }} name="Admin %" connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* 2. Velocity + 3M Rolling Average */}
          {velocityData.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Velocity &amp; 3-Month Average</h3>
              <p className="text-xs text-gray-400 mb-4">Monthly hours (bars) with 3-month rolling average (line)</p>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={velocityData} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}h`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v) => typeof v === 'number' ? fmtH(v, locale) : v} />
                  <Bar dataKey="hours" fill="#dde1ff" name="Monthly Hours" radius={[3, 3, 0, 0]} opacity={0.9} />
                  <Line type="monotone" dataKey="avg3m" stroke="#4338ca" strokeWidth={2} dot={{ r: 3 }} name="3M Avg" />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-sm bg-indigo-200 inline-block" /> Monthly Hours
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-4 border-t-2 border-indigo-700 inline-block" /> 3M Avg
                </span>
              </div>
            </div>
          )}

          {/* 2b. Admin % — this member vs team average */}
          {teamAdminChart.rows.length > 0 && (() => {
            const { rows, globalAvg, qualifiedCount } = teamAdminChart;
            const recentRows = rows
              .filter(r => r.memberPct !== null && r.teamAvg !== null)
              .slice(-6);
            const position = recentRows.length > 0 ? (() => {
              const deltas = recentRows.map(r => r.memberPct! - r.teamAvg!);
              const avgDelta = deltas.reduce((s, d) => s + d, 0) / deltas.length;
              const aboveCount = deltas.filter(d => d > 0).length;
              return {
                above: avgDelta > 0,
                avgDelta: Math.round(avgDelta),
                aboveCount,
                total: recentRows.length,
              };
            })() : null;
            return (
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">Admin % — You vs. Team Average</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Team average across {qualifiedCount} members with ≥1h non-billable
                      {globalAvg !== null && <> · overall avg <span className="font-medium text-amber-600">{globalAvg}%</span></>}
                    </p>
                  </div>
                  {position && (
                    <div className="text-right shrink-0">
                      <span className="text-xs font-medium px-2 py-1 rounded-full"
                        style={{ background: (position.above ? '#ef4444' : '#22c55e') + '18', color: position.above ? '#ef4444' : '#22c55e' }}>
                        {position.above ? 'trending above' : 'trending below'}
                      </span>
                      <p className="text-xs text-slate-400 mt-1">
                        {position.aboveCount}/{position.total} months · avg {position.avgDelta > 0 ? '+' : ''}{position.avgDelta}%
                      </p>
                    </div>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [`${v}%`, name]} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="memberPct" name={member.name} fill="#6366f1" opacity={0.75} radius={[3, 3, 0, 0]}
                      label={false} />
                    <Line type="monotone" dataKey="teamAvg" name="Team avg" stroke="#f59e0b"
                      strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: '#f59e0b' }} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="flex gap-5 mt-2">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-sm bg-indigo-400 inline-block opacity-75" /> {member.name}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-5 border-t-2 border-dashed border-amber-500 inline-block" /> Team avg
                  </span>
                </div>
              </div>
            );
          })()}

          {/* 3. Hours by Ticket per Month */}
          {ticketBarData.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Hours by Ticket per Month</h3>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={ticketBarData} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}h`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v) => typeof v === 'number' ? fmtH(v, locale) : v} />
                  <Legend verticalAlign="top" wrapperStyle={{ fontSize: '11px', paddingBottom: '8px' }}
                    formatter={(name) => String(name).length > 26 ? String(name).slice(0, 26) + '…' : String(name)} />
                  {top8Keys.map((key, i) => (
                    <Bar key={key} dataKey={key} stackId="t" fill={COLORS[i % COLORS.length]} opacity={0.88} />
                  ))}
                  {ticketHasOthers && <Bar dataKey="Others" stackId="t" fill="#94a3b8" opacity={0.7} />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 4. Pie — By Category / By Ticket toggle */}
          {(categoryPie.length > 0 || ticketPie.length > 0) && (() => {
            const pieData = pieView === 'category' ? categoryPie : ticketPie;
            return (
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-800">
                    {pieView === 'category' ? 'Hours by Category' : 'Hours by Ticket'}
                  </h3>
                  <div className="flex gap-1 border border-slate-200 rounded-md p-0.5">
                    {(['category', 'ticket'] as const).map(v => (
                      <button key={v} onClick={() => setPieView(v)}
                        className={`text-xs px-3 py-1 rounded transition-colors ${
                          pieView === v ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-700'
                        }`}>
                        {v === 'category' ? 'By Category' : 'By Ticket'}
                      </button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={340}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" outerRadius={110}
                      labelLine={false} label={PieLabel}>
                      {pieData.map((d, i) => <Cell key={i} fill={d.color} opacity={0.9} />)}
                    </Pie>
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v) => typeof v === 'number' ? fmtH(v, locale) : v} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Custom legend — outside SVG so it never overlaps labels */}
                <div className="flex flex-wrap gap-x-5 gap-y-2 mt-5 px-2">
                  {pieData.map(d => (
                    <span key={d.name} className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color, opacity: 0.9 }} />
                      {d.name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* 5. Top Tickets by Hours */}
          {topTicketsChart.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Top Tickets by Hours</h3>
              <ResponsiveContainer width="100%" height={topTicketsChart.length * 44 + 24}>
                <BarChart data={topTicketsChart} layout="vertical" margin={{ left: 0, right: 48, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}h`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={190} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v) => typeof v === 'number' ? fmtH(v, locale) : v} />
                  <Bar dataKey="hours" radius={[0, 3, 3, 0]} barSize={20} opacity={0.88}>
                    {topTicketsChart.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── Utilization Tab ── */}
      {activeTab === 'utilization' && (() => {
        const cap        = member.monthlyCapacity      ?? 160;
        const billTarget = member.monthlyBillableTarget ?? 120;
        const isIntern   = member.type === 'intern';
        const data       = utilizationData;

        const avgCapUtil  = data.length ? Math.round(data.reduce((s, r) => s + r.capUtil, 0)  / data.length) : 0;
        const avgBillUtil = data.length ? Math.round(data.reduce((s, r) => s + r.billUtil, 0) / data.length) : 0;
        const monthsAtCap  = data.filter(r => r.capUtil  >= 100).length;
        const monthsAtBill = data.filter(r => r.billUtil >= 100).length;

        return (
          <div className="space-y-5">
            <ChartTimeFilter value={utilRange} onChange={setUtilRange} defaultPreset="all" />

            {/* KPI cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Avg Capacity Util.', value: `${avgCapUtil}%`, sub: `target ${cap}h/mo` },
                { label: 'Avg Billable Util.', value: `${avgBillUtil}%`, sub: `target ${billTarget}h/mo` },
                { label: 'Months ≥ Capacity',  value: String(monthsAtCap),  sub: `of ${data.length}` },
                { label: 'Months ≥ Billable',  value: String(monthsAtBill), sub: `of ${data.length}` },
              ].map(k => (
                <div key={k.label} className="bg-white rounded-lg border border-slate-200 px-4 py-3">
                  <p className="text-xs text-slate-400 mb-1">{k.label}</p>
                  <p className="text-xl font-bold text-slate-800">{k.value}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{k.sub}</p>
                </div>
              ))}
            </div>

            {data.length === 0 && <p className="text-slate-400 text-sm">{t('noData')}</p>}

            {/* Chart 1 — Hours vs targets */}
            {data.length > 0 && (
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-1">Hours per Month vs. Targets</h3>
                <p className="text-xs text-gray-400 mb-4">
                  Billable (teal) · Admin (slate){isIntern ? ' · Vacation (amber)' : ''} · dashed lines = capacity & billable targets
                </p>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}h`} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v) => typeof v === 'number' ? fmtH(v, locale) : v} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="billable" stackId="h" fill="#0f766e" opacity={0.85} radius={[0, 0, 0, 0]} name="Billable" />
                    <Bar dataKey="admin"    stackId="h" fill="#475569" opacity={0.7}  radius={[0, 0, 0, 0]} name="Admin" />
                    {isIntern && <Bar dataKey="vacation" stackId="h" fill="#f59e0b" opacity={0.75} radius={[3, 3, 0, 0]} name="Vacation" />}
                    <Line type="monotone" dataKey="cap"        stroke="#ef4444" strokeWidth={1.5} strokeDasharray="6 3" dot={false} name={`Capacity (${cap}h)`} />
                    <Line type="monotone" dataKey="billTarget" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="6 3" dot={false} name={`Billable target`} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Chart 2 — Utilization % */}
            {data.length > 0 && (
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-1">Utilization %</h3>
                <p className="text-xs text-gray-400 mb-4">Capacity util (blue) · Billable util (teal) · 100% reference</p>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 'auto']} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [`${v}%`, name]} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Line type="monotone" dataKey="capUtil"  stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3 }} name="Capacity %" connectNulls />
                    <Line type="monotone" dataKey="billUtil" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} name="Billable %"  connectNulls />
                    <Line type="monotone" dataKey={() => 100} stroke="#ef4444" strokeWidth={1} strokeDasharray="4 3" dot={false} name="100% target" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Monthly detail table */}
            {data.length > 0 && (
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-medium">
                    <tr>
                      <th className="px-4 py-3 text-left">Month</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Billable</th>
                      <th className="px-4 py-3 text-right">Admin</th>
                      {isIntern && <th className="px-4 py-3 text-right">Vacation</th>}
                      <th className="px-4 py-3 text-right">Cap. Util.</th>
                      <th className="px-4 py-3 text-right">Bill. Util.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.map(row => (
                      <tr key={row.month} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-slate-600 tabular-nums">{row.month}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700 tabular-nums">{fmtH(row.total, locale)}</td>
                        <td className="px-4 py-2.5 text-right text-teal-700 tabular-nums">{fmtH(row.billable, locale)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">{fmtH(row.admin, locale)}</td>
                        {isIntern && <td className="px-4 py-2.5 text-right text-amber-600 tabular-nums">{fmtH(row.vacation, locale)}</td>}
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          <span className={row.capUtil >= 100 ? 'text-green-700 font-semibold' : row.capUtil >= 80 ? 'text-slate-700' : 'text-red-600'}>
                            {row.capUtil}%
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          <span className={row.billUtil >= 100 ? 'text-green-700 font-semibold' : row.billUtil >= 80 ? 'text-slate-700' : 'text-red-600'}>
                            {row.billUtil}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Profile Tab ── */}
      {/* ── PROFITABILITY ── */}
      {activeTab === 'profitability' && (
        <div className="space-y-6">
          <ChartTimeFilter value={profitRange} defaultRange={initChartRange(entries)} onChange={setProfitRange} />
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Cost',           value: fmtEur(profitability.totalCost,  locale), color: 'text-slate-800',   sub: profitability.hasFixprice ? `incl. ${fmtEur(profitability.fixpriceCost, locale)} fixed price` : undefined },
              { label: 'T&M Revenue',          value: fmtEur(profitability.tmRevenue,  locale), color: 'text-emerald-700', sub: profitability.hasFixprice ? 'fixed price excluded' : undefined },
              { label: 'T&M Net Profit',       value: fmtEur(profitability.tmProfit,   locale), color: profitability.tmProfit >= 0 ? 'text-emerald-700' : 'text-red-600', sub: undefined },
              { label: 'T&M Margin',           value: profitability.totalMargin !== null ? `${profitability.totalMargin}%` : '—', color: (profitability.totalMargin ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600', sub: undefined },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-lg border border-slate-200 px-4 py-3">
                <p className="text-xs text-slate-400 mb-1">{k.label}</p>
                <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
                {k.sub && <p className="text-xs text-slate-400 mt-0.5">{k.sub}</p>}
              </div>
            ))}
          </div>

          {/* Warnings */}
          {member.costRate === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              ⚠ No cost rate set — cost figures are 0. Set a cost rate in the Profile tab.
            </div>
          )}
          {profitability.hasFixprice && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
              ℹ This member works on Fixed Price projects. Revenue for those projects is contract-based, not per hour — they are excluded from the T&M revenue and profit/margin calculations. Only their cost is included in the total cost.
            </div>
          )}

          {/* Monthly cost vs revenue chart */}
          {profitability.monthly.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Monthly Cost vs T&M Revenue</h3>
              <p className="text-xs text-gray-400 mb-4">Cost (red) vs billable T&M revenue (green) per month — fixed price revenue not shown</p>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={profitability.monthly} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [fmtEur(Number(v), locale), String(name)]} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="cost"    fill="#fca5a5" opacity={0.9} name="Cost"    radius={[3,3,0,0]} />
                  <Bar dataKey="revenue" fill="#6ee7b7" opacity={0.9} name="Revenue" radius={[3,3,0,0]} />
                  <Line type="monotone" dataKey="profit" stroke="#4338ca" strokeWidth={2} dot={{ r: 3 }} name="Profit" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* T&M project breakdown */}
          {(() => {
            const tmRows = profitability.rows.filter(r => !r.isFixprice);
            if (tmRows.length === 0) return null;
            return (
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <h3 className="text-sm font-semibold text-slate-700">T&amp;M Projects — Breakdown</h3>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-500">
                      <th className="text-left px-4 py-2 font-medium">Project</th>
                      <th className="text-right px-4 py-2 font-medium">Total h</th>
                      <th className="text-right px-4 py-2 font-medium">Billable h</th>
                      <th className="text-right px-4 py-2 font-medium">Internal h</th>
                      <th className="text-right px-4 py-2 font-medium">Cost</th>
                      <th className="text-right px-4 py-2 font-medium">Rate €/h</th>
                      <th className="text-right px-4 py-2 font-medium">Revenue</th>
                      <th className="text-right px-4 py-2 font-medium">Profit / Loss</th>
                      <th className="text-right px-4 py-2 font-medium">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {tmRows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50/40">
                        <td className="px-4 py-2 font-medium text-slate-700">
                          <div className="flex items-center gap-1.5">
                            {r.project.name}
                            {r.missingRate && <span className="text-orange-500 text-xs" title="Billable hours but no billing rate set">no rate</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right text-slate-600">{fmtH(r.totalHours, locale)}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{fmtH(r.billableHours, locale)}</td>
                        <td className="px-4 py-2 text-right text-slate-400">{fmtH(r.internalHours, locale)}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{fmtEur(r.cost, locale)}</td>
                        {/* Rate column — editable for WBS rows, read-only for project rows */}
                        <td className="px-4 py-2 text-right">
                          {r.wbsCode ? (
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                placeholder="—"
                                defaultValue={wbsLocalRates[r.wbsCode] || ''}
                                className="w-16 text-right bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-300 focus:bg-white placeholder:text-slate-300"
                                onBlur={e => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setWbsLocalRates(prev => ({ ...prev, [r.wbsCode!]: val }));
                                }}
                              />
                              <span className="text-xs text-slate-400">€/h</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">
                              {r.billableHours > 0 ? `${Math.round(r.revenue / r.billableHours)} €/h` : '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-emerald-700">{fmtEur(r.revenue, locale)}</td>
                        <td className={`px-4 py-2 text-right font-semibold ${(r.profit ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {(r.profit ?? 0) >= 0 ? '+' : ''}{fmtEur(r.profit ?? 0, locale)}
                        </td>
                        <td className={`px-4 py-2 text-right ${r.margin === null ? 'text-slate-300' : r.margin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {r.margin !== null ? `${r.margin}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-xs">
                      <td className="px-4 py-2 text-slate-600">Total</td>
                      <td className="px-4 py-2 text-right text-slate-600">{fmtH(tmRows.reduce((s, r) => s + r.totalHours, 0), locale)}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{fmtH(tmRows.reduce((s, r) => s + r.billableHours, 0), locale)}</td>
                      <td className="px-4 py-2 text-right text-slate-400">{fmtH(tmRows.reduce((s, r) => s + r.internalHours, 0), locale)}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{fmtEur(profitability.totalCost - profitability.fixpriceCost, locale)}</td>
                      <td className="px-4 py-2" />
                      <td className="px-4 py-2 text-right text-emerald-700">{fmtEur(profitability.tmRevenue, locale)}</td>
                      <td className={`px-4 py-2 text-right ${profitability.tmProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {profitability.tmProfit >= 0 ? '+' : ''}{fmtEur(profitability.tmProfit, locale)}
                      </td>
                      <td className={`px-4 py-2 text-right ${(profitability.totalMargin ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {profitability.totalMargin !== null ? `${profitability.totalMargin}%` : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                <p className="px-4 py-2 text-xs text-slate-400 border-t border-slate-50">
                  Revenue = billable (V-class) hours × billing rate per project. &ldquo;no rate&rdquo; = rate not configured in the project&apos;s Team tab.
                </p>
              </div>
            );
          })()}

          {/* Fixed Price project breakdown — cost only */}
          {profitability.hasFixprice && (() => {
            const fpRows = profitability.rows.filter(r => r.isFixprice);
            return (
              <div className="bg-white rounded-lg border border-blue-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-blue-100 bg-blue-50/60 flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-blue-800">Fixed Price Projects — Cost Contribution</h3>
                  <span className="text-xs text-blue-500">Revenue is contract-based, not per hour — P&amp;L not applicable</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-blue-50 text-slate-500">
                      <th className="text-left px-4 py-2 font-medium">Project</th>
                      <th className="text-right px-4 py-2 font-medium">Total h</th>
                      <th className="text-right px-4 py-2 font-medium">Billable h</th>
                      <th className="text-right px-4 py-2 font-medium">Internal h</th>
                      <th className="text-right px-4 py-2 font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-50">
                    {fpRows.map((r, i) => (
                      <tr key={i} className="hover:bg-blue-50/40">
                        <td className="px-4 py-2 font-medium text-slate-700">{r.project.name}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{fmtH(r.totalHours, locale)}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{fmtH(r.billableHours, locale)}</td>
                        <td className="px-4 py-2 text-right text-slate-400">{fmtH(r.internalHours, locale)}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{fmtEur(r.cost, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-blue-100 bg-blue-50/40 font-semibold text-xs">
                      <td className="px-4 py-2 text-slate-600">Total</td>
                      <td className="px-4 py-2 text-right text-slate-600">{fmtH(fpRows.reduce((s, r) => s + r.totalHours, 0), locale)}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{fmtH(fpRows.reduce((s, r) => s + r.billableHours, 0), locale)}</td>
                      <td className="px-4 py-2 text-right text-slate-400">{fmtH(fpRows.reduce((s, r) => s + r.internalHours, 0), locale)}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{fmtEur(profitability.fixpriceCost, locale)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })()}
        </div>
      )}

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
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-medium text-slate-500 mb-3">Utilization targets</p>
            <div className="flex gap-6">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Monthly capacity (h)</label>
                <input type="number" min="0" step="1" value={capacity}
                  onChange={e => setCapacity(e.target.value)}
                  className="border border-slate-300 rounded px-3 py-1.5 text-sm w-28" />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Billable target (h)</label>
                <input type="number" min="0" step="1" value={billableTarget}
                  onChange={e => setBillTarget(e.target.value)}
                  className="border border-slate-300 rounded px-3 py-1.5 text-sm w-28" />
              </div>
            </div>
            {member.type === 'intern' && (
              <p className="text-xs text-slate-400 mt-2">For internals, vacation hours (absence category) reduce the effective billable target.</p>
            )}
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
