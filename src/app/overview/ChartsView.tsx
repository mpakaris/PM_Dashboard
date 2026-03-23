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

const COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#84cc16',
  '#06b6d4', '#e11d48',
];
const getColor = (i: number) => COLORS[i % COLORS.length];

function getAllMonths(projects: Project[]): string[] {
  if (projects.length === 0) return getMonthsBetween('2026-01', '2026-12');
  const set = new Set<string>();
  for (const p of projects)
    for (const m of getMonthsBetween(p.startMonth, p.endMonth)) set.add(m);
  return Array.from(set).sort();
}

// ─── Shared toggle hook ───────────────────────────────────────────────────────

function useToggle(names: string[]) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (name: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  const showAll = () => setHidden(new Set());
  const hideAll = () => setHidden(new Set(names));
  // "isolate" = hide everything except this one
  const isolate = (name: string) =>
    setHidden(new Set(names.filter((n) => n !== name)));
  return { hidden, toggle, isolate, showAll, hideAll };
}

// ─── Shared legend pills ──────────────────────────────────────────────────────

function LegendPills({
  items,
  hidden,
  onToggle,
  onIsolate,
  onShowAll,
  onHideAll,
}: {
  items: { name: string; color: string }[];
  hidden: Set<string>;
  onToggle: (name: string) => void;
  onIsolate: (name: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-5">
      {items.map(({ name, color }) => {
        const isHidden = hidden.has(name);
        return (
          <button
            key={name}
            onClick={() => onToggle(name)}
            onDoubleClick={(e) => { e.preventDefault(); onIsolate(name); }}
            title="Click to toggle · Double-click to isolate"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer select-none ${
              isHidden
                ? 'bg-white text-gray-400 border-gray-200 opacity-50'
                : 'text-white border-transparent'
            }`}
            style={isHidden ? {} : { backgroundColor: color }}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: isHidden ? '#d1d5db' : color }}
            />
            {name}
          </button>
        );
      })}
      <div className="flex gap-2 ml-auto text-xs">
        <button onClick={onShowAll} className="px-2.5 py-1 rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors">Show all</button>
        <button onClick={onHideAll} className="px-2.5 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">Hide all</button>
      </div>
    </div>
  );
}

function ChartShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-800 mb-1">{title}</h3>
      <p className="text-xs text-gray-400 mb-4">{subtitle}</p>
      {children}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="bg-white rounded-lg ring-1 ring-gray-200 p-8 text-center text-gray-400 text-sm">{label}</div>;
}

// ─── Chart 1: assigned hours per project per month ────────────────────────────

function ProjectsChart({ assignments, projects }: Omit<Props, 'members'>) {
  const months = getAllMonths(projects);
  const { hidden, toggle, isolate, showAll, hideAll } = useToggle(projects.map((p) => p.name));

  const data = months.map((month) => {
    const entry: Record<string, string | number> = { month: formatMonth(month) };
    for (const project of projects) {
      if (!getMonthsBetween(project.startMonth, project.endMonth).includes(month)) continue;
      const total = assignments
        .filter((a) => a.projectId === project.id)
        .reduce((s, a) => s + a.hoursPerMonth, 0);
      if (total > 0) entry[project.name] = total;
    }
    return entry;
  });

  if (projects.length === 0) return <Empty label="No projects yet." />;

  const items = projects.map((p, i) => ({ name: p.name, color: getColor(i) }));

  return (
    <ChartShell
      title="Assigned Resources per Project — over Time"
      subtitle="Total hours committed by all assigned members per project per month · Click to toggle · Double-click to isolate"
    >
      <LegendPills items={items} hidden={hidden} onToggle={toggle} onIsolate={isolate} onShowAll={showAll} onHideAll={hideAll} />
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="h" width={42} />
          <Tooltip
            formatter={(val: unknown, name: unknown) => [`${val}h`, String(name)]}
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
          />
          {projects.map((project, i) => (
            <Bar
              key={project.id}
              dataKey={project.name}
              stackId="a"
              fill={getColor(i)}
              hide={hidden.has(project.name)}
              radius={i === projects.length - 1 ? [3, 3, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

// ─── Chart 2: hours per team member per month ─────────────────────────────────

function MembersChart({ assignments, projects, members }: Props) {
  const months = getAllMonths(projects);
  const { hidden, toggle, isolate, showAll, hideAll } = useToggle(members.map((m) => m.name));

  const data = months.map((month) => {
    const entry: Record<string, string | number> = { month: formatMonth(month) };
    for (const member of members) {
      const hours = assignments
        .filter((a) => a.memberId === member.id)
        .reduce((s, a) => {
          const proj = projects.find((p) => p.id === a.projectId);
          if (!proj) return s;
          return getMonthsBetween(proj.startMonth, proj.endMonth).includes(month)
            ? s + a.hoursPerMonth : s;
        }, 0);
      if (hours > 0) entry[member.name] = hours;
    }
    return entry;
  });

  if (members.length === 0) return <Empty label="No team members yet." />;

  const items = members.map((m, i) => ({ name: m.name, color: getColor(i) }));

  return (
    <ChartShell
      title="Team Member Utilisation — over Time"
      subtitle="Total planned hours per team member per month across all projects · Click to toggle · Double-click to isolate"
    >
      <LegendPills items={items} hidden={hidden} onToggle={toggle} onIsolate={isolate} onShowAll={showAll} onHideAll={hideAll} />
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="h" width={42} />
          <Tooltip
            formatter={(val: unknown, name: unknown) => [`${val}h`, String(name)]}
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
          />
          {members.map((member, i) => (
            <Bar
              key={member.id}
              dataKey={member.name}
              stackId="a"
              fill={getColor(i)}
              hide={hidden.has(member.name)}
              radius={i === members.length - 1 ? [3, 3, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

// ─── Chart 3: utilisation % + isolated composed chart ─────────────────────────

function UtilisationChart({ assignments, projects, members }: Props) {
  const months = getAllMonths(projects);
  const membersWithAvail = members.filter((m) => m.monthlyAvailability > 0);
  const { hidden, toggle, isolate, showAll, hideAll } = useToggle(membersWithAvail.map((m) => m.name));

  const data = months.map((month) => {
    const entry: Record<string, string | number> = { month: formatMonth(month) };
    for (const member of membersWithAvail) {
      const hours = assignments
        .filter((a) => a.memberId === member.id)
        .reduce((s, a) => {
          const proj = projects.find((p) => p.id === a.projectId);
          if (!proj) return s;
          return getMonthsBetween(proj.startMonth, proj.endMonth).includes(month)
            ? s + a.hoursPerMonth : s;
        }, 0);
      entry[member.name] = Math.round((hours / member.monthlyAvailability) * 100);
    }
    return entry;
  });

  if (membersWithAvail.length === 0)
    return <Empty label="Set monthly availability on team members to see utilisation %." />;

  const items = membersWithAvail.map((m, i) => ({ name: m.name, color: getColor(i) }));
  const visibleMembers = membersWithAvail.filter((m) => !hidden.has(m.name));
  const isolatedMember = visibleMembers.length === 1 ? visibleMembers[0] : null;

  // Composed data for isolated member
  const isolatedMemberAssignments = isolatedMember
    ? assignments.filter((a) => a.memberId === isolatedMember.id)
    : [];
  const isolatedMemberProjects = isolatedMemberAssignments
    .map((a) => projects.find((p) => p.id === a.projectId))
    .filter(Boolean) as Project[];

  const composedData = isolatedMember
    ? months.map((month) => {
        const entry: Record<string, string | number> = { month: formatMonth(month) };
        let totalHours = 0;
        for (const a of isolatedMemberAssignments) {
          const proj = projects.find((p) => p.id === a.projectId);
          if (!proj) continue;
          if (getMonthsBetween(proj.startMonth, proj.endMonth).includes(month)) {
            entry[proj.name] = a.hoursPerMonth;
            totalHours += a.hoursPerMonth;
          }
        }
        entry['__utilPct__'] = Math.round((totalHours / isolatedMember.monthlyAvailability) * 100);
        return entry;
      })
    : [];

  return (
    <ChartShell
      title="Utilisation Rate per Member — % of Availability"
      subtitle="Planned hours ÷ monthly availability. 100% = fully booked · Click to toggle · Double-click to isolate"
    >
      <LegendPills items={items} hidden={hidden} onToggle={toggle} onIsolate={isolate} onShowAll={showAll} onHideAll={hideAll} />

      {isolatedMember ? (
        <>
          <p className="text-xs text-gray-500 mb-3">
            <span className="font-medium">{isolatedMember.name}</span> — bars show hours per project (left), line shows utilisation % (right)
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={composedData} margin={{ top: 4, right: 48, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="hours" tick={{ fontSize: 11 }} unit="h" width={42} />
              <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 11 }} unit="%" width={42} domain={[0, 'dataMax + 20']} />
              <Tooltip
                formatter={(val: unknown, name: unknown) =>
                  String(name) === '__utilPct__' ? [`${val}%`, 'Utilisation'] : [`${val}h`, String(name)]
                }
                contentStyle={{ fontSize: 12, borderRadius: 6 }}
              />
              <Legend
                formatter={(name) => name === '__utilPct__' ? 'Utilisation %' : name}
                wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
              />
              <ReferenceLine yAxisId="hours" y={isolatedMember.monthlyAvailability} stroke="#6366f1" strokeDasharray="4 4" strokeWidth={1.5}
                label={{ value: `${isolatedMember.monthlyAvailability}h`, fontSize: 10, fill: '#6366f1', position: 'insideTopLeft' }} />
              <ReferenceLine yAxisId="pct" y={100} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5}
                label={{ value: '100%', fontSize: 10, fill: '#ef4444', position: 'insideTopRight' }} />
              {isolatedMemberProjects.map((proj, i) => (
                <Bar key={proj.id} yAxisId="hours" dataKey={proj.name} stackId="b" fill={getColor(i)} opacity={0.85}
                  radius={i === isolatedMemberProjects.length - 1 ? [3, 3, 0, 0] : undefined} />
              ))}
              <Line yAxisId="pct" type="monotone" dataKey="__utilPct__" stroke="#1e293b" strokeWidth={2.5}
                dot={{ r: 3, fill: '#1e293b' }} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit="%" width={42} domain={[0, 'dataMax + 20']} />
            <Tooltip
              formatter={(val: unknown, name: unknown) => [`${val}%`, String(name)]}
              contentStyle={{ fontSize: 12, borderRadius: 6 }}
            />
            <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5}
              label={{ value: '100%', fontSize: 10, fill: '#ef4444' }} />
            {membersWithAvail.map((member, i) => (
              <Line key={member.id} type="monotone" dataKey={member.name} stroke={getColor(i)}
                strokeWidth={hidden.has(member.name) ? 0 : 2}
                dot={hidden.has(member.name) ? false : { r: 3 }}
                activeDot={hidden.has(member.name) ? false : { r: 5 }}
                hide={hidden.has(member.name)} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function ChartsView(props: Props) {
  return (
    <div className="space-y-6">
      <ProjectsChart assignments={props.assignments} projects={props.projects} />
      <MembersChart {...props} />
      <UtilisationChart {...props} />
    </div>
  );
}
