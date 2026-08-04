'use client';

import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Line, LineChart, ReferenceLine,
  PieChart, Pie, Cell,
} from 'recharts';
import { ProjektAnalysisEntry, ProjektAnalysisMemberSettings, ProjektAnalysisTicketForecast, ProjektAnalysisChange } from '@/lib/types';
import { formatMonth } from '@/lib/utils';

const COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#84cc16',
];
const getColor = (i: number) => COLORS[i % COLORS.length];

function fmtH(h: number) {
  return h.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'h';
}
function fmtEur(v: number) {
  return v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}
function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function ticketId(task: string): string {
  return task.match(/^(#\d+)/)?.[1] ?? '';
}
export function ticketLabel(task: string): string {
  return task.replace(/^#\d+ - /, '');
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function ChartShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 p-8 text-center text-gray-400 text-sm">
      {label}
    </div>
  );
}

function LegendPills({
  items,
  hidden,
  onToggle,
  onIsolate,
  onShowAll,
  onHideAll,
}: {
  items: { id: string; label: string; color: string }[];
  hidden: Set<string>;
  onToggle: (id: string) => void;
  onIsolate: (id: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {items.map(({ id, label, color }) => {
        const isHidden = hidden.has(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onToggle(id)}
            onDoubleClick={(e) => { e.preventDefault(); onIsolate(id); }}
            title="Click to toggle · Double-click to isolate"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer select-none ${
              isHidden ? 'bg-white text-gray-400 border-gray-200 opacity-50' : 'text-white border-transparent'
            }`}
            style={isHidden ? {} : { backgroundColor: color }}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isHidden ? '#d1d5db' : color }} />
            {label}
          </button>
        );
      })}
      <button type="button" onClick={onShowAll} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1">
        Show all
      </button>
      <button type="button" onClick={onHideAll} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1">
        Hide all
      </button>
    </div>
  );
}

// ─── Monthly Hours by Ticket ──────────────────────────────────────────────────

export function MonthlyByTicketChart({ entries }: { entries: ProjektAnalysisEntry[] }) {
  const months = [...new Set(entries.map(e => e.month))].sort();
  const tasks = [...new Set(entries.map(e => e.task))].sort();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  if (months.length === 0) return <Empty label="No data available" />;

  const items = tasks.map((t, i) => ({ id: t, label: ticketId(t) || t.slice(0, 12), color: getColor(i) }));

  const data = months.map(month => {
    const row: Record<string, any> = { month: formatMonth(month) };
    for (const task of tasks) {
      if (!hidden.has(task)) {
        row[task] = entries
          .filter(e => e.month === month && e.task === task)
          .reduce((s, e) => s + e.spentTime, 0);
      }
    }
    return row;
  });

  return (
    <ChartShell title="Hours per Month by Ticket">
      <LegendPills
        items={items}
        hidden={hidden}
        onToggle={(id) => setHidden(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
        onIsolate={(id) => setHidden(new Set(tasks.filter(t => t !== id)))}
        onShowAll={() => setHidden(new Set())}
        onHideAll={() => setHidden(new Set(tasks))}
      />
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}h`} />
          <Tooltip formatter={(v, name) => [fmtH(Number(v)), ticketId(String(name)) || String(name)]} />
          {tasks.filter(t => !hidden.has(t)).map((task, i) => (
            <Bar key={task} dataKey={task} stackId="a" fill={getColor(tasks.indexOf(task))} name={task} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

// ─── Monthly Hours by Employee ────────────────────────────────────────────────

export function MonthlyByUserChart({ entries }: { entries: ProjektAnalysisEntry[] }) {
  const months = [...new Set(entries.map(e => e.month))].sort();
  const users = [...new Set(entries.map(e => e.user))].sort();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  if (months.length === 0) return <Empty label="No data available" />;

  const items = users.map((u, i) => ({ id: u, label: u.split(' ')[0], color: getColor(i) }));

  const data = months.map(month => {
    const row: Record<string, any> = { month: formatMonth(month) };
    for (const user of users) {
      if (!hidden.has(user)) {
        row[user] = entries
          .filter(e => e.month === month && e.user === user)
          .reduce((s, e) => s + e.spentTime, 0);
      }
    }
    return row;
  });

  return (
    <ChartShell title="Hours per Month by Employee">
      <LegendPills
        items={items}
        hidden={hidden}
        onToggle={(id) => setHidden(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
        onIsolate={(id) => setHidden(new Set(users.filter(u => u !== id)))}
        onShowAll={() => setHidden(new Set())}
        onHideAll={() => setHidden(new Set(users))}
      />
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}h`} />
          <Tooltip formatter={(v, name) => [fmtH(Number(v)), String(name)]} />
          {users.filter(u => !hidden.has(u)).map((user) => (
            <Bar key={user} dataKey={user} stackId="a" fill={getColor(users.indexOf(user))} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

// ─── Activity Split per Month ─────────────────────────────────────────────────

export function ActivitySplitChart({ entries }: { entries: ProjektAnalysisEntry[] }) {
  const months = [...new Set(entries.map(e => e.month))].sort();
  if (months.length === 0) return <Empty label="No data available" />;

  const data = months.map(month => {
    const monthEntries = entries.filter(e => e.month === month);
    return {
      month: formatMonth(month),
      Work: monthEntries.filter(e => e.activity === 'Work').reduce((s, e) => s + e.spentTime, 0),
      Operations: monthEntries.filter(e => e.activity === 'Operations').reduce((s, e) => s + e.spentTime, 0),
    };
  });

  return (
    <ChartShell title="Work vs Operations per Month">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}h`} />
          <Tooltip formatter={(v, name) => [fmtH(Number(v)), String(name)]} />
          <Bar dataKey="Work" stackId="a" fill="#6366f1" />
          <Bar dataKey="Operations" stackId="a" fill="#f59e0b" />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" /> Work
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" /> Operations
        </span>
      </div>
    </ChartShell>
  );
}

// ─── Cumulative Hours (Burn-up) ───────────────────────────────────────────────

export function CumulativeChart({
  entries,
  totalExpectedHours,
}: {
  entries: ProjektAnalysisEntry[];
  totalExpectedHours: number;
}) {
  const months = [...new Set(entries.map(e => e.month))].sort();
  if (months.length === 0) return <Empty label="No data available" />;

  const monthHours: Record<string, number> = {};
  for (const e of entries) monthHours[e.month] = (monthHours[e.month] || 0) + e.spentTime;

  let cumulative = 0;
  const data = months.map(month => {
    cumulative += monthHours[month] || 0;
    return { month: formatMonth(month), Actual: Math.round(cumulative * 10) / 10 };
  });

  return (
    <ChartShell title="Cumulative Hours">
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}h`} />
          <Tooltip formatter={(v) => fmtH(Number(v))} />
          <Line type="monotone" dataKey="Actual" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
          {totalExpectedHours > 0 && (
            <ReferenceLine y={totalExpectedHours} stroke="#ef4444" strokeDasharray="6 3" label={{ value: 'Budget', position: 'right', fontSize: 10, fill: '#ef4444' }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

// ─── Cost vs Revenue per Month ────────────────────────────────────────────────

export function EconomicsChart({
  entries,
  memberSettings,
}: {
  entries: ProjektAnalysisEntry[];
  memberSettings: ProjektAnalysisMemberSettings[];
}) {
  const months = [...new Set(entries.map(e => e.month))].sort();
  const rateMap: Record<string, { costRate: number; billingRate: number }> = {};
  for (const s of memberSettings) rateMap[s.user] = s;

  if (months.length === 0 || memberSettings.length === 0) {
    return <Empty label="Set employee rates in the Employees tab to see economics" />;
  }

  const data = months.map(month => {
    const monthEntries = entries.filter(e => e.month === month);
    let cost = 0, revenue = 0;
    for (const e of monthEntries) {
      const r = rateMap[e.user];
      if (!r) continue;
      cost += e.spentTime * r.costRate;
      revenue += e.spentTime * r.billingRate;
    }
    return {
      month: formatMonth(month),
      Cost: Math.round(cost),
      Revenue: Math.round(revenue),
      'P&L': Math.round(revenue - cost),
    };
  });

  return (
    <ChartShell title="Cost vs Revenue per Month">
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(v, name) => [fmtEur(Number(v)), String(name)]} />
          <Bar dataKey="Cost" fill="#ef4444" opacity={0.8} />
          <Bar dataKey="Revenue" fill="#10b981" opacity={0.8} />
          <Line type="monotone" dataKey="P&L" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" /> Cost
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Revenue
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" /> P&L
        </span>
      </div>
    </ChartShell>
  );
}

// ─── Forecast Burn-up Chart ───────────────────────────────────────────────────

export function ForecastBurnupChart({
  entries,
  monthsRemaining,
  totalExpectedHours,
}: {
  entries: ProjektAnalysisEntry[];
  monthsRemaining: number;
  totalExpectedHours: number;
}) {
  const months = [...new Set(entries.map(e => e.month))].sort();
  if (months.length === 0) return <Empty label="No data available" />;

  const monthHours: Record<string, number> = {};
  for (const e of entries) monthHours[e.month] = (monthHours[e.month] || 0) + e.spentTime;

  const totalSpent = Object.values(monthHours).reduce((s, v) => s + v, 0);
  const avgBurn = months.length > 0 ? totalSpent / months.length : 0;

  let cumActual = 0;
  const historicalData = months.map(month => {
    cumActual += monthHours[month] || 0;
    return { month: formatMonth(month), Actual: Math.round(cumActual * 10) / 10, Projected: null as number | null };
  });

  const lastMonth = months[months.length - 1];
  let cumProjected = cumActual;
  const projectedData = Array.from({ length: Math.max(0, monthsRemaining) }, (_, i) => {
    const m = addMonths(lastMonth, i + 1);
    cumProjected += avgBurn;
    return { month: formatMonth(m), Actual: null as number | null, Projected: Math.round(Math.min(cumProjected, totalExpectedHours || Infinity) * 10) / 10 };
  });

  // Connect the last actual point to first projected point
  const bridge = projectedData.length > 0
    ? [{ month: historicalData[historicalData.length - 1].month, Actual: null, Projected: historicalData[historicalData.length - 1].Actual }]
    : [];

  const data = [...historicalData, ...bridge, ...projectedData];

  return (
    <ChartShell title="Burn-up Forecast">
      <p className="text-xs text-gray-400 mb-3">
        Avg burn: {fmtH(avgBurn)}/month · Spent: {fmtH(totalSpent)}
        {totalExpectedHours > 0 && ` · Budget: ${fmtH(totalExpectedHours)} · Remaining: ${fmtH(Math.max(0, totalExpectedHours - totalSpent))}`}
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}h`} />
          <Tooltip formatter={(v, name) => v != null ? [fmtH(Number(v)), String(name)] : ['']} />
          <Line type="monotone" dataKey="Actual" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          <Line type="monotone" dataKey="Projected" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} />
          {totalExpectedHours > 0 && (
            <ReferenceLine y={totalExpectedHours} stroke="#ef4444" strokeDasharray="6 3"
              label={{ value: `Budget ${fmtH(totalExpectedHours)}`, position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-4 border-t-2 border-indigo-500 inline-block" /> Actual
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-4 border-t-2 border-dashed border-indigo-500 inline-block" /> Projected
        </span>
        {totalExpectedHours > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-4 border-t-2 border-dashed border-red-400 inline-block" /> Budget
          </span>
        )}
      </div>
    </ChartShell>
  );
}

// ─── Per-Ticket Progress Bars ─────────────────────────────────────────────────

export function TicketProgressChart({
  entries,
  ticketForecasts,
}: {
  entries: ProjektAnalysisEntry[];
  ticketForecasts: ProjektAnalysisTicketForecast[];
}) {
  const taskHours: Record<string, number> = {};
  for (const e of entries) taskHours[e.task] = (taskHours[e.task] || 0) + e.spentTime;

  const ticketsWithHours = ticketForecasts
    .map(t => ({ ...t, spent: taskHours[t.task] || 0 }))
    .filter(t => t.spent > 0 || t.expectedHours > 0)
    .sort((a, b) => b.spent - a.spent);

  if (ticketsWithHours.length === 0) return <Empty label="Set expected hours in the Forecast tab" />;

  return (
    <ChartShell title="Spent vs Expected per Ticket">
      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {ticketsWithHours.map((t) => {
          const pct = t.expectedHours > 0 ? Math.min(100, (t.spent / t.expectedHours) * 100) : 0;
          const over = t.expectedHours > 0 && t.spent > t.expectedHours;
          return (
            <div key={t.task}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-600 truncate max-w-[60%]" title={ticketLabel(t.task)}>
                  <span className="font-mono text-gray-400 mr-1">{ticketId(t.task)}</span>
                  {ticketLabel(t.task)}
                </span>
                <span className={`text-xs font-medium ${over ? 'text-red-500' : 'text-gray-500'}`}>
                  {fmtH(t.spent)}{t.expectedHours > 0 ? ` / ${fmtH(t.expectedHours)}` : ''}
                </span>
              </div>
              {t.expectedHours > 0 ? (
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${over ? 'bg-red-400' : pct > 80 ? 'bg-amber-400' : 'bg-indigo-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              ) : (
                <div className="h-2 bg-gray-100 rounded-full">
                  <div className="h-full w-1 bg-gray-300 rounded-full" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ChartShell>
  );
}

// ─── Velocity Chart (universal) ───────────────────────────────────────────────

export function VelocityChart({ entries }: { entries: ProjektAnalysisEntry[] }) {
  const months = [...new Set(entries.map(e => e.month))].sort();
  if (months.length === 0) return <Empty label="No data available" />;

  const monthHours: Record<string, number> = {};
  for (const e of entries) monthHours[e.month] = (monthHours[e.month] || 0) + e.spentTime;

  const data = months.map((month, i) => {
    const h = monthHours[month] || 0;
    const window = months.slice(Math.max(0, i - 2), i + 1);
    const avg = window.reduce((s, m) => s + (monthHours[m] || 0), 0) / window.length;
    return {
      month: formatMonth(month),
      Hours: Math.round(h * 10) / 10,
      'Ø 3-Month': Math.round(avg * 10) / 10,
    };
  });

  return (
    <ChartShell title="Velocity — Hours per Month">
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}h`} />
          <Tooltip formatter={(v) => fmtH(Number(v))} />
          <Bar dataKey="Hours" fill="#e0e7ff" radius={[3, 3, 0, 0]} />
          <Line type="monotone" dataKey="Ø 3-Month" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-indigo-100 inline-block" /> Hours
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-4 border-t-2 border-indigo-500 inline-block" /> 3-Month Avg
        </span>
      </div>
    </ChartShell>
  );
}

// ─── Team Composition Donut (universal) ───────────────────────────────────────

export function TeamCompositionChart({ entries }: { entries: ProjektAnalysisEntry[] }) {
  const userHours: Record<string, number> = {};
  for (const e of entries) userHours[e.user] = (userHours[e.user] || 0) + e.spentTime;

  const data = Object.entries(userHours)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 }));

  if (data.length === 0) return <Empty label="No data available" />;

  const total = data.reduce((s, d) => s + d.value, 0);

  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, index }: any) => {
    const RADIAN = Math.PI / 180;
    const r = innerRadius + (outerRadius - innerRadius) * 1.45;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    const pct = Math.round((data[index].value / total) * 100);
    if (pct < 4) return null;
    return (
      <text x={x} y={y} fill="#6b7280" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={11}>
        {data[index].name.split(' ')[0]} {pct}%
      </text>
    );
  };

  return (
    <ChartShell title="Team Composition">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            dataKey="value"
            labelLine={false}
            label={renderLabel}
          >
            {data.map((_, i) => <Cell key={i} fill={getColor(i)} />)}
          </Pie>
          <Tooltip formatter={(v) => fmtH(Number(v))} />
        </PieChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

// ─── Monthly Billing Chart (T&M) ──────────────────────────────────────────────

export function MonthlyBillingChart({
  entries,
  memberSettings,
}: {
  entries: ProjektAnalysisEntry[];
  memberSettings: ProjektAnalysisMemberSettings[];
}) {
  const months = [...new Set(entries.map(e => e.month))].sort();
  const rateMap: Record<string, number> = {};
  for (const s of memberSettings) rateMap[s.user] = s.billingRate;

  const hasRates = memberSettings.some(s => s.billingRate > 0);
  if (!hasRates) return <Empty label="Set billing rates in the Employees tab to see monthly revenue" />;

  let cumRevenue = 0;
  const data = months.map(month => {
    const revenue = entries
      .filter(e => e.month === month)
      .reduce((s, e) => s + e.spentTime * (rateMap[e.user] || 0), 0);
    cumRevenue += revenue;
    return {
      month: formatMonth(month),
      Revenue: Math.round(revenue),
      Cumulative: Math.round(cumRevenue),
    };
  });

  return (
    <ChartShell title="Monthly Billing Revenue (T&M)">
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(v, name) => [fmtEur(Number(v)), String(name)]} />
          <Bar yAxisId="left" dataKey="Revenue" fill="#10b981" opacity={0.85} radius={[3, 3, 0, 0]} />
          <Line yAxisId="right" type="monotone" dataKey="Cumulative" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Monthly
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-4 border-t-2 border-indigo-500 inline-block" /> Cumulative
        </span>
      </div>
    </ChartShell>
  );
}

// ─── Festpreis Hours Burn-down ────────────────────────────────────────────────

export function FestpreisHoursBurndownChart({
  entries,
  contractHours,
}: {
  entries: ProjektAnalysisEntry[];
  contractHours: number;
}) {
  if (contractHours <= 0) return <Empty label="Set contract hours in Project Settings above" />;

  const months = [...new Set(entries.map(e => e.month))].sort();
  if (months.length === 0) return <Empty label="No data available" />;

  const monthHours: Record<string, number> = {};
  for (const e of entries) monthHours[e.month] = (monthHours[e.month] || 0) + e.spentTime;

  let spent = 0;
  const data = months.map(month => {
    spent += monthHours[month] || 0;
    return {
      month: formatMonth(month),
      Remaining: Math.max(0, Math.round((contractHours - spent) * 10) / 10),
      Spent: Math.round(spent * 10) / 10,
    };
  });

  const pct = Math.min(100, Math.round((spent / contractHours) * 100));

  return (
    <ChartShell title="Hours Burn-down (Festpreis)">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct > 90 ? 'bg-red-400' : pct > 75 ? 'bg-amber-400' : 'bg-indigo-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`text-xs font-semibold ${pct > 90 ? 'text-red-500' : 'text-gray-600'}`}>
          {pct}% used · {fmtH(Math.max(0, contractHours - spent))} remaining
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}h`} domain={[0, contractHours]} />
          <Tooltip formatter={(v) => fmtH(Number(v))} />
          <Bar dataKey="Remaining" stackId="a" fill="#e0e7ff" />
          <Bar dataKey="Spent" stackId="a" fill="#6366f1" radius={[3, 3, 0, 0]} />
          <ReferenceLine y={contractHours} stroke="#ef4444" strokeDasharray="6 3"
            label={{ value: `Budget ${fmtH(contractHours)}`, position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" /> Spent
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-indigo-100 inline-block" /> Remaining
        </span>
      </div>
    </ChartShell>
  );
}

// ─── Festpreis Cost vs Contract ───────────────────────────────────────────────

export function FestpreisCostChart({
  entries,
  memberSettings,
  contractValue,
  monthsRemaining,
}: {
  entries: ProjektAnalysisEntry[];
  memberSettings: ProjektAnalysisMemberSettings[];
  contractValue: number;
  monthsRemaining: number;
}) {
  const months = [...new Set(entries.map(e => e.month))].sort();
  if (months.length === 0) return <Empty label="No data available" />;
  if (contractValue <= 0) return <Empty label="Set contract value in Project Settings above" />;

  const rateMap: Record<string, number> = {};
  for (const s of memberSettings) rateMap[s.user] = s.costRate;

  const hasRates = memberSettings.some(s => s.costRate > 0);
  if (!hasRates) return <Empty label="Set cost rates in the Employees tab to see margin" />;

  const monthHours: Record<string, number> = {};
  for (const e of entries) monthHours[e.month] = (monthHours[e.month] || 0) + e.spentTime;

  const monthCost: Record<string, number> = {};
  for (const e of entries) monthCost[e.month] = (monthCost[e.month] || 0) + e.spentTime * (rateMap[e.user] || 0);

  let cumCost = 0;
  const historicalData = months.map(month => {
    cumCost += monthCost[month] || 0;
    return { month: formatMonth(month), Cost: Math.round(cumCost), Projected: null as number | null };
  });

  // Project forward at current avg cost rate
  const avgMonthCost = months.length > 0 ? cumCost / months.length : 0;
  const lastMonth = months[months.length - 1];
  let projCost = cumCost;
  const projectedData = Array.from({ length: Math.max(0, monthsRemaining) }, (_, i) => {
    const m = addMonths(lastMonth, i + 1);
    projCost += avgMonthCost;
    return { month: formatMonth(m), Cost: null as number | null, Projected: Math.round(projCost) };
  });

  const bridge = projectedData.length > 0
    ? [{ month: historicalData[historicalData.length - 1].month, Cost: null, Projected: historicalData[historicalData.length - 1].Cost }]
    : [];

  const data = [...historicalData, ...bridge, ...projectedData];
  const currentMargin = contractValue - cumCost;
  const projectedFinalCost = cumCost + avgMonthCost * monthsRemaining;
  const projectedMargin = contractValue - projectedFinalCost;

  return (
    <ChartShell title="Cost vs Contract Value (Festpreis)">
      <div className="flex gap-6 mb-3 text-xs">
        <div>
          <span className="text-gray-400">Current margin </span>
          <span className={`font-semibold ${currentMargin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {fmtEur(currentMargin)} ({Math.round((currentMargin / contractValue) * 100)}%)
          </span>
        </div>
        {monthsRemaining > 0 && (
          <div>
            <span className="text-gray-400">Projected final </span>
            <span className={`font-semibold ${projectedMargin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {fmtEur(projectedMargin)} ({Math.round((projectedMargin / contractValue) * 100)}%)
            </span>
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(v, name) => v != null ? [fmtEur(Number(v)), String(name)] : ['']} />
          <Line type="monotone" dataKey="Cost" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} name="Actual Cost" />
          <Line type="monotone" dataKey="Projected" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} name="Projected Cost" />
          <ReferenceLine y={contractValue} stroke="#10b981" strokeDasharray="6 3"
            label={{ value: `Contract ${fmtEur(contractValue)}`, position: 'insideTopRight', fontSize: 10, fill: '#10b981' }} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-4 border-t-2 border-red-400 inline-block" /> Actual Cost
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-4 border-t-2 border-dashed border-red-400 inline-block" /> Projected
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-4 border-t-2 border-dashed border-emerald-500 inline-block" /> Contract Value
        </span>
      </div>
    </ChartShell>
  );
}

// ─── Festpreis Kalkulation vs Verbrauch ───────────────────────────────────────

export function FestpreisKalkulationChart({
  entries,
  contractHours,
  contractValue,
  changes,
  monthsRemaining,
}: {
  entries: ProjektAnalysisEntry[];
  contractHours: number;
  contractValue: number;
  changes: ProjektAnalysisChange[];
  monthsRemaining: number;
}) {
  if (contractHours <= 0 && contractValue <= 0)
    return <Empty label="Set contract hours and value in Project Settings" />;

  const months = [...new Set(entries.map(e => e.month))].sort();
  const burnedHours = entries.reduce((s, e) => s + e.spentTime, 0);
  const totalNachtraege = changes.reduce((s, c) => s + c.value, 0);
  const totalContractValue = contractValue + totalNachtraege;
  const impliedRate = contractHours > 0 ? totalContractValue / contractHours : 0;
  const burnedValue = burnedHours * impliedRate;
  const remainingHours = Math.max(0, contractHours - burnedHours);
  const remainingValue = Math.max(0, totalContractValue - burnedValue);
  const totalMonths = months.length + monthsRemaining;
  const planPerMonth = totalMonths > 0 ? contractHours / totalMonths : 0;

  const monthHours: Record<string, number> = {};
  for (const e of entries) monthHours[e.month] = (monthHours[e.month] || 0) + e.spentTime;

  let cumBurned = 0;
  const data = months.map((month, i) => {
    cumBurned += monthHours[month] || 0;
    const planCum = planPerMonth * (i + 1);
    return {
      month: formatMonth(month),
      Verbrannt: Math.round(cumBurned * 10) / 10,
      Kalkulation: Math.round(planCum * 10) / 10,
    };
  });

  // projected future months
  const lastMonth = months[months.length - 1];
  if (lastMonth && monthsRemaining > 0) {
    let projCum = cumBurned;
    const avgBurn = months.length > 0 ? cumBurned / months.length : 0;
    for (let i = 0; i < monthsRemaining; i++) {
      projCum += avgBurn;
      const planCum = planPerMonth * (months.length + i + 1);
      data.push({
        month: formatMonth(addMonths(lastMonth, i + 1)),
        Verbrannt: Math.round(projCum * 10) / 10,
        Kalkulation: Math.round(planCum * 10) / 10,
      });
    }
  }

  const hPct = contractHours > 0 ? Math.round((burnedHours / contractHours) * 100) : 0;
  const vPct = totalContractValue > 0 ? Math.round((burnedValue / totalContractValue) * 100) : 0;

  return (
    <ChartShell title="Kalkulation vs. Verbrauch">
      {/* KPI comparison table */}
      <div className="grid grid-cols-3 gap-2 mb-5 text-xs">
        <div />
        <div className="text-center font-semibold text-gray-500">Stunden</div>
        <div className="text-center font-semibold text-gray-500">Wert</div>

        <div className="text-gray-500 flex items-center">Kalkuliert</div>
        <div className="text-center font-medium text-gray-800">
          {contractHours > 0 ? fmtH(contractHours) : '—'}
        </div>
        <div className="text-center font-medium text-gray-800">
          {contractValue > 0 ? fmtEur(contractValue) : '—'}
        </div>

        {changes.length > 0 && (
          <>
            <div className="text-gray-400 flex items-center pl-2">Nachträge</div>
            <div className="text-center text-gray-400">—</div>
            <div className="text-center text-emerald-600 font-medium">+{fmtEur(totalNachtraege)}</div>
          </>
        )}

        <div className="text-gray-500 flex items-center font-semibold border-t border-gray-100 pt-1">Gesamt</div>
        <div className="text-center font-semibold text-gray-800 border-t border-gray-100 pt-1">
          {contractHours > 0 ? fmtH(contractHours) : '—'}
        </div>
        <div className="text-center font-semibold text-gray-800 border-t border-gray-100 pt-1">
          {totalContractValue > 0 ? fmtEur(totalContractValue) : '—'}
        </div>

        <div className="text-indigo-600 flex items-center">Verbrannt</div>
        <div className="text-center text-indigo-700 font-medium">
          {fmtH(burnedHours)}
          {contractHours > 0 && <span className="text-gray-400 ml-1">({hPct}%)</span>}
        </div>
        <div className="text-center text-indigo-700 font-medium">
          {impliedRate > 0 ? fmtEur(burnedValue) : '—'}
          {totalContractValue > 0 && impliedRate > 0 && <span className="text-gray-400 ml-1">({vPct}%)</span>}
        </div>

        <div className="text-gray-500 flex items-center border-t border-gray-100 pt-1">Verbleibend</div>
        <div className={`text-center font-medium border-t border-gray-100 pt-1 ${remainingHours === 0 ? 'text-red-500' : 'text-gray-700'}`}>
          {contractHours > 0 ? fmtH(remainingHours) : '—'}
        </div>
        <div className={`text-center font-medium border-t border-gray-100 pt-1 ${remainingValue === 0 ? 'text-red-500' : 'text-gray-700'}`}>
          {totalContractValue > 0 && impliedRate > 0 ? fmtEur(remainingValue) : '—'}
        </div>
      </div>

      {/* Progress bars */}
      {contractHours > 0 && (
        <div className="space-y-2 mb-5">
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Stunden</span>
              <span>{hPct}% verbrannt</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${hPct > 100 ? 'bg-red-400' : hPct > 85 ? 'bg-amber-400' : 'bg-indigo-500'}`}
                style={{ width: `${Math.min(100, hPct)}%` }}
              />
            </div>
          </div>
          {totalContractValue > 0 && impliedRate > 0 && (
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Wert ({impliedRate > 0 ? `${fmtEur(impliedRate)}/h` : ''})</span>
                <span>{vPct}% verbrannt</span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${vPct > 100 ? 'bg-red-400' : vPct > 85 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, vPct)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Trajectory chart */}
      {data.length > 0 && (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}h`} />
            <Tooltip formatter={(v) => fmtH(Number(v))} />
            <Line type="monotone" dataKey="Verbrannt" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="Kalkulation" stroke="#d1d5db" strokeWidth={2} strokeDasharray="6 3" dot={false} />
            {contractHours > 0 && (
              <ReferenceLine y={contractHours} stroke="#ef4444" strokeDasharray="4 3"
                label={{ value: `Budget ${fmtH(contractHours)}`, position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}
      <div className="flex gap-4 mt-2">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-4 border-t-2 border-indigo-500 inline-block" /> Verbrannt (kumuliert)
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-4 border-t-2 border-dashed border-gray-300 inline-block" /> Linearplan
        </span>
      </div>
    </ChartShell>
  );
}
