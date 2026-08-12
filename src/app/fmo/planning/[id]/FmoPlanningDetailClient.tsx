'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRole } from '@/components/RoleProvider';
import { useLocale } from 'next-intl';
import { fmtH, type Locale } from '@/lib/i18n';
import { getMonthsBetween } from '@/lib/utils';
import type { FmoForecast, FmoProject, FmoMember, FmoWbsEntry, FmoEntry } from '@/lib/types';
import {
  renameFmoForecast,
  upsertFmoForecastProject, removeFmoForecastProject,
  upsertFmoForecastAssignment, removeFmoForecastAssignment,
} from '@/actions/fmoPlanning';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const FTE_PER_MONTH = 140; // hours

function hoursToFte(h: number, months: number) {
  return months > 0 ? h / (FTE_PER_MONTH * months) : 0;
}

function AddProjectPanel({
  forecast,
  projects,
  onDone,
}: {
  forecast: FmoForecast;
  projects: FmoProject[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState('');
  const [hours, setHours]         = useState('');
  const [saving, setSaving]       = useState(false);

  const available = projects.filter(p => !forecast.projects.find(fp => fp.projectId === p.id));

  async function add() {
    if (!projectId || !hours) return;
    setSaving(true);
    await upsertFmoForecastProject(forecast.id, projectId, parseFloat(hours) || 0);
    setSaving(false);
    onDone();
    router.refresh();
  }

  if (!available.length) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select value={projectId} onChange={e => setProjectId(e.target.value)}
        className="border border-slate-300 rounded px-2 py-1.5 text-sm">
        <option value="">— choose project —</option>
        {available.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input type="number" value={hours} onChange={e => setHours(e.target.value)}
        placeholder="Budget h"
        className="border border-slate-300 rounded px-2 py-1.5 text-sm w-28" />
      <button onClick={add} disabled={saving || !projectId}
        className="px-3 py-1.5 bg-slate-800 text-white text-xs rounded hover:bg-slate-700 disabled:opacity-50">
        {saving ? '…' : '+ Add'}
      </button>
      <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
    </div>
  );
}

export default function FmoPlanningDetailClient({
  forecast,
  projects,
  members,
  wbs,
  entries,
}: {
  forecast: FmoForecast;
  projects: FmoProject[];
  members: Record<string, FmoMember>;
  wbs: Record<string, FmoWbsEntry>;
  entries: FmoEntry[];
}) {
  const router  = useRouter();
  const isAdmin = useRole() === 'admin';
  const locale  = useLocale() as Locale;

  const months = getMonthsBetween(forecast.startMonth, forecast.endMonth);

  const [editingName, setEditingName] = useState(false);
  const [name, setName]               = useState(forecast.name);
  const [addingProject, setAddingProject] = useState(false);
  const sortedMembers = useMemo(() => Object.values(members).sort((a, b) => a.name.localeCompare(b.name)), [members]);

  async function saveName() {
    await renameFmoForecast(forecast.id, name);
    setEditingName(false);
    router.refresh();
  }

  // Actual hours per project for comparison
  const actualByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const fp of forecast.projects) {
      const proj = projects.find(p => p.id === fp.projectId);
      if (!proj) continue;
      const h = entries.filter(e => (e.wbsCode && proj.wbsCodes.includes(e.wbsCode) && (e.ticketId === null || !(proj.excludedTicketIds ?? []).includes(e.ticketId))) || (e.ticketId !== null && (proj.ticketIds ?? []).includes(e.ticketId))
        && e.month >= forecast.startMonth && e.month <= forecast.endMonth)
        .reduce((s, e) => s + e.spentTime, 0);
      map.set(fp.projectId, h);
    }
    return map;
  }, [forecast, projects, entries]);

  // Total planned/actual
  const totalPlanned = useMemo(() => forecast.projects.reduce((s, p) => s + p.overallHours, 0), [forecast]);
  const totalActual  = useMemo(() => [...actualByProject.values()].reduce((s, h) => s + h, 0), [actualByProject]);

  // Comparison chart data
  const compChart = useMemo(() => forecast.projects.map(fp => {
    const proj = projects.find(p => p.id === fp.projectId);
    return {
      name: proj?.name ?? fp.projectId,
      planned: fp.overallHours,
      actual: actualByProject.get(fp.projectId) ?? 0,
    };
  }), [forecast, projects, actualByProject]);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link href="/fmo/planning" className="text-slate-400 hover:text-slate-600 text-sm">← Planning</Link>
          <span className="text-slate-300">/</span>
          {editingName ? (
            <div className="flex items-center gap-2">
              <input value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditingName(false); setName(forecast.name); } }}
                className="text-2xl font-bold text-slate-900 border-b-2 border-indigo-400 focus:outline-none bg-transparent" autoFocus />
              <button onClick={saveName} className="text-xs text-indigo-600 hover:text-indigo-800">Save</button>
              <button onClick={() => { setEditingName(false); setName(forecast.name); }} className="text-xs text-slate-400">Cancel</button>
            </div>
          ) : (
            <h1 className="text-2xl font-bold text-slate-900 cursor-pointer hover:text-indigo-700"
              onClick={() => isAdmin && setEditingName(true)}>
              {forecast.name}
            </h1>
          )}
        </div>
        <p className="text-sm text-slate-500">{forecast.startMonth} → {forecast.endMonth} · {months.length} months</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Planned', value: fmtH(totalPlanned, locale), sub: `${hoursToFte(totalPlanned, months.length).toFixed(1)} FTE avg` },
          { label: 'Actual (period)', value: fmtH(totalActual, locale), sub: totalPlanned > 0 ? `${Math.round(totalActual / totalPlanned * 100)}% of plan` : undefined },
          { label: 'Projects', value: String(forecast.projects.length) },
          { label: 'Months', value: String(months.length) },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-400 mb-1">{kpi.label}</p>
            <p className="text-xl font-bold text-slate-800">{kpi.value}</p>
            {kpi.sub && <p className="text-xs text-slate-400">{kpi.sub}</p>}
          </div>
        ))}
      </div>

      {/* Planned vs Actual chart */}
      {compChart.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Planned vs Actual Hours by Project</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={compChart} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => typeof v === 'number' ? fmtH(v, locale) : v} />
              <Legend />
              <Bar dataKey="planned" fill="#e0e7ff" name="Planned" radius={[3, 3, 0, 0]} />
              <Bar dataKey="actual" fill="#6366f1" name="Actual" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Projects + Assignment matrices */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Projects</h2>
          {isAdmin && !addingProject && (
            <button onClick={() => setAddingProject(true)}
              className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-3 py-1.5 hover:border-indigo-300 transition-colors">
              + Add Project
            </button>
          )}
        </div>
        {isAdmin && addingProject && (
          <AddProjectPanel forecast={forecast} projects={projects} onDone={() => setAddingProject(false)} />
        )}

        {forecast.projects.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 px-4 py-8 text-center text-slate-400 text-sm">
            No projects added. Add a project to start planning.
          </div>
        ) : (
          forecast.projects.map(fp => {
            const proj = projects.find(p => p.id === fp.projectId);
            const actual = actualByProject.get(fp.projectId) ?? 0;
            const pct = fp.overallHours > 0 ? Math.round(actual / fp.overallHours * 100) : 0;

            return (
              <div key={fp.projectId} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                {/* Project header */}
                <div className="flex items-center gap-4 px-5 py-3 border-b border-slate-100 bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-slate-800">{proj?.name ?? fp.projectId}</span>
                    <span className="ml-3 text-xs text-slate-500">
                      Budget: {fmtH(fp.overallHours, locale)} · Actual: {fmtH(actual, locale)}
                      {fp.overallHours > 0 && ` · ${pct}%`}
                    </span>
                  </div>
                  <div className="w-32 h-1.5 bg-slate-200 rounded-full shrink-0">
                    <div className={`h-1.5 rounded-full ${pct > 100 ? 'bg-red-400' : pct >= 80 ? 'bg-emerald-400' : 'bg-indigo-400'}`}
                      style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  {isAdmin && (
                    <button onClick={async () => {
                      if (!confirm(`Remove project "${proj?.name}" from this plan?`)) return;
                      await removeFmoForecastProject(forecast.id, fp.projectId);
                      router.refresh();
                    }} className="text-xs text-gray-300 hover:text-red-400 shrink-0">×</button>
                  )}
                </div>

                {/* Assignment matrix: members × months */}
                <div className="overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead className="border-b border-slate-100 text-slate-400">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium w-48">Member</th>
                        {months.map(m => (
                          <th key={m} className="px-2 py-2 text-center font-medium min-w-[72px]">{m.slice(5)}</th>
                        ))}
                        <th className="px-3 py-2 text-right font-medium">Plan</th>
                        <th className="px-3 py-2 text-right font-medium text-indigo-600">Actual</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {fp.assignments.map(asgn => {
                        const member = members[asgn.memberId];
                        if (!member) return null;
                        const rowPlan = Object.values(asgn.plannedHours).reduce((s, h) => s + h, 0);
                        const rowActual = proj
                          ? entries.filter(e => e.user === member.name && (e.wbsCode && proj.wbsCodes.includes(e.wbsCode) && (e.ticketId === null || !(proj.excludedTicketIds ?? []).includes(e.ticketId))) || (e.ticketId !== null && (proj.ticketIds ?? []).includes(e.ticketId))
                            && e.month >= forecast.startMonth && e.month <= forecast.endMonth)
                            .reduce((s, e) => s + e.spentTime, 0)
                          : 0;
                        return (
                          <tr key={asgn.memberId} className="hover:bg-slate-50">
                            <td className="px-4 py-2 font-medium text-slate-700">
                              <div className="flex items-center gap-2">
                                <Link href={`/fmo/members/${asgn.memberId}`} className="text-indigo-600 hover:text-indigo-800">{member.name}</Link>
                                <span className={`text-xs px-1 py-0.5 rounded ${member.type === 'intern' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>{member.type}</span>
                              </div>
                            </td>
                            {months.map(month => {
                              const planned = asgn.plannedHours[month] ?? 0;
                              return (
                                <td key={month} className="px-2 py-2 text-center">
                                  {isAdmin ? (
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.5"
                                      defaultValue={planned || ''}
                                      placeholder="—"
                                      className="w-16 text-center border-0 border-b border-slate-200 bg-transparent text-slate-700 focus:outline-none focus:border-indigo-400 text-xs"
                                      onBlur={async (e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        const next = { ...asgn.plannedHours, [month]: val };
                                        if (val === 0) delete next[month];
                                        await upsertForecastAssignment(forecast.id, fp.projectId, asgn.memberId, next);
                                        router.refresh();
                                      }}
                                    />
                                  ) : (
                                    <span className="text-slate-600">{planned > 0 ? planned : '—'}</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2 text-right font-medium text-slate-700">{rowPlan > 0 ? fmtH(rowPlan, locale) : '—'}</td>
                            <td className="px-3 py-2 text-right text-indigo-600">{rowActual > 0 ? fmtH(rowActual, locale) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Add member to this project */}
                {isAdmin && (
                  <AddMemberRow
                    forecastId={forecast.id}
                    projectId={fp.projectId}
                    members={members}
                    assigned={fp.assignments.map(a => a.memberId)}
                    onDone={() => router.refresh()}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function AddMemberRow({
  forecastId, projectId, members, assigned, onDone,
}: {
  forecastId: string; projectId: string;
  members: Record<string, FmoMember>; assigned: string[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [memberId, setMemberId] = useState('');
  const available = Object.values(members).filter(m => !assigned.includes(m.id)).sort((a, b) => a.name.localeCompare(b.name));

  async function add() {
    if (!memberId) return;
    await upsertForecastAssignment(forecastId, projectId, memberId, {});
    setAdding(false);
    setMemberId('');
    onDone();
    router.refresh();
  }

  if (!adding) return (
    <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50">
      <button onClick={() => setAdding(true)}
        className="text-xs text-slate-400 hover:text-slate-700 border border-dashed border-slate-200 hover:border-slate-300 rounded px-3 py-1.5 transition-colors">
        + Add Member
      </button>
    </div>
  );

  return (
    <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50 flex items-center gap-2">
      <select value={memberId} onChange={e => setMemberId(e.target.value)}
        className="border border-slate-300 rounded px-2 py-1 text-xs">
        <option value="">— select member —</option>
        {available.map(m => <option key={m.id} value={m.id}>{m.name} ({m.type})</option>)}
      </select>
      <button onClick={add} disabled={!memberId}
        className="text-xs bg-slate-800 text-white px-2.5 py-1 rounded hover:bg-slate-700 disabled:opacity-50">Add</button>
      <button onClick={() => { setAdding(false); setMemberId(''); }}
        className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
    </div>
  );
}

// Inline alias so the import chain works without circular deps
async function upsertForecastAssignment(forecastId: string, projectId: string, memberId: string, plannedHours: Record<string, number>) {
  return upsertFmoForecastAssignment(forecastId, projectId, memberId, plannedHours);
}
