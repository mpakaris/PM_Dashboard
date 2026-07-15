'use client';

import { useState } from 'react';
import { Assignment, Project, TeamMember } from '@/lib/types';
import { getMonthsBetween, formatMonth } from '@/lib/utils';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';

interface Props {
  assignments: Assignment[];
  projects: Project[];
  members: TeamMember[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

type RagStatus = 'not-started' | 'on-track' | 'at-risk' | 'behind' | 'over-budget' | 'completed' | 'no-budget';

const RAG: Record<RagStatus, { label: string; dot: string; text: string; ring: string }> = {
  'not-started': { label: 'Not started', dot: 'bg-gray-300',    text: 'text-gray-500',   ring: 'ring-gray-200' },
  'on-track':    { label: 'On track',    dot: 'bg-emerald-500', text: 'text-emerald-700', ring: 'ring-emerald-200' },
  'at-risk':     { label: 'At risk',     dot: 'bg-amber-400',   text: 'text-amber-700',  ring: 'ring-amber-200' },
  'behind':      { label: 'Behind',      dot: 'bg-red-500',     text: 'text-red-700',    ring: 'ring-red-200' },
  'over-budget': { label: 'Over budget', dot: 'bg-red-600',     text: 'text-red-700',    ring: 'ring-red-300' },
  'completed':   { label: 'Completed',   dot: 'bg-slate-400',  text: 'text-slate-700', ring: 'ring-slate-200' },
  'no-budget':   { label: 'No budget',   dot: 'bg-gray-300',    text: 'text-gray-400',   ring: 'ring-gray-200' },
};

function computeHealth(project: Project, assignments: Assignment[], now: string) {
  const allMonths     = getMonthsBetween(project.startMonth, project.endMonth);
  const elapsed       = allMonths.filter((m) => m <= now);
  const timelinePct   = allMonths.length > 0 ? Math.round((elapsed.length / allMonths.length) * 100) : 0;
  const pas           = assignments.filter((a) => a.projectId === project.id);

  const billedToDate  = pas.reduce((s, a) => s + elapsed.reduce((ms, m) => ms + (a.billedHours[m]  ?? 0), 0), 0);
  const plannedToDate = pas.reduce((s, a) => s + elapsed.reduce((ms, m) => ms + (a.plannedHours[m] ?? 0), 0), 0);
  const totalPlanned  = pas.reduce((s, a) => s + Object.values(a.plannedHours).reduce((x, v) => x + v, 0), 0);

  const budget    = project.orderAmountHours ?? 0;
  const billedPct = budget > 0 ? Math.round((billedToDate / budget) * 100) : 0;
  const remaining = budget > 0 ? budget - billedToDate : null;

  // Forecast to completion
  let forecastEnd: string | null = null;
  if (elapsed.length > 0 && billedToDate > 0 && remaining !== null && remaining > 0) {
    const rate = billedToDate / elapsed.length;
    forecastEnd = addMonths(now, Math.ceil(remaining / rate));
  }

  // RAG
  let status: RagStatus = 'on-track';
  if (budget === 0) {
    status = 'no-budget';
  } else if (project.startMonth > now) {
    status = 'not-started';
  } else if (project.endMonth < now) {
    status = billedPct >= 90 ? 'completed' : billedPct >= 70 ? 'at-risk' : 'behind';
  } else if (billedPct > 100) {
    status = 'over-budget';
  } else {
    const delta = billedPct - timelinePct;
    status = delta >= -10 ? 'on-track' : delta >= -25 ? 'at-risk' : 'behind';
  }

  return { allMonths, elapsed, timelinePct, billedToDate, plannedToDate, totalPlanned, budget, billedPct, remaining, forecastEnd, status, pas };
}

// ─── RAG badge ────────────────────────────────────────────────────────────────

function RagBadge({ status }: { status: RagStatus }) {
  const r = RAG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${r.ring} ${r.text} bg-white`}>
      <span className={`w-2 h-2 rounded-full ${r.dot} shrink-0`} />
      {r.label}
    </span>
  );
}

// ─── Mini progress bar ────────────────────────────────────────────────────────

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

// ─── Section 1: Project Health ────────────────────────────────────────────────

function ProjectHealthTable({ assignments, projects, members }: Props) {
  const now = getCurrentMonth();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (projects.length === 0)
    return <div className="bg-white rounded-lg ring-1 ring-gray-200 px-6 py-10 text-center text-gray-400 text-sm">No projects yet.</div>;

  const rows = projects.map((p) => ({ project: p, health: computeHealth(p, assignments, now) }));

  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Project Health</h2>
          <p className="text-xs text-gray-400 mt-0.5">Budget burn · Timeline · RAG status · Forecast to completion</p>
        </div>
        <span className="text-xs text-gray-400">{formatMonth(now)}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60 text-xs">
              <th className="text-left px-4 py-3 font-medium text-gray-500 min-w-[180px]">Project</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Budget</th>
              <th className="text-right px-4 py-3 font-medium text-emerald-600">Billed</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Planned</th>
              <th className="px-4 py-3 font-medium text-gray-500">Budget burn</th>
              <th className="px-4 py-3 font-medium text-gray-500">Timeline</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Forecast end</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ project, health }) => {
              const isOpen = expanded.has(project.id);
              const { billedToDate, plannedToDate, totalPlanned, budget, billedPct, timelinePct, remaining, forecastEnd, status, elapsed, pas } = health;
              const rag = RAG[status];
              const billedBarColor = billedPct > 100 ? 'bg-red-500' : billedPct > timelinePct + 10 ? 'bg-emerald-400' : status === 'at-risk' ? 'bg-amber-400' : status === 'behind' ? 'bg-red-400' : 'bg-emerald-400';

              return (
                <>
                  <tr
                    key={project.id}
                    className="border-b border-gray-50 hover:bg-gray-50/40 transition-colors cursor-pointer"
                    onClick={() => setExpanded((prev) => {
                      const n = new Set(prev);
                      n.has(project.id) ? n.delete(project.id) : n.add(project.id);
                      return n;
                    })}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-gray-400 text-xs transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                        <div>
                          <p className="font-medium text-gray-800">{project.name}</p>
                          <p className="text-xs text-gray-400">{formatMonth(project.startMonth)} – {formatMonth(project.endMonth)} · {health.allMonths.length}mo</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 font-medium">
                      {budget > 0 ? `${budget.toLocaleString()}h` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">{billedToDate}h</td>
                    <td className="px-4 py-3 text-right text-slate-500">{plannedToDate}h</td>
                    <td className="px-4 py-3">
                      {budget > 0 ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <ProgressBar pct={billedPct} color={billedBarColor} />
                            <span className={`text-xs font-medium ${billedPct > 100 ? 'text-red-600' : 'text-gray-600'}`}>{billedPct}%</span>
                          </div>
                          {remaining !== null && (
                            <p className="text-xs text-gray-400">{remaining > 0 ? `${remaining}h left` : 'exhausted'}</p>
                          )}
                        </div>
                      ) : <span className="text-xs text-gray-300">No budget set</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <ProgressBar pct={timelinePct} color="bg-slate-300" />
                          <span className="text-xs font-medium text-gray-600">{timelinePct}%</span>
                        </div>
                        <p className="text-xs text-gray-400">{elapsed.length}/{health.allMonths.length} months</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500">
                      {forecastEnd ? (
                        <span className={forecastEnd > project.endMonth ? 'text-red-600 font-medium' : 'text-emerald-600 font-medium'}>
                          {formatMonth(forecastEnd)}
                          {forecastEnd > project.endMonth && <span className="block font-normal text-red-400">overruns plan</span>}
                        </span>
                      ) : budget === 0 ? '—' : billedToDate === 0 ? <span className="text-gray-300">No billing yet</span> : <span className="text-emerald-600">Within budget</span>}
                    </td>
                    <td className="px-4 py-3">
                      <RagBadge status={status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-gray-300">{pas.length}m</span>
                    </td>
                  </tr>

                  {isOpen && (
                    <tr key={`${project.id}-detail`} className="border-b border-gray-100 bg-gray-50/30">
                      <td colSpan={9} className="px-8 py-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Member delivery to date</p>
                        <div className="flex flex-wrap gap-3">
                          {pas.length === 0 ? (
                            <p className="text-xs text-gray-400">No members assigned.</p>
                          ) : (
                            pas.map((a) => {
                              const member = members.find((m) => m.id === a.memberId);
                              const billed  = elapsed.reduce((s, m) => s + (a.billedHours[m]  ?? 0), 0);
                              const planned = elapsed.reduce((s, m) => s + (a.plannedHours[m] ?? 0), 0);
                              const delta   = billed - planned;
                              return (
                                <div key={a.id} className="bg-white rounded-md ring-1 ring-gray-200 px-3 py-2 text-xs min-w-[140px]">
                                  <p className="font-medium text-gray-700 mb-1">{member?.name ?? 'Unknown'}</p>
                                  <p className="text-emerald-600">Billed: {billed}h</p>
                                  <p className="text-slate-500">Planned: {planned}h</p>
                                  <p className={`font-semibold mt-0.5 ${delta < 0 ? 'text-red-500' : delta > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                                    {delta > 0 ? `+${delta}h ahead` : delta < 0 ? `${delta}h behind` : '± on target'}
                                  </p>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50 text-xs font-semibold">
              <td className="px-4 py-3 text-gray-600">Total</td>
              <td className="px-4 py-3 text-right text-gray-600">
                {rows.reduce((s, r) => s + r.health.budget, 0).toLocaleString()}h
              </td>
              <td className="px-4 py-3 text-right text-emerald-600">
                {rows.reduce((s, r) => s + r.health.billedToDate, 0)}h
              </td>
              <td className="px-4 py-3 text-right text-slate-500">
                {rows.reduce((s, r) => s + r.health.plannedToDate, 0)}h
              </td>
              <td colSpan={5}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Section 2: Team Capacity Gap ────────────────────────────────────────────

function TeamCapacityGap({ assignments, projects, members }: Props) {
  const now         = getCurrentMonth();
  const totalCap    = members.reduce((s, m) => s + (m.monthlyAvailability ?? 0), 0);

  if (totalCap === 0)
    return <div className="bg-white rounded-lg ring-1 ring-gray-200 px-6 py-8 text-center text-gray-400 text-sm">Set monthly availability on team members to see capacity gap.</div>;

  // Show the next 12 months from now, plus any active project months
  const activeMonthsSet = new Set<string>();
  for (const p of projects)
    for (const m of getMonthsBetween(p.startMonth, p.endMonth)) activeMonthsSet.add(m);
  const futureMonths = getMonthsBetween(now, addMonths(now, 11));
  const allMonths    = Array.from(new Set([...futureMonths, ...activeMonthsSet])).sort().filter((m) => m >= now).slice(0, 18);

  const data = allMonths.map((month) => {
    const planned = assignments.reduce((s, a) => s + (a.plannedHours[month] ?? 0), 0);
    const gap     = totalCap - planned;
    const over    = planned > totalCap;
    return { month: formatMonth(month), planned, free: over ? 0 : gap, over: over ? planned - totalCap : 0, totalCap };
  });

  const overCommittedMonths = data.filter((d) => d.over > 0).length;
  const maxPlanned          = Math.max(...data.map((d) => d.planned));

  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Team Capacity Gap</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Planned hours vs team capacity ({totalCap}h/month) · Next 18 months
          </p>
        </div>
        {overCommittedMonths > 0 ? (
          <span className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
            ⚠ {overCommittedMonths} month{overCommittedMonths !== 1 ? 's' : ''} overcommitted
          </span>
        ) : (
          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            ✓ Within capacity
          </span>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-center gap-4 text-xs text-gray-400 mb-4">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-400 inline-block" /> Planned</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-400 inline-block" /> Over capacity</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-200 inline-block" /> Free capacity</span>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit="h" width={42} domain={[0, Math.max(maxPlanned, totalCap) + 20]} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 6 }}
              formatter={(val, name) => {
                if (name === 'planned') return [`${val}h`, 'Planned'];
                if (name === 'over')    return [`${val}h`, 'Over capacity'];
                if (name === 'free')    return [`${val}h`, 'Free capacity'];
                return [`${val}h`, String(name)];
              }}
            />
            <Bar dataKey="planned" stackId="a" fill="#818cf8" opacity={0.85} name="planned" radius={[0, 0, 0, 0]} />
            <Bar dataKey="over"    stackId="a" fill="#f87171" opacity={0.9}  name="over"    radius={[3, 3, 0, 0]} />
            <Bar dataKey="free"    stackId="b" fill="#f3f4f6" opacity={1}    name="free"    radius={[3, 3, 0, 0]} />
            <ReferenceLine y={totalCap} stroke="#10b981" strokeDasharray="5 3" strokeWidth={2}
              label={{ value: `${totalCap}h cap`, fontSize: 10, fill: '#059669', position: 'insideTopRight' }} />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Monthly table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <td className="py-1.5 font-medium">Month</td>
                {data.map((d) => <td key={d.month} className="py-1.5 text-center px-1 font-medium min-w-[52px]">{d.month.split(' ')[0]}</td>)}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50">
                <td className="py-1.5 text-slate-500 font-medium">Planned</td>
                {data.map((d) => <td key={d.month} className="py-1.5 text-center px-1 text-slate-600 font-medium">{d.planned > 0 ? `${d.planned}h` : '—'}</td>)}
              </tr>
              <tr className="border-b border-gray-50 text-gray-400">
                <td className="py-1.5">Capacity</td>
                {data.map((d) => <td key={d.month} className="py-1.5 text-center px-1">{totalCap}h</td>)}
              </tr>
              <tr>
                <td className="py-1.5 font-medium">Gap</td>
                {data.map((d) => {
                  const gap = totalCap - d.planned;
                  return (
                    <td key={d.month} className={`py-1.5 text-center px-1 font-semibold ${gap < 0 ? 'text-red-600' : gap === 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {d.planned === 0 ? '—' : gap > 0 ? `+${gap}h` : `${gap}h`}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function DashboardView(props: Props) {
  return (
    <div className="space-y-6">
      <ProjectHealthTable {...props} />
      <TeamCapacityGap {...props} />
    </div>
  );
}
