'use client';

import { useState } from 'react';
import { Assignment, Project, TeamMember, Role } from '@/lib/types';
import { getMonthsBetween, formatMonth } from '@/lib/utils';
import ChartsView from './ChartsView';

const YEAR_MONTHS = getMonthsBetween('2026-01', '2026-12');

interface Props {
  assignments: Assignment[];
  projects: Project[];
  members: TeamMember[];
  roles: Role[];
}

/** Returns hours for a member in a given month across all their assignments */
function getMemberHoursForMonth(
  memberId: string,
  month: string,
  assignments: Assignment[],
  projects: Project[]
): number {
  return assignments
    .filter((a) => a.memberId === memberId)
    .reduce((sum, a) => {
      const proj = projects.find((p) => p.id === a.projectId);
      if (!proj) return sum;
      const months = getMonthsBetween(proj.startMonth, proj.endMonth);
      return months.includes(month) ? sum + a.hoursPerMonth : sum;
    }, 0);
}

function ByMemberView({ assignments, projects, members, roles }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (members.length === 0) {
    return (
      <div className="text-center text-gray-400 text-sm py-12">No team members yet.</div>
    );
  }

  function collapseAll() {
    setCollapsed({});
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={collapseAll}
          className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
        >
          Collapse all
        </button>
      </div>
      {members.map((member) => {
        const isOpen = collapsed[member.id] === true;
        const role = roles.find((r) => r.id === member.roleId);
        const availability = member.monthlyAvailability ?? 0;
        const memberAssignments = assignments.filter((a) => a.memberId === member.id);

        // Per-project rows: for each assignment, show hoursPerMonth across months
        const projectRows = memberAssignments.map((a) => {
          const project = projects.find((p) => p.id === a.projectId);
          const projMonths = project
            ? getMonthsBetween(project.startMonth, project.endMonth)
            : [];
          return { project, a, projMonths };
        });

        // Total per month across all projects
        const totalPerMonth: Record<string, number> = {};
        for (const month of YEAR_MONTHS) {
          totalPerMonth[month] = getMemberHoursForMonth(
            member.id,
            month,
            assignments,
            projects
          );
        }
        const grandTotal = Object.values(totalPerMonth).reduce((s, v) => s + v, 0);

        return (
          <div key={member.id} className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setCollapsed((prev) => ({ ...prev, [member.id]: !prev[member.id] }))}
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
                  ▶
                </span>
                <span className="font-semibold text-gray-800">{member.name}</span>
                {role && (
                  <span className="text-xs text-gray-400">{role.name} · {role.type}</span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span>{memberAssignments.length} project{memberAssignments.length !== 1 ? 's' : ''}</span>
                {availability > 0 && (
                  <span className={`font-medium ${grandTotal > availability * 12 ? 'text-red-500' : 'text-gray-500'}`}>
                    {grandTotal}h / {availability * 12}h yr
                  </span>
                )}
                {!availability && <span className="font-medium text-gray-600">{grandTotal}h total</span>}
              </div>
            </button>

            {isOpen && (
            <div className="border-t border-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600 min-w-[180px]">
                      Project
                    </th>
                    {YEAR_MONTHS.map((m) => (
                      <th
                        key={m}
                        className="text-center px-2 py-2.5 font-medium text-gray-500 text-xs min-w-[50px]"
                      >
                        {formatMonth(m).split(' ')[0]}
                      </th>
                    ))}
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600 min-w-[60px]">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {projectRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={YEAR_MONTHS.length + 2}
                        className="px-4 py-4 text-center text-gray-400 text-xs"
                      >
                        No assignments
                      </td>
                    </tr>
                  ) : (
                    projectRows.map(({ project, a, projMonths }, idx) => {
                      const total = a.hoursPerMonth * projMonths.length;
                      return (
                        <tr
                          key={a.id}
                          className={`border-b border-gray-50 ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                          }`}
                        >
                          <td className="px-4 py-2 text-gray-700">
                            <span>{project?.name ?? 'Unknown'}</span>
                            <span className="block text-xs text-gray-400">
                              {a.hoursPerMonth}h/month
                            </span>
                          </td>
                          {YEAR_MONTHS.map((m) => {
                            const active = projMonths.includes(m);
                            return (
                              <td
                                key={m}
                                className={`text-center px-2 py-2 text-xs ${
                                  active ? 'text-indigo-600 font-medium' : 'text-gray-200'
                                }`}
                              >
                                {active ? a.hoursPerMonth : '—'}
                              </td>
                            );
                          })}
                          <td className="text-right px-4 py-2 text-gray-700 font-medium">
                            {total}h
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-slate-50">
                    <td className="px-4 py-2 font-semibold text-gray-700">Total assigned</td>
                    {YEAR_MONTHS.map((m) => {
                      const total = totalPerMonth[m] ?? 0;
                      const isOver = availability > 0 && total > availability;
                      const isWarn = availability > 0 && total >= availability * 0.8 && !isOver;
                      return (
                        <td
                          key={m}
                          className={`text-center px-2 py-2 text-xs font-semibold rounded ${
                            isOver
                              ? 'bg-red-100 text-red-700'
                              : isWarn
                              ? 'bg-yellow-50 text-yellow-700'
                              : total > 0
                              ? 'text-gray-800'
                              : 'text-gray-300'
                          }`}
                        >
                          {total > 0 ? `${total}h` : '—'}
                        </td>
                      );
                    })}
                    <td className="text-right px-4 py-2 font-semibold text-gray-700">
                      {grandTotal}h
                    </td>
                  </tr>
                  {availability > 0 && (
                    <tr className="bg-indigo-50/40">
                      <td className="px-4 py-2 text-xs text-gray-500">Available</td>
                      {YEAR_MONTHS.map((m) => (
                        <td key={m} className="text-center px-2 py-2 text-xs text-gray-400">
                          {availability}h
                        </td>
                      ))}
                      <td className="text-right px-4 py-2 text-xs text-gray-400">
                        {availability * 12}h
                      </td>
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

function ByProjectView({ assignments, projects, members }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (projects.length === 0) {
    return (
      <div className="text-center text-gray-400 text-sm py-12">No projects yet.</div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCollapsed({})}
          className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
        >
          Collapse all
        </button>
      </div>
      {projects.map((project) => {
        const isOpen = collapsed[project.id] === true;
        const months = getMonthsBetween(project.startMonth, project.endMonth);
        const projectAssignments = assignments.filter((a) => a.projectId === project.id);
        const budgetPerMonth = project.monthlyDistribution;
        const totalAssigned = projectAssignments.reduce((s, a) => s + a.hoursPerMonth * months.length, 0);

        const totalAssignedPerMonth: Record<string, number> = {};
        for (const month of months) {
          totalAssignedPerMonth[month] = projectAssignments.reduce(
            (s, a) => s + a.hoursPerMonth,
            0
          );
        }

        return (
          <div key={project.id} className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setCollapsed((prev) => ({ ...prev, [project.id]: !prev[project.id] }))}
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
                  ▶
                </span>
                <span className="font-semibold text-gray-800">{project.name}</span>
                {project.orderNo && (
                  <span className="text-xs text-gray-400">#{project.orderNo}</span>
                )}
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {projectAssignments.length} member{projectAssignments.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span>{formatMonth(project.startMonth)} – {formatMonth(project.endMonth)} · {months.length} months</span>
                <span className="font-medium text-gray-600">{totalAssigned}h total</span>
              </div>
            </button>

            {isOpen && (
            <div className="border-t border-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600 min-w-[180px]">
                      Member
                    </th>
                    {months.map((m) => (
                      <th
                        key={m}
                        className="text-center px-2 py-2.5 font-medium text-gray-500 text-xs min-w-[55px]"
                      >
                        {formatMonth(m).split(' ')[0]}
                        <span className="block text-gray-300 font-normal">
                          {formatMonth(m).split(' ')[1]}
                        </span>
                      </th>
                    ))}
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600 min-w-[60px]">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {projectAssignments.length === 0 ? (
                    <tr>
                      <td
                        colSpan={months.length + 2}
                        className="px-4 py-4 text-center text-gray-400 text-xs"
                      >
                        No assignments
                      </td>
                    </tr>
                  ) : (
                    projectAssignments.map((a, idx) => {
                      const member = members.find((m) => m.id === a.memberId);
                      const total = a.hoursPerMonth * months.length;
                      return (
                        <tr
                          key={a.id}
                          className={`border-b border-gray-50 ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                          }`}
                        >
                          <td className="px-4 py-2 text-gray-700">
                            <span>{member?.name ?? 'Unknown'}</span>
                            <span className="block text-xs text-gray-400">
                              {a.hoursPerMonth}h/month
                            </span>
                          </td>
                          {months.map((m) => (
                            <td
                              key={m}
                              className="text-center px-2 py-2 text-xs text-indigo-600 font-medium"
                            >
                              {a.hoursPerMonth}h
                            </td>
                          ))}
                          <td className="text-right px-4 py-2 text-gray-700 font-medium">
                            {total}h
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-slate-50">
                    <td className="px-4 py-2 font-semibold text-gray-700">Total Assigned</td>
                    {months.map((m) => {
                      const total = totalAssignedPerMonth[m] ?? 0;
                      const budget = budgetPerMonth[m] ?? 0;
                      const isOver = budget > 0 && total > budget;
                      return (
                        <td
                          key={m}
                          className={`text-center px-2 py-2 text-xs font-semibold ${
                            isOver ? 'bg-red-100 text-red-700 rounded' : 'text-gray-700'
                          }`}
                        >
                          {total > 0 ? `${total}h` : '—'}
                        </td>
                      );
                    })}
                    <td className="text-right px-4 py-2 font-semibold text-gray-700">
                      {projectAssignments.reduce((s, a) => s + a.hoursPerMonth * months.length, 0)}h
                    </td>
                  </tr>
                  <tr className="bg-indigo-50/50">
                    <td className="px-4 py-2 text-gray-500 text-xs">Project Budget</td>
                    {months.map((m) => (
                      <td key={m} className="text-center px-2 py-2 text-xs text-gray-400">
                        {budgetPerMonth[m] ? `${budgetPerMonth[m]}h` : '—'}
                      </td>
                    ))}
                    <td className="text-right px-4 py-2 text-xs text-gray-400">
                      {Object.values(budgetPerMonth).reduce((s, v) => s + v, 0)}h
                    </td>
                  </tr>
                  <tr className="bg-gray-50/50">
                    <td className="px-4 py-2 text-gray-500 text-xs">Remaining</td>
                    {months.map((m) => {
                      const assigned = totalAssignedPerMonth[m] ?? 0;
                      const budget = budgetPerMonth[m] ?? 0;
                      const remaining = budget - assigned;
                      return (
                        <td
                          key={m}
                          className={`text-center px-2 py-2 text-xs ${
                            remaining < 0
                              ? 'text-red-600 font-semibold'
                              : remaining === 0 && budget > 0
                              ? 'text-green-600'
                              : 'text-gray-400'
                          }`}
                        >
                          {budget > 0 ? `${remaining}h` : '—'}
                        </td>
                      );
                    })}
                    <td className="text-right px-4 py-2 text-xs text-gray-400">
                      {(() => {
                        const totalBudget = Object.values(budgetPerMonth).reduce(
                          (s, v) => s + v,
                          0
                        );
                        const totalAssigned = projectAssignments.reduce(
                          (s, a) => s + a.hoursPerMonth * months.length,
                          0
                        );
                        return `${totalBudget - totalAssigned}h`;
                      })()}
                    </td>
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

export default function OverviewClient(props: Props) {
  const [tab, setTab] = useState<'member' | 'project' | 'charts'>('member');

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'member', label: 'By Member' },
    { key: 'project', label: 'By Project' },
    { key: 'charts', label: 'Charts' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {tabs.map((t, i) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                i > 0 ? 'border-l border-gray-200' : ''
              } ${
                tab === t.key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'member' && <ByMemberView {...props} />}
      {tab === 'project' && <ByProjectView {...props} />}
      {tab === 'charts' && <ChartsView assignments={props.assignments} projects={props.projects} members={props.members} />}
    </div>
  );
}
