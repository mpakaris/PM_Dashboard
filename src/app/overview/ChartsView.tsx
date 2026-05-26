'use client';

import { useState, Fragment } from 'react';
import {
  ComposedChart, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, ReferenceLine, Legend,
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

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// Returns the last month to include in billed-hours views:
// - capped at current month
// - if current month has no billing, rolls back to last month that does
function getEffectiveEndMonth(assignments: Assignment[]): string {
  const current = getCurrentMonth();
  let lastBilled: string | null = null;
  let hasCurrentMonthBilling = false;
  for (const a of assignments) {
    for (const [month, hours] of Object.entries(a.billedHours)) {
      if ((hours ?? 0) > 0 && month <= current) {
        if (!lastBilled || month > lastBilled) lastBilled = month;
        if (month === current) hasCurrentMonthBilling = true;
      }
    }
  }
  if (!lastBilled) return current;
  return hasCurrentMonthBilling ? current : lastBilled;
}

function useToggle(names: string[]) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (name: string) => setHidden((prev) => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const showAll = () => setHidden(new Set());
  const hideAll = () => setHidden(new Set(names));
  const isolate = (name: string) => setHidden(new Set(names.filter((n) => n !== name)));
  return { hidden, toggle, isolate, showAll, hideAll };
}

function LegendPills({ items, hidden, onToggle, onIsolate, onShowAll, onHideAll }: {
  items: { name: string; color: string }[];
  hidden: Set<string>;
  onToggle: (n: string) => void;
  onIsolate: (n: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-5">
      {items.map(({ name, color }) => {
        const isHidden = hidden.has(name);
        return (
          <button key={name} onClick={() => onToggle(name)} onDoubleClick={(e) => { e.preventDefault(); onIsolate(name); }}
            title="Click to toggle · Double-click to isolate"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer select-none ${isHidden ? 'bg-white text-gray-400 border-gray-200 opacity-50' : 'text-white border-transparent'}`}
            style={isHidden ? {} : { backgroundColor: color }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isHidden ? '#d1d5db' : color }} />
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

// ─── Chart 1: Planned hours per project per month ─────────────────────────────

function ProjectsChart({ assignments, projects }: Omit<Props, 'members'>) {
  const months = getAllMonths(projects);
  const { hidden, toggle, isolate, showAll, hideAll } = useToggle(projects.map((p) => p.name));

  const data = months.map((month) => {
    const entry: Record<string, string | number> = { month: formatMonth(month) };
    for (const project of projects) {
      if (!getMonthsBetween(project.startMonth, project.endMonth).includes(month)) continue;
      const total = assignments.filter((a) => a.projectId === project.id).reduce((s, a) => s + (a.plannedHours[month] ?? 0), 0);
      if (total > 0) entry[project.name] = total;
    }
    return entry;
  });

  if (projects.length === 0) return <Empty label="No projects yet." />;

  return (
    <ChartShell title="Planned Hours per Project — over Time" subtitle="Total planned hours across all assigned members per project per month · Click to toggle · Double-click to isolate">
      <LegendPills items={projects.map((p, i) => ({ name: p.name, color: getColor(i) }))} hidden={hidden} onToggle={toggle} onIsolate={isolate} onShowAll={showAll} onHideAll={hideAll} />
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="h" width={42} />
          <Tooltip formatter={(val, name) => [`${val}h`, String(name)]} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
          {projects.map((project, i) => (
            <Bar key={project.id} dataKey={project.name} stackId="a" fill={getColor(i)} hide={hidden.has(project.name)} radius={i === projects.length - 1 ? [3, 3, 0, 0] : undefined} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

// ─── Chart 2: Planned hours per member per month ──────────────────────────────

function MembersChart({ assignments, projects, members }: Props) {
  const months = getAllMonths(projects);
  const { hidden, toggle, isolate, showAll, hideAll } = useToggle(members.map((m) => m.name));

  const data = months.map((month) => {
    const entry: Record<string, string | number> = { month: formatMonth(month) };
    for (const member of members) {
      const hours = assignments.filter((a) => a.memberId === member.id).reduce((s, a) => s + (a.plannedHours[month] ?? 0), 0);
      if (hours > 0) entry[member.name] = hours;
    }
    return entry;
  });

  if (members.length === 0) return <Empty label="No team members yet." />;

  return (
    <ChartShell title="Planned Hours per Member — over Time" subtitle="Total planned hours per team member per month across all projects · Click to toggle · Double-click to isolate">
      <LegendPills items={members.map((m, i) => ({ name: m.name, color: getColor(i) }))} hidden={hidden} onToggle={toggle} onIsolate={isolate} onShowAll={showAll} onHideAll={hideAll} />
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="h" width={42} />
          <Tooltip formatter={(val, name) => [`${val}h`, String(name)]} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
          {members.map((member, i) => (
            <Bar key={member.id} dataKey={member.name} stackId="a" fill={getColor(i)} hide={hidden.has(member.name)} radius={i === members.length - 1 ? [3, 3, 0, 0] : undefined} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

// ─── Chart 3: Utilisation % — planned vs billed ───────────────────────────────

function UtilisationChart({ assignments, projects, members }: Props) {
  const allMonths = getAllMonths(projects);
  const effectiveEnd = getEffectiveEndMonth(assignments);
  const months = allMonths.filter((m) => m <= effectiveEnd);
  const membersWithAvail = members.filter((m) => m.monthlyAvailability > 0);
  const { hidden, toggle, isolate, showAll, hideAll } = useToggle(membersWithAvail.map((m) => m.name));

  const data = months.map((month) => {
    const entry: Record<string, string | number> = { month: formatMonth(month) };
    for (const member of membersWithAvail) {
      const planned = assignments.filter((a) => a.memberId === member.id).reduce((s, a) => s + (a.plannedHours[month] ?? 0), 0);
      const billed = assignments.filter((a) => a.memberId === member.id).reduce((s, a) => s + (a.billedHours[month] ?? 0), 0);
      entry[`${member.name}__planned`] = Math.round((planned / member.monthlyAvailability) * 100);
      entry[`${member.name}__billed`] = Math.round((billed / member.monthlyAvailability) * 100);
    }
    return entry;
  });

  if (membersWithAvail.length === 0)
    return <Empty label="Set monthly availability on team members to see utilisation %." />;

  const items = membersWithAvail.map((m, i) => ({ name: m.name, color: getColor(i) }));
  const visibleMembers = membersWithAvail.filter((m) => !hidden.has(m.name));
  const isolatedMember = visibleMembers.length === 1 ? visibleMembers[0] : null;

  const isolatedAssignments = isolatedMember ? assignments.filter((a) => a.memberId === isolatedMember.id) : [];
  const isolatedProjects = isolatedAssignments.map((a) => projects.find((p) => p.id === a.projectId)).filter(Boolean) as Project[];

  const composedData = isolatedMember
    ? months.map((month) => {
        const entry: Record<string, string | number> = { month: formatMonth(month) };
        let totalPlanned = 0;
        let totalBilled = 0;
        for (const a of isolatedAssignments) {
          const proj = projects.find((p) => p.id === a.projectId);
          if (!proj) continue;
          if (getMonthsBetween(proj.startMonth, proj.endMonth).includes(month)) {
            entry[`${proj.name}__planned`] = a.plannedHours[month] ?? 0;
            totalPlanned += a.plannedHours[month] ?? 0;
            totalBilled += a.billedHours[month] ?? 0;
          }
        }
        entry['__plannedPct__'] = Math.round((totalPlanned / isolatedMember.monthlyAvailability) * 100);
        entry['__billedPct__'] = Math.round((totalBilled / isolatedMember.monthlyAvailability) * 100);
        return entry;
      })
    : [];

  return (
    <ChartShell title="Utilisation Rate — Planned vs Billed" subtitle="Planned (solid) and Billed (dashed) as % of monthly availability · Click to toggle · Double-click to isolate">
      <LegendPills items={items} hidden={hidden} onToggle={toggle} onIsolate={isolate} onShowAll={showAll} onHideAll={hideAll} />

      {isolatedMember ? (
        <>
          <p className="text-xs text-gray-500 mb-3">
            <span className="font-medium">{isolatedMember.name}</span> — bars: planned hours per project (left axis) · solid line: planned % · dashed line: billed % (right axis)
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={composedData} margin={{ top: 4, right: 48, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="hours" tick={{ fontSize: 11 }} unit="h" width={42} />
              <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 11 }} unit="%" width={42} domain={[0, 'dataMax + 20']} />
              <Tooltip
                formatter={(val, name) => {
                  if (name === '__plannedPct__') return [`${val}%`, 'Planned util.'];
                  if (name === '__billedPct__') return [`${val}%`, 'Billed util.'];
                  return [`${val}h`, String(name).replace('__planned', '')];
                }}
                contentStyle={{ fontSize: 12, borderRadius: 6 }}
              />
              <ReferenceLine yAxisId="hours" y={isolatedMember.monthlyAvailability} stroke="#6366f1" strokeDasharray="4 4" strokeWidth={1.5}
                label={{ value: `${isolatedMember.monthlyAvailability}h`, fontSize: 10, fill: '#6366f1', position: 'insideTopLeft' }} />
              <ReferenceLine yAxisId="pct" y={100} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5}
                label={{ value: '100%', fontSize: 10, fill: '#ef4444', position: 'insideTopRight' }} />
              {isolatedProjects.map((proj, i) => (
                <Bar key={proj.id} yAxisId="hours" dataKey={`${proj.name}__planned`} stackId="b" fill={getColor(i)} opacity={0.8}
                  name={proj.name} radius={i === isolatedProjects.length - 1 ? [3, 3, 0, 0] : undefined} />
              ))}
              <Line yAxisId="pct" type="monotone" dataKey="__plannedPct__" name="Planned %" stroke="#1e293b" strokeWidth={2.5} dot={{ r: 3, fill: '#1e293b' }} activeDot={{ r: 5 }} />
              <Line yAxisId="pct" type="monotone" dataKey="__billedPct__" name="Billed %" stroke="#10b981" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: '#10b981' }} activeDot={{ r: 5 }} />
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
              formatter={(val, name) => {
                const n = String(name);
                if (n.endsWith('__billed')) return [`${val}%`, `${n.replace('__billed', '')} (billed)`];
                return [`${val}%`, n.replace('__planned', '')];
              }}
              contentStyle={{ fontSize: 12, borderRadius: 6 }}
            />
            <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: '100%', fontSize: 10, fill: '#ef4444' }} />
            {membersWithAvail.map((member, i) => (
              <Fragment key={member.id}>
                <Line type="monotone" dataKey={`${member.name}__planned`} stroke={getColor(i)} strokeWidth={hidden.has(member.name) ? 0 : 2} dot={hidden.has(member.name) ? false : { r: 3 }} activeDot={hidden.has(member.name) ? false : { r: 5 }} hide={hidden.has(member.name)} name={`${member.name}__planned`} />
                <Line type="monotone" dataKey={`${member.name}__billed`} stroke={getColor(i)} strokeWidth={hidden.has(member.name) ? 0 : 1.5} strokeDasharray="5 3" dot={false} activeDot={hidden.has(member.name) ? false : { r: 4 }} hide={hidden.has(member.name)} name={`${member.name}__billed`} />
              </Fragment>
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );
}

// ─── Chart 4: Plan vs Actual per member ───────────────────────────────────────

function PlanVsActualChart({ assignments, projects, members }: Props) {
  const allMonths = getAllMonths(projects);
  const effectiveEnd = getEffectiveEndMonth(assignments);
  const months = allMonths.filter((m) => m <= effectiveEnd);
  const { hidden, toggle, isolate, showAll, hideAll } = useToggle(members.map((m) => m.name));

  const data = months.map((month) => {
    const entry: Record<string, string | number> = { month: formatMonth(month) };
    for (const member of members) {
      const planned = assignments.filter((a) => a.memberId === member.id).reduce((s, a) => s + (a.plannedHours[month] ?? 0), 0);
      const billed = assignments.filter((a) => a.memberId === member.id).reduce((s, a) => s + (a.billedHours[month] ?? 0), 0);
      if (planned > 0 || billed > 0) {
        entry[`${member.name}__planned`] = planned;
        entry[`${member.name}__billed`] = billed;
      }
    }
    return entry;
  });

  if (members.length === 0) return <Empty label="No team members yet." />;

  const items = members.map((m, i) => ({ name: m.name, color: getColor(i) }));

  return (
    <ChartShell title="Plan vs Actual — Hours per Member" subtitle="Solid bars: planned hours · Outlined bars: billed hours. Gaps reveal over- or under-delivery · Click to toggle · Double-click to isolate">
      <LegendPills items={items} hidden={hidden} onToggle={toggle} onIsolate={isolate} onShowAll={showAll} onHideAll={hideAll} />
      <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-indigo-400 opacity-80" /> Planned</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm border-2 border-indigo-400" /> Billed</span>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="h" width={42} />
          <Tooltip
            formatter={(val, name) => {
              const n = String(name);
              if (n.endsWith('__billed')) return [`${val}h`, `${n.replace('__billed', '')} (billed)`];
              return [`${val}h`, n.replace('__planned', '')];
            }}
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
          />
          {members.map((member, i) => (
            <Fragment key={member.id}>
              <Bar dataKey={`${member.name}__planned`} fill={getColor(i)} opacity={0.7} hide={hidden.has(member.name)} name={`${member.name}__planned`} />
              <Bar dataKey={`${member.name}__billed`} fill="transparent" stroke={getColor(i)} strokeWidth={2} hide={hidden.has(member.name)} name={`${member.name}__billed`} />
            </Fragment>
          ))}
        </BarChart>
      </ResponsiveContainer>
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
      <PlanVsActualChart {...props} />
    </div>
  );
}
