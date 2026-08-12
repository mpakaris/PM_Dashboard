'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRole } from '@/components/RoleProvider';
import { useLocale } from 'next-intl';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Line, CartesianGrid,
} from 'recharts';
import { fmtH, fmtEur, type Locale } from '@/lib/i18n';
import type {
  FmoProject, FmoEntry, FmoMember, FmoWbsEntry, FmoTicket,
  WbsSubCategory, FmoOperationContract,
} from '@/lib/types';
import {
  updateFmoProject, updateProjectConfig, setProjectMemberRate,
  upsertProjectOperationContract, removeProjectOperationContract,
} from '@/actions/fmoProjects';
import { ChartTimeFilter, initChartRange, type TimeRange } from '@/components/ChartTimeFilter';

type Tab = 'overview' | 'team' | 'tickets' | 'financials' | 'settings';

const COLORS = [
  '#4338ca', '#0f766e', '#c2410c', '#1d4ed8',
  '#7c3aed', '#a16207', '#b91c1c', '#475569', '#0e7490', '#9d174d',
];
const TOOLTIP_STYLE = {
  contentStyle: { fontSize: 12, borderRadius: 6, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,.06)' },
};

// ─── Operations Contract form ─────────────────────────────────────────────────

function OpsContractForm({
  projectId, allTickets, onDone, onCancel,
}: {
  projectId: string;
  allTickets: FmoTicket[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName]                   = useState('');
  const [type, setType]                   = useState<'fixprice' | 'hourly'>('fixprice');
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [selected, setSelected]           = useState<number[]>([]);
  const [query, setQuery]                 = useState('');
  const [saving, setSaving]               = useState(false);

  const filtered = allTickets
    .filter(t => !query || String(t.id).includes(query) || t.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    await upsertProjectOperationContract(projectId, {
      name: name.trim(), type, ticketIds: selected,
      defaultMonthlyAmount: type === 'fixprice' ? (parseFloat(monthlyAmount) || 0) : 0,
      monthlyOverrides: {},
    });
    setSaving(false);
    onDone();
  }

  return (
    <div className="border border-indigo-100 rounded-lg p-4 bg-indigo-50/30 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Contract Name</label>
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Operations Support"
            className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Billing Type</label>
          <div className="flex gap-1 mt-1">
            {(['fixprice', 'hourly'] as const).map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={`flex-1 text-xs px-2 py-1.5 rounded border transition-colors ${
                  type === t ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-300 text-slate-600 hover:border-slate-500'
                }`}>
                {t === 'fixprice' ? 'Pauschal / Fix' : 'Per Hour'}
              </button>
            ))}
          </div>
        </div>
      </div>
      {type === 'fixprice' && (
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Monthly Amount (€)</label>
          <input type="number" min="0" value={monthlyAmount} onChange={e => setMonthlyAmount(e.target.value)}
            className="w-40 border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Tickets ({selected.length} selected)
        </label>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tickets…"
          className="w-full border border-slate-200 rounded px-3 py-1.5 text-xs focus:outline-none focus:border-slate-400 mb-1" />
        <div className="border border-slate-200 rounded max-h-40 overflow-y-auto divide-y divide-slate-50 bg-white">
          {filtered.map(t => (
            <label key={t.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" checked={selected.includes(t.id)}
                onChange={() => setSelected(prev => prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id])} />
              <span className="font-mono text-xs text-slate-400">#{t.id}</span>
              <span className="text-xs text-slate-700 truncate">{t.name}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="text-sm text-slate-500 px-3 py-1.5">Cancel</button>
        <button type="button" onClick={save} disabled={saving || !name.trim()}
          className="bg-slate-800 text-white text-sm px-4 py-1.5 rounded hover:bg-slate-700 disabled:opacity-50">
          {saving ? 'Adding…' : 'Add Contract'}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProjectDetailClient({
  project, entries, wbs, members, tickets, subCategories, allProjects,
}: {
  project: FmoProject;
  entries: FmoEntry[];
  wbs: Record<string, FmoWbsEntry>;
  members: Record<string, FmoMember>;
  tickets: Record<string, FmoTicket>;
  subCategories: Record<string, WbsSubCategory>;
  allProjects: FmoProject[];
}) {
  const router  = useRouter();
  const isAdmin = useRole() === 'admin';
  const locale  = useLocale() as Locale;

  const [activeTab, setActiveTab]           = useState<Tab>('overview');
  const [chartRange, setChartRange]         = useState<TimeRange>(() => initChartRange(entries));
  const [projType, setProjType]             = useState(project.projectType ?? 'tm');
  const [contractValue, setContractValue]   = useState(String(project.contractValue ?? 0));
  const [contractHours, setContractHours]   = useState(String(project.contractHours ?? 0));
  const [savingConfig, setSavingConfig]     = useState(false);
  const [editingWbs, setEditingWbs]         = useState(false);
  const [selectedWbs, setSelectedWbs]       = useState<string[]>(project.wbsCodes);
  const [savingWbs, setSavingWbs]           = useState(false);
  const [showOpsForm, setShowOpsForm]       = useState(false);

  // ── Lookups ────────────────────────────────────────────────────────────────

  const nameToMember = useMemo(() =>
    Object.fromEntries(Object.values(members).map(m => [m.name, m])),
    [members],
  );

  const fixOpsTicketSet = useMemo(() =>
    new Set((project.operationContracts ?? [])
      .filter(c => c.type === 'fixprice')
      .flatMap(c => c.ticketIds)),
    [project.operationContracts],
  );

  // ── All-time KPIs ──────────────────────────────────────────────────────────

  const totalHours    = useMemo(() => entries.reduce((s, e) => s + e.spentTime, 0), [entries]);
  const billableHours = useMemo(() => entries.filter(e => e.billingClass === 'V').reduce((s, e) => s + e.spentTime, 0), [entries]);

  // ── Chart-filtered entries ─────────────────────────────────────────────────

  const chartEntries = useMemo(
    () => chartRange.from
      ? entries.filter(e => e.month >= chartRange.from && e.month <= chartRange.to)
      : entries,
    [entries, chartRange],
  );

  // ── Member summary (all-time for Team tab) ─────────────────────────────────

  const memberSummary = useMemo(() => {
    const map = new Map<string, { member: FmoMember; hours: number; billable: number; cost: number; revenue: number }>();
    for (const e of entries) {
      const m = nameToMember[e.user];
      if (!m) continue;
      const ex = map.get(m.id) ?? { member: m, hours: 0, billable: 0, cost: 0, revenue: 0 };
      ex.hours   += e.spentTime;
      if (e.billingClass === 'V') ex.billable += e.spentTime;
      ex.cost    += e.spentTime * (m.costRate ?? 0);
      const isFixOps = e.ticketId !== null && fixOpsTicketSet.has(e.ticketId);
      if (!isFixOps) ex.revenue += e.spentTime * ((project.memberRates ?? {})[m.id]?.billingRate ?? 0);
      map.set(m.id, ex);
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [entries, nameToMember, fixOpsTicketSet, project.memberRates]);

  // ── Ticket summary (all-time for Tickets tab) ──────────────────────────────

  const ticketSummary = useMemo(() => {
    const map = new Map<number | string, { name: string; wbsCode: string | null; billingClass: string | null; subCategory: string | null; hours: number }>();
    for (const e of entries) {
      const key = e.ticketId ?? e.ticketName;
      const ex = map.get(key);
      if (ex) ex.hours += e.spentTime;
      else map.set(key, { name: e.ticketName, wbsCode: e.wbsCode, billingClass: e.billingClass, subCategory: e.subCategory, hours: e.spentTime });
    }
    return [...map.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.hours - a.hours);
  }, [entries]);

  // ── Chart-range data ───────────────────────────────────────────────────────

  // Velocity
  const velocityData = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of chartEntries) totals.set(e.month, (totals.get(e.month) ?? 0) + e.spentTime);
    const months = [...totals.keys()].sort();
    return months.map((month, i) => {
      const h = totals.get(month)!;
      const slice = months.slice(Math.max(0, i - 2), i + 1);
      const avg = slice.reduce((s, m) => s + (totals.get(m) ?? 0), 0) / slice.length;
      return { month: month.slice(0, 7), hours: h, avg3m: Math.round(avg * 10) / 10 };
    });
  }, [chartEntries]);

  // Category stacked bar
  const { categoryData, categoryKeys } = useMemo(() => {
    const monthMap = new Map<string, Map<string, number>>();
    const catSet   = new Set<string>();
    for (const e of chartEntries) {
      if (!monthMap.has(e.month)) monthMap.set(e.month, new Map());
      const label = e.billingClass === 'V'
        ? 'Billable'
        : (e.subCategory ? (subCategories[e.subCategory]?.label ?? e.subCategory) : 'Unmapped');
      catSet.add(label);
      const m = monthMap.get(e.month)!;
      m.set(label, (m.get(label) ?? 0) + e.spentTime);
    }
    const months = [...monthMap.keys()].sort();
    const cats   = [...catSet];
    const data   = months.map(month => {
      const row: Record<string, any> = { month: month.slice(0, 7) };
      const m = monthMap.get(month)!;
      for (const cat of cats) row[cat] = m.get(cat) ?? 0;
      return row;
    });
    return { categoryData: data, categoryKeys: cats };
  }, [chartEntries, subCategories]);

  // Monthly by member (top 5)
  const topMembers = useMemo(() => memberSummary.slice(0, 5).map(ms => ms.member.name), [memberSummary]);
  const monthlyByMember = useMemo(() => {
    const months = [...new Set(chartEntries.map(e => e.month))].sort();
    return months.map(month => {
      const row: Record<string, any> = { month: month.slice(0, 7) };
      for (const name of topMembers) {
        row[name] = chartEntries.filter(e => e.month === month && e.user === name).reduce((s, e) => s + e.spentTime, 0);
      }
      return row;
    });
  }, [chartEntries, topMembers]);

  // Economics by month (chart-range)
  const economicsByMonth = useMemo(() => {
    const monthTotals = new Map<string, { cost: number; tmRevenue: number; opsRevenue: number }>();
    for (const e of chartEntries) {
      const m   = nameToMember[e.user];
      const row = monthTotals.get(e.month) ?? { cost: 0, tmRevenue: 0, opsRevenue: 0 };
      if (m) {
        row.cost += e.spentTime * (m.costRate ?? 0);
        const isFixOps = e.ticketId !== null && fixOpsTicketSet.has(e.ticketId);
        if (!isFixOps) row.tmRevenue += e.spentTime * ((project.memberRates ?? {})[m.id]?.billingRate ?? 0);
      }
      monthTotals.set(e.month, row);
    }
    const opsFixed = (project.operationContracts ?? []).filter(c => c.type === 'fixprice');
    for (const [month, row] of monthTotals) {
      row.opsRevenue = opsFixed.reduce((s, c) => s + ((c.monthlyOverrides ?? {})[month] ?? c.defaultMonthlyAmount), 0);
    }
    const months = [...monthTotals.keys()].sort();
    let cumPl = 0;
    return months.map(month => {
      const r       = monthTotals.get(month)!;
      const revenue = r.tmRevenue + r.opsRevenue;
      const pl      = revenue - r.cost;
      cumPl        += pl;
      return {
        month: month.slice(0, 7),
        cost:      Math.round(r.cost),
        tmRevenue: Math.round(r.tmRevenue),
        opsRevenue:Math.round(r.opsRevenue),
        revenue:   Math.round(revenue),
        pl:        Math.round(pl),
        cumPl:     Math.round(cumPl),
      };
    });
  }, [chartEntries, nameToMember, fixOpsTicketSet, project.memberRates, project.operationContracts]);

  const totalEcon = useMemo(() =>
    economicsByMonth.reduce((s, m) => ({ cost: s.cost + m.cost, revenue: s.revenue + m.revenue, pl: s.pl + m.pl }),
      { cost: 0, revenue: 0, pl: 0 }),
    [economicsByMonth],
  );

  const hasRates     = Object.values(project.memberRates ?? {}).some(r => r.billingRate > 0);
  const hasCostRates = Object.values(members).some(m => (m.costRate ?? 0) > 0);
  const margin       = totalEcon.revenue > 0 ? Math.round((totalEcon.pl / totalEcon.revenue) * 100) : 0;
  const hasOpsFixed  = (project.operationContracts ?? []).some(c => c.type === 'fixprice');

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview',   label: 'Overview' },
    { id: 'team',       label: 'Team' },
    { id: 'tickets',    label: 'Tickets' },
    { id: 'financials', label: 'Financials' },
    { id: 'settings',   label: 'Settings' },
  ];

  return (
    <div className="p-6 space-y-6 max-w-6xl">

      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link href="/fmo/projects" className="text-slate-400 hover:text-slate-600 text-sm">← Projects</Link>
          <span className="text-slate-300">/</span>
          <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
            (project.projectType ?? 'tm') === 'tm'
              ? 'bg-blue-50 border-blue-200 text-blue-700'
              : 'bg-violet-50 border-violet-200 text-violet-700'
          }`}>
            {(project.projectType ?? 'tm') === 'tm' ? 'T&M' : 'Fixed Price'}
          </span>
        </div>
        {project.description && <p className="text-sm text-slate-500">{project.description}</p>}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {project.wbsCodes.map(code => (
            <span key={code} className={`text-xs px-2 py-0.5 rounded-full font-mono border ${
              code.startsWith('V.') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              {code}{wbs[code]?.label && <span className="ml-1 font-sans font-normal">{wbs[code].label}</span>}
            </span>
          ))}
          {(project.ticketIds ?? []).length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full border bg-indigo-50 border-indigo-200 text-indigo-600">
              +{project.ticketIds.length} tickets
            </span>
          )}
        </div>
      </div>

      {/* ── Top KPIs (all-time) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Hours',    value: fmtH(totalHours, locale) },
          { label: 'Billable %',     value: totalHours > 0 ? `${Math.round(billableHours / totalHours * 100)}%` : '—' },
          { label: 'Team Members',   value: String(memberSummary.length) },
          { label: 'Tickets',        value: String(ticketSummary.length) },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-400 mb-1">{kpi.label}</p>
            <p className="text-xl font-bold text-slate-800">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id ? 'border-slate-700 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <ChartTimeFilter value={chartRange} defaultRange={initChartRange(entries)} onChange={setChartRange} />

          {velocityData.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Velocity & 3-Month Average</h3>
              <p className="text-xs text-gray-400 mb-4">Monthly hours (bars) · 3-month rolling average (line)</p>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={velocityData} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}h`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={v => typeof v === 'number' ? fmtH(v, locale) : v} />
                  <Bar dataKey="hours" fill="#dde1ff" name="Monthly Hours" radius={[3,3,0,0]} opacity={0.9} />
                  <Line type="monotone" dataKey="avg3m" stroke="#4338ca" strokeWidth={2} dot={{ r: 3 }} name="3M Avg" />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2">
                <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-200 inline-block" /> Monthly Hours</span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-4 border-t-2 border-indigo-700 inline-block" /> 3M Avg</span>
              </div>
            </div>
          )}

          {categoryData.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Monthly Hours by Category</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={categoryData} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}h`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={v => typeof v === 'number' ? fmtH(v, locale) : v} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  {categoryKeys.map((cat, i) => (
                    <Bar key={cat} dataKey={cat} stackId="a" fill={COLORS[i % COLORS.length]} opacity={0.88} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── TEAM ── */}
      {activeTab === 'team' && (
        <div className="space-y-6">
          {isAdmin && (
            <p className="text-xs text-slate-400">Click a billing rate cell to edit. Cost rates come from the member profile.</p>
          )}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-medium">
                <tr>
                  <th className="px-4 py-3 text-left">Member</th>
                  <th className="px-4 py-3 text-right">Hours</th>
                  <th className="px-4 py-3 text-right">Billable %</th>
                  <th className="px-4 py-3 text-right">Cost Rate</th>
                  <th className="px-4 py-3 text-right">Billing Rate</th>
                  <th className="px-4 py-3 text-right">Cost (€)</th>
                  <th className="px-4 py-3 text-right">Revenue (€)</th>
                  <th className="px-4 py-3 text-right">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {memberSummary.map(({ member, hours, billable, cost, revenue }) => {
                  const rowMargin    = revenue > 0 ? Math.round((revenue - cost) / revenue * 100) : null;
                  const billingRate  = (project.memberRates ?? {})[member.id]?.billingRate ?? 0;
                  return (
                    <tr key={member.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Link href={`/fmo/members/${member.id}`} className="text-indigo-600 hover:text-indigo-800 font-medium">{member.name}</Link>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${member.type === 'intern' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}`}>{member.type}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{fmtH(hours, locale)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500 text-xs">{hours > 0 ? `${Math.round(billable / hours * 100)}%` : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500 text-xs">{member.costRate > 0 ? `${member.costRate} €/h` : '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        {isAdmin ? (
                          <input type="number" min="0" step="0.5"
                            defaultValue={billingRate || ''}
                            placeholder="—"
                            className="w-20 text-right border-0 border-b border-slate-200 bg-transparent text-sm focus:outline-none focus:border-indigo-400"
                            onBlur={async e => {
                              const val = parseFloat(e.target.value) || 0;
                              await setProjectMemberRate(project.id, member.id, val);
                              router.refresh();
                            }}
                          />
                        ) : (
                          <span className="text-slate-700 text-sm">{billingRate > 0 ? `${billingRate} €/h` : '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{cost > 0 ? fmtEur(cost) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{revenue > 0 ? fmtEur(revenue) : '—'}</td>
                      <td className={`px-4 py-2.5 text-right text-sm font-medium ${
                        rowMargin !== null ? (rowMargin >= 0 ? 'text-emerald-600' : 'text-red-500') : 'text-slate-400'
                      }`}>
                        {rowMargin !== null ? `${rowMargin}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {memberSummary.length > 0 && (
                <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-medium text-sm">
                  <tr>
                    <td className="px-4 py-2.5 text-slate-700">Total</td>
                    <td className="px-4 py-2.5 text-right text-slate-800">{fmtH(totalHours, locale)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500 text-xs">{totalHours > 0 ? `${Math.round(billableHours / totalHours * 100)}%` : '—'}</td>
                    <td colSpan={2} />
                    <td className="px-4 py-2.5 text-right text-slate-800">{totalEcon.cost > 0 ? fmtEur(totalEcon.cost) : '—'}</td>
                    <td className="px-4 py-2.5 text-right text-slate-800">{totalEcon.revenue > 0 ? fmtEur(totalEcon.revenue) : '—'}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${
                      totalEcon.revenue > 0 ? (margin >= 0 ? 'text-emerald-600' : 'text-red-500') : 'text-slate-400'
                    }`}>
                      {totalEcon.revenue > 0 ? `${margin}%` : '—'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {monthlyByMember.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Monthly Hours by Member (Top 5)</h3>
              <ChartTimeFilter value={chartRange} defaultRange={initChartRange(entries)} onChange={setChartRange} />
              <div className="mt-4">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={monthlyByMember} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}h`} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={v => typeof v === 'number' ? fmtH(v, locale) : v} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    {topMembers.map((name, i) => (
                      <Bar key={name} dataKey={name} stackId="a" fill={COLORS[i % COLORS.length]} opacity={0.88} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TICKETS ── */}
      {activeTab === 'tickets' && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-medium">
              <tr>
                <th className="px-4 py-3 text-left">Ticket</th>
                <th className="px-4 py-3 text-left">WBS</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-right">Hours</th>
                <th className="px-4 py-3 text-right">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {ticketSummary.map(tk => {
                const isFixOps = typeof tk.id === 'number' && fixOpsTicketSet.has(tk.id as number);
                return (
                  <tr key={String(tk.id)} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {typeof tk.id === 'number' && (
                          <Link href={`/fmo/tickets/${tk.id}`} className="font-mono text-xs text-indigo-600 hover:text-indigo-800 shrink-0">#{tk.id}</Link>
                        )}
                        <span className="text-slate-700 truncate max-w-sm" title={tk.name}>{tk.name}</span>
                        {isFixOps && <span className="text-xs px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 shrink-0">Fixed Ops</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{tk.wbsCode ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${tk.billingClass === 'V' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {tk.billingClass === 'V' ? 'Billable' : 'Internal'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{fmtH(tk.hours, locale)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-400 text-xs">{totalHours > 0 ? `${Math.round(tk.hours / totalHours * 100)}%` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={3} className="px-4 py-2.5 font-medium text-slate-700">Total</td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-800">{fmtH(totalHours, locale)}</td>
                <td className="px-4 py-2.5 text-right text-slate-500 text-xs">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── FINANCIALS ── */}
      {activeTab === 'financials' && (
        <div className="space-y-6">
          {(!hasRates || !hasCostRates) && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              {!hasCostRates && 'Member cost rates are not configured. '}
              {!hasRates && 'No billing rates set for this project. '}
              Set rates in the{' '}
              <button className="underline" onClick={() => setActiveTab('team')}>Team tab</button>.
            </div>
          )}

          {/* Financial KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Cost',    value: totalEcon.cost    > 0 ? fmtEur(totalEcon.cost)    : '—', cls: 'text-red-600' },
              { label: 'Total Revenue', value: totalEcon.revenue > 0 ? fmtEur(totalEcon.revenue) : '—', cls: 'text-emerald-600' },
              { label: 'P&L',           value: totalEcon.revenue > 0 ? fmtEur(totalEcon.pl)      : '—', cls: totalEcon.pl >= 0 ? 'text-emerald-600' : 'text-red-500' },
              { label: 'Margin',        value: totalEcon.revenue > 0 ? `${margin}%`               : '—', cls: margin >= 0 ? 'text-emerald-600' : 'text-red-500' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white rounded-lg border border-slate-200 px-4 py-3">
                <p className="text-xs text-slate-400 mb-1">{kpi.label}</p>
                <p className={`text-xl font-bold ${kpi.cls}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          <ChartTimeFilter value={chartRange} defaultRange={initChartRange(entries)} onChange={setChartRange} />

          {/* Cost vs Revenue */}
          {economicsByMonth.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Cost vs Revenue per Month</h3>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={economicsByMonth} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [fmtEur(Number(v)), String(name)]} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="cost"      fill="#b91c1c" opacity={0.8}  name="Cost"        radius={[3,3,0,0]} />
                  <Bar dataKey="tmRevenue" fill="#0f766e" opacity={0.85} name="T&M Revenue" stackId="rev" radius={hasOpsFixed ? [0,0,0,0] : [3,3,0,0]} />
                  {hasOpsFixed && (
                    <Bar dataKey="opsRevenue" fill="#4338ca" opacity={0.85} name="Ops Revenue" stackId="rev" radius={[3,3,0,0]} />
                  )}
                  <Line type="monotone" dataKey="pl" stroke="#a16207" strokeWidth={2} dot={{ r: 3 }} name="P&L" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Cumulative P&L */}
          {economicsByMonth.length > 0 && hasRates && hasCostRates && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Cumulative P&L</h3>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={economicsByMonth} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [fmtEur(Number(v)), String(name)]} />
                  <Bar dataKey="revenue" fill="#dde1ff" name="Revenue" radius={[3,3,0,0]} opacity={0.7} />
                  <Line type="monotone" dataKey="cumPl" stroke="#4338ca" strokeWidth={2} dot={{ r: 3 }} name="Cumulative P&L" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── SETTINGS ── */}
      {activeTab === 'settings' && (
        <div className="space-y-6 max-w-2xl">

          {/* Project Type */}
          <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Project Type</h3>
            <div className="flex gap-2">
              {([
                ['tm',       'Time & Material', 'Hours billed at per-member rates'],
                ['fixprice', 'Fixed Price',      'Fixed contract with budget hours'],
              ] as const).map(([t, label, desc]) => (
                <button key={t} type="button" onClick={() => isAdmin && setProjType(t)} disabled={!isAdmin}
                  className={`flex-1 text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
                    projType === t ? 'border-slate-700 bg-slate-50' : 'border-slate-200 hover:border-slate-400'
                  } disabled:cursor-default`}>
                  <span className="font-medium block text-slate-800">{label}</span>
                  <span className="text-xs text-slate-400">{desc}</span>
                </button>
              ))}
            </div>
            {projType === 'fixprice' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Contract Value (€)</label>
                  <input type="number" min="0" value={contractValue} onChange={e => setContractValue(e.target.value)} disabled={!isAdmin}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Budget Hours (h)</label>
                  <input type="number" min="0" value={contractHours} onChange={e => setContractHours(e.target.value)} disabled={!isAdmin}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50" />
                </div>
              </div>
            )}
            {isAdmin && (
              <button disabled={savingConfig} onClick={async () => {
                setSavingConfig(true);
                await updateProjectConfig(project.id, {
                  projectType: projType,
                  contractValue: parseFloat(contractValue) || 0,
                  contractHours: parseFloat(contractHours) || 0,
                });
                setSavingConfig(false);
                router.refresh();
              }} className="px-4 py-2 bg-slate-800 text-white text-sm rounded hover:bg-slate-700 disabled:opacity-50">
                {savingConfig ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>

          {/* Operations Contracts */}
          <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Operations Contracts</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Per-hour: tickets billed normally · Pauschal: flat monthly fee regardless of hours
                </p>
              </div>
              {isAdmin && !showOpsForm && (
                <button onClick={() => setShowOpsForm(true)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-3 py-1.5">
                  + Add Contract
                </button>
              )}
            </div>
            {showOpsForm && isAdmin && (
              <OpsContractForm
                projectId={project.id}
                allTickets={Object.values(tickets)}
                onDone={() => { setShowOpsForm(false); router.refresh(); }}
                onCancel={() => setShowOpsForm(false)}
              />
            )}
            {(project.operationContracts ?? []).length === 0 && !showOpsForm && (
              <p className="text-sm text-slate-400">No operations contracts yet.</p>
            )}
            {(project.operationContracts ?? []).map(c => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{c.name}</p>
                  <p className="text-xs text-slate-500">
                    {c.type === 'fixprice' ? `${fmtEur(c.defaultMonthlyAmount)}/mo flat` : 'Per hour billed'}
                    {' · '}{c.ticketIds.length} ticket{c.ticketIds.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${c.type === 'fixprice' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}>
                  {c.type === 'fixprice' ? 'Pauschal' : 'Per Hour'}
                </span>
                {isAdmin && (
                  <button onClick={async () => {
                    if (!confirm(`Remove "${c.name}"?`)) return;
                    await removeProjectOperationContract(project.id, c.id);
                    router.refresh();
                  }} className="text-gray-300 hover:text-red-400 shrink-0">×</button>
                )}
              </div>
            ))}
          </div>

          {/* WBS Scope */}
          <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">WBS / Ticket Scope</h3>
                <p className="text-xs text-slate-400 mt-0.5">Which WBS codes and tickets feed into this project</p>
              </div>
              {isAdmin && (
                <button onClick={() => setEditingWbs(true)}
                  className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded px-3 py-1.5">
                  Edit WBS
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {project.wbsCodes.map(code => (
                <span key={code} className={`text-xs px-2 py-0.5 rounded-full font-mono border ${
                  code.startsWith('V.') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}>
                  {code}{wbs[code]?.label && <span className="ml-1 font-sans font-normal">{wbs[code].label}</span>}
                </span>
              ))}
              {(project.ticketIds ?? []).length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full border bg-indigo-50 border-indigo-200 text-indigo-600">
                  +{project.ticketIds.length} individual tickets
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* WBS edit modal */}
      {editingWbs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-sm font-semibold text-slate-800">Edit WBS Codes</h2>
              <button onClick={() => setEditingWbs(false)} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4">
              <div className="border border-slate-200 rounded divide-y divide-slate-100">
                {Object.values(wbs).sort((a, b) => a.code.localeCompare(b.code)).map(w => (
                  <label key={w.code} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={selectedWbs.includes(w.code)}
                      onChange={() => setSelectedWbs(prev =>
                        prev.includes(w.code) ? prev.filter(c => c !== w.code) : [...prev, w.code]
                      )} />
                    <span className="font-mono text-xs text-slate-500 shrink-0">{w.code}</span>
                    <span className="text-sm text-slate-700 truncate">{w.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t">
              <button onClick={() => setEditingWbs(false)} className="text-sm text-slate-500 px-4 py-2">Cancel</button>
              <button disabled={savingWbs} onClick={async () => {
                setSavingWbs(true);
                await updateFmoProject(project.id, project.name, project.description ?? '', selectedWbs, project.ticketIds ?? [], project.excludedTicketIds ?? []);
                setSavingWbs(false);
                setEditingWbs(false);
                router.refresh();
              }} className="bg-slate-800 text-white text-sm px-4 py-2 rounded hover:bg-slate-700 disabled:opacity-50">
                {savingWbs ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
