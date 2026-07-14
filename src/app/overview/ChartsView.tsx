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

function ChartShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
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

// ─── Chart 3: Billing Utilisation — billed hours vs capacity ──────────────────

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
      const billed  = assignments.filter((a) => a.memberId === member.id).reduce((s, a) => s + (a.billedHours[month]  ?? 0), 0);
      entry[`${member.name}__billed`]  = Math.round((billed  / member.monthlyAvailability) * 100);
      entry[`${member.name}__planned`] = Math.round((planned / member.monthlyAvailability) * 100);
    }
    return entry;
  });

  if (membersWithAvail.length === 0)
    return <Empty label="Set monthly availability on team members to see billing utilisation." />;

  const items = membersWithAvail.map((m, i) => ({ name: m.name, color: getColor(i) }));
  const visibleMembers = membersWithAvail.filter((m) => !hidden.has(m.name));
  const isolatedMember = visibleMembers.length === 1 ? visibleMembers[0] : null;

  const isolatedAssignments = isolatedMember ? assignments.filter((a) => a.memberId === isolatedMember.id) : [];
  const isolatedProjects    = isolatedAssignments.map((a) => projects.find((p) => p.id === a.projectId)).filter(Boolean) as Project[];

  const composedData = isolatedMember
    ? months.map((month) => {
        const entry: Record<string, string | number> = { month: formatMonth(month) };
        let totalPlanned = 0;
        let totalBilled  = 0;
        for (const a of isolatedAssignments) {
          const proj = projects.find((p) => p.id === a.projectId);
          if (!proj) continue;
          if (getMonthsBetween(proj.startMonth, proj.endMonth).includes(month)) {
            entry[`${proj.name}__planned`] = a.plannedHours[month] ?? 0;
            totalPlanned += a.plannedHours[month] ?? 0;
            totalBilled  += a.billedHours[month]  ?? 0;
          }
        }
        entry['__billedPct__']  = Math.round((totalBilled  / isolatedMember.monthlyAvailability) * 100);
        entry['__plannedPct__'] = Math.round((totalPlanned / isolatedMember.monthlyAvailability) * 100);
        return entry;
      })
    : [];

  return (
    <ChartShell
      title="Billing Utilisation"
      subtitle="Billed hours as % of monthly capacity (solid) · Planned % shown as dashed reference · 100% = fully utilised · Double-click a member to drill down"
    >
      <LegendPills items={items} hidden={hidden} onToggle={toggle} onIsolate={isolate} onShowAll={showAll} onHideAll={hideAll} />

      {isolatedMember ? (
        <>
          <p className="text-xs text-gray-500 mb-3">
            <span className="font-medium">{isolatedMember.name}</span>
            {' '}— bars: planned hours per project · <span className="font-medium text-emerald-600">solid green line</span>: billed % of capacity · <span className="text-gray-400">dashed: planned %</span> (right axis)
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={composedData} margin={{ top: 4, right: 48, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="hours" tick={{ fontSize: 11 }} unit="h" width={42} />
              <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 11 }} unit="%" width={42} domain={[0, 'dataMax + 20']} />
              <Tooltip
                formatter={(val, name) => {
                  if (name === '__billedPct__')  return [`${val}%`, 'Billed util.'];
                  if (name === '__plannedPct__') return [`${val}%`, 'Planned util.'];
                  return [`${val}h`, String(name).replace('__planned', '')];
                }}
                contentStyle={{ fontSize: 12, borderRadius: 6 }}
              />
              <ReferenceLine yAxisId="hours" y={isolatedMember.monthlyAvailability} stroke="#6366f1" strokeDasharray="4 4" strokeWidth={1.5}
                label={{ value: `${isolatedMember.monthlyAvailability}h cap`, fontSize: 10, fill: '#6366f1', position: 'insideTopLeft' }} />
              <ReferenceLine yAxisId="pct" y={100} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5}
                label={{ value: '100%', fontSize: 10, fill: '#ef4444', position: 'insideTopRight' }} />
              {isolatedProjects.map((proj, i) => (
                <Bar key={proj.id} yAxisId="hours" dataKey={`${proj.name}__planned`} stackId="b" fill={getColor(i)} opacity={0.5}
                  name={proj.name} radius={i === isolatedProjects.length - 1 ? [3, 3, 0, 0] : undefined} />
              ))}
              {/* Billed % — primary, thick, solid green */}
              <Line yAxisId="pct" type="monotone" dataKey="__billedPct__"  name="Billed %"  stroke="#10b981" strokeWidth={3}   dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 6 }} />
              {/* Planned % — secondary, thin, dashed */}
              <Line yAxisId="pct" type="monotone" dataKey="__plannedPct__" name="Planned %" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 3" dot={false} activeDot={{ r: 4 }} />
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
                if (n.endsWith('__billed'))  return [`${val}%`, `${n.replace('__billed', '')} — billed`];
                if (n.endsWith('__planned')) return [`${val}%`, `${n.replace('__planned', '')} — planned`];
                return [`${val}%`, n];
              }}
              contentStyle={{ fontSize: 12, borderRadius: 6 }}
            />
            <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5}
              label={{ value: '100%', fontSize: 10, fill: '#ef4444' }} />
            {membersWithAvail.map((member, i) => (
              <Fragment key={member.id}>
                {/* Billed % — primary: thick, solid */}
                <Line type="monotone" dataKey={`${member.name}__billed`}
                  stroke={getColor(i)} strokeWidth={hidden.has(member.name) ? 0 : 2.5}
                  dot={hidden.has(member.name) ? false : { r: 3 }}
                  activeDot={hidden.has(member.name) ? false : { r: 5 }}
                  hide={hidden.has(member.name)}
                  name={`${member.name}__billed`} />
                {/* Planned % — secondary: thin, dashed */}
                <Line type="monotone" dataKey={`${member.name}__planned`}
                  stroke={getColor(i)} strokeWidth={hidden.has(member.name) ? 0 : 1}
                  strokeDasharray="4 3" dot={false}
                  activeDot={hidden.has(member.name) ? false : { r: 3 }}
                  hide={hidden.has(member.name)}
                  name={`${member.name}__planned`} />
              </Fragment>
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );
}

// ─── Chart 4: Billed vs Planned — absolute hours per member ──────────────────

function PlanVsActualChart({ assignments, projects, members }: Props) {
  const allMonths = getAllMonths(projects);
  const effectiveEnd = getEffectiveEndMonth(assignments);
  const months = allMonths.filter((m) => m <= effectiveEnd);
  const { hidden, toggle, isolate, showAll, hideAll } = useToggle(members.map((m) => m.name));

  const data = months.map((month) => {
    const entry: Record<string, string | number> = { month: formatMonth(month) };
    for (const member of members) {
      const planned = assignments.filter((a) => a.memberId === member.id).reduce((s, a) => s + (a.plannedHours[month] ?? 0), 0);
      const billed  = assignments.filter((a) => a.memberId === member.id).reduce((s, a) => s + (a.billedHours[month]  ?? 0), 0);
      if (planned > 0 || billed > 0) {
        entry[`${member.name}__planned`] = planned;
        entry[`${member.name}__billed`]  = billed;
      }
    }
    return entry;
  });

  if (members.length === 0) return <Empty label="No team members yet." />;

  const items = members.map((m, i) => ({ name: m.name, color: getColor(i) }));

  return (
    <ChartShell
      title="Billed vs Planned — Hours per Member"
      subtitle="Billed hours (solid, full opacity) vs planned hours (same colour, low opacity) per member per month · Click to toggle · Double-click to isolate"
    >
      <LegendPills items={items} hidden={hidden} onToggle={toggle} onIsolate={isolate} onShowAll={showAll} onHideAll={hideAll} />
      <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-indigo-500" /> Billed</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-indigo-200" /> Planned</span>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="h" width={42} />
          <Tooltip
            formatter={(val, name) => {
              const n = String(name);
              if (n.endsWith('__billed'))  return [`${val}h`, `${n.replace('__billed', '')} — billed`];
              if (n.endsWith('__planned')) return [`${val}h`, `${n.replace('__planned', '')} — planned`];
              return [`${val}h`, n];
            }}
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
          />
          {members.map((member, i) => (
            <Fragment key={member.id}>
              {/* Planned — low opacity, rendered first (behind) */}
              <Bar dataKey={`${member.name}__planned`} fill={getColor(i)} opacity={0.25} hide={hidden.has(member.name)} name={`${member.name}__planned`} />
              {/* Billed — full opacity, rendered on top */}
              <Bar dataKey={`${member.name}__billed`}  fill={getColor(i)} opacity={1}    hide={hidden.has(member.name)} name={`${member.name}__billed`} radius={[2, 2, 0, 0]} />
            </Fragment>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

// ─── Chart 5: Billed vs Planned — per project ────────────────────────────────

function ProjectBilledVsPlannedChart({ assignments, projects }: Omit<Props, 'members'>) {
  const allMonths = getAllMonths(projects);
  const effectiveEnd = getEffectiveEndMonth(assignments);
  const months = allMonths.filter((m) => m <= effectiveEnd);
  const { hidden, toggle, isolate, showAll, hideAll } = useToggle(projects.map((p) => p.name));

  const data = months.map((month) => {
    const entry: Record<string, string | number> = { month: formatMonth(month) };
    for (const project of projects) {
      const pMonths = getMonthsBetween(project.startMonth, project.endMonth);
      if (!pMonths.includes(month)) continue;
      const projectAssignments = assignments.filter((a) => a.projectId === project.id);
      const planned = projectAssignments.reduce((s, a) => s + (a.plannedHours[month] ?? 0), 0);
      const billed  = projectAssignments.reduce((s, a) => s + (a.billedHours[month]  ?? 0), 0);
      if (planned > 0 || billed > 0) {
        entry[`${project.name}__planned`] = planned;
        entry[`${project.name}__billed`]  = billed;
      }
    }
    return entry;
  });

  if (projects.length === 0) return <Empty label="No projects yet." />;

  const items = projects.map((p, i) => ({ name: p.name, color: getColor(i) }));

  return (
    <ChartShell
      title="Billed vs Planned — Hours per Project"
      subtitle="Billed hours (solid) vs planned hours (faded) · Click to toggle · Double-click to isolate"
    >
      <LegendPills items={items} hidden={hidden} onToggle={toggle} onIsolate={isolate} onShowAll={showAll} onHideAll={hideAll} />
      <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-indigo-500" /> Billed</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-indigo-200" /> Planned</span>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="h" width={42} />
          <Tooltip
            formatter={(val, name) => {
              const n = String(name);
              if (n.endsWith('__billed'))  return [`${val}h`, `${n.replace('__billed',  '')} — billed`];
              if (n.endsWith('__planned')) return [`${val}h`, `${n.replace('__planned', '')} — planned`];
              return [`${val}h`, n];
            }}
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
          />
          {projects.map((project, i) => (
            <Fragment key={project.id}>
              <Bar dataKey={`${project.name}__planned`} fill={getColor(i)} opacity={0.25} hide={hidden.has(project.name)} name={`${project.name}__planned`} />
              <Bar dataKey={`${project.name}__billed`}  fill={getColor(i)} opacity={1}    hide={hidden.has(project.name)} name={`${project.name}__billed`} radius={[2, 2, 0, 0]} />
            </Fragment>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

// ─── Chart 5b: Budget Burn — cumulative billed vs budget ceiling ──────────────

function BudgetBurnChart({ assignments, projects }: Omit<Props, 'members'>) {
  const { hidden, toggle, isolate, showAll, hideAll } = useToggle(projects.map((p) => p.name));

  if (projects.length === 0) return <Empty label="No projects yet." />;

  const data: Record<string, string | number>[] = [];
  for (const project of projects) {
    if (hidden.has(project.name)) continue;
    const months = getMonthsBetween(project.startMonth, project.endMonth);
    const pas    = assignments.filter((a) => a.projectId === project.id);
    let cumBilled = 0;
    for (const month of months) {
      cumBilled += pas.reduce((s, a) => s + (a.billedHours[month] ?? 0), 0);
      const existing = data.find((d) => d.month === formatMonth(month));
      if (existing) {
        existing[project.name] = cumBilled;
      } else {
        data.push({ month: formatMonth(month), [project.name]: cumBilled });
      }
    }
  }
  data.sort((a, b) => String(a.month).localeCompare(String(b.month)));

  const items = projects.map((p, i) => ({ name: p.name, color: getColor(i) }));

  return (
    <ChartShell
      title="Budget Burn — Cumulative Billed Hours"
      subtitle="Running total of billed hours per project over time · Click to toggle · Double-click to isolate"
    >
      <LegendPills items={items} hidden={hidden} onToggle={toggle} onIsolate={isolate} onShowAll={showAll} onHideAll={hideAll} />
      {/* Budget ceiling reference lines */}
      <div className="flex flex-wrap gap-2 mb-3 text-xs text-gray-400">
        {projects.filter((p) => !hidden.has(p.name) && p.orderAmountHours > 0).map((p) => (
          <span key={p.id} className="flex items-center gap-1">
            <span className="w-4 border-t-2 border-dashed inline-block" style={{ borderColor: getColor(projects.indexOf(p)) }} />
            {p.name} budget: {p.orderAmountHours}h
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="h" width={42} />
          <Tooltip formatter={(val, name) => [`${val}h cumulative billed`, String(name)]} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
          {projects.filter((p) => !hidden.has(p.name)).map((p, i) => (
            <Fragment key={p.id}>
              <Line
                type="monotone"
                dataKey={p.name}
                stroke={getColor(projects.indexOf(p))}
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
              {p.orderAmountHours > 0 && (
                <ReferenceLine
                  y={p.orderAmountHours}
                  stroke={getColor(projects.indexOf(p))}
                  strokeDasharray="5 3"
                  strokeWidth={1.5}
                  opacity={0.5}
                />
              )}
            </Fragment>
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

// ─── Chart 6: Project billing rate — billed as % of planned ──────────────────

function ProjectBillingRateChart({ assignments, projects }: Omit<Props, 'members'>) {
  const allMonths = getAllMonths(projects);
  const effectiveEnd = getEffectiveEndMonth(assignments);
  const months = allMonths.filter((m) => m <= effectiveEnd);
  const { hidden, toggle, isolate, showAll, hideAll } = useToggle(projects.map((p) => p.name));

  const data = months.map((month) => {
    const entry: Record<string, string | number> = { month: formatMonth(month) };
    for (const project of projects) {
      const pMonths = getMonthsBetween(project.startMonth, project.endMonth);
      if (!pMonths.includes(month)) continue;
      const projectAssignments = assignments.filter((a) => a.projectId === project.id);
      const planned = projectAssignments.reduce((s, a) => s + (a.plannedHours[month] ?? 0), 0);
      const billed  = projectAssignments.reduce((s, a) => s + (a.billedHours[month]  ?? 0), 0);
      if (planned > 0) entry[project.name] = Math.round((billed / planned) * 100);
    }
    return entry;
  });

  if (projects.length === 0) return <Empty label="No projects yet." />;

  const items = projects.map((p, i) => ({ name: p.name, color: getColor(i) }));

  return (
    <ChartShell
      title="Project Billing Rate"
      subtitle="Billed hours as % of planned hours per project per month · 100% = all planned hours billed · Click to toggle · Double-click to isolate"
    >
      <LegendPills items={items} hidden={hidden} onToggle={toggle} onIsolate={isolate} onShowAll={showAll} onHideAll={hideAll} />
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="%" width={42} domain={[0, 'dataMax + 20']} />
          <Tooltip formatter={(val, name) => [`${val}%`, String(name)]} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
          <ReferenceLine y={100} stroke="#10b981" strokeDasharray="4 4" strokeWidth={1.5}
            label={{ value: '100% target', fontSize: 10, fill: '#059669', position: 'insideTopRight' }} />
          {projects.map((project, i) => (
            <Line
              key={project.id}
              type="monotone"
              dataKey={project.name}
              stroke={getColor(i)}
              strokeWidth={hidden.has(project.name) ? 0 : 2.5}
              dot={hidden.has(project.name) ? false : { r: 3 }}
              activeDot={hidden.has(project.name) ? false : { r: 5 }}
              hide={hidden.has(project.name)}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

// ─── Chart 7: Planned utilisation — % of availability, all months ────────────

function MemberPlannedUtilisationChart({ assignments, projects, members }: Props) {
  const allMonths = getAllMonths(projects);
  const now = new Date().toISOString().slice(0, 7);
  const membersWithAvail = members.filter((m) => m.monthlyAvailability > 0);
  const { hidden, toggle, isolate, showAll, hideAll } = useToggle(membersWithAvail.map((m) => m.name));

  if (membersWithAvail.length === 0)
    return <Empty label="Set monthly availability on team members to see planned utilisation." />;

  const data = allMonths.map((month) => {
    const entry: Record<string, string | number> = { month: formatMonth(month) };
    for (const member of membersWithAvail) {
      const planned = assignments
        .filter((a) => a.memberId === member.id)
        .reduce((s, a) => s + (a.plannedHours[month] ?? 0), 0);
      entry[member.name] = Math.round((planned / member.monthlyAvailability) * 100);
    }
    return entry;
  });

  const items = membersWithAvail.map((m, i) => ({ name: m.name, color: getColor(i) }));

  return (
    <ChartShell
      title="Planned Utilisation — Past & Future"
      subtitle="Planned hours as % of monthly availability · Vertical line = today · 100% = fully committed · Click to toggle · Double-click to isolate"
    >
      <LegendPills items={items} hidden={hidden} onToggle={toggle} onIsolate={isolate} onShowAll={showAll} onHideAll={hideAll} />
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="%" width={42} domain={[0, 'dataMax + 20']} />
          <Tooltip formatter={(val, name) => [`${val}%`, String(name)]} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
          <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5}
            label={{ value: '100% cap', fontSize: 10, fill: '#ef4444', position: 'insideTopRight' }} />
          <ReferenceLine x={formatMonth(now)} stroke="#6366f1" strokeDasharray="3 2" strokeWidth={1.5}
            label={{ value: 'Today', fontSize: 9, fill: '#6366f1', position: 'insideTopLeft' }} />
          {membersWithAvail.map((member, i) => (
            <Line
              key={member.id}
              type="monotone"
              dataKey={member.name}
              stroke={getColor(i)}
              strokeWidth={hidden.has(member.name) ? 0 : 2.5}
              dot={hidden.has(member.name) ? false : { r: 3 }}
              activeDot={hidden.has(member.name) ? false : { r: 5 }}
              hide={hidden.has(member.name)}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

// ─── Chart 8: Per-member planned load stacked by project ─────────────────────

function MemberLoadByProjectChart({ member, assignments, projects }: {
  member: TeamMember;
  assignments: Assignment[];
  projects: Project[];
}) {
  const memberAssignments = assignments.filter((a) => a.memberId === member.id);
  const memberProjects    = memberAssignments
    .map((a) => projects.find((p) => p.id === a.projectId))
    .filter(Boolean) as Project[];

  const allMonthsSet = new Set<string>();
  for (const p of memberProjects)
    for (const m of getMonthsBetween(p.startMonth, p.endMonth)) allMonthsSet.add(m);
  const allMonths = Array.from(allMonthsSet).sort();

  if (allMonths.length === 0) return null;

  const now = new Date().toISOString().slice(0, 7);

  const data = allMonths.map((month) => {
    const entry: Record<string, string | number> = { month: formatMonth(month) };
    for (const a of memberAssignments) {
      const p = projects.find((proj) => proj.id === a.projectId);
      if (!p || !getMonthsBetween(p.startMonth, p.endMonth).includes(month)) continue;
      const h = a.plannedHours[month] ?? 0;
      if (h > 0) entry[p.id] = h;
    }
    return entry;
  });

  const totalPlanned = memberAssignments.reduce(
    (s, a) => s + Object.values(a.plannedHours).reduce((x, v) => x + v, 0), 0
  );
  const overMonths = member.monthlyAvailability > 0
    ? allMonths.filter((m) =>
        memberAssignments.reduce((s, a) => s + (a.plannedHours[m] ?? 0), 0) > member.monthlyAvailability
      ).length
    : 0;

  return (
    <ChartShell title={member.name}>
      <div className="flex flex-wrap items-center gap-3 text-xs mb-3">
        <span className="font-semibold text-indigo-600">{totalPlanned}h planned total</span>
        {member.monthlyAvailability > 0 && (
          <span className="text-gray-400">{member.monthlyAvailability}h/month cap</span>
        )}
        {overMonths > 0 ? (
          <span className="text-red-600 font-medium">⚠ {overMonths} month{overMonths !== 1 ? 's' : ''} over capacity</span>
        ) : totalPlanned > 0 ? (
          <span className="text-emerald-600 font-medium">✓ Within capacity</span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {memberProjects.map((p) => (
          <span key={p.id} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: getColor(projects.indexOf(p)) }} />
            {p.name}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} unit="h" width={36} />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 6 }}
            formatter={(val, name) => [`${val}h`, projects.find((p) => p.id === name)?.name ?? String(name)]}
          />
          {memberProjects.map((p, i) => (
            <Bar
              key={p.id}
              dataKey={p.id}
              stackId="load"
              fill={getColor(projects.indexOf(p))}
              opacity={0.85}
              radius={i === memberProjects.length - 1 ? [3, 3, 0, 0] : undefined}
            />
          ))}
          {member.monthlyAvailability > 0 && (
            <ReferenceLine
              y={member.monthlyAvailability}
              stroke="#ef4444"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{ value: `${member.monthlyAvailability}h cap`, fontSize: 9, fill: '#ef4444', position: 'insideTopLeft' }}
            />
          )}
          <ReferenceLine x={formatMonth(now)} stroke="#6366f1" strokeDasharray="3 2" strokeWidth={1.5} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function ChartsView(props: Props) {
  const [tab, setTab] = useState<'members' | 'projects'>('members');

  return (
    <div>
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {(['members', 'projects'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'members' ? 'Members' : 'Projects'}
          </button>
        ))}
      </div>

      {tab === 'members' && (
        <div className="space-y-6">
          <MemberPlannedUtilisationChart {...props} />
          <UtilisationChart {...props} />
          <PlanVsActualChart {...props} />

          {(() => {
            const assignedMembers = props.members.filter((m) =>
              props.assignments.some((a) => a.memberId === m.id)
            );
            if (assignedMembers.length === 0) return null;
            return (
              <>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Planned Load per Member — by Project
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {assignedMembers.map((m) => (
                    <MemberLoadByProjectChart
                      key={m.id}
                      member={m}
                      assignments={props.assignments}
                      projects={props.projects}
                    />
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {tab === 'projects' && (
        <div className="space-y-6">
          <BudgetBurnChart assignments={props.assignments} projects={props.projects} />
          <ProjectBillingRateChart assignments={props.assignments} projects={props.projects} />
          <ProjectBilledVsPlannedChart assignments={props.assignments} projects={props.projects} />
          <ProjectsChart assignments={props.assignments} projects={props.projects} />
        </div>
      )}
    </div>
  );
}
