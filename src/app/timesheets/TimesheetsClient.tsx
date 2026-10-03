'use client';

import { useState, useRef, useMemo, useEffect, useTransition, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/components/RoleProvider';
import { TimesheetEntry, TimesheetStore, TicketRate } from '@/lib/types';
import {
  uploadTimesheetFiles,
  clearTimesheets,
  deleteTimesheetPerson,
  updateTimesheetBaseline,
  updateTicketRate,
  updateMemberCostRate,
} from '@/actions/timesheets';
import { useToast } from '@/components/ToastProvider';
import { useConfirm } from '@/components/ConfirmDialogProvider';
import {
  ComposedChart, BarChart, LineChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_BASELINE = 140; // 1 FTE = 1680h/year = 140h/month

function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

function fmtH(h: number): string {
  return h.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + 'h';
}

function fmtEur(v: number): string {
  return v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}

function fmtNet(v: number): string {
  if (v === 0) return '±0 €';
  return (v > 0 ? '+' : '') + fmtEur(v);
}

function netColor(n: number): string {
  return n > 0 ? 'text-emerald-600' : n < 0 ? 'text-red-500' : 'text-gray-400';
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

type ChartPoint = {
  month: string;        // display label e.g. "Jan '26"
  rawMonth: string;     // "YYYY-MM" for sorting
  billable: number;
  internal: number;
  unaccounted: number;
  avg3m: number;        // 3-month rolling average of total hours
  revenue: number;
  cost: number;
  capacityCost: number;
  utilizationPct: number;
  billablePct: number;
};

// ─── Trend Badge ──────────────────────────────────────────────────────────────

function TrendBadge({ delta, unit = '', goodWhenPositive = true }: {
  delta: number | null;
  unit?: string;
  goodWhenPositive?: boolean;
}) {
  if (delta === null || Math.abs(delta) < 0.5) return null;
  const isGood = goodWhenPositive ? delta > 0 : delta < 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full font-medium ${
      isGood ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
    }`}>
      {delta > 0 ? '↑' : '↓'} {Math.abs(delta)}{unit}
    </span>
  );
}

// ─── Hide Button ──────────────────────────────────────────────────────────────

function HideBtn({ isHidden, onToggle }: { isHidden: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={isHidden ? 'Restore row' : 'Hide row'}
      className={`w-5 h-5 flex items-center justify-center rounded text-xs transition-colors ${
        isHidden
          ? 'text-slate-500 bg-slate-50 hover:bg-slate-100'
          : 'text-orange-600 hover:text-gray-500 hover:bg-gray-100'
      }`}
    >
      {isHidden ? '↩' : '–'}
    </button>
  );
}

// ─── Rate Editor ──────────────────────────────────────────────────────────────

function RateEditor({ value, onChange }: {
  value: TicketRate;
  onChange: (billable: boolean, rate: number) => void;
}) {
  const isAdmin = useRole() === 'admin';
  const [rateInput, setRateInput] = useState(value.rate ? String(value.rate) : '');
  useEffect(() => { setRateInput(value.rate ? String(value.rate) : ''); }, [value.rate]);

  if (!isAdmin) return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${value.billable ? 'bg-emerald-50 text-emerald-700' : 'text-gray-400'}`}>
      {value.billable ? `Billable${value.rate ? ` · ${value.rate} €/h` : ''}` : 'Internal'}
    </span>
  );

  return (
    <div className="flex items-center gap-2 shrink-0">
      {value.billable && (
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            step={1}
            value={rateInput}
            onChange={e => setRateInput(e.target.value)}
            onBlur={() => {
              const r = Math.max(0, Number(rateInput) || 0);
              setRateInput(r ? String(r) : '');
              onChange(value.billable, r);
            }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="w-16 text-right border-0 border-b border-emerald-300 bg-transparent text-emerald-700 font-semibold focus:outline-none focus:border-emerald-500 text-xs"
            placeholder="rate"
          />
          <span className="text-xs text-gray-400">€/h</span>
        </div>
      )}
      <button
        type="button"
        onClick={() => onChange(!value.billable, value.rate)}
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
          value.billable
            ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
            : 'bg-gray-100 border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${value.billable ? 'bg-emerald-500' : 'bg-gray-300'}`} />
        {value.billable ? 'Billable' : 'Internal'}
      </button>
    </div>
  );
}

// ─── Person Table ─────────────────────────────────────────────────────────────

function PersonTable({ entries, baseline, onBaselineChange, staticMode = false }: {
  entries: TimesheetEntry[];
  baseline: number;
  onBaselineChange: (h: number) => void;
  staticMode?: boolean;
}) {
  const isAdmin = useRole() === 'admin';
  const [baselineInput, setBaselineInput] = useState(String(baseline));
  useEffect(() => { setBaselineInput(String(baseline)); }, [baseline]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setHidden(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  function rowHidden(project: string, task?: string) {
    if (hidden.has(`p:${project}`)) return true;
    if (task !== undefined && hidden.has(`t:${project}:::${task}`)) return true;
    return false;
  }

  const months = useMemo(() => [...new Set(entries.map(e => e.month))].sort(), [entries]);

  const tree = useMemo(() => {
    const map = new Map<string, Map<string, Map<string, number>>>();
    for (const e of entries) {
      if (!map.has(e.project)) map.set(e.project, new Map());
      const tMap = map.get(e.project)!;
      if (!tMap.has(e.task)) tMap.set(e.task, new Map());
      tMap.get(e.task)!.set(e.month, (tMap.get(e.task)!.get(e.month) ?? 0) + e.spentTime);
    }
    return map;
  }, [entries]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visibleEntries = useMemo(() => entries.filter(e => !rowHidden(e.project, e.task)), [entries, hidden]);
  const grandTotal = visibleEntries.reduce((s, e) => s + e.spentTime, 0);
  const totalPerMonth = useMemo(() => {
    const t: Record<string, number> = {};
    for (const e of visibleEntries) t[e.month] = (t[e.month] ?? 0) + e.spentTime;
    return t;
  }, [visibleEntries]);

  const hiddenCount = hidden.size;

  return (
    <div>
      {hiddenCount > 0 && (
        <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-600 flex items-center gap-2">
          <span>{hiddenCount} row{hiddenCount !== 1 ? 's' : ''} hidden — excluded from totals</span>
          <button type="button" onClick={() => setHidden(new Set())} className="underline hover:text-amber-800">restore all</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-max">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-200">
              <th className="w-8 px-2 py-2 sticky left-0 bg-gray-100" />
              <th className="text-left px-3 py-2 font-medium text-gray-600 min-w-[260px] sticky left-8 bg-gray-100">Project / Task</th>
              {months.map(m => (
                <th key={m} className="text-right px-3 py-2 font-medium text-gray-600 min-w-[72px] whitespace-nowrap">{fmtMonth(m)}</th>
              ))}
              <th className="text-right px-3 py-2 font-medium text-gray-700 min-w-[72px]">Total</th>
            </tr>
          </thead>
          <tbody>
            {[...tree.entries()].map(([project, taskMap]) => {
              const projHidden = hidden.has(`p:${project}`);
              const visProj = entries.filter(e => e.project === project && !rowHidden(e.project, e.task));
              const projPerMonth: Record<string, number> = {};
              for (const e of visProj) projPerMonth[e.month] = (projPerMonth[e.month] ?? 0) + e.spentTime;
              const projTotal = Object.values(projPerMonth).reduce((a, b) => a + b, 0);
              return (
                <Fragment key={project}>
                  <tr className={`border-b border-slate-100 ${projHidden ? 'opacity-40' : 'bg-slate-50'}`}>
                    <td className={`px-2 py-1.5 sticky left-0 ${projHidden ? 'bg-white' : 'bg-slate-50'}`}>
                      <HideBtn isHidden={projHidden} onToggle={() => toggle(`p:${project}`)} />
                    </td>
                    <td className={`px-3 py-1.5 font-semibold sticky left-8 ${projHidden ? 'text-orange-600 bg-white' : 'text-slate-700 bg-slate-50'}`}>{project}</td>
                    {months.map(m => (
                      <td key={m} className={`px-3 py-1.5 text-right font-medium ${projHidden ? 'text-orange-600' : 'text-slate-600'}`}>
                        {!projHidden && projPerMonth[m] ? fmtH(projPerMonth[m]) : '—'}
                      </td>
                    ))}
                    <td className={`px-3 py-1.5 text-right font-bold ${projHidden ? 'text-orange-600' : 'text-slate-700'}`}>
                      {projHidden ? '—' : fmtH(projTotal)}
                    </td>
                  </tr>
                  {[...taskMap.entries()].map(([task, monthMap]) => {
                    const taskHid = rowHidden(project, task);
                    const taskTotal = taskHid ? 0 : [...monthMap.values()].reduce((a, b) => a + b, 0);
                    return (
                      <tr key={`task-${task}`} className={`border-b border-gray-50 ${taskHid ? 'opacity-40' : 'hover:bg-gray-50/60'}`}>
                        <td className="px-2 py-1.5 sticky left-0 bg-white">
                          <HideBtn isHidden={taskHid} onToggle={() => toggle(`t:${project}:::${task}`)} />
                        </td>
                        <td className={`px-3 py-1.5 pl-5 sticky left-8 bg-white max-w-[280px] truncate ${taskHid ? 'text-orange-600' : 'text-gray-600'}`} title={task}>
                          ↳ {task}
                        </td>
                        {months.map(m => {
                          const h = taskHid ? 0 : (monthMap.get(m) ?? 0);
                          return (
                            <td key={m} className={`px-3 py-1.5 text-right ${h > 0 ? 'text-gray-700 font-medium' : 'text-gray-200'}`}>
                              {h > 0 ? fmtH(h) : '—'}
                            </td>
                          );
                        })}
                        <td className={`px-3 py-1.5 text-right ${taskHid ? 'text-orange-600' : 'text-gray-600 font-semibold'}`}>
                          {taskHid ? '—' : fmtH(taskTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
              <td className="sticky left-0 bg-gray-50" />
              <td className="px-3 py-2 text-gray-700 sticky left-8 bg-gray-50">
                Total{hiddenCount > 0 && <span className="ml-1 text-xs font-normal text-amber-500">(visible only)</span>}
              </td>
              {months.map(m => (
                <td key={m} className="px-3 py-2 text-right text-slate-700">{totalPerMonth[m] ? fmtH(totalPerMonth[m]) : '—'}</td>
              ))}
              <td className="px-3 py-2 text-right text-slate-700 font-bold">{fmtH(grandTotal)}</td>
            </tr>
            <tr className="bg-gray-50 border-t border-gray-200">
              <td className="sticky left-0 bg-gray-50" />
              <td className="px-3 py-1.5 text-gray-400 text-xs sticky left-8 bg-gray-50 font-normal">
                <span>utilization vs. </span>
                {isAdmin && !staticMode ? (
                  <input
                    type="number"
                    min={1}
                    value={baselineInput}
                    onChange={e => setBaselineInput(e.target.value)}
                    onBlur={() => {
                      const h = Math.max(1, Math.round(Number(baselineInput) || DEFAULT_BASELINE));
                      setBaselineInput(String(h));
                      if (h !== baseline) onBaselineChange(h);
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="w-12 text-center border-0 border-b border-gray-300 bg-transparent text-gray-600 font-semibold focus:outline-none focus:border-slate-500 text-xs"
                  />
                ) : <span className="font-semibold text-gray-600">{baseline}</span>}
                <span>h baseline</span>
              </td>
              {months.map(m => {
                const total = totalPerMonth[m] ?? 0;
                const diff = total - baseline;
                const pct = Math.round((diff / baseline) * 100);
                const over = diff > 0;
                const exact = diff === 0;
                const color = exact ? 'text-emerald-600' : over ? 'text-red-500' : 'text-amber-500';
                return (
                  <td key={m} className={`px-3 py-1.5 text-right text-xs font-medium ${total === 0 ? 'text-gray-200' : color}`}>
                    {total === 0 ? '—' : (
                      <>
                        {over ? '+' : ''}{diff.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h
                        <span className="block text-gray-400 font-normal">{over ? '+' : ''}{pct}%</span>
                      </>
                    )}
                  </td>
                );
              })}
              {(() => {
                const activeMonths = months.filter(m => (totalPerMonth[m] ?? 0) > 0);
                if (activeMonths.length === 0) return <td className="px-3 py-1.5 text-right text-xs text-orange-600">—</td>;
                const avgPct = Math.round(activeMonths.reduce((s, m) => s + ((totalPerMonth[m] - baseline) / baseline) * 100, 0) / activeMonths.length);
                const over = avgPct > 0;
                const exact = avgPct === 0;
                const color = exact ? 'text-emerald-600' : over ? 'text-red-500' : 'text-amber-500';
                return (
                  <td className={`px-3 py-1.5 text-right text-xs font-semibold ${color}`}>
                    Ø {over ? '+' : ''}{avgPct}%
                    <span className="block text-gray-400 font-normal text-xs">avg / mo</span>
                  </td>
                );
              })()}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Capacity Tooltip ─────────────────────────────────────────────────────────

type TooltipProps = {
  active?: boolean;
  payload?: Array<{ name: string; value: number; fill?: string; color?: string }>;
  label?: string;
};

function CapacityTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const get = (name: string) => payload.find(p => p.name === name)?.value ?? 0;
  const billable = get('Billable');
  const internal = get('Internal');
  const unaccounted = get('Unaccounted');
  const avg3m = payload.find(p => p.name === '3M avg')?.value;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-2.5 text-xs min-w-[140px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {billable > 0 && <p className="text-emerald-600 flex justify-between gap-3"><span>Billable</span><span className="font-medium">{fmtH(billable)}</span></p>}
      {internal > 0 && <p className="text-slate-500 flex justify-between gap-3"><span>Internal</span><span className="font-medium">{fmtH(internal)}</span></p>}
      {unaccounted > 0 && <p className="text-amber-500 flex justify-between gap-3"><span>Unaccounted</span><span className="font-medium">{fmtH(unaccounted)}</span></p>}
      {avg3m !== undefined && (
        <p className="text-gray-400 flex justify-between gap-3 mt-1 pt-1 border-t border-gray-100">
          <span>3M avg</span><span className="font-medium">{fmtH(avg3m)}</span>
        </p>
      )}
    </div>
  );
}

// ─── Charts ───────────────────────────────────────────────────────────────────

function MemberCharts({ chartData, baseline, costRate }: {
  chartData: ChartPoint[];
  baseline: number;
  costRate: number;
}) {
  const showFinancial = costRate > 0 || chartData.some(d => d.revenue > 0);
  const eurFmt = (v: number) => v >= 1000 ? `${Math.round(v / 1000)}k €` : `${v} €`;
  const pctFmt = (v: number) => `${v}%`;

  return (
    <div className="space-y-4">
      {/* Row 1: Capacity Breakdown + Efficiency Trend */}
      <div className="grid grid-cols-2 gap-4">

        {/* Capacity Breakdown — stacked bars + 3M avg line */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-600 mb-0.5">Monthly Time Allocation</p>
          <p className="text-xs text-gray-400 mb-3">
            Billable · Internal · Unaccounted — {baseline}h FTE capacity · 3M avg trend
          </p>
          <ResponsiveContainer width="100%" height={190}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 24, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
              <Tooltip content={<CapacityTooltip />} />
              <ReferenceLine y={baseline} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1.5} />
              <Bar dataKey="billable" name="Billable" fill="#10b981" stackId="a" />
              <Bar dataKey="internal" name="Internal" fill="#94a3b8" stackId="a" />
              <Bar dataKey="unaccounted" name="Unaccounted" fill="#fef3c7" stackId="a" radius={[3, 3, 0, 0]} />
              <Line type="monotone" dataKey="avg3m" name="3M avg" stroke="#475569" strokeWidth={2}
                dot={{ r: 2.5, fill: '#475569', strokeWidth: 0 }} strokeDasharray="5 3" connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 justify-center">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />Billable</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-300 inline-block" />Internal</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-200 inline-block" />Unaccounted</span>
            <span className="flex items-center gap-1"><span className="border-t-2 border-dashed border-slate-400 w-4 inline-block" />3M avg</span>
            <span className="flex items-center gap-1"><span className="border-t-2 border-dashed border-amber-400 w-4 inline-block" />{baseline}h</span>
          </div>
        </div>

        {/* Efficiency Trend — billable % + utilization % */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-600 mb-0.5">Efficiency Trend</p>
          <p className="text-xs text-gray-400 mb-3">Billable rate & FTE utilization per month — 70% target line</p>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={chartData} margin={{ top: 5, right: 24, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={34}
                domain={[0, 100]} tickFormatter={pctFmt} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
              <ReferenceLine y={70} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1}
                label={{ value: '70%', position: 'right', fontSize: 9, fill: '#f59e0b' }} />
              <Line type="monotone" dataKey="billablePct" name="Billable %" stroke="#10b981"
                strokeWidth={2.5} dot={{ r: 3.5, fill: '#10b981', strokeWidth: 0 }} connectNulls />
              <Line type="monotone" dataKey="utilizationPct" name="Utilization %" stroke="#475569"
                strokeWidth={2} dot={{ r: 3, fill: '#475569', strokeWidth: 0 }}
                strokeDasharray="5 3" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2: Revenue vs Cost (full width, only when financial data exists) */}
      {showFinancial && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-600 mb-0.5">Revenue vs. Cost — Monthly</p>
          <p className="text-xs text-gray-400 mb-3">
            Revenue earned · Logged cost · Full FTE capacity cost ({baseline}h × {costRate} €/h)
          </p>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={chartData} margin={{ top: 5, right: 24, bottom: 0, left: 10 }} barCategoryGap="30%" barGap={3}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={44} tickFormatter={eurFmt} />
              <Tooltip formatter={(v) => fmtEur(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
              <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="cost" name="Logged Cost" fill="#f87171" radius={[3, 3, 0, 0]} />
              {costRate > 0 && (
                <Bar dataKey="capacityCost" name="FTE Capacity Cost" fill="#e2e8f0" radius={[3, 3, 0, 0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Ticket Rates Panel ───────────────────────────────────────────────────────

function TicketRatesPanel({ user, entries, billingRates, costRate, onRateChange }: {
  user: string;
  entries: TimesheetEntry[];
  billingRates: Record<string, TicketRate>;
  costRate: number;
  onRateChange: (key: string, billable: boolean, rate: number) => void;
}) {
  const tickets = useMemo(() => {
    const map = new Map<string, { project: string; task: string; hours: number }>();
    for (const e of entries) {
      const key = `${user}:::${e.project}:::${e.task}`;
      if (!map.has(key)) map.set(key, { project: e.project, task: e.task, hours: 0 });
      map.get(key)!.hours += e.spentTime;
    }
    return [...map.entries()].sort(([, a], [, b]) => a.task.localeCompare(b.task));
  }, [entries, user]);

  const summary = useMemo(() => {
    let totalHours = 0, totalRevenue = 0;
    for (const [key, { hours }] of tickets) {
      const rate = billingRates[key];
      totalHours += hours;
      if (rate?.billable && rate.rate > 0) totalRevenue += hours * rate.rate;
    }
    const totalCost = totalHours * costRate;
    return { totalHours, totalRevenue, totalCost, delta: totalRevenue - totalCost };
  }, [tickets, billingRates, costRate]);

  const hasCost = costRate > 0;
  const hasRevenue = summary.totalRevenue > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 bg-slate-50">
        <p className="font-semibold text-sm text-slate-800">Billing Configuration</p>
        <p className="text-xs text-gray-400 mt-0.5">Per-ticket billing rate for this team member</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-max">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-5 py-2.5 font-medium text-gray-500">Ticket</th>
              <th className="text-right px-4 py-2.5 font-medium text-gray-500 w-20">Hours</th>
              {hasCost && <th className="text-right px-4 py-2.5 font-medium text-red-400 w-28">Cost</th>}
              <th className="text-right px-4 py-2.5 font-medium text-emerald-600 w-28">Billed</th>
              {hasCost && <th className="text-right px-4 py-2.5 font-medium text-gray-600 w-28">Delta</th>}
              <th className="text-right px-5 py-2.5 font-medium text-gray-500 w-44">Rate</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map(([key, { project, task, hours }]) => {
              const rate = billingRates[key] ?? { billable: false, rate: 0 };
              const revenue = rate.billable && rate.rate > 0 ? hours * rate.rate : 0;
              const ticketCost = hours * costRate;
              const delta = revenue - ticketCost;
              const deltaColor = delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-500' : 'text-gray-400';
              return (
                <tr key={key} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-5 py-2.5">
                    <p className="text-sm text-gray-800 truncate max-w-xs" title={task}>{task}</p>
                    <p className="text-xs text-gray-400">{project}</p>
                  </td>
                  <td className="text-right px-4 py-2.5 text-gray-400 tabular-nums">{fmtH(hours)}</td>
                  {hasCost && (
                    <td className="text-right px-4 py-2.5 text-red-400 font-medium tabular-nums">{fmtEur(ticketCost)}</td>
                  )}
                  <td className={`text-right px-4 py-2.5 font-medium tabular-nums ${revenue > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
                    {revenue > 0 ? fmtEur(revenue) : '—'}
                  </td>
                  {hasCost && (
                    <td className={`text-right px-4 py-2.5 font-semibold tabular-nums ${deltaColor}`}>
                      {fmtNet(delta)}
                    </td>
                  )}
                  <td className="px-5 py-2.5">
                    <div className="flex justify-end">
                      <RateEditor value={rate} onChange={(b, r) => onRateChange(key, b, r)} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {(hasCost || hasRevenue) && (
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                <td className="px-5 py-3 text-gray-600">Total</td>
                <td className="text-right px-4 py-3 text-gray-500 tabular-nums">{fmtH(summary.totalHours)}</td>
                {hasCost && (
                  <td className="text-right px-4 py-3 text-red-500 font-bold tabular-nums">{fmtEur(summary.totalCost)}</td>
                )}
                <td className={`text-right px-4 py-3 font-bold tabular-nums ${hasRevenue ? 'text-emerald-600' : 'text-gray-300'}`}>
                  {hasRevenue ? fmtEur(summary.totalRevenue) : '—'}
                </td>
                {hasCost && (
                  <td className={`text-right px-4 py-3 font-bold tabular-nums ${summary.delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {fmtNet(summary.delta)}
                  </td>
                )}
                <td className="px-5 py-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ─── Print View ───────────────────────────────────────────────────────────────

function PrintView({ user, entries, billingRates, costRates, baselines }: {
  user: string;
  entries: TimesheetEntry[];
  billingRates: Record<string, TicketRate>;
  costRates: Record<string, number>;
  baselines: Record<string, number>;
}) {
  const baseline = baselines[user] ?? DEFAULT_BASELINE;
  const costRate = costRates[user] ?? 0;

  const months = useMemo(() => [...new Set(entries.map(e => e.month))].sort(), [entries]);

  const tree = useMemo(() => {
    const map = new Map<string, Map<string, Map<string, number>>>();
    for (const e of entries) {
      if (!map.has(e.project)) map.set(e.project, new Map());
      const tMap = map.get(e.project)!;
      if (!tMap.has(e.task)) tMap.set(e.task, new Map());
      tMap.get(e.task)!.set(e.month, (tMap.get(e.task)!.get(e.month) ?? 0) + e.spentTime);
    }
    return map;
  }, [entries]);

  const { totalHours, billableHours, revenue, chartData, ticketList } = useMemo(() => {
    let totalHours = 0, billableHours = 0, revenue = 0;
    const mMap = new Map<string, { b: number; i: number; rev: number }>();
    const tickMap = new Map<string, { project: string; task: string; hours: number; revenue: number }>();
    for (const e of entries) {
      const rKey = `${user}:::${e.project}:::${e.task}`;
      const r = billingRates[rKey];
      const isBill = !!(r?.billable && r.rate > 0);
      const rev = isBill ? e.spentTime * r.rate : 0;
      totalHours += e.spentTime; if (isBill) { billableHours += e.spentTime; revenue += rev; }
      if (!mMap.has(e.month)) mMap.set(e.month, { b: 0, i: 0, rev: 0 });
      const md = mMap.get(e.month)!;
      if (isBill) md.b += e.spentTime; else md.i += e.spentTime;
      md.rev += rev;
      if (!tickMap.has(rKey)) tickMap.set(rKey, { project: e.project, task: e.task, hours: 0, revenue: 0 });
      const td = tickMap.get(rKey)!; td.hours += e.spentTime; td.revenue += rev;
    }
    const monthTotals = new Map(months.map(m => [m, (mMap.get(m)?.b ?? 0) + (mMap.get(m)?.i ?? 0)]));
    const chartData = months.map((m, i) => {
      const d = mMap.get(m) ?? { b: 0, i: 0, rev: 0 };
      const logged = d.b + d.i;
      const slice = months.slice(Math.max(0, i - 2), i + 1);
      const avg3m = round1(slice.reduce((s, mo) => s + (monthTotals.get(mo) ?? 0), 0) / slice.length);
      return {
        month: fmtMonth(m),
        billable: round1(d.b), internal: round1(d.i),
        unaccounted: round1(Math.max(0, baseline - logged)),
        avg3m,
        revenue: Math.round(d.rev),
        cost: Math.round(logged * costRate),
        capacityCost: Math.round(baseline * costRate),
        utilizationPct: baseline > 0 ? Math.round((logged / baseline) * 100) : 0,
        billablePct: logged > 0 ? Math.round((d.b / logged) * 100) : 0,
      };
    });
    return { totalHours, billableHours, revenue, chartData, ticketList: [...tickMap.entries()].sort(([, a], [, b]) => a.task.localeCompare(b.task)) };
  }, [entries, billingRates, costRate, user, months, baseline]);

  const cost = totalHours * costRate;
  const totalCapacity = baseline * months.length;
  const unaccountedHours = Math.max(0, totalCapacity - totalHours);
  const avgBillingRate = billableHours > 0 ? revenue / billableHours : 0;
  const untappedRevenue = unaccountedHours * avgBillingRate;
  const billablePct = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0;
  const utilizationPct = totalCapacity > 0 ? Math.round((totalHours / totalCapacity) * 100) : 0;
  const period = months.length > 0 ? `${fmtMonth(months[0])} – ${fmtMonth(months[months.length - 1])}` : '';
  const kpiBillColor = billablePct >= 70 ? '#10b981' : billablePct >= 50 ? '#f59e0b' : '#ef4444';
  const kpiUtilColor = utilizationPct >= 90 ? '#10b981' : utilizationPct >= 70 ? '#f59e0b' : '#ef4444';
  const s = { fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 11 } as const;
  const showFinancial = costRate > 0 || revenue > 0;

  return (
    <div style={{ ...s, width: 1100, padding: 36, background: '#ffffff', color: '#1e293b' }}>
      <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: '2px solid #e2e8f0' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#0f172a' }}>{user}</h1>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 0' }}>{period}</p>
        <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
          <span style={{ fontSize: 11, background: '#f1f5f9', borderRadius: 6, padding: '4px 10px', color: '#475569', fontWeight: 500 }}>
            Baseline: {baseline}h / month
          </span>
          <span style={{ fontSize: 11, background: costRate > 0 ? '#fef2f2' : '#f1f5f9', borderRadius: 6, padding: '4px 10px', color: costRate > 0 ? '#ef4444' : '#94a3b8', fontWeight: 500 }}>
            Cost rate: {costRate > 0 ? `${costRate} €/h` : 'not set'}
          </span>
          {costRate > 0 && (
            <span style={{ fontSize: 11, background: '#f1f5f9', borderRadius: 6, padding: '4px 10px', color: '#475569', fontWeight: 500 }}>
              Full FTE cost: {fmtEur(baseline * costRate)} / month
            </span>
          )}
        </div>
      </div>

      {/* KPI row 1 — Time */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        {[
          { label: 'Total Hours', value: fmtH(totalHours), color: '#475569' },
          { label: 'FTE Utilization', value: utilizationPct > 0 ? `${utilizationPct}%` : '—', color: kpiUtilColor },
          { label: 'Billable Rate', value: billablePct > 0 ? `${billablePct}%` : '—', color: billablePct > 0 ? kpiBillColor : '#94a3b8' },
          { label: 'Unaccounted', value: unaccountedHours > 0 ? fmtH(unaccountedHours) : '—', color: unaccountedHours > 0 ? '#f59e0b' : '#10b981' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
            <p style={{ fontSize: 9, color: '#94a3b8', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
            <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* KPI row 2 — Money */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
        {[
          { label: 'Revenue', value: revenue > 0 ? fmtEur(revenue) : '—', color: revenue > 0 ? '#10b981' : '#94a3b8' },
          { label: 'Cost', value: cost > 0 ? fmtEur(cost) : '—', color: cost > 0 ? '#ef4444' : '#94a3b8' },
          { label: 'Net P&L', value: revenue === 0 && cost === 0 ? '—' : fmtNet(revenue - cost), color: revenue === 0 && cost === 0 ? '#94a3b8' : (revenue - cost) >= 0 ? '#10b981' : '#ef4444' },
          { label: 'Untapped Potential', value: untappedRevenue > 0 ? fmtEur(untappedRevenue) : '—', color: untappedRevenue > 0 ? '#f59e0b' : '#94a3b8' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
            <p style={{ fontSize: 9, color: '#94a3b8', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
            <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
        <div style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#475569', margin: '0 0 4px' }}>Time Allocation + 3M Trend</p>
          <p style={{ fontSize: 9, color: '#94a3b8', margin: '0 0 12px' }}>Billable · Internal · Unaccounted · 3M avg line · {baseline}h baseline</p>
          <ComposedChart width={490} height={160} data={chartData} margin={{ top: 4, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={28} />
            <ReferenceLine y={baseline} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1.5} />
            <Bar dataKey="billable" name="Billable" fill="#10b981" stackId="a" />
            <Bar dataKey="internal" name="Internal" fill="#94a3b8" stackId="a" />
            <Bar dataKey="unaccounted" name="Unaccounted" fill="#fef3c7" stackId="a" radius={[2, 2, 0, 0]} />
            <Line type="monotone" dataKey="avg3m" stroke="#475569" strokeWidth={2} dot={false} strokeDasharray="5 3" connectNulls />
          </ComposedChart>
        </div>
        <div style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#475569', margin: '0 0 4px' }}>Efficiency Trend</p>
          <p style={{ fontSize: 9, color: '#94a3b8', margin: '0 0 12px' }}>Billable rate & FTE utilization — 70% target</p>
          <LineChart width={490} height={160} data={chartData} margin={{ top: 4, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={28} domain={[0, 100]} tickFormatter={v => `${v}%`} />
            <ReferenceLine y={70} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1} />
            <Line type="monotone" dataKey="billablePct" stroke="#10b981" strokeWidth={2} dot={{ r: 2.5, fill: '#10b981', strokeWidth: 0 }} connectNulls />
            <Line type="monotone" dataKey="utilizationPct" stroke="#475569" strokeWidth={2} dot={{ r: 2.5, fill: '#475569', strokeWidth: 0 }} strokeDasharray="5 3" connectNulls />
          </LineChart>
        </div>
      </div>

      {showFinancial && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 28 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#475569', margin: '0 0 4px' }}>Revenue vs. Cost</p>
          <p style={{ fontSize: 9, color: '#94a3b8', margin: '0 0 12px' }}>Revenue · Logged cost · FTE capacity cost</p>
          <BarChart width={1028} height={140} data={chartData} margin={{ top: 4, right: 10, bottom: 0, left: 10 }} barCategoryGap="30%" barGap={3}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={36} tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)} />
            <Bar dataKey="revenue" fill="#10b981" radius={[2, 2, 0, 0]} />
            <Bar dataKey="cost" fill="#f87171" radius={[2, 2, 0, 0]} />
            {costRate > 0 && <Bar dataKey="capacityCost" fill="#e2e8f0" radius={[2, 2, 0, 0]} />}
          </BarChart>
        </div>
      )}

      {/* Hours table */}
      <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: '0 0 10px' }}>Hours Breakdown</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, marginBottom: 28 }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <th style={{ textAlign: 'left', padding: '7px 10px', color: '#64748b', fontWeight: 600 }}>Project / Task</th>
            {months.map(m => (
              <th key={m} style={{ textAlign: 'right', padding: '7px 10px', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtMonth(m)}</th>
            ))}
            <th style={{ textAlign: 'right', padding: '7px 10px', color: '#334155', fontWeight: 600 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {[...tree.entries()].map(([project, taskMap]) => {
            const ppM: Record<string, number> = {};
            for (const [, mMap] of taskMap.entries()) for (const [m, h] of mMap.entries()) ppM[m] = (ppM[m] ?? 0) + h;
            const pTotal = Object.values(ppM).reduce((a, b) => a + b, 0);
            return (
              <Fragment key={project}>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '6px 10px', fontWeight: 700, color: '#334155' }}>{project}</td>
                  {months.map(m => <td key={m} style={{ textAlign: 'right', padding: '6px 10px', color: '#64748b' }}>{ppM[m] ? fmtH(ppM[m]) : '—'}</td>)}
                  <td style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 700, color: '#334155' }}>{fmtH(pTotal)}</td>
                </tr>
                {[...taskMap.entries()].map(([task, mMap]) => {
                  const tTotal = [...mMap.values()].reduce((a, b) => a + b, 0);
                  return (
                    <tr key={task} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '5px 10px 5px 22px', color: '#64748b' }}>↳ {task}</td>
                      {months.map(m => { const h = mMap.get(m) ?? 0; return <td key={m} style={{ textAlign: 'right', padding: '5px 10px', color: h > 0 ? '#334155' : '#e2e8f0' }}>{h > 0 ? fmtH(h) : '—'}</td>; })}
                      <td style={{ textAlign: 'right', padding: '5px 10px', fontWeight: 600, color: '#475569' }}>{fmtH(tTotal)}</td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f1f5f9' }}>
            <td style={{ padding: '7px 10px', fontWeight: 700, color: '#334155' }}>Total</td>
            {months.map(m => { const t = entries.filter(e => e.month === m).reduce((s, e) => s + e.spentTime, 0); return <td key={m} style={{ textAlign: 'right', padding: '7px 10px', fontWeight: 600, color: '#334155' }}>{t > 0 ? fmtH(t) : '—'}</td>; })}
            <td style={{ textAlign: 'right', padding: '7px 10px', fontWeight: 700, color: '#334155' }}>{fmtH(totalHours)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Ticket overview */}
      {ticketList.length > 0 && (
        <>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: '0 0 10px' }}>Ticket Overview</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '7px 10px', color: '#64748b', fontWeight: 600 }}>Ticket</th>
                <th style={{ textAlign: 'left', padding: '7px 10px', color: '#64748b', fontWeight: 600 }}>Project</th>
                <th style={{ textAlign: 'right', padding: '7px 10px', color: '#64748b', fontWeight: 600 }}>Hours</th>
                <th style={{ textAlign: 'right', padding: '7px 10px', color: '#64748b', fontWeight: 600 }}>Type</th>
                <th style={{ textAlign: 'right', padding: '7px 10px', color: '#64748b', fontWeight: 600 }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {ticketList.map(([key, { project, task, hours, revenue: tRev }]) => {
                const r = billingRates[key]; const isBill = !!(r?.billable && r.rate > 0);
                return (
                  <tr key={key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 10px', color: '#334155' }}>{task}</td>
                    <td style={{ padding: '6px 10px', color: '#94a3b8' }}>{project}</td>
                    <td style={{ textAlign: 'right', padding: '6px 10px', color: '#475569' }}>{fmtH(hours)}</td>
                    <td style={{ textAlign: 'right', padding: '6px 10px', color: isBill ? '#10b981' : '#94a3b8', fontWeight: isBill ? 600 : 400 }}>
                      {isBill ? `Billable · ${r.rate} €/h` : 'Internal'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '6px 10px', color: tRev > 0 ? '#10b981' : '#e2e8f0', fontWeight: tRev > 0 ? 600 : 400 }}>
                      {tRev > 0 ? fmtEur(tRev) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ─── Individual Member View ───────────────────────────────────────────────────

function IndividualMemberView({ user, entries, baselines, costRates, billingRates, onDeletePerson, onBaselineChange, onCostRateChange, onTicketRateChange }: {
  user: string;
  entries: TimesheetEntry[];
  baselines: Record<string, number>;
  costRates: Record<string, number>;
  billingRates: Record<string, TicketRate>;
  onDeletePerson: () => void;
  onBaselineChange: (h: number) => void;
  onCostRateChange: (rate: number) => void;
  onTicketRateChange: (key: string, billable: boolean, rate: number) => void;
}) {
  const isAdmin = useRole() === 'admin';
  const confirm = useConfirm();
  const toast = useToast();
  const baseline = baselines[user] ?? DEFAULT_BASELINE;
  const costRate = costRates[user] ?? 0;

  const [costInput, setCostInput] = useState(costRate ? String(costRate) : '');
  const [isPrinting, setIsPrinting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setCostInput(costRate ? String(costRate) : ''); }, [costRate]);

  useEffect(() => {
    if (!isPrinting || !printRef.current) return;
    const el = printRef.current;
    const tid = setTimeout(async () => {
      try {
        const { default: html2canvas } = await import('html2canvas');
        const { default: jsPDF } = await import('jspdf');
        const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 10;
        const printW = pageW - 2 * margin;
        const imgH = (canvas.height * printW) / canvas.width;
        const usableH = pageH - 2 * margin;
        const pages = Math.ceil(imgH / usableH);
        for (let i = 0; i < pages; i++) {
          if (i > 0) pdf.addPage();
          pdf.addImage(imgData, 'PNG', margin, margin - i * usableH, printW, imgH);
        }
        pdf.save(`${user.replace(/\s+/g, '_')}_timesheet.pdf`);
      } finally {
        setIsPrinting(false);
      }
    }, 350);
    return () => clearTimeout(tid);
  }, [isPrinting, user]);

  const months = useMemo(() => [...new Set(entries.map(e => e.month))].sort(), [entries]);

  const stats = useMemo(() => {
    let totalHours = 0, billableHours = 0, revenue = 0;
    for (const e of entries) {
      const r = billingRates[`${user}:::${e.project}:::${e.task}`];
      const isBill = !!(r?.billable && r.rate > 0);
      totalHours += e.spentTime;
      if (isBill) { billableHours += e.spentTime; revenue += e.spentTime * r.rate; }
    }
    const cost = totalHours * costRate;
    const totalCapacity = baseline * months.length;
    const unaccountedHours = Math.max(0, totalCapacity - totalHours);
    const avgBillingRate = billableHours > 0 ? revenue / billableHours : 0;
    const untappedRevenue = unaccountedHours * avgBillingRate;
    const capacityCost = totalCapacity * costRate;
    return {
      totalHours, billableHours, unaccountedHours,
      revenue, cost, net: revenue - cost,
      billablePct: totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0,
      utilizationPct: totalCapacity > 0 ? Math.round((totalHours / totalCapacity) * 100) : 0,
      totalCapacity, capacityCost, untappedRevenue, avgBillingRate,
    };
  }, [entries, billingRates, costRate, user, baseline, months]);

  const chartData: ChartPoint[] = useMemo(() => {
    const map = new Map<string, { b: number; i: number; rev: number; loggedCost: number }>();
    for (const e of entries) {
      const r = billingRates[`${user}:::${e.project}:::${e.task}`];
      const isBill = !!(r?.billable && r.rate > 0);
      if (!map.has(e.month)) map.set(e.month, { b: 0, i: 0, rev: 0, loggedCost: 0 });
      const d = map.get(e.month)!;
      if (isBill) { d.b += e.spentTime; d.rev += e.spentTime * r.rate; }
      else d.i += e.spentTime;
      d.loggedCost += e.spentTime * costRate;
    }
    const monthTotals = new Map(months.map(m => [m, (map.get(m)?.b ?? 0) + (map.get(m)?.i ?? 0)]));
    return months.map((m, i) => {
      const d = map.get(m) ?? { b: 0, i: 0, rev: 0, loggedCost: 0 };
      const logged = d.b + d.i;
      const slice = months.slice(Math.max(0, i - 2), i + 1);
      const avg3m = round1(slice.reduce((s, mo) => s + (monthTotals.get(mo) ?? 0), 0) / slice.length);
      return {
        month: fmtMonth(m), rawMonth: m,
        billable: round1(d.b), internal: round1(d.i),
        unaccounted: round1(Math.max(0, baseline - logged)),
        avg3m,
        revenue: Math.round(d.rev),
        cost: Math.round(d.loggedCost),
        capacityCost: Math.round(baseline * costRate),
        utilizationPct: baseline > 0 ? Math.round((logged / baseline) * 100) : 0,
        billablePct: logged > 0 ? Math.round((d.b / logged) * 100) : 0,
      };
    });
  }, [entries, billingRates, costRate, user, baseline, months]);

  // Month-over-month trend deltas for KPI cards
  const lastTwo = chartData.slice(-2);
  const billableDelta = lastTwo.length === 2 ? lastTwo[1].billablePct - lastTwo[0].billablePct : null;
  const utilizationDelta = lastTwo.length === 2 ? lastTwo[1].utilizationPct - lastTwo[0].utilizationPct : null;
  const revenueDelta = lastTwo.length === 2 ? lastTwo[1].revenue - lastTwo[0].revenue : null;

  const period = months.length > 0
    ? `${fmtMonth(months[0])} – ${fmtMonth(months[months.length - 1])}`
    : '';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{user}</h2>
          {period && <p className="text-sm text-gray-400 mt-0.5">{period}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isAdmin && (
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
              <span className="text-xs text-gray-400">Cost rate:</span>
              <input
                type="number" min={0} value={costInput}
                onChange={e => setCostInput(e.target.value)}
                onBlur={() => {
                  const r = Math.max(0, Number(costInput) || 0);
                  setCostInput(r ? String(r) : '');
                  if (r !== costRate) onCostRateChange(r);
                }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className="w-14 text-right border-0 border-b border-gray-300 bg-transparent text-gray-600 font-semibold focus:outline-none focus:border-slate-500 text-xs"
                placeholder="0"
              />
              <span className="text-xs text-gray-400">€/h</span>
            </div>
          )}
          <button
            type="button" onClick={() => setIsPrinting(true)} disabled={isPrinting}
            className="flex items-center gap-1.5 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <span>{isPrinting ? '…' : '↓'}</span>
            <span>{isPrinting ? 'Generating…' : 'Download PDF'}</span>
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={async () => {
                if (!await confirm(`Delete all data for ${user}?`, { body: 'All their timesheet entries will be permanently removed.', destructive: true, confirmLabel: 'Delete' })) return;
                onDeletePerson(); toast.success(`${user}'s data deleted`);
              }}
              className="text-xs text-red-400 hover:text-red-600 border border-red-200 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors"
            >Delete</button>
          )}
        </div>
      </div>

      {/* KPI Row 1 — Time allocation */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1.5 uppercase tracking-wide">Total Hours</p>
          <p className="text-xl font-bold text-slate-700">{fmtH(stats.totalHours)}</p>
          <p className="text-xs text-gray-400 mt-1">{stats.totalCapacity}h FTE capacity</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1 uppercase tracking-wide">FTE Utilization</p>
          <div className="flex items-baseline gap-2">
            <p className={`text-xl font-bold ${
              stats.utilizationPct >= 90 ? 'text-emerald-600'
              : stats.utilizationPct >= 70 ? 'text-amber-500'
              : stats.utilizationPct > 0 ? 'text-red-500'
              : 'text-gray-300'
            }`}>
              {stats.utilizationPct > 0 ? `${stats.utilizationPct}%` : '—'}
            </p>
            <TrendBadge delta={utilizationDelta} unit="pp" />
          </div>
          <p className="text-xs text-gray-400 mt-1">of {baseline}h/mo baseline</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Billable Rate</p>
          <div className="flex items-baseline gap-2">
            <p className={`text-xl font-bold ${
              stats.billablePct >= 70 ? 'text-emerald-600'
              : stats.billablePct >= 50 ? 'text-amber-500'
              : stats.billablePct > 0 ? 'text-red-500'
              : 'text-gray-300'
            }`}>
              {stats.billablePct > 0 ? `${stats.billablePct}%` : '—'}
            </p>
            <TrendBadge delta={billableDelta} unit="pp" />
          </div>
          <p className="text-xs text-gray-400 mt-1">{fmtH(stats.billableHours)} of logged time</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1.5 uppercase tracking-wide">Unaccounted</p>
          <p className={`text-xl font-bold ${stats.unaccountedHours > 0 ? 'text-amber-500' : 'text-emerald-600'}`}>
            {stats.unaccountedHours > 0 ? fmtH(stats.unaccountedHours) : '—'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {stats.unaccountedHours > 0 ? 'gap vs FTE capacity' : 'fully accounted'}
          </p>
        </div>
      </div>

      {/* KPI Row 2 — Money */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Revenue</p>
          <div className="flex items-baseline gap-2">
            <p className={`text-xl font-bold ${stats.revenue > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
              {stats.revenue > 0 ? fmtEur(stats.revenue) : '—'}
            </p>
            {revenueDelta !== null && revenueDelta !== 0 && (
              <TrendBadge delta={revenueDelta > 0 ? 1 : -1} unit={` ${Math.abs(revenueDelta) >= 1000 ? `${Math.round(Math.abs(revenueDelta) / 1000)}k €` : `${Math.abs(revenueDelta)} €`}`} />
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">{stats.avgBillingRate > 0 ? `Ø ${Math.round(stats.avgBillingRate)} €/h` : 'no billable tickets'}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-1.5 uppercase tracking-wide">Cost</p>
          <p className={`text-xl font-bold ${stats.cost > 0 ? 'text-red-500' : 'text-gray-300'}`}>
            {stats.cost > 0 ? fmtEur(stats.cost) : '—'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {stats.capacityCost > 0 ? `${fmtEur(stats.capacityCost)} full FTE cost` : 'no cost rate set'}
          </p>
        </div>
        <div className={`rounded-lg border p-4 ${
          stats.revenue === 0 && stats.cost === 0 ? 'bg-white border-gray-200'
          : stats.net >= 0 ? 'bg-emerald-50 border-emerald-200'
          : 'bg-red-50 border-red-200'
        }`}>
          <p className="text-xs text-gray-400 mb-1.5 uppercase tracking-wide">Net P&amp;L</p>
          <p className={`text-xl font-bold ${stats.revenue === 0 && stats.cost === 0 ? 'text-gray-300' : netColor(stats.net)}`}>
            {stats.revenue === 0 && stats.cost === 0 ? '—' : fmtNet(stats.net)}
          </p>
          <p className="text-xs text-gray-400 mt-1">logged hours basis</p>
        </div>
        <div className={`rounded-lg border p-4 ${stats.untappedRevenue > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
          <p className="text-xs text-gray-400 mb-1.5 uppercase tracking-wide">Untapped Potential</p>
          <p className={`text-xl font-bold ${stats.untappedRevenue > 0 ? 'text-amber-600' : 'text-gray-300'}`}>
            {stats.untappedRevenue > 0 ? fmtEur(stats.untappedRevenue) : '—'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {stats.unaccountedHours > 0 && stats.avgBillingRate > 0
              ? `${fmtH(stats.unaccountedHours)} × ${Math.round(stats.avgBillingRate)} €/h`
              : stats.unaccountedHours > 0 ? 'set billing rates to calculate'
              : 'no capacity gap'}
          </p>
        </div>
      </div>

      {/* Charts */}
      <MemberCharts chartData={chartData} baseline={baseline} costRate={costRate} />

      {/* Hours breakdown */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 bg-slate-50">
          <p className="font-semibold text-sm text-slate-800">Hours Breakdown</p>
        </div>
        <PersonTable entries={entries} baseline={baseline} onBaselineChange={onBaselineChange} />
      </div>

      {/* Billing configuration */}
      <TicketRatesPanel
        user={user} entries={entries} billingRates={billingRates} costRate={costRate} onRateChange={onTicketRateChange}
      />

      {/* Off-screen print capture */}
      {isPrinting && (
        <div style={{ position: 'fixed', top: -99999, left: -99999, pointerEvents: 'none', zIndex: -1 }}>
          <div ref={printRef}>
            <PrintView user={user} entries={entries} billingRates={billingRates} costRates={costRates} baselines={baselines} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TimesheetsClient({ store }: { store: TimesheetStore }) {
  const router = useRouter();
  const isAdmin = useRole() === 'admin';
  const confirm = useConfirm();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const users = useMemo(() => [...new Set(store.entries.map(e => e.user))].sort(), [store.entries]);
  const [selectedUser, setSelectedUser] = useState<string>(() => users[0] ?? '');

  useEffect(() => {
    if (users.length > 0 && !users.includes(selectedUser)) setSelectedUser(users[0]);
  }, [users, selectedUser]);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;
    setUploading(true); setUploadMsg(null);
    const fd = new FormData();
    for (const file of Array.from(files)) fd.append('files', file);
    const res = await uploadTimesheetFiles(fd);
    if (res.error) {
      setUploadMsg(`Error: ${res.error}`);
    } else {
      setUploadMsg(`Imported ${res.added} entries from ${files.length} file${files.length > 1 ? 's' : ''}. ${res.total} total entries stored.`);
      if (fileRef.current) fileRef.current.value = '';
      startTransition(() => router.refresh());
    }
    setUploading(false);
  }

  async function handleClear() {
    if (!await confirm('Delete all timesheet data?', { body: 'All entries for all members will be permanently removed.', destructive: true, confirmLabel: 'Delete all' })) return;
    await clearTimesheets();
    setUploadMsg(null);
    startTransition(() => router.refresh());
    toast.success('All timesheet data cleared');
  }

  const memberEntries = useMemo(() => store.entries.filter(e => e.user === selectedUser), [store.entries, selectedUser]);
  const overallTotal = store.entries.reduce((s, e) => s + e.spentTime, 0);
  const ticketCount = useMemo(() => new Set(store.entries.map(e => `${e.project}:::${e.task}`)).size, [store.entries]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Timesheets</h1>
        <p className="text-gray-500 text-sm">Upload CSV exports to review individual team member performance.</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          {isAdmin && (
            <form onSubmit={handleUpload} className="flex items-center gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">CSV files (one per team member)</label>
                <input ref={fileRef} type="file" accept=".csv" multiple
                  className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50 cursor-pointer" />
              </div>
              <button type="submit" disabled={uploading || isPending}
                className="self-end bg-slate-800 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-40">
                {uploading ? 'Importing…' : 'Upload'}
              </button>
            </form>
          )}
          {isAdmin && (
            <button onClick={handleClear} disabled={isPending}
              className="self-end text-xs text-red-500 hover:text-red-700 border border-red-200 px-3 py-1.5 rounded hover:bg-red-50 transition-colors disabled:opacity-40">
              Clear all
            </button>
          )}
        </div>

        {uploadMsg && (
          <p className={`mt-3 text-sm font-medium ${uploadMsg.startsWith('Error') ? 'text-red-600' : 'text-emerald-600'}`}>{uploadMsg}</p>
        )}

        {store.sources.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-400">Loaded:</span>
            {store.sources.map(s => (
              <span key={s} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s}</span>
            ))}
            <span className="text-xs text-gray-400 ml-2">·</span>
            <span className="text-xs text-gray-500">
              {users.length} {users.length === 1 ? 'person' : 'people'} · {ticketCount} tickets · {store.entries.length} entries · {fmtH(overallTotal)} total
            </span>
          </div>
        )}
      </div>

      {store.entries.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 px-6 py-16 text-center text-gray-400 text-sm">
          No data yet. Upload CSV files to get started.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-6">
            <span className="text-sm text-gray-500 font-medium">Team member:</span>
            <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white cursor-pointer">
              {users.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <span className="text-xs text-gray-400">{users.length} {users.length === 1 ? 'person' : 'people'} loaded</span>
          </div>

          {selectedUser && (
            <IndividualMemberView
              key={selectedUser}
              user={selectedUser}
              entries={memberEntries}
              baselines={store.baselines}
              costRates={store.costRates}
              billingRates={store.billingRates}
              onDeletePerson={async () => { await deleteTimesheetPerson(selectedUser); startTransition(() => router.refresh()); }}
              onBaselineChange={async (h) => { await updateTimesheetBaseline(selectedUser, h); startTransition(() => router.refresh()); }}
              onCostRateChange={async (rate) => { await updateMemberCostRate(selectedUser, rate); startTransition(() => router.refresh()); }}
              onTicketRateChange={async (key, billable, rate) => { await updateTicketRate(key, billable, rate); startTransition(() => router.refresh()); }}
            />
          )}
        </>
      )}
    </div>
  );
}
