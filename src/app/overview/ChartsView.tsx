'use client';

import { useState } from 'react';
import {
  ComposedChart,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
} from 'recharts';
import { Assignment, Project, TeamMember } from '@/lib/types';
import { getMonthsBetween, formatMonth } from '@/lib/utils';

interface Props {
  assignments: Assignment[];
  projects: Project[];
  members: TeamMember[];
}

// Fixed palette — distinct enough for 10+ items
const COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#84cc16',
  '#06b6d4', '#e11d48',
];

function getColor(index: number) {
  return COLORS[index % COLORS.length];
}

// Collect all months touched by any project, sorted
function getAllMonths(projects: Project[]): string[] {
  if (projects.length === 0) return getMonthsBetween('2026-01', '2026-12');
  const set = new Set<string>();
  for (const p of projects) {
    for (const m of getMonthsBetween(p.startMonth, p.endMonth)) set.add(m);
  }
  return Array.from(set).sort();
}

// ─── Chart 1: assigned hours per project per month ───────────────────────────

function ProjectsChart({ assignments, projects }: Omit<Props, 'members'>) {
  const months = getAllMonths(projects);

  const data = months.map((month) => {
    const entry: Record<string, string | number> = { month: formatMonth(month) };
    for (const project of projects) {
      const projMonths = getMonthsBetween(project.startMonth, project.endMonth);
      if (!projMonths.includes(month)) continue;
      const total = assignments
        .filter((a) => a.projectId === project.id)
        .reduce((s, a) => s + a.hoursPerMonth, 0);
      if (total > 0) entry[project.name] = total;
    }
    return entry;
  });

  if (projects.length === 0) {
    return <Empty label="No projects yet." />;
  }

  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-800 mb-1">
        Assigned Resources per Project — over Time
      </h3>
      <p className="text-xs text-gray-400 mb-5">
        Total hours committed by all assigned members per project per month
      </p>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="h" width={42} />
          <Tooltip
            formatter={(val: unknown, name: unknown) => [`${val}h`, String(name)]}
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
          {projects.map((project, i) => (
            <Bar
              key={project.id}
              dataKey={project.name}
              stackId="a"
              fill={getColor(i)}
              radius={i === projects.length - 1 ? [3, 3, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Chart 2: hours per team member per month ─────────────────────────────────

function MembersChart({ assignments, projects, members }: Props) {
  const months = getAllMonths(projects);

  const data = months.map((month) => {
    const entry: Record<string, string | number> = { month: formatMonth(month) };
    for (const member of members) {
      const hours = assignments
        .filter((a) => a.memberId === member.id)
        .reduce((s, a) => {
          const proj = projects.find((p) => p.id === a.projectId);
          if (!proj) return s;
          return getMonthsBetween(proj.startMonth, proj.endMonth).includes(month)
            ? s + a.hoursPerMonth
            : s;
        }, 0);
      if (hours > 0) entry[member.name] = hours;
    }
    return entry;
  });

  if (members.length === 0) {
    return <Empty label="No team members yet." />;
  }

  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-800 mb-1">
        Team Member Utilisation — over Time
      </h3>
      <p className="text-xs text-gray-400 mb-5">
        Total planned hours per team member per month across all projects
      </p>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="h" width={42} />
          <Tooltip
            formatter={(val: unknown, name: unknown) => [`${val}h`, String(name)]}
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
          {members.map((member, i) => (
            <Bar
              key={member.id}
              dataKey={member.name}
              stackId="a"
              fill={getColor(i)}
              radius={i === members.length - 1 ? [3, 3, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Chart 3: member utilisation vs availability (line chart) ─────────────────

function MembersUtilisationChart({ assignments, projects, members }: Props) {
  const months = getAllMonths(projects);
  const membersWithAvail = members.filter((m) => m.monthlyAvailability > 0);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggleMember = (name: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const hideAll = () => setHidden(new Set(membersWithAvail.map((m) => m.name)));
  const showAll = () => setHidden(new Set());

  const data = months.map((month) => {
    const entry: Record<string, string | number> = { month: formatMonth(month) };
    for (const member of membersWithAvail) {
      const hours = assignments
        .filter((a) => a.memberId === member.id)
        .reduce((s, a) => {
          const proj = projects.find((p) => p.id === a.projectId);
          if (!proj) return s;
          return getMonthsBetween(proj.startMonth, proj.endMonth).includes(month)
            ? s + a.hoursPerMonth
            : s;
        }, 0);
      entry[member.name] = Math.round((hours / member.monthlyAvailability) * 100);
    }
    return entry;
  });

  if (membersWithAvail.length === 0) {
    return <Empty label="Set monthly availability on team members to see utilisation %." />;
  }

  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 p-5">
      <div className="flex items-start justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-800">
          Utilisation Rate per Member — % of Availability
        </h3>
        <div className="flex gap-3 text-xs shrink-0 ml-4">
          <button onClick={showAll} className="text-indigo-600 hover:text-indigo-800">
            Show all
          </button>
          <button onClick={hideAll} className="text-gray-400 hover:text-gray-600">
            Hide all
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Planned hours ÷ monthly availability. 100% = fully booked. Click a name to isolate.
      </p>

      {/* Toggle pills */}
      <div className="flex flex-wrap gap-2 mb-5">
        {membersWithAvail.map((member, i) => {
          const isHidden = hidden.has(member.name);
          return (
            <button
              key={member.id}
              onClick={() => toggleMember(member.name)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                isHidden
                  ? 'bg-white text-gray-400 border-gray-200 opacity-50'
                  : 'text-white border-transparent'
              }`}
              style={isHidden ? {} : { backgroundColor: getColor(i) }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: isHidden ? '#d1d5db' : getColor(i) }}
              />
              {member.name}
            </button>
          );
        })}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="%" width={42} domain={[0, 'dataMax + 20']} />
          <Tooltip
            formatter={(val: unknown, name: unknown) => [`${val}%`, String(name)]}
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
          />
          <ReferenceLine
            y={100}
            stroke="#ef4444"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{ value: '100%', fontSize: 10, fill: '#ef4444' }}
          />
          {membersWithAvail.map((member, i) => (
            <Line
              key={member.id}
              type="monotone"
              dataKey={member.name}
              stroke={getColor(i)}
              strokeWidth={hidden.has(member.name) ? 0 : 2}
              dot={hidden.has(member.name) ? false : { r: 3 }}
              activeDot={hidden.has(member.name) ? false : { r: 5 }}
              hide={hidden.has(member.name)}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Isolated member: overlay project bars + utilisation line in one composed chart */}
      {(() => {
        const visibleMembers = membersWithAvail.filter((m) => !hidden.has(m.name));
        if (visibleMembers.length !== 1) return null;
        const member = visibleMembers[0];
        const memberAssignments = assignments.filter((a) => a.memberId === member.id);
        const memberProjects = memberAssignments
          .map((a) => projects.find((p) => p.id === a.projectId))
          .filter(Boolean) as typeof projects;

        const composedData = months.map((month) => {
          const entry: Record<string, string | number> = { month: formatMonth(month) };
          let totalHours = 0;
          for (const a of memberAssignments) {
            const proj = projects.find((p) => p.id === a.projectId);
            if (!proj) continue;
            if (getMonthsBetween(proj.startMonth, proj.endMonth).includes(month)) {
              entry[proj.name] = a.hoursPerMonth;
              totalHours += a.hoursPerMonth;
            }
          }
          entry['__utilPct__'] = Math.round((totalHours / member.monthlyAvailability) * 100);
          return entry;
        });

        return (
          <div className="mt-6 pt-5 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-700 mb-1">
              {member.name} — Project Breakdown &amp; Utilisation
            </p>
            <p className="text-xs text-gray-400 mb-4">
              Bars = hours per project (left axis) · Line = utilisation % (right axis) · availability {member.monthlyAvailability}h/month
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={composedData} margin={{ top: 4, right: 48, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis
                  yAxisId="hours"
                  tick={{ fontSize: 11 }}
                  unit="h"
                  width={42}
                />
                <YAxis
                  yAxisId="pct"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  unit="%"
                  width={42}
                  domain={[0, 'dataMax + 20']}
                />
                <Tooltip
                  formatter={(val: unknown, name: unknown) =>
                    String(name) === '__utilPct__'
                      ? [`${val}%`, 'Utilisation']
                      : [`${val}h`, String(name)]
                  }
                  contentStyle={{ fontSize: 12, borderRadius: 6 }}
                />
                <Legend
                  formatter={(name) => name === '__utilPct__' ? 'Utilisation %' : name}
                  wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
                />
                <ReferenceLine
                  yAxisId="hours"
                  y={member.monthlyAvailability}
                  stroke="#6366f1"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{ value: `${member.monthlyAvailability}h`, fontSize: 10, fill: '#6366f1', position: 'insideTopLeft' }}
                />
                <ReferenceLine
                  yAxisId="pct"
                  y={100}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{ value: '100%', fontSize: 10, fill: '#ef4444', position: 'insideTopRight' }}
                />
                {memberProjects.map((proj, i) => (
                  <Bar
                    key={proj.id}
                    yAxisId="hours"
                    dataKey={proj.name}
                    stackId="b"
                    fill={getColor(i)}
                    opacity={0.85}
                    radius={i === memberProjects.length - 1 ? [3, 3, 0, 0] : undefined}
                  />
                ))}
                <Line
                  yAxisId="pct"
                  type="monotone"
                  dataKey="__utilPct__"
                  stroke="#1e293b"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#1e293b' }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        );
      })()}
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

export default function ChartsView(props: Props) {
  return (
    <div className="space-y-6">
      <ProjectsChart assignments={props.assignments} projects={props.projects} />
      <MembersChart {...props} />
      <MembersUtilisationChart {...props} />
    </div>
  );
}
