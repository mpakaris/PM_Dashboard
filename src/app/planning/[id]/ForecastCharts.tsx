'use client';

import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ComposedChart, Line, LineChart,
} from 'recharts';
import { Forecast, ForecastProject, TeamMember } from '@/lib/types';
import { getMonthsBetween, formatMonth } from '@/lib/utils';

const FTE_HOURS_PER_YEAR = 1680;
const FTE_HOURS_PER_MONTH = FTE_HOURS_PER_YEAR / 12; // 140

function hoursToFte(hours: number, numMonths: number): number {
  if (numMonths === 0) return 0;
  return hours / (FTE_HOURS_PER_MONTH * numMonths);
}

function formatFte(fte: number): string {
  const r = Math.round(fte * 100) / 100;
  return `${r % 1 === 0 ? r : r.toFixed(2)} FTE`;
}

const PROJECT_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#84cc16',
];
const getColor = (i: number) => PROJECT_COLORS[i % PROJECT_COLORS.length];

// ─── Shared UI ────────────────────────────────────────────────────────────────

function ChartShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">{title}</h3>
      {children}
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

function LegendPills({
  items,
  hidden,
  onToggle,
  onIsolate,
  onShowAll,
  onHideAll,
}: {
  items: { id: string; label: string; color: string }[];
  hidden: Set<string>;
  onToggle: (id: string) => void;
  onIsolate: (id: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {items.map(({ id, label, color }) => {
        const isHidden = hidden.has(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onToggle(id)}
            onDoubleClick={(e) => { e.preventDefault(); onIsolate(id); }}
            title="Click to toggle · Double-click to isolate"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer select-none ${
              isHidden ? 'bg-white text-gray-400 border-gray-200 opacity-50' : 'text-white border-transparent'
            }`}
            style={isHidden ? {} : { backgroundColor: color }}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isHidden ? '#d1d5db' : color }} />
            {label}
          </button>
        );
      })}
      <div className="flex gap-2 ml-auto text-xs">
        <button type="button" onClick={onShowAll} className="px-2.5 py-1 rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors">
          Show all
        </button>
        <button type="button" onClick={onHideAll} className="px-2.5 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
          Hide all
        </button>
      </div>
    </div>
  );
}

// ─── Ghost need badge ─────────────────────────────────────────────────────────

function GhostNeedBadge({ gapHours, numMonths }: { gapHours: number; numMonths: number }) {
  if (gapHours <= 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        ✓ Fully covered
      </span>
    );
  }
  const fte = hoursToFte(gapHours, numMonths);
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
      👻 Needs {formatFte(fte)} ({gapHours}h)
    </span>
  );
}

// ─── Per-project chart: real + ghost stacked vs budget ────────────────────────

function ProjectCapacityChart({ project, forecast }: { project: ForecastProject; forecast: Forecast }) {
  const months = getMonthsBetween(project.startMonth, project.endMonth);
  const numMonths = months.length || 1;
  const budgetPerMonth = Math.round(project.overallHours / numMonths);

  const projectAssignments = forecast.assignments.filter((a) => a.projectId === project.id);

  const data = months.map((month) => {
    const real = projectAssignments.filter((a) => !a.isGhost).reduce((s, a) => s + (a.plannedHours[month] ?? 0), 0);
    const ghost = projectAssignments.filter((a) => a.isGhost).reduce((s, a) => s + (a.plannedHours[month] ?? 0), 0);
    return { month: formatMonth(month), real, ghost };
  });

  const realTotal = projectAssignments.filter((a) => !a.isGhost).reduce(
    (s, a) => s + Object.values(a.plannedHours).reduce((x, v) => x + v, 0), 0
  );
  const ghostTotal = projectAssignments.filter((a) => a.isGhost).reduce(
    (s, a) => s + Object.values(a.plannedHours).reduce((x, v) => x + v, 0), 0
  );
  const totalAllocated = realTotal + ghostTotal;
  const gap = Math.max(0, project.overallHours - totalAllocated);

  return (
    <ChartShell title={project.name}>
      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
        <span className="flex items-center gap-1.5 text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block shrink-0" />
          Real: <strong className="text-gray-700">{formatFte(hoursToFte(realTotal, numMonths))} ({realTotal}h)</strong>
        </span>
        <span className="flex items-center gap-1.5 text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-violet-400 inline-block shrink-0" />
          Ghost: <strong className="text-gray-700">{formatFte(hoursToFte(ghostTotal, numMonths))} ({ghostTotal}h)</strong>
        </span>
        <GhostNeedBadge gapHours={gap} numMonths={numMonths} />
        <span className="ml-auto text-gray-400">Budget: {project.overallHours}h ({formatFte(hoursToFte(project.overallHours, numMonths))})</span>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="h" width={42} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
            formatter={(val, name) => [`${val}h`, name === 'real' ? 'Real team' : 'Ghost / Hire']}
          />
          <Bar dataKey="real" name="real" stackId="a" fill="#6366f1" opacity={0.85} />
          <Bar dataKey="ghost" name="ghost" stackId="a" fill="#8b5cf6" opacity={0.75} radius={[3, 3, 0, 0]} />
          <ReferenceLine
            y={budgetPerMonth}
            stroke="#f59e0b"
            strokeDasharray="5 3"
            strokeWidth={2}
            label={{ value: `${budgetPerMonth}h target`, fontSize: 10, fill: '#b45309', position: 'insideTopLeft' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

// ─── Total chart: all projects stacked + capacity line ────────────────────────

function TotalCapacityChart({
  forecast,
  teamMembers,
  hiddenProjects,
  projectColors,
}: {
  forecast: Forecast;
  teamMembers: TeamMember[];
  hiddenProjects: Set<string>;
  projectColors: Map<string, string>;
}) {
  const visibleProjects = forecast.projects.filter((p) => !hiddenProjects.has(p.id));

  const allMonthsSet = new Set<string>();
  for (const p of visibleProjects)
    for (const m of getMonthsBetween(p.startMonth, p.endMonth)) allMonthsSet.add(m);
  const allMonths = Array.from(allMonthsSet).sort();

  const realMemberIds = new Set(
    forecast.assignments.filter((a) => !a.isGhost).map((a) => a.memberId)
  );
  const ghostMemberIds = new Set(
    forecast.assignments.filter((a) => a.isGhost).map((a) => a.memberId)
  );
  const totalCapacity =
    Array.from(realMemberIds).reduce((s, id) => s + (teamMembers.find((m) => m.id === id)?.monthlyAvailability ?? 0), 0) +
    Array.from(ghostMemberIds).reduce((s, id) => s + (forecast.ghostMembers.find((g) => g.id === id)?.monthlyAvailability ?? 0), 0);

  const data = allMonths.map((month) => {
    const entry: Record<string, string | number> = { month: formatMonth(month) };
    for (const project of visibleProjects) {
      const projectMonths = getMonthsBetween(project.startMonth, project.endMonth);
      if (!projectMonths.includes(month)) continue;
      const allocated = forecast.assignments
        .filter((a) => a.projectId === project.id)
        .reduce((s, a) => s + (a.plannedHours[month] ?? 0), 0);
      if (allocated > 0) entry[project.id] = allocated;
    }
    return entry;
  });

  const totalBudget = visibleProjects.reduce((s, p) => s + p.overallHours, 0);
  const totalAllocated = forecast.assignments
    .filter((a) => visibleProjects.some((p) => p.id === a.projectId))
    .reduce((s, a) => s + Object.values(a.plannedHours).reduce((x, v) => x + v, 0), 0);
  const totalGhostAllocated = forecast.assignments
    .filter((a) => a.isGhost && visibleProjects.some((p) => p.id === a.projectId))
    .reduce((s, a) => s + Object.values(a.plannedHours).reduce((x, v) => x + v, 0), 0);
  const totalRealAllocated = totalAllocated - totalGhostAllocated;
  const avgMonths = visibleProjects.length > 0
    ? visibleProjects.reduce((s, p) => s + getMonthsBetween(p.startMonth, p.endMonth).length, 0) / visibleProjects.length
    : 1;
  const totalGap = Math.max(0, totalBudget - totalAllocated);

  if (visibleProjects.length === 0) {
    return (
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-8 text-center text-gray-400 text-sm">
        All projects are hidden — toggle some on above.
      </div>
    );
  }

  return (
    <ChartShell title="Total — All Projects">
      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
        <span className="flex items-center gap-1.5 text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block shrink-0" />
          Real: <strong className="text-gray-700">{formatFte(hoursToFte(totalRealAllocated, avgMonths))} ({totalRealAllocated}h)</strong>
        </span>
        <span className="flex items-center gap-1.5 text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-violet-400 inline-block shrink-0" />
          Ghost: <strong className="text-gray-700">{formatFte(hoursToFte(totalGhostAllocated, avgMonths))} ({totalGhostAllocated}h)</strong>
        </span>
        <GhostNeedBadge gapHours={totalGap} numMonths={avgMonths} />
        <span className="ml-auto text-gray-400">
          Budget: {totalBudget}h ({formatFte(hoursToFte(totalBudget, avgMonths))}) · 1 FTE = {FTE_HOURS_PER_YEAR}h/yr
        </span>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="h" width={42} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
            formatter={(val, name) => [`${val}h`, forecast.projects.find((p) => p.id === name)?.name ?? String(name)]}
          />
          {visibleProjects.map((p, i) => (
            <Bar
              key={p.id}
              dataKey={p.id}
              stackId="projects"
              fill={projectColors.get(p.id) ?? getColor(i)}
              opacity={0.85}
              radius={i === visibleProjects.length - 1 ? [3, 3, 0, 0] : undefined}
            />
          ))}
          {totalCapacity > 0 && (
            <ReferenceLine
              y={totalCapacity}
              stroke="#10b981"
              strokeDasharray="5 3"
              strokeWidth={2}
              label={{ value: `${totalCapacity}h cap`, fontSize: 10, fill: '#059669', position: 'insideTopRight' }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

// ─── Forecast Capacity Gap — monthly planned vs member capacity ───────────────

function ForecastCapacityGapChart({
  forecast,
  teamMembers,
}: {
  forecast: Forecast;
  teamMembers: TeamMember[];
}) {
  // All unique months across all projects
  const allMonthsSet = new Set<string>();
  for (const p of forecast.projects)
    for (const m of getMonthsBetween(p.startMonth, p.endMonth)) allMonthsSet.add(m);
  const allMonths = Array.from(allMonthsSet).sort();

  if (allMonths.length === 0) return null;

  // Total capacity = sum of monthly availability of every unique member (real + ghost) assigned
  const realIds  = new Set(forecast.assignments.filter((a) => !a.isGhost).map((a) => a.memberId));
  const ghostIds = new Set(forecast.assignments.filter((a) =>  a.isGhost).map((a) => a.memberId));
  const totalCap =
    Array.from(realIds).reduce((s, id)  => s + (teamMembers.find((m) => m.id === id)?.monthlyAvailability ?? 0), 0) +
    Array.from(ghostIds).reduce((s, id) => s + (forecast.ghostMembers.find((g) => g.id === id)?.monthlyAvailability ?? 0), 0);

  if (totalCap === 0) return null;

  const data = allMonths.map((month) => {
    const planned = forecast.assignments.reduce((s, a) => s + (a.plannedHours[month] ?? 0), 0);
    const gap     = totalCap - planned;
    const over    = planned > totalCap;
    return { month: formatMonth(month), planned, free: over ? 0 : gap, over: over ? planned - totalCap : 0 };
  });

  const overMonths = data.filter((d) => d.over > 0).length;

  return (
    <ChartShell title="Forecast Capacity Gap">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-400">Planned hours vs total assigned member capacity ({totalCap}h/month)</p>
        {overMonths > 0 ? (
          <span className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
            ⚠ {overMonths} month{overMonths !== 1 ? 's' : ''} over capacity
          </span>
        ) : (
          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            ✓ Within capacity
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-400 inline-block" /> Planned</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-400 inline-block" /> Over capacity</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-200 inline-block" /> Free capacity</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="h" width={42} />
          <Tooltip
            formatter={(val, name) => {
              if (name === 'planned') return [`${val}h`, 'Planned'];
              if (name === 'over')    return [`${val}h`, 'Over capacity'];
              if (name === 'free')    return [`${val}h`, 'Free capacity'];
              return [`${val}h`, String(name)];
            }}
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
          />
          <Bar dataKey="planned" stackId="a" fill="#818cf8" opacity={0.85} name="planned" />
          <Bar dataKey="over"    stackId="a" fill="#f87171" opacity={0.9}  name="over" radius={[3, 3, 0, 0]} />
          <Bar dataKey="free"    stackId="b" fill="#f3f4f6" opacity={1}    name="free" radius={[3, 3, 0, 0]} />
          <ReferenceLine y={totalCap} stroke="#10b981" strokeDasharray="5 3" strokeWidth={2}
            label={{ value: `${totalCap}h cap`, fontSize: 10, fill: '#059669', position: 'insideTopRight' }} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

// ─── Member: utilisation lines (planned % of availability) ───────────────────

const MEMBER_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#ec4899','#14b8a6','#f97316','#8b5cf6','#84cc16'];
const getMemberColor = (i: number) => MEMBER_COLORS[i % MEMBER_COLORS.length];

function ForecastMemberUtilisationChart({
  forecast, teamMembers,
}: { forecast: Forecast; teamMembers: TeamMember[] }) {
  const allMonthsSet = new Set<string>();
  for (const p of forecast.projects)
    for (const m of getMonthsBetween(p.startMonth, p.endMonth)) allMonthsSet.add(m);
  const allMonths = Array.from(allMonthsSet).sort();

  type MemberEntry = { id: string; name: string; availability: number; isGhost: boolean };
  const members: MemberEntry[] = [
    ...teamMembers
      .filter((m) => forecast.assignments.some((a) => !a.isGhost && a.memberId === m.id) && m.monthlyAvailability > 0)
      .map((m) => ({ id: m.id, name: m.name, availability: m.monthlyAvailability, isGhost: false })),
    ...forecast.ghostMembers
      .filter((g) => forecast.assignments.some((a) => a.isGhost && a.memberId === g.id) && g.monthlyAvailability > 0)
      .map((g) => ({ id: g.id, name: g.name, availability: g.monthlyAvailability, isGhost: true })),
  ];

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const allIds = members.map((m) => m.id);
  const toggleM  = (id: string) => setHidden((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const isolateM = (id: string) => setHidden(new Set(allIds.filter((i) => i !== id)));
  const showAllM = () => setHidden(new Set());
  const hideAllM = () => setHidden(new Set(allIds));

  if (members.length === 0)
    return <Empty label="Assign members (with availability set) to see utilisation." />;

  const data = allMonths.map((month) => {
    const entry: Record<string, string | number> = { month: formatMonth(month) };
    for (const m of members) {
      const planned = forecast.assignments
        .filter((a) => a.memberId === m.id)
        .reduce((s, a) => s + (a.plannedHours[month] ?? 0), 0);
      entry[m.id] = Math.round((planned / m.availability) * 100);
    }
    return entry;
  });

  const legendItems = members.map((m, i) => ({
    id: m.id,
    label: m.isGhost ? `👻 ${m.name}` : m.name,
    color: getMemberColor(i),
  }));

  return (
    <ChartShell title="Member Utilisation — Planned as % of Availability">
      <LegendPills items={legendItems} hidden={hidden} onToggle={toggleM} onIsolate={isolateM} onShowAll={showAllM} onHideAll={hideAllM} />
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="%" width={42} domain={[0, 'dataMax + 20']} />
          <Tooltip
            formatter={(val, name) => {
              const m = members.find((x) => x.id === name);
              return [`${val}%`, m ? (m.isGhost ? `👻 ${m.name}` : m.name) : String(name)];
            }}
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
          />
          <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5}
            label={{ value: '100% cap', fontSize: 10, fill: '#ef4444', position: 'insideTopRight' }} />
          {members.map((m, i) => (
            <Line
              key={m.id}
              type="monotone"
              dataKey={m.id}
              stroke={getMemberColor(i)}
              strokeWidth={hidden.has(m.id) ? 0 : 2.5}
              strokeDasharray={m.isGhost ? '5 3' : undefined}
              dot={hidden.has(m.id) ? false : { r: 3 }}
              activeDot={hidden.has(m.id) ? false : { r: 5 }}
              hide={hidden.has(m.id)}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-400 mt-2">Ghost members shown as dashed lines · 100% = fully allocated · over 100% = over-committed</p>
    </ChartShell>
  );
}

// ─── Member: per-member load chart (stacked by project) ──────────────────────

function ForecastMemberLoadChart({
  memberId, memberName, isGhost, availability,
  memberAssignments, forecast, projectColors,
}: {
  memberId: string; memberName: string; isGhost: boolean; availability: number;
  memberAssignments: import('@/lib/types').ForecastAssignment[];
  forecast: Forecast; projectColors: Map<string, string>;
}) {
  const allMonthsSet = new Set<string>();
  for (const a of memberAssignments) {
    const p = forecast.projects.find((p) => p.id === a.projectId);
    if (p) for (const m of getMonthsBetween(p.startMonth, p.endMonth)) allMonthsSet.add(m);
  }
  const allMonths = Array.from(allMonthsSet).sort();

  const projects = memberAssignments
    .map((a) => forecast.projects.find((p) => p.id === a.projectId))
    .filter(Boolean) as import('@/lib/types').ForecastProject[];

  const data = allMonths.map((month) => {
    const entry: Record<string, string | number> = { month: formatMonth(month) };
    for (const a of memberAssignments) {
      const p = forecast.projects.find((proj) => proj.id === a.projectId);
      if (!p) continue;
      if (!getMonthsBetween(p.startMonth, p.endMonth).includes(month)) continue;
      const h = a.plannedHours[month] ?? 0;
      if (h > 0) entry[p.id] = h;
    }
    return entry;
  });

  const totalHours    = memberAssignments.reduce((s, a) => s + Object.values(a.plannedHours).reduce((x, v) => x + v, 0), 0);
  const overMonths    = availability > 0
    ? allMonths.filter((m) => memberAssignments.reduce((s, a) => s + (a.plannedHours[m] ?? 0), 0) > availability).length
    : 0;
  const accentColor   = isGhost ? 'text-violet-600' : 'text-indigo-600';

  return (
    <ChartShell title={`${isGhost ? '👻 ' : ''}${memberName}`}>
      <div className="flex flex-wrap items-center gap-3 text-xs mb-3">
        <span className={`font-semibold ${accentColor}`}>{totalHours}h planned total</span>
        {availability > 0 && <span className="text-gray-400">{availability}h/month cap</span>}
        {overMonths > 0 && (
          <span className="text-red-600 font-medium">⚠ {overMonths} month{overMonths !== 1 ? 's' : ''} over capacity</span>
        )}
        {overMonths === 0 && totalHours > 0 && (
          <span className="text-emerald-600 font-medium">✓ Within capacity</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {projects.map((p, i) => (
          <span key={p.id} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: projectColors.get(p.id) ?? getColor(i) }} />
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
            formatter={(val, name) => [`${val}h`, forecast.projects.find((p) => p.id === name)?.name ?? String(name)]}
          />
          {projects.map((p, i) => (
            <Bar
              key={p.id}
              dataKey={p.id}
              stackId="load"
              fill={projectColors.get(p.id) ?? getColor(i)}
              opacity={0.85}
              radius={i === projects.length - 1 ? [3, 3, 0, 0] : undefined}
            />
          ))}
          {availability > 0 && (
            <ReferenceLine y={availability} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5}
              label={{ value: `${availability}h`, fontSize: 9, fill: '#ef4444', position: 'insideTopLeft' }} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function ForecastCharts({
  forecast,
  teamMembers,
}: {
  forecast: Forecast;
  teamMembers: TeamMember[];
}) {
  const [chartTab, setChartTab] = useState<'project' | 'member'>('project');
  const [hidden,   setHidden]   = useState<Set<string>>(new Set());

  if (forecast.projects.length === 0) {
    return <Empty label="Add projects in the Plan tab to see charts." />;
  }

  // Stable color maps
  const projectColors = new Map(forecast.projects.map((p, i) => [p.id, getColor(i)]));
  const legendItems   = forecast.projects.map((p) => ({
    id: p.id, label: p.name, color: projectColors.get(p.id) ?? getColor(0),
  }));

  function toggle(id: string)  { setHidden((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function isolate(id: string) { setHidden(new Set(forecast.projects.filter((p) => p.id !== id).map((p) => p.id))); }
  function showAll()           { setHidden(new Set()); }
  function hideAll()           { setHidden(new Set(forecast.projects.map((p) => p.id))); }

  const visibleProjects = forecast.projects.filter((p) => !hidden.has(p.id));

  // Members with at least one assignment
  const assignedRealMembers = teamMembers.filter((m) =>
    forecast.assignments.some((a) => !a.isGhost && a.memberId === m.id)
  );
  const assignedGhostMembers = forecast.ghostMembers.filter((g) =>
    forecast.assignments.some((a) => a.isGhost && a.memberId === g.id)
  );

  return (
    <div className="space-y-5">
      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(['project', 'member'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setChartTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              chartTab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'project' ? 'By Project' : 'By Member'}
          </button>
        ))}
      </div>

      {/* ── By Project ── */}
      {chartTab === 'project' && (
        <>
          <div className="bg-white rounded-lg ring-1 ring-gray-200 px-5 py-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Projects — Click to toggle · Double-click to isolate
            </p>
            <LegendPills items={legendItems} hidden={hidden} onToggle={toggle} onIsolate={isolate} onShowAll={showAll} onHideAll={hideAll} />
          </div>

          <TotalCapacityChart forecast={forecast} teamMembers={teamMembers} hiddenProjects={hidden} projectColors={projectColors} />
          <ForecastCapacityGapChart forecast={forecast} teamMembers={teamMembers} />

          {visibleProjects.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {visibleProjects.map((project) => (
                <ProjectCapacityChart key={project.id} project={project} forecast={forecast} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── By Member ── */}
      {chartTab === 'member' && (
        <>
          {assignedRealMembers.length === 0 && assignedGhostMembers.length === 0 ? (
            <Empty label="No members assigned to any project yet." />
          ) : (
            <>
              {/* Utilisation overview — all members as lines */}
              <ForecastMemberUtilisationChart forecast={forecast} teamMembers={teamMembers} />

              {/* Per-member load charts */}
              {assignedRealMembers.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Team Members</p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {assignedRealMembers.map((m) => (
                      <ForecastMemberLoadChart
                        key={m.id}
                        memberId={m.id}
                        memberName={m.name}
                        isGhost={false}
                        availability={m.monthlyAvailability}
                        memberAssignments={forecast.assignments.filter((a) => a.memberId === m.id)}
                        forecast={forecast}
                        projectColors={projectColors}
                      />
                    ))}
                  </div>
                </>
              )}

              {assignedGhostMembers.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Ghost Members</p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {assignedGhostMembers.map((g) => (
                      <ForecastMemberLoadChart
                        key={g.id}
                        memberId={g.id}
                        memberName={g.name}
                        isGhost={true}
                        availability={g.monthlyAvailability}
                        memberAssignments={forecast.assignments.filter((a) => a.memberId === g.id)}
                        forecast={forecast}
                        projectColors={projectColors}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
