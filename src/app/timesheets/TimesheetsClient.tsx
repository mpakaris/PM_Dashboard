'use client';

import { useState, useRef, useMemo, useEffect, useTransition, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { TimesheetEntry, TimesheetStore, TicketRate } from '@/lib/types';
import {
  uploadTimesheetFiles,
  clearTimesheets,
  deleteTimesheetPerson,
  updateTimesheetBaseline,
  updateTicketRate,
  updateMemberCostRate,
} from '@/actions/timesheets';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

function fmtH(h: number): string {
  return h.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + 'h';
}

function fmtEur(v: number): string {
  return v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
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

function RateEditor({
  value,
  onChange,
}: {
  value: TicketRate;
  onChange: (billable: boolean, rate: number) => void;
}) {
  const [rateInput, setRateInput] = useState(value.rate ? String(value.rate) : '');
  useEffect(() => { setRateInput(value.rate ? String(value.rate) : ''); }, [value.rate]);

  return (
    <div className="flex items-center gap-2 shrink-0">
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
    </div>
  );
}

// ─── Person Table ─────────────────────────────────────────────────────────────

function PersonTable({ entries, baseline, onBaselineChange }: {
  entries: TimesheetEntry[];
  baseline: number;
  onBaselineChange: (h: number) => void;
}) {
  const [baselineInput, setBaselineInput] = useState(String(baseline));
  useEffect(() => { setBaselineInput(String(baseline)); }, [baseline]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setHidden(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
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
      const mMap = tMap.get(e.task)!;
      mMap.set(e.month, (mMap.get(e.month) ?? 0) + e.spentTime);
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
                <input
                  type="number"
                  min={1}
                  value={baselineInput}
                  onChange={e => setBaselineInput(e.target.value)}
                  onBlur={() => {
                    const h = Math.max(1, Math.round(Number(baselineInput) || 160));
                    setBaselineInput(String(h));
                    if (h !== baseline) onBaselineChange(h);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  className="w-12 text-center border-0 border-b border-gray-300 bg-transparent text-gray-600 font-semibold focus:outline-none focus:border-slate-500 text-xs"
                />
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

// ─── Member Card ──────────────────────────────────────────────────────────────

function MemberCard({ user, entries, baseline, costRate, onDeletePerson, onBaselineChange, onCostRateChange }: {
  user: string;
  entries: TimesheetEntry[];
  baseline: number;
  costRate: number;
  onDeletePerson: () => void;
  onBaselineChange: (h: number) => void;
  onCostRateChange: (rate: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [costInput, setCostInput] = useState(costRate ? String(costRate) : '');
  useEffect(() => { setCostInput(costRate ? String(costRate) : ''); }, [costRate]);

  const total = entries.reduce((s, e) => s + e.spentTime, 0);
  const months = useMemo(() => [...new Set(entries.map(e => e.month))].sort(), [entries]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setIsOpen(v => !v)}
          className="flex-1 px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <span className={`text-gray-400 text-xs transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
            <span className="font-semibold text-gray-800">{user}</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {months.length} month{months.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-gray-400">
              {months.length > 0 && `${fmtMonth(months[0])} – ${fmtMonth(months[months.length - 1])}`}
            </span>
            <span className="text-slate-600 font-bold">{fmtH(total)}</span>
          </div>
        </button>
        <div
          className="flex items-center gap-1.5 px-3 py-3.5 border-l border-gray-100"
          title="Internal cost rate per hour"
        >
          <span className="text-xs text-gray-400">Cost:</span>
          <input
            type="number"
            min={0}
            value={costInput}
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
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete all timesheet data for ${user}?`)) onDeletePerson();
          }}
          className="px-4 py-3.5 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors border-l border-gray-100"
          title="Delete this person's timesheets"
        >
          Delete
        </button>
      </div>
      {isOpen && (
        <div className="border-t border-gray-100">
          <PersonTable
            entries={entries}
            baseline={baseline}
            onBaselineChange={onBaselineChange}
          />
        </div>
      )}
    </div>
  );
}

// ─── By Member View ───────────────────────────────────────────────────────────

function ByMemberView({ entries, baselines, costRates, onDeletePerson, onBaselineChange, onCostRateChange }: {
  entries: TimesheetEntry[];
  baselines: Record<string, number>;
  costRates: Record<string, number>;
  onDeletePerson: (user: string) => void;
  onBaselineChange: (user: string, h: number) => void;
  onCostRateChange: (user: string, rate: number) => void;
}) {
  const userMap = useMemo(() => {
    const map = new Map<string, TimesheetEntry[]>();
    for (const e of entries) {
      if (!map.has(e.user)) map.set(e.user, []);
      map.get(e.user)!.push(e);
    }
    return map;
  }, [entries]);

  const users = useMemo(() => [...userMap.keys()].sort(), [userMap]);
  const overallTotal = entries.reduce((s, e) => s + e.spentTime, 0);

  return (
    <div className="space-y-3">
      {users.map(user => (
        <MemberCard
          key={user}
          user={user}
          entries={userMap.get(user)!}
          baseline={baselines[user] ?? 160}
          costRate={costRates[user] ?? 0}
          onDeletePerson={() => onDeletePerson(user)}
          onBaselineChange={h => onBaselineChange(user, h)}
          onCostRateChange={rate => onCostRateChange(user, rate)}
        />
      ))}
      <div className="bg-gray-50 rounded-lg border border-gray-200 px-5 py-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-600">Grand Total — all {users.length} people</span>
        <span className="text-lg font-bold text-slate-700">{fmtH(overallTotal)}</span>
      </div>
    </div>
  );
}

// ─── Ticket Table ─────────────────────────────────────────────────────────────

function TicketTable({
  ticketEntries,
  title,
  subtitle,
  isSummary = false,
  billingRates = {},
  singleKey,
  onRateChange,
}: {
  ticketEntries: TimesheetEntry[];
  title: string;
  subtitle?: string;
  isSummary?: boolean;
  billingRates?: Record<string, TicketRate>;
  singleKey?: string;
  onRateChange?: (key: string, billable: boolean, rate: number) => void;
}) {
  const months = useMemo(() => [...new Set(ticketEntries.map(e => e.month))].sort(), [ticketEntries]);

  const userMonthMap = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const e of ticketEntries) {
      if (!map.has(e.user)) map.set(e.user, new Map());
      const mm = map.get(e.user)!;
      mm.set(e.month, (mm.get(e.month) ?? 0) + e.spentTime);
    }
    return map;
  }, [ticketEntries]);

  const userRevenueMap = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const e of ticketEntries) {
      const key = `${e.project}:::${e.task}`;
      const r = billingRates[key];
      if (!r?.billable || !r.rate) continue;
      if (!map.has(e.user)) map.set(e.user, new Map());
      const mm = map.get(e.user)!;
      mm.set(e.month, (mm.get(e.month) ?? 0) + e.spentTime * r.rate);
    }
    return map;
  }, [ticketEntries, billingRates]);

  const hasRevenue = userRevenueMap.size > 0;
  const users = useMemo(() => [...userMonthMap.keys()].sort(), [userMonthMap]);

  const totalPerMonth: Record<string, number> = {};
  for (const e of ticketEntries) totalPerMonth[e.month] = (totalPerMonth[e.month] ?? 0) + e.spentTime;
  const grandTotal = ticketEntries.reduce((s, e) => s + e.spentTime, 0);

  const revenuePerMonth: Record<string, number> = {};
  for (const mm of userRevenueMap.values()) {
    for (const [m, v] of mm) revenuePerMonth[m] = (revenuePerMonth[m] ?? 0) + v;
  }
  const grandRevenue = Object.values(revenuePerMonth).reduce((a, b) => a + b, 0);

  const currentRate = singleKey ? (billingRates[singleKey] ?? { billable: false, rate: 0 }) : null;

  const headerBg = isSummary ? 'bg-slate-800' : 'bg-slate-50';
  const headerText = isSummary ? 'text-white' : 'text-slate-800';
  const headerSub = isSummary ? 'text-slate-300' : 'text-slate-400';

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className={`px-5 py-3.5 border-b border-gray-100 ${headerBg}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            {subtitle && <p className={`text-xs font-medium mb-0.5 ${headerSub}`}>{subtitle}</p>}
            <p className={`font-semibold text-sm ${headerText}`}>{title}</p>
            <p className={`text-xs mt-0.5 ${isSummary ? 'text-slate-400' : 'text-gray-400'}`}>
              {users.length} member{users.length !== 1 ? 's' : ''} · {fmtH(grandTotal)} total
              {hasRevenue && ` · ${fmtEur(grandRevenue)} revenue`}
            </p>
          </div>
          {currentRate !== null && (
            <RateEditor
              value={currentRate}
              onChange={(billable, rate) => onRateChange?.(singleKey!, billable, rate)}
            />
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-max">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-200">
              <th className="text-left px-4 py-2.5 font-medium text-gray-600 min-w-[200px] sticky left-0 bg-gray-100">Team Member</th>
              {months.map(m => (
                <th key={m} className="text-right px-3 py-2.5 font-medium text-gray-600 min-w-[72px] whitespace-nowrap">{fmtMonth(m)}</th>
              ))}
              <th className="text-right px-3 py-2.5 font-medium text-gray-700 min-w-[72px]">Total</th>
              {hasRevenue && <th className="text-right px-3 py-2.5 font-medium text-emerald-600 min-w-[100px]">Revenue</th>}
            </tr>
          </thead>
          <tbody>
            {users.map((user, idx) => {
              const mm = userMonthMap.get(user)!;
              const rm = userRevenueMap.get(user);
              const userTotal = [...mm.values()].reduce((a, b) => a + b, 0);
              const userRevenue = rm ? [...rm.values()].reduce((a, b) => a + b, 0) : 0;
              return (
                <tr key={user} className={`border-b border-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                  <td className="px-4 py-2 font-medium text-gray-800 sticky left-0 bg-inherit">{user}</td>
                  {months.map(m => {
                    const h = mm.get(m) ?? 0;
                    return (
                      <td key={m} className={`px-3 py-2 text-right ${h > 0 ? 'text-gray-700 font-medium' : 'text-gray-200'}`}>
                        {h > 0 ? fmtH(h) : '—'}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right text-slate-600 font-semibold">{fmtH(userTotal)}</td>
                  {hasRevenue && (
                    <td className={`px-3 py-2 text-right font-semibold ${userRevenue > 0 ? 'text-emerald-600' : 'text-gray-200'}`}>
                      {userRevenue > 0 ? fmtEur(userRevenue) : '—'}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className={`border-t-2 font-semibold ${isSummary ? 'border-slate-700 bg-slate-100' : 'border-gray-300 bg-gray-50'}`}>
              <td className={`px-4 py-2 sticky left-0 ${isSummary ? 'text-slate-800 bg-slate-100' : 'text-gray-700 bg-gray-50'}`}>Total</td>
              {months.map(m => (
                <td key={m} className={`px-3 py-2 text-right ${isSummary ? 'text-slate-700' : 'text-slate-600'}`}>
                  {totalPerMonth[m] ? fmtH(totalPerMonth[m]) : '—'}
                </td>
              ))}
              <td className={`px-3 py-2 text-right font-bold ${isSummary ? 'text-slate-800' : 'text-slate-700'}`}>{fmtH(grandTotal)}</td>
              {hasRevenue && (
                <td className="px-3 py-2 text-right font-bold text-emerald-700">{fmtEur(grandRevenue)}</td>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── By Ticket View ───────────────────────────────────────────────────────────

function ByTicketView({
  entries,
  selectedKeys,
  setSelectedKeys,
  billingRates,
  onRateChange,
}: {
  entries: TimesheetEntry[];
  selectedKeys: Set<string>;
  setSelectedKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  billingRates: Record<string, TicketRate>;
  onRateChange: (key: string, billable: boolean, rate: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 10);
  }, [open]);

  const tickets = useMemo(() => {
    const map = new Map<string, { project: string; task: string }>();
    for (const e of entries) {
      const key = `${e.project}:::${e.task}`;
      if (!map.has(key)) map.set(key, { project: e.project, task: e.task });
    }
    return [...map.entries()].sort(([, a], [, b]) => a.task.localeCompare(b.task));
  }, [entries]);

  const filteredTickets = useMemo(() => {
    if (!search.trim()) return tickets;
    const q = search.toLowerCase();
    return tickets.filter(([, { project, task }]) =>
      task.toLowerCase().includes(q) || project.toLowerCase().includes(q)
    );
  }, [tickets, search]);

  function toggle(key: string) {
    setSelectedKeys(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }

  const selectedList = tickets.filter(([k]) => selectedKeys.has(k));

  const entriesForKey = (key: string) => {
    const t = tickets.find(([k]) => k === key)?.[1];
    if (!t) return [];
    return entries.filter(e => e.project === t.project && e.task === t.task);
  };

  const allSelectedEntries = useMemo(
    () => entries.filter(e => selectedKeys.has(`${e.project}:::${e.task}`)),
    [entries, selectedKeys]
  );

  const triggerLabel = selectedKeys.size === 0
    ? `Select tickets… (${tickets.length} available)`
    : selectedKeys.size === 1
      ? selectedList[0]?.[1].task ?? ''
      : `${selectedKeys.size} tickets selected`;

  return (
    <div className="space-y-4">
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-between bg-white border border-gray-300 rounded-md px-3 py-2.5 text-sm text-left focus:outline-none focus:ring-2 focus:ring-slate-400 hover:border-slate-400 transition-colors"
        >
          <span className={selectedKeys.size === 0 ? 'text-gray-400' : 'text-gray-800 font-medium'}>{triggerLabel}</span>
          <div className="flex items-center gap-2">
            {selectedKeys.size > 0 && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); setSelectedKeys(new Set()); }}
                className="text-gray-400 hover:text-gray-600 text-xs px-1"
                title="Clear selection"
              >✕</span>
            )}
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {open && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg flex flex-col max-h-[600px]">
            <div className="px-3 py-2.5 border-b border-gray-100 shrink-0">
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search tickets…"
                className="w-full text-sm border border-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-400 placeholder:text-orange-600"
              />
              {search && (
                <p className="text-xs text-gray-400 mt-1.5">
                  {filteredTickets.length} of {tickets.length} tickets
                </p>
              )}
            </div>
            <div className="overflow-y-auto">
              {filteredTickets.length === 0 && (
                <p className="px-4 py-4 text-sm text-gray-400 text-center">No tickets match &quot;{search}&quot;</p>
              )}
              {filteredTickets.map(([key, { project, task }]) => {
                const checked = selectedKeys.has(key);
                const rate = billingRates[key];
                return (
                  <label key={key} className={`flex items-start gap-3 px-4 py-2.5 cursor-pointer transition-colors border-b border-gray-50 last:border-0 ${checked ? 'bg-slate-50' : 'hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(key)} className="mt-0.5 rounded border-gray-300 text-slate-800 focus:ring-slate-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm truncate ${checked ? 'font-medium text-slate-800' : 'text-gray-700'}`} title={task}>{task}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{project}</p>
                    </div>
                    {rate?.billable && (
                      <span className="shrink-0 text-xs text-emerald-600 font-medium bg-emerald-50 px-1.5 py-0.5 rounded">
                        {rate.rate ? `${rate.rate}€/h` : 'Billable'}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {selectedKeys.size === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 px-6 py-12 text-center text-gray-400 text-sm">
          Select one or more tickets above to see the breakdown by team member.
        </div>
      )}

      {selectedList.length >= 2 && (
        <TicketTable
          ticketEntries={allSelectedEntries}
          title={`Summary — ${selectedList.length} tickets combined`}
          isSummary
          billingRates={billingRates}
        />
      )}

      {selectedList.map(([key, { project, task }]) => (
        <TicketTable
          key={key}
          ticketEntries={entriesForKey(key)}
          title={task}
          subtitle={project}
          billingRates={billingRates}
          singleKey={key}
          onRateChange={onRateChange}
        />
      ))}
    </div>
  );
}

// ─── Ticket Breakdown (economics expansion) ───────────────────────────────────

function TicketBreakdown({ byTicket, costRate, allMonths }: {
  byTicket: Record<string, {
    project: string; task: string; isBillable: boolean; billingRate: number;
    byMonth: Record<string, { hours: number; revenue: number }>;
  }>;
  costRate: number;
  allMonths: string[];
}) {
  const tickets = Object.entries(byTicket).sort(([, a], [, b]) => a.task.localeCompare(b.task));

  return (
    <div className="border-t border-gray-100 overflow-x-auto bg-slate-50/50">
      <table className="w-full text-xs min-w-max">
        <thead>
          <tr className="border-b border-gray-200 bg-slate-100/60">
            <th className="w-8 sticky left-0 bg-slate-100/60" />
            <th className="text-left px-4 py-2 pl-10 font-medium text-gray-500 min-w-[260px] sticky left-8 bg-slate-100/60">
              Ticket
            </th>
            {allMonths.map(m => (
              <th key={m} className="text-right px-3 py-2 font-medium text-gray-500 min-w-[100px] whitespace-nowrap">
                {fmtMonth(m)}
                <span className="block text-gray-300 font-normal">h · net</span>
              </th>
            ))}
            <th className="text-right px-3 py-2 font-medium text-gray-500 min-w-[70px]">Total h</th>
            <th className="text-right px-3 py-2 font-medium text-gray-500 min-w-[90px]">Net</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map(([key, t]) => {
            const totalHours   = Object.values(t.byMonth).reduce((s, v) => s + v.hours, 0);
            const totalRevenue = Object.values(t.byMonth).reduce((s, v) => s + v.revenue, 0);
            const totalCost    = totalHours * costRate;
            const totalNet     = totalRevenue - totalCost;
            const showEconomics = totalRevenue > 0 || costRate > 0;

            return (
              <tr key={key} className="border-b border-gray-100 last:border-0 hover:bg-white/60 transition-colors">
                <td className="sticky left-0 bg-inherit" />
                <td className="px-4 py-2 pl-10 sticky left-8 bg-inherit">
                  <p className="font-medium text-gray-700 truncate max-w-[220px]" title={t.task}>{t.task}</p>
                  <p className="text-gray-400 truncate max-w-[220px]" title={t.project}>{t.project}</p>
                  {t.isBillable
                    ? <span className="text-emerald-600 font-medium">{t.billingRate} €/h</span>
                    : <span className="text-slate-400">Internal</span>
                  }
                </td>
                {allMonths.map(m => {
                  const md = t.byMonth[m];
                  if (!md) return <td key={m} className="px-3 py-2 text-right text-gray-200">—</td>;
                  const net = md.revenue - md.hours * costRate;
                  const netColor = net > 0 ? 'text-emerald-600' : net < 0 ? 'text-red-500' : 'text-gray-400';
                  return (
                    <td key={m} className="px-3 py-2 text-right">
                      <p className="font-medium text-gray-700">{fmtH(md.hours)}</p>
                      {showEconomics && (
                        <p className={`text-xs font-medium mt-0.5 ${netColor}`}>
                          {net > 0 ? '+' : ''}{fmtEur(net)}
                        </p>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right font-semibold text-gray-600">{fmtH(totalHours)}</td>
                <td className={`px-3 py-2 text-right font-bold ${
                  !showEconomics ? 'text-gray-200'
                  : totalNet > 0 ? 'text-emerald-600'
                  : totalNet < 0 ? 'text-red-500'
                  : 'text-gray-400'
                }`}>
                  {!showEconomics ? '—' : (totalNet > 0 ? '+' : '') + fmtEur(totalNet)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Economics View ───────────────────────────────────────────────────────────

function EconomicsView({ entries, billingRates, costRates }: {
  entries: TimesheetEntry[];
  billingRates: Record<string, TicketRate>;
  costRates: Record<string, number>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const users = useMemo(() => [...new Set(entries.map(e => e.user))].sort(), [entries]);

  const stats = useMemo(() => {
    type TicketEntry = {
      project: string; task: string; isBillable: boolean; billingRate: number;
      byMonth: Record<string, { hours: number; revenue: number }>;
    };
    const result: Record<string, {
      costRate: number; totalHours: number; billableHours: number;
      revenue: number; cost: number; net: number;
      byMonth: Record<string, { hours: number; billableHours: number; revenue: number; cost: number; net: number }>;
      byTicket: Record<string, TicketEntry>;
    }> = {};

    for (const user of users) {
      const costRate = costRates[user] ?? 0;
      const byMonth: Record<string, { hours: number; billableHours: number; revenue: number; cost: number; net: number }> = {};
      const byTicket: Record<string, TicketEntry> = {};

      for (const e of entries) {
        if (e.user !== user) continue;
        const key = `${e.project}:::${e.task}`;
        const r = billingRates[key];
        const isBillable = r?.billable && r.rate > 0;
        const entryRevenue = isBillable ? e.spentTime * r.rate : 0;

        if (!byMonth[e.month]) byMonth[e.month] = { hours: 0, billableHours: 0, revenue: 0, cost: 0, net: 0 };
        byMonth[e.month].hours += e.spentTime;
        byMonth[e.month].billableHours += isBillable ? e.spentTime : 0;
        byMonth[e.month].revenue += entryRevenue;

        if (!byTicket[key]) byTicket[key] = {
          project: e.project, task: e.task,
          isBillable: !!(r?.billable && r.rate > 0), billingRate: r?.rate ?? 0,
          byMonth: {},
        };
        if (!byTicket[key].byMonth[e.month]) byTicket[key].byMonth[e.month] = { hours: 0, revenue: 0 };
        byTicket[key].byMonth[e.month].hours += e.spentTime;
        byTicket[key].byMonth[e.month].revenue += entryRevenue;
      }

      for (const m of Object.keys(byMonth)) {
        byMonth[m].cost = byMonth[m].hours * costRate;
        byMonth[m].net = byMonth[m].revenue - byMonth[m].cost;
      }

      const totalHours    = Object.values(byMonth).reduce((s, v) => s + v.hours, 0);
      const billableHours = Object.values(byMonth).reduce((s, v) => s + v.billableHours, 0);
      const revenue       = Object.values(byMonth).reduce((s, v) => s + v.revenue, 0);
      const cost          = totalHours * costRate;

      result[user] = { costRate, totalHours, billableHours, revenue, cost, net: revenue - cost, byMonth, byTicket };
    }

    return result;
  }, [entries, billingRates, costRates, users]);

  const totals = useMemo(() => {
    const revenue       = Object.values(stats).reduce((s, v) => s + v.revenue, 0);
    const cost          = Object.values(stats).reduce((s, v) => s + v.cost, 0);
    const billableHours = Object.values(stats).reduce((s, v) => s + v.billableHours, 0);
    const totalHours    = Object.values(stats).reduce((s, v) => s + v.totalHours, 0);
    return { revenue, cost, net: revenue - cost, billableHours, internalHours: totalHours - billableHours, totalHours };
  }, [stats]);

  function netColor(n: number) {
    return n > 0 ? 'text-emerald-600' : n < 0 ? 'text-red-500' : 'text-gray-400';
  }

  function fmtNet(v: number) {
    if (v === 0) return '±0 €';
    return (v > 0 ? '+' : '') + fmtEur(v);
  }

  const noCostRates = users.every(u => !costRates[u]);
  const noBillingRates = !Object.values(billingRates).some(r => r.billable);

  return (
    <div className="space-y-5">
      {(noCostRates || noBillingRates) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-3.5 text-sm text-amber-700 space-y-1">
          {noBillingRates && (
            <p>No billable tickets configured — go to <strong>By Ticket</strong> and toggle a ticket to <em>Billable</em> to set a rate.</p>
          )}
          {noCostRates && (
            <p>No cost rates set — open <strong>By Team Member</strong> and enter a <em>Cost €/h</em> for each person.</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <p className="text-xs text-gray-400 mb-1.5">Total Revenue</p>
          <p className="text-2xl font-bold text-emerald-600">
            {totals.revenue > 0 ? fmtEur(totals.revenue) : <span className="text-gray-300">—</span>}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <p className="text-xs text-gray-400 mb-1.5">Total Cost</p>
          <p className="text-2xl font-bold text-red-500">
            {totals.cost > 0 ? fmtEur(totals.cost) : <span className="text-gray-300">—</span>}
          </p>
        </div>
        <div className={`rounded-lg border p-5 ${
          totals.revenue === 0 && totals.cost === 0
            ? 'bg-white border-gray-200'
            : totals.net >= 0
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-red-50 border-red-200'
        }`}>
          <p className="text-xs text-gray-400 mb-1.5">Net P&amp;L</p>
          <p className={`text-2xl font-bold ${
            totals.revenue === 0 && totals.cost === 0 ? 'text-gray-300' : netColor(totals.net)
          }`}>
            {totals.revenue === 0 && totals.cost === 0 ? '—' : fmtNet(totals.net)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 px-5 py-3.5 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 mb-1">Billable Hours</p>
            <p className="text-xl font-bold text-emerald-600">{fmtH(totals.billableHours)}</p>
          </div>
          {totals.totalHours > 0 && (
            <span className="text-sm font-semibold text-emerald-500 bg-emerald-50 px-2.5 py-1 rounded-full">
              {Math.round((totals.billableHours / totals.totalHours) * 100)}%
            </span>
          )}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 px-5 py-3.5 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 mb-1">Internal Hours</p>
            <p className="text-xl font-bold text-slate-500">{fmtH(totals.internalHours)}</p>
          </div>
          {totals.totalHours > 0 && (
            <span className="text-sm font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
              {Math.round((totals.internalHours / totals.totalHours) * 100)}%
            </span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 bg-slate-50">
          <p className="font-semibold text-sm text-slate-800">Cost vs. Revenue — per team member</p>
          <p className="text-xs text-gray-400 mt-0.5">Click a row to expand monthly breakdown</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-max">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200">
                <th className="w-8 px-3 py-2.5 sticky left-0 bg-gray-100" />
                <th className="text-left px-4 py-2.5 font-medium text-gray-600 min-w-[180px] sticky left-8 bg-gray-100">Team Member</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-500 min-w-[80px]">Cost €/h</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 min-w-[80px]">Hours</th>
                <th className="text-right px-3 py-2.5 font-medium text-emerald-600 min-w-[80px]">Billable h</th>
                <th className="text-right px-3 py-2.5 font-medium text-slate-500 min-w-[80px]">Internal h</th>
                <th className="text-right px-3 py-2.5 font-medium text-emerald-600 min-w-[110px]">Revenue</th>
                <th className="text-right px-3 py-2.5 font-medium text-red-500 min-w-[110px]">Cost</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-700 min-w-[110px]">Net</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, idx) => {
                const s = stats[user];
                const isExpanded = expanded.has(user);
                const billPct = s.totalHours > 0 ? Math.round((s.billableHours / s.totalHours) * 100) : 0;
                const userMonths = Object.keys(s.byMonth).sort();
                const rowBg = isExpanded ? 'bg-slate-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30';
                // 9 cols: toggle | name | cost€/h | hours | billable h | internal h | revenue | cost | net

                return (
                  <Fragment key={user}>
                    <tr
                      className={`border-b border-gray-100 cursor-pointer transition-colors ${rowBg} hover:bg-slate-50/70`}
                      onClick={() => setExpanded(prev => {
                        const n = new Set(prev);
                        n.has(user) ? n.delete(user) : n.add(user);
                        return n;
                      })}
                    >
                      <td className={`px-3 py-2.5 sticky left-0 ${rowBg}`}>
                        <span className={`text-gray-400 text-xs transition-transform duration-150 inline-block ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                      </td>
                      <td className={`px-4 py-2.5 font-medium text-gray-800 sticky left-8 ${rowBg}`}>{user}</td>
                      <td className="px-3 py-2.5 text-right text-gray-500">
                        {s.costRate > 0 ? `${s.costRate} €` : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600">{fmtH(s.totalHours)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-emerald-600 font-medium">{fmtH(s.billableHours)}</span>
                        {billPct > 0 && <span className="ml-1 text-gray-400 text-xs">{billPct}%</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-500">
                        {fmtH(s.totalHours - s.billableHours)}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-medium ${s.revenue > 0 ? 'text-emerald-600' : 'text-gray-200'}`}>
                        {s.revenue > 0 ? fmtEur(s.revenue) : '—'}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-medium ${s.cost > 0 ? 'text-red-500' : 'text-gray-200'}`}>
                        {s.cost > 0 ? fmtEur(s.cost) : '—'}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-bold ${s.revenue === 0 && s.cost === 0 ? 'text-gray-200' : netColor(s.net)}`}>
                        {s.revenue === 0 && s.cost === 0 ? '—' : fmtNet(s.net)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${user}-breakdown`}>
                        <td colSpan={9} className="p-0">
                          <TicketBreakdown
                            byTicket={s.byTicket}
                            costRate={s.costRate}
                            allMonths={userMonths}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                <td className="sticky left-0 bg-gray-50" />
                <td className="px-4 py-2.5 text-gray-700 sticky left-8 bg-gray-50">Total</td>
                <td className="px-3 py-2.5 text-right text-gray-400 text-xs font-normal">{users.length} members</td>
                <td />
                <td className="px-3 py-2.5 text-right text-emerald-600">{fmtH(totals.billableHours)}</td>
                <td className="px-3 py-2.5 text-right text-slate-500">{fmtH(totals.internalHours)}</td>
                <td className={`px-3 py-2.5 text-right ${totals.revenue > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
                  {totals.revenue > 0 ? fmtEur(totals.revenue) : '—'}
                </td>
                <td className={`px-3 py-2.5 text-right ${totals.cost > 0 ? 'text-red-500' : 'text-gray-300'}`}>
                  {totals.cost > 0 ? fmtEur(totals.cost) : '—'}
                </td>
                <td className={`px-3 py-2.5 text-right font-bold ${
                  totals.revenue === 0 && totals.cost === 0 ? 'text-gray-300' : netColor(totals.net)
                }`}>
                  {totals.revenue === 0 && totals.cost === 0 ? '—' : fmtNet(totals.net)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TimesheetsClient({ store }: { store: TimesheetStore }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<'member' | 'ticket' | 'economics'>('member');
  const [selectedTicketKeys, setSelectedTicketKeys] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadMsg(null);
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
    if (!confirm('Delete all timesheet data?')) return;
    await clearTimesheets();
    setUploadMsg(null);
    startTransition(() => router.refresh());
  }

  async function handleDeletePerson(user: string) {
    await deleteTimesheetPerson(user);
    startTransition(() => router.refresh());
  }

  async function handleBaselineChange(user: string, h: number) {
    await updateTimesheetBaseline(user, h);
    startTransition(() => router.refresh());
  }

  async function handleCostRateChange(user: string, rate: number) {
    await updateMemberCostRate(user, rate);
    startTransition(() => router.refresh());
  }

  async function handleTicketRateChange(key: string, billable: boolean, rate: number) {
    await updateTicketRate(key, billable, rate);
    startTransition(() => router.refresh());
  }

  const overallTotal = store.entries.reduce((s, e) => s + e.spentTime, 0);
  const userCount = useMemo(() => new Set(store.entries.map(e => e.user)).size, [store.entries]);
  const ticketCount = useMemo(() => new Set(store.entries.map(e => `${e.project}:::${e.task}`)).size, [store.entries]);

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'member', label: 'By Team Member' },
    { key: 'ticket', label: 'By Ticket' },
    { key: 'economics', label: 'Economics' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Timesheets</h1>
        <p className="text-gray-500 text-sm">Upload team member CSV exports to see monthly hours per project and ticket.</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <form onSubmit={handleUpload} className="flex items-center gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">CSV files (one per team member)</label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                multiple
                className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50 cursor-pointer"
              />
            </div>
            <button
              type="submit"
              disabled={uploading || isPending}
              className="self-end bg-slate-800 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-40"
            >
              {uploading ? 'Importing…' : 'Upload'}
            </button>
          </form>
          <button
            onClick={handleClear}
            disabled={isPending}
            className="self-end text-xs text-red-500 hover:text-red-700 border border-red-200 px-3 py-1.5 rounded hover:bg-red-50 transition-colors disabled:opacity-40"
          >
            Clear all
          </button>
        </div>

        {uploadMsg && (
          <p className={`mt-3 text-sm font-medium ${uploadMsg.startsWith('Error') ? 'text-red-600' : 'text-emerald-600'}`}>
            {uploadMsg}
          </p>
        )}

        {store.sources.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-400">Loaded:</span>
            {store.sources.map(s => (
              <span key={s} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s}</span>
            ))}
            <span className="text-xs text-gray-400 ml-2">·</span>
            <span className="text-xs text-gray-500">
              {userCount} people · {ticketCount} tickets · {store.entries.length} entries · {fmtH(overallTotal)} total
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
          <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-4 w-fit">
            {tabs.map(({ key, label }, i) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-5 py-2 text-sm font-medium transition-colors ${i > 0 ? 'border-l border-gray-200' : ''} ${
                  tab === key ? 'bg-slate-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'member' && (
            <ByMemberView
              entries={store.entries}
              baselines={store.baselines}
              costRates={store.costRates}
              onDeletePerson={handleDeletePerson}
              onBaselineChange={handleBaselineChange}
              onCostRateChange={handleCostRateChange}
            />
          )}
          {tab === 'ticket' && (
            <ByTicketView
              entries={store.entries}
              selectedKeys={selectedTicketKeys}
              setSelectedKeys={setSelectedTicketKeys}
              billingRates={store.billingRates}
              onRateChange={handleTicketRateChange}
            />
          )}
          {tab === 'economics' && (
            <EconomicsView
              entries={store.entries}
              billingRates={store.billingRates}
              costRates={store.costRates}
            />
          )}
        </>
      )}
    </div>
  );
}
