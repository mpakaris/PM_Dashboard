'use client';

import { useState } from 'react';
import { Assignment, Project, TeamMember, Role } from '@/lib/types';
import { getMonthsBetween, formatMonth } from '@/lib/utils';
import ChartsView from './ChartsView';
import DashboardView from './DashboardView';

const YEAR_MONTHS = getMonthsBetween('2026-01', '2026-12');

interface Props {
  assignments: Assignment[];
  projects: Project[];
  members: TeamMember[];
  roles: Role[];
}

function getMemberHoursForMonth(
  memberId: string,
  month: string,
  assignments: Assignment[],
  key: 'plannedHours' | 'billedHours'
): number {
  return assignments
    .filter((a) => a.memberId === memberId)
    .reduce((sum, a) => sum + (a[key][month] ?? 0), 0);
}

// ─── By Member ────────────────────────────────────────────────────────────────

function ByMemberView({ assignments, projects, members, roles }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (members.length === 0)
    return <div className="text-center text-gray-400 text-sm py-12">No team members yet.</div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setCollapsed({})} className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">Collapse all</button>
      </div>
      {members.map((member) => {
        const isOpen = collapsed[member.id] === true;
        const role = roles.find((r) => r.id === member.roleId);
        const availability = member.monthlyAvailability ?? 0;
        const memberAssignments = assignments.filter((a) => a.memberId === member.id);

        const totalPlannedPerMonth: Record<string, number> = {};
        const totalBilledPerMonth: Record<string, number> = {};
        for (const month of YEAR_MONTHS) {
          totalPlannedPerMonth[month] = getMemberHoursForMonth(member.id, month, assignments, 'plannedHours');
          totalBilledPerMonth[month] = getMemberHoursForMonth(member.id, month, assignments, 'billedHours');
        }
        const grandPlanned = Object.values(totalPlannedPerMonth).reduce((s, v) => s + v, 0);
        const grandBilled = Object.values(totalBilledPerMonth).reduce((s, v) => s + v, 0);

        return (
          <div key={member.id} className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setCollapsed((prev) => ({ ...prev, [member.id]: !prev[member.id] }))}
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                <span className="font-semibold text-gray-800">{member.name}</span>
                {role && <span className="text-xs text-gray-400">{role.name} · {role.type}</span>}
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-gray-400">{memberAssignments.length} project{memberAssignments.length !== 1 ? 's' : ''}</span>
                <span className="text-indigo-600 font-medium">{grandPlanned}h planned</span>
                <span className="text-emerald-600 font-medium">{grandBilled}h billed</span>
                {availability > 0 && grandBilled > 0 && (
                  <span className={`font-medium ${grandBilled > availability * 12 ? 'text-red-500' : 'text-emerald-600'}`}>
                    {Math.round((grandBilled / (availability * 12)) * 100)}% billed util.
                  </span>
                )}
                {availability > 0 && grandPlanned > 0 && (
                  <span className={`font-medium ${grandPlanned > availability * 12 ? 'text-red-400' : 'text-gray-400'}`}>
                    {Math.round((grandPlanned / (availability * 12)) * 100)}% planned
                  </span>
                )}
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 min-w-[180px]">Project</th>
                      {YEAR_MONTHS.map((m) => (
                        <th key={m} className="text-center px-2 py-2.5 font-medium text-gray-500 text-xs min-w-[52px]">
                          {formatMonth(m).split(' ')[0]}
                        </th>
                      ))}
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600 min-w-[60px]">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberAssignments.length === 0 ? (
                      <tr><td colSpan={YEAR_MONTHS.length + 2} className="px-4 py-4 text-center text-gray-400 text-xs">No assignments</td></tr>
                    ) : (
                      memberAssignments.map(({ id, projectId, plannedHours, billedHours }, idx) => {
                        const project = projects.find((p) => p.id === projectId);
                        const projMonths = project ? getMonthsBetween(project.startMonth, project.endMonth) : [];
                        const totalP = projMonths.reduce((s, m) => s + (plannedHours[m] ?? 0), 0);
                        const totalB = projMonths.reduce((s, m) => s + (billedHours[m] ?? 0), 0);

                        return (
                          <>
                            {/* Planned row */}
                            <tr key={`${id}-planned`} className={`border-b border-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                              <td className="px-4 py-1.5 text-gray-700">
                                <span className="font-medium">{project?.name ?? 'Unknown'}</span>
                                <span className="block text-xs text-indigo-400">Planned</span>
                              </td>
                              {YEAR_MONTHS.map((m) => {
                                const h = plannedHours[m] ?? 0;
                                const active = projMonths.includes(m);
                                return (
                                  <td key={m} className={`text-center px-2 py-1.5 text-xs ${active && h > 0 ? 'text-indigo-600 font-medium' : active ? 'text-gray-300' : 'text-gray-100'}`}>
                                    {active ? (h > 0 ? `${h}` : '—') : ''}
                                  </td>
                                );
                              })}
                              <td className="text-right px-4 py-1.5 text-indigo-600 font-medium">{totalP}h</td>
                            </tr>
                            {/* Billed row */}
                            <tr key={`${id}-billed`} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-emerald-50/20' : 'bg-emerald-50/10'}`}>
                              <td className="px-4 py-1.5 pl-8 text-gray-500 text-xs">↳ Billed</td>
                              {YEAR_MONTHS.map((m) => {
                                const h = billedHours[m] ?? 0;
                                const active = projMonths.includes(m);
                                return (
                                  <td key={m} className={`text-center px-2 py-1.5 text-xs ${active && h > 0 ? 'text-emerald-600 font-medium' : active ? 'text-gray-200' : 'text-gray-100'}`}>
                                    {active ? (h > 0 ? `${h}` : '—') : ''}
                                  </td>
                                );
                              })}
                              <td className="text-right px-4 py-1.5 text-emerald-600 text-xs font-medium">{totalB}h</td>
                            </tr>
                          </>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot>
                    {/* Total planned */}
                    <tr className="border-t border-gray-200 bg-indigo-50/40">
                      <td className="px-4 py-2 font-semibold text-indigo-700 text-xs">Total Planned</td>
                      {YEAR_MONTHS.map((m) => {
                        const total = totalPlannedPerMonth[m] ?? 0;
                        const isOver = availability > 0 && total > availability;
                        const isWarn = availability > 0 && total >= availability * 0.8 && !isOver;
                        return (
                          <td key={m} className={`text-center px-2 py-2 text-xs font-semibold ${isOver ? 'bg-red-100 text-red-700 rounded' : isWarn ? 'bg-yellow-50 text-yellow-700' : total > 0 ? 'text-indigo-600' : 'text-gray-300'}`}>
                            {total > 0 ? `${total}h` : '—'}
                          </td>
                        );
                      })}
                      <td className="text-right px-4 py-2 font-semibold text-indigo-700">{grandPlanned}h</td>
                    </tr>
                    {/* Total billed */}
                    <tr className="bg-emerald-50/30">
                      <td className="px-4 py-2 text-xs text-emerald-700 font-semibold">Total Billed</td>
                      {YEAR_MONTHS.map((m) => {
                        const total = totalBilledPerMonth[m] ?? 0;
                        return (
                          <td key={m} className={`text-center px-2 py-2 text-xs font-medium ${total > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
                            {total > 0 ? `${total}h` : '—'}
                          </td>
                        );
                      })}
                      <td className="text-right px-4 py-2 text-xs font-semibold text-emerald-700">{grandBilled}h</td>
                    </tr>
                    {/* Available */}
                    {availability > 0 && (
                      <tr className="bg-gray-50/50">
                        <td className="px-4 py-2 text-xs text-gray-500">Available</td>
                        {YEAR_MONTHS.map((m) => (
                          <td key={m} className="text-center px-2 py-2 text-xs text-gray-400">{availability}h</td>
                        ))}
                        <td className="text-right px-4 py-2 text-xs text-gray-400">{availability * 12}h</td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── By Project ───────────────────────────────────────────────────────────────

function ByProjectView({ assignments, projects, members }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (projects.length === 0)
    return <div className="text-center text-gray-400 text-sm py-12">No projects yet.</div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setCollapsed({})} className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">Collapse all</button>
      </div>
      {projects.map((project) => {
        const isOpen = collapsed[project.id] === true;
        const months = getMonthsBetween(project.startMonth, project.endMonth);
        const projectAssignments = assignments.filter((a) => a.projectId === project.id);
        const budgetPerMonth = project.monthlyDistribution;

        const totalPlannedPerMonth: Record<string, number> = {};
        const totalBilledPerMonth: Record<string, number> = {};
        for (const month of months) {
          totalPlannedPerMonth[month] = projectAssignments.reduce((s, a) => s + (a.plannedHours[month] ?? 0), 0);
          totalBilledPerMonth[month] = projectAssignments.reduce((s, a) => s + (a.billedHours[month] ?? 0), 0);
        }
        const totalPlanned = Object.values(totalPlannedPerMonth).reduce((s, v) => s + v, 0);
        const totalBilled = Object.values(totalBilledPerMonth).reduce((s, v) => s + v, 0);

        return (
          <div key={project.id} className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setCollapsed((prev) => ({ ...prev, [project.id]: !prev[project.id] }))}
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                <span className="font-semibold text-gray-800">{project.name}</span>
                {project.orderNo && <span className="text-xs text-gray-400">#{project.orderNo}</span>}
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{projectAssignments.length} member{projectAssignments.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-gray-400">{formatMonth(project.startMonth)} – {formatMonth(project.endMonth)} · {months.length} months</span>
                <span className="text-indigo-600 font-medium">{totalPlanned}h planned</span>
                <span className="text-emerald-600 font-medium">{totalBilled}h billed</span>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 min-w-[180px]">Member</th>
                      {months.map((m) => (
                        <th key={m} className="text-center px-2 py-2.5 font-medium text-gray-500 text-xs min-w-[55px]">
                          {formatMonth(m).split(' ')[0]}
                          <span className="block text-gray-300 font-normal">{formatMonth(m).split(' ')[1]}</span>
                        </th>
                      ))}
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600 min-w-[60px]">Total</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-500 min-w-[52px] text-xs">Billed %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectAssignments.length === 0 ? (
                      <tr><td colSpan={months.length + 3} className="px-4 py-4 text-center text-gray-400 text-xs">No assignments</td></tr>
                    ) : (
                      projectAssignments.map(({ id, memberId, plannedHours, billedHours }, idx) => {
                        const member = members.find((m) => m.id === memberId);
                        const totalP = months.reduce((s, m) => s + (plannedHours[m] ?? 0), 0);
                        const totalB = months.reduce((s, m) => s + (billedHours[m] ?? 0), 0);
                        const pct = totalP > 0 ? Math.round((totalB / totalP) * 100) : null;
                        return (
                          <>
                            <tr key={`${id}-planned`} className={`border-b border-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                              <td className="px-4 py-1.5 text-gray-700">
                                <span className="font-medium">{member?.name ?? 'Unknown'}</span>
                                <span className="block text-xs text-indigo-400">Planned</span>
                              </td>
                              {months.map((m) => {
                                const h = plannedHours[m] ?? 0;
                                return <td key={m} className={`text-center px-2 py-1.5 text-xs ${h > 0 ? 'text-indigo-600 font-medium' : 'text-gray-200'}`}>{h > 0 ? `${h}h` : '—'}</td>;
                              })}
                              <td className="text-right px-4 py-1.5 text-indigo-600 font-medium">{totalP}h</td>
                              <td />
                            </tr>
                            <tr key={`${id}-billed`} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-emerald-50/20' : 'bg-emerald-50/10'}`}>
                              <td className="px-4 py-1.5 pl-8 text-gray-500 text-xs">↳ Billed</td>
                              {months.map((m) => {
                                const h = billedHours[m] ?? 0;
                                return <td key={m} className={`text-center px-2 py-1.5 text-xs ${h > 0 ? 'text-emerald-600 font-medium' : 'text-gray-200'}`}>{h > 0 ? `${h}h` : '—'}</td>;
                              })}
                              <td className="text-right px-4 py-1.5 text-emerald-600 text-xs font-medium">{totalB}h</td>
                              <td className="text-right px-4 py-1.5">
                                {pct !== null && (
                                  <span className={`text-xs font-semibold ${pct >= 100 ? 'text-emerald-600' : pct >= 75 ? 'text-yellow-600' : 'text-gray-400'}`}>
                                    {pct}%
                                  </span>
                                )}
                              </td>
                            </tr>
                          </>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-indigo-50/40">
                      <td className="px-4 py-2 font-semibold text-indigo-700 text-xs">Total Planned</td>
                      {months.map((m) => {
                        const total = totalPlannedPerMonth[m] ?? 0;
                        const budget = budgetPerMonth[m] ?? 0;
                        const isOver = budget > 0 && total > budget;
                        return (
                          <td key={m} className={`text-center px-2 py-2 text-xs font-semibold ${isOver ? 'bg-red-100 text-red-700 rounded' : total > 0 ? 'text-indigo-600' : 'text-gray-300'}`}>
                            {total > 0 ? `${total}h` : '—'}
                          </td>
                        );
                      })}
                      <td className="text-right px-4 py-2 font-semibold text-indigo-700">{totalPlanned}h</td>
                      <td />
                    </tr>
                    <tr className="bg-emerald-50/30">
                      <td className="px-4 py-2 text-xs text-emerald-700 font-semibold">Total Billed</td>
                      {months.map((m) => {
                        const total = totalBilledPerMonth[m] ?? 0;
                        return <td key={m} className={`text-center px-2 py-2 text-xs font-medium ${total > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>{total > 0 ? `${total}h` : '—'}</td>;
                      })}
                      <td className="text-right px-4 py-2 text-xs font-semibold text-emerald-700">{totalBilled}h</td>
                      <td className="text-right px-4 py-2">
                        {totalPlanned > 0 && (
                          <span className={`text-xs font-bold ${Math.round((totalBilled / totalPlanned) * 100) >= 100 ? 'text-emerald-600' : Math.round((totalBilled / totalPlanned) * 100) >= 75 ? 'text-yellow-600' : 'text-gray-500'}`}>
                            {Math.round((totalBilled / totalPlanned) * 100)}%
                          </span>
                        )}
                      </td>
                    </tr>
                    <tr className="bg-indigo-50/20">
                      <td className="px-4 py-2 text-gray-500 text-xs">Project Budget</td>
                      {months.map((m) => (
                        <td key={m} className="text-center px-2 py-2 text-xs text-gray-400">{budgetPerMonth[m] ? `${budgetPerMonth[m]}h` : '—'}</td>
                      ))}
                      <td className="text-right px-4 py-2 text-xs text-gray-400">{Object.values(budgetPerMonth).reduce((s, v) => s + v, 0)}h</td>
                      <td />
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-4 py-2 text-gray-500 text-xs">Remaining</td>
                      {months.map((m) => {
                        const assigned = totalPlannedPerMonth[m] ?? 0;
                        const budget = budgetPerMonth[m] ?? 0;
                        const remaining = budget - assigned;
                        return (
                          <td key={m} className={`text-center px-2 py-2 text-xs ${remaining < 0 ? 'text-red-600 font-semibold' : remaining === 0 && budget > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                            {budget > 0 ? `${remaining}h` : '—'}
                          </td>
                        );
                      })}
                      <td className="text-right px-4 py-2 text-xs text-gray-400">
                        {Object.values(budgetPerMonth).reduce((s, v) => s + v, 0) - totalPlanned}h
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function OverviewClient(props: Props) {
  const [tab, setTab] = useState<'dashboard' | 'member' | 'project' | 'charts'>('dashboard');
  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'member',    label: 'By Member' },
    { key: 'project',   label: 'By Project' },
    { key: 'charts',    label: 'Charts' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {tabs.map((t, i) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 text-sm font-medium transition-colors ${i > 0 ? 'border-l border-gray-200' : ''} ${tab === t.key ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'dashboard' && <DashboardView assignments={props.assignments} projects={props.projects} members={props.members} />}
      {tab === 'member'    && <ByMemberView {...props} />}
      {tab === 'project'   && <ByProjectView {...props} />}
      {tab === 'charts'    && <ChartsView assignments={props.assignments} projects={props.projects} members={props.members} />}
    </div>
  );
}
