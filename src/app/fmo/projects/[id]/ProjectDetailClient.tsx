'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRole } from '@/components/RoleProvider';
import { useLocale } from 'next-intl';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid,
} from 'recharts';
import { fmtH, fmtEur, type Locale } from '@/lib/i18n';
import type { FmoProject, FmoEntry, FmoMember, FmoWbsEntry, FmoTicket, WbsSubCategory } from '@/lib/types';
import { updateFmoProject } from '@/actions/fmoProjects';
import { ChartTimeFilter, initChartRange, type TimeRange } from '@/components/ChartTimeFilter';

type Tab = 'overview' | 'members' | 'tickets' | 'charts';

const COLORS = [
  '#4338ca', '#0f766e', '#c2410c', '#1d4ed8',
  '#7c3aed', '#a16207', '#b91c1c', '#475569', '#0e7490', '#9d174d',
];

const TOOLTIP_STYLE = {
  contentStyle: { fontSize: 12, borderRadius: 6, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,.06)' },
};

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

export default function ProjectDetailClient({
  project,
  entries,
  wbs,
  members,
  tickets,
  subCategories,
  allProjects,
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
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [chartRange, setChartRange] = useState<TimeRange>(() => initChartRange(entries));
  const [editingWbs, setEditingWbs]   = useState(false);
  const [selectedWbs, setSelectedWbs] = useState<string[]>(project.wbsCodes);
  const [saving, setSaving] = useState(false);

  const totalHours    = useMemo(() => entries.reduce((s, e) => s + e.spentTime, 0), [entries]);
  const billableHours = useMemo(() => entries.filter(e => e.billingClass === 'V').reduce((s, e) => s + e.spentTime, 0), [entries]);
  const internalHours = totalHours - billableHours;

  const chartEntries = useMemo(
    () => chartRange.from
      ? entries.filter(e => e.month >= chartRange.from && e.month <= chartRange.to)
      : entries,
    [entries, chartRange],
  );

  const allMonths = useMemo(() => [...new Set(chartEntries.map(e => e.month))].sort(), [chartEntries]);

  // Member breakdown
  const memberSummary = useMemo(() => {
    const map = new Map<string, { billable: number; internal: number }>();
    for (const e of entries) {
      const ex = map.get(e.user) ?? { billable: 0, internal: 0 };
      if (e.billingClass === 'V') ex.billable += e.spentTime;
      else ex.internal += e.spentTime;
      map.set(e.user, ex);
    }
    return [...map.entries()]
      .map(([name, h]) => ({ name, total: h.billable + h.internal, ...h }))
      .sort((a, b) => b.total - a.total);
  }, [entries]);

  // Ticket breakdown
  const ticketSummary = useMemo(() => {
    const map = new Map<number | string, { name: string; wbsCode: string | null; hours: number }>();
    for (const e of entries) {
      const key = e.ticketId ?? e.ticketName;
      const ex = map.get(key) ?? { name: e.ticketName, wbsCode: e.wbsCode, hours: 0 };
      ex.hours += e.spentTime;
      map.set(key, ex);
    }
    return [...map.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.hours - a.hours);
  }, [entries]);

  // Monthly bar data by WBS
  const monthlyByWbs = useMemo(() => {
    return allMonths.map(month => {
      const row: Record<string, any> = { month: month.slice(0, 7) };
      for (const code of project.wbsCodes) {
        row[code] = chartEntries.filter(e => e.month === month && e.wbsCode === code).reduce((s, e) => s + e.spentTime, 0);
      }
      return row;
    });
  }, [chartEntries, allMonths, project.wbsCodes]);

  // Monthly by member (top 5)
  const topMembers = useMemo(() => memberSummary.slice(0, 5).map(m => m.name), [memberSummary]);
  const monthlyByMember = useMemo(() => allMonths.map(month => {
    const row: Record<string, any> = { month: month.slice(0, 7) };
    for (const name of topMembers) row[name] = chartEntries.filter(e => e.month === month && e.user === name).reduce((s, e) => s + e.spentTime, 0);
    return row;
  }), [chartEntries, allMonths, topMembers]);

  // Pie: billable vs internal (chart-range aware)
  const pieBV = useMemo(() => {
    const chartBillable = chartEntries.filter(e => e.billingClass === 'V').reduce((s, e) => s + e.spentTime, 0);
    const chartInternal = chartEntries.reduce((s, e) => s + e.spentTime, 0) - chartBillable;
    return [
      { name: 'Billable', value: chartBillable, color: '#0f766e' },
      { name: 'Internal', value: chartInternal, color: '#475569' },
    ].filter(d => d.value > 0);
  }, [chartEntries]);

  async function saveWbs() {
    setSaving(true);
    await updateFmoProject(project.id, project.name, project.description ?? '', selectedWbs);
    setSaving(false);
    setEditingWbs(false);
    router.refresh();
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'members',  label: 'Members' },
    { id: 'tickets',  label: 'Tickets' },
    { id: 'charts',   label: 'Charts' },
  ];

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link href="/fmo/projects" className="text-slate-400 hover:text-slate-600 text-sm">← Projects</Link>
          <span className="text-slate-300">/</span>
          <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
        </div>
        {project.description && <p className="text-sm text-slate-500">{project.description}</p>}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {project.wbsCodes.map(code => (
            <span key={code} className={`text-xs px-2 py-0.5 rounded-full font-mono border ${code.startsWith('V.') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
              {code}
            </span>
          ))}
          {isAdmin && (
            <button onClick={() => setEditingWbs(true)}
              className="text-xs text-slate-400 hover:text-slate-700 border border-dashed border-slate-300 rounded-full px-2 py-0.5">
              Edit WBS
            </button>
          )}
        </div>
      </div>

      {/* Edit WBS modal */}
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
                    <input type="checkbox" checked={selectedWbs.includes(w.code)} onChange={() =>
                      setSelectedWbs(prev => prev.includes(w.code) ? prev.filter(c => c !== w.code) : [...prev, w.code])
                    } />
                    <span className="font-mono text-xs text-slate-500 shrink-0">{w.code}</span>
                    <span className="text-sm text-slate-700 truncate">{w.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t">
              <button onClick={() => setEditingWbs(false)} className="text-sm text-slate-500 px-4 py-2">Cancel</button>
              <button onClick={saveWbs} disabled={saving}
                className="bg-slate-800 text-white text-sm px-4 py-2 rounded hover:bg-slate-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Hours', value: fmtH(totalHours, locale) },
          { label: 'Billable', value: fmtH(billableHours, locale), sub: totalHours > 0 ? `${Math.round(billableHours / totalHours * 100)}%` : undefined },
          { label: 'Team Members', value: String(memberSummary.length) },
          { label: 'Tickets', value: String(ticketSummary.length) },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-400 mb-1">{kpi.label}</p>
            <p className="text-xl font-bold text-slate-800">{kpi.value}</p>
            {kpi.sub && <p className="text-xs text-slate-400">{kpi.sub}</p>}
          </div>
        ))}
      </div>

      {/* Tabs */}
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

      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <ChartTimeFilter value={chartRange} defaultRange={initChartRange(entries)} onChange={setChartRange} />
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Monthly Hours by WBS</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyByWbs} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}h`} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => typeof v === 'number' ? fmtH(v, locale) : v} />
                <Legend wrapperStyle={{ fontSize: '12px' }} formatter={code => wbs[code]?.label ?? code} />
                {project.wbsCodes.map((code, i) => (
                  <Bar key={code} dataKey={code} stackId="a" fill={COLORS[i % COLORS.length]} opacity={0.88} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Billable vs Internal</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={pieBV} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                  labelLine={false} label={PieLabel} opacity={0.9}>
                  {pieBV.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => typeof v === 'number' ? fmtH(v, locale) : v} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Members */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-medium">
                <tr>
                  <th className="px-4 py-3 text-left">Member</th>
                  <th className="px-4 py-3 text-right">Billable</th>
                  <th className="px-4 py-3 text-right">Internal</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {memberSummary.map(({ name, billable, internal, total }) => {
                  const m = Object.values(members).find(m => m.name === name);
                  return (
                    <tr key={name} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {m ? (
                            <Link href={`/fmo/members/${m.id}`} className="text-indigo-600 hover:text-indigo-800 font-medium">{name}</Link>
                          ) : <span className="font-medium text-slate-700">{name}</span>}
                          {m && <span className={`text-xs px-1.5 py-0.5 rounded ${m.type === 'intern' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}`}>{m.type}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-green-700">{fmtH(billable, locale)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{fmtH(internal, locale)}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-slate-800">{fmtH(total, locale)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-400 text-xs">{totalHours > 0 ? `${Math.round(total / totalHours * 100)}%` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-medium">
                <tr>
                  <td className="px-4 py-2.5 text-slate-700">Total</td>
                  <td className="px-4 py-2.5 text-right text-green-700">{fmtH(billableHours, locale)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{fmtH(internalHours, locale)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-800">{fmtH(totalHours, locale)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500 text-xs">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {monthlyByMember.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Monthly by Member</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthlyByMember} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}h`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v) => typeof v === 'number' ? fmtH(v, locale) : v} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  {topMembers.map((name, i) => <Bar key={name} dataKey={name} stackId="a" fill={COLORS[i % COLORS.length]} opacity={0.88} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Tickets */}
      {activeTab === 'tickets' && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-medium">
              <tr>
                <th className="px-4 py-3 text-left">Ticket</th>
                <th className="px-4 py-3 text-left">WBS</th>
                <th className="px-4 py-3 text-right">Hours</th>
                <th className="px-4 py-3 text-right">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {ticketSummary.map(tk => (
                <tr key={String(tk.id)} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {typeof tk.id === 'number' && (
                        <Link href={`/fmo/tickets/${tk.id}`} className="font-mono text-xs text-indigo-600 hover:text-indigo-800 shrink-0">#{tk.id}</Link>
                      )}
                      <span className="text-slate-700 truncate max-w-sm" title={tk.name}>{tk.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{tk.wbsCode ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{fmtH(tk.hours, locale)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-400 text-xs">{totalHours > 0 ? `${Math.round(tk.hours / totalHours * 100)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={2} className="px-4 py-2.5 font-medium text-slate-700">Total</td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-800">{fmtH(totalHours, locale)}</td>
                <td className="px-4 py-2.5 text-right text-slate-500 text-xs">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Charts */}
      {activeTab === 'charts' && (
        <div className="space-y-4">
          <ChartTimeFilter value={chartRange} defaultRange={initChartRange(entries)} onChange={setChartRange} />
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Monthly Hours by WBS Code</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyByWbs} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}h`} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => typeof v === 'number' ? fmtH(v, locale) : v} />
                <Legend wrapperStyle={{ fontSize: '12px' }} formatter={code => wbs[code]?.label ?? code} />
                {project.wbsCodes.map((code, i) => (
                  <Bar key={code} dataKey={code} stackId="a" fill={COLORS[i % COLORS.length]} opacity={0.88} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Monthly Hours by Member (Top 5)</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyByMember} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}h`} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => typeof v === 'number' ? fmtH(v, locale) : v} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                {topMembers.map((name, i) => <Bar key={name} dataKey={name} stackId="a" fill={COLORS[i % COLORS.length]} opacity={0.88} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Billable vs Internal</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={pieBV} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                  labelLine={false} label={PieLabel} opacity={0.9}>
                  {pieBV.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => typeof v === 'number' ? fmtH(v, locale) : v} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-4 text-sm text-amber-800">
          No time entries found for this project's WBS codes. Make sure you've imported CSV data and assigned tickets to the right WBS codes.
        </div>
      )}
    </div>
  );
}
