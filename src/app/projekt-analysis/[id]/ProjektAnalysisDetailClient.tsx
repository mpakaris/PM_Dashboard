'use client';

import { useState, useMemo, useEffect, useTransition, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/components/RoleProvider';
import {
  ProjektAnalysisProject,
  ProjektAnalysisMemberSettings,
  ProjektAnalysisForecast,
  ProjektAnalysisTicketForecast,
  ProjektAnalysisType,
  ProjektAnalysisChange,
  ProjektAnalysisEntry,
  Forecast,
  TeamMember,
} from '@/lib/types';
import {
  updateProjektAnalysisMemberSettings,
  updateProjektAnalysisForecast,
  updateProjektAnalysisProjectSettings,
  updateProjektAnalysisChanges,
  uploadEmployeeExcel,
  deleteEmployeeEntries,
  addProjectMember,
  removeProjectMember,
  linkForecast,
} from '@/actions/projektAnalysis';
import {
  MonthlyByTicketChart,
  MonthlyByUserChart,
  ActivitySplitChart,
  CumulativeChart,
  EconomicsChart,
  ForecastBurnupChart,
  TicketProgressChart,
  VelocityChart,
  TeamCompositionChart,
  MonthlyBillingChart,
  FestpreisHoursBurndownChart,
  FestpreisCostChart,
  FestpreisKalkulationChart,
  ticketId,
  ticketLabel,
} from './ProjektAnalysisCharts';

const TABS = ['Overview', 'Employees', 'Tickets', 'Trends', 'Forecast'] as const;
type Tab = (typeof TABS)[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtH(h: number) {
  return h.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + 'h';
}
function fmtEur(v: number) {
  return v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}
function fmtMonth(ym: string) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

// ─── Rate Input ───────────────────────────────────────────────────────────────

function RateInput({
  value,
  onCommit,
  suffix = '€/h',
  placeholder = '',
}: {
  value: number;
  onCommit: (v: number) => void;
  suffix?: string;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState(value > 0 ? String(value) : '');
  useEffect(() => { setRaw(value > 0 ? String(value) : ''); }, [value]);
  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9.]*"
        value={raw}
        placeholder={placeholder}
        onChange={(e) => setRaw(e.target.value.replace(/[^0-9.]/g, ''))}
        onBlur={() => {
          const v = Math.max(0, Number(raw) || 0);
          setRaw(v > 0 ? String(v) : '');
          onCommit(v);
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-16 text-right border-0 border-b border-gray-300 bg-transparent text-gray-700 focus:outline-none focus:border-slate-500 text-sm"
      />
      <span className="text-xs text-gray-400">{suffix}</span>
    </div>
  );
}

// ─── Employee Detail Table (pivot: tickets × months) ─────────────────────────

function EmployeeDetailTable({
  user,
  entries,
  months,
  tasks,
}: {
  user: string;
  entries: { task: string; month: string; user: string; spentTime: number }[];
  months: string[];
  tasks: string[];
}) {
  const userEntries = entries.filter(e => e.user === user);

  // Only show tickets this user actually worked on
  const activeTasks = tasks.filter(task =>
    userEntries.some(e => e.task === task)
  );

  if (activeTasks.length === 0) return null;

  // Pre-compute hours[task][month]
  const hours: Record<string, Record<string, number>> = {};
  for (const task of activeTasks) {
    hours[task] = {};
    for (const month of months) {
      hours[task][month] = userEntries
        .filter(e => e.task === task && e.month === month)
        .reduce((s, e) => s + e.spentTime, 0);
    }
  }

  // Column totals (per month)
  const monthTotals: Record<string, number> = {};
  for (const month of months) {
    monthTotals[month] = activeTasks.reduce((s, t) => s + (hours[t][month] || 0), 0);
  }

  // Row totals (per ticket)
  const taskTotals: Record<string, number> = {};
  for (const task of activeTasks) {
    taskTotals[task] = months.reduce((s, m) => s + (hours[task][m] || 0), 0);
  }

  const grandTotal = activeTasks.reduce((s, t) => s + taskTotals[t], 0);

  return (
    <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
      <table className="text-xs w-full table-fixed">
        <colgroup>
          <col className="w-48" />
          {months.map(m => <col key={m} />)}
          <col className="w-20" />
        </colgroup>
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left px-3 py-2 font-medium text-gray-500">Ticket</th>
            {months.map(month => (
              <th key={month} className="text-right px-2 py-2 font-medium text-gray-500">
                {fmtMonth(month)}
              </th>
            ))}
            <th className="text-right px-3 py-2 font-medium text-gray-600">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {activeTasks.map(task => (
            <tr key={task} className="hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-600 max-w-0">
                <div className="flex items-center gap-1 overflow-hidden">
                  <span className="font-mono text-gray-400 shrink-0">{ticketId(task)}</span>
                  <span className="truncate text-gray-600" title={ticketLabel(task)}>{ticketLabel(task)}</span>
                </div>
              </td>
              {months.map(month => {
                const h = hours[task][month] || 0;
                return (
                  <td key={month} className="text-right px-2 py-2">
                    {h > 0
                      ? <span className="text-gray-700">{fmtH(h)}</span>
                      : <span className="text-gray-200">—</span>
                    }
                  </td>
                );
              })}
              <td className="text-right px-3 py-2 font-medium text-gray-800">
                {fmtH(taskTotals[task])}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-gray-200 bg-gray-50">
          <tr>
            <td className="px-3 py-2 font-semibold text-gray-700">Total</td>
            {months.map(month => (
              <td key={month} className="text-right px-2 py-2 font-semibold text-gray-700">
                {monthTotals[month] > 0 ? fmtH(monthTotals[month]) : <span className="text-gray-300">—</span>}
              </td>
            ))}
            <td className="text-right px-3 py-2 font-bold text-gray-800">{fmtH(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Add Employee Row ─────────────────────────────────────────────────────────

function AddEmployeeRow({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    if (!name.trim()) return;
    setBusy(true);
    await addProjectMember(projectId, name.trim());
    setName('');
    setAdding(false);
    setBusy(false);
    onDone();
  }

  if (!adding) return (
    <button
      onClick={() => setAdding(true)}
      className="text-xs text-gray-400 hover:text-slate-600 border border-dashed border-gray-200 hover:border-gray-300 rounded-md px-3 py-2 transition-colors"
    >
      + Add Employee
    </button>
  );

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        type="text"
        placeholder="Employee name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setName(''); } }}
        className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
      />
      <button
        onClick={handleAdd}
        disabled={busy || !name.trim()}
        className="text-xs text-white bg-slate-600 hover:bg-slate-700 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
      >
        Add
      </button>
      <button onClick={() => { setAdding(false); setName(''); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
    </div>
  );
}

// ─── Employee Excel Upload ─────────────────────────────────────────────────────

function EmployeeExcelUpload({ projectId, userName, onDone }: { projectId: string; userName: string; onDone: () => void }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error' | 'confirm-clear' | 'confirm-remove'>('idle');
  const [msg, setMsg] = useState('');

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('loading');
    setMsg('');
    const fd = new FormData();
    fd.append('file', file);
    const res = await uploadEmployeeExcel(fd, projectId, userName);
    if (res.ok) {
      setStatus('ok');
      setMsg(`+${res.added} entries`);
      onDone();
    } else {
      setStatus('error');
      setMsg(res.error ?? 'Upload failed');
    }
    e.target.value = '';
  }

  async function handleClear() {
    setStatus('loading');
    const res = await deleteEmployeeEntries(projectId, userName);
    if (res.ok) { onDone(); setStatus('idle'); }
    else { setStatus('error'); setMsg(res.error ?? 'Failed'); }
  }

  async function handleRemove() {
    setStatus('loading');
    const res = await removeProjectMember(projectId, userName);
    if (res.ok) { onDone(); setStatus('idle'); }
    else { setStatus('error'); setMsg(res.error ?? 'Failed'); }
  }

  if (status === 'loading') return <span className="text-xs text-gray-400">Working…</span>;
  if (status === 'ok') return <span className="text-xs text-emerald-600">{msg}</span>;
  if (status === 'error') return <span className="text-xs text-red-500" title={msg}>Error</span>;

  if (status === 'confirm-clear') return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-500">Clear entries?</span>
      <button onClick={handleClear} className="text-xs text-red-500 hover:text-red-700 font-medium">Yes</button>
      <button onClick={() => setStatus('idle')} className="text-xs text-gray-400 hover:text-gray-600">No</button>
    </div>
  );

  if (status === 'confirm-remove') return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-500">Remove employee?</span>
      <button onClick={handleRemove} className="text-xs text-red-500 hover:text-red-700 font-medium">Yes</button>
      <button onClick={() => setStatus('idle')} className="text-xs text-gray-400 hover:text-gray-600">No</button>
    </div>
  );

  return (
    <div className="flex items-center gap-1">
      <label className="cursor-pointer group" title="Upload Excel for this employee">
        <input type="file" accept=".xlsx,.xls" className="sr-only" onChange={handleFile} />
        <span className="text-xs text-gray-300 group-hover:text-slate-500 transition-colors px-2 py-1 border border-transparent group-hover:border-gray-200 rounded">
          ↑ Excel
        </span>
      </label>
      <button
        onClick={() => setStatus('confirm-clear')}
        className="text-xs text-gray-300 hover:text-amber-500 transition-colors px-1.5 py-1"
        title="Clear entries (keep employee)"
      >
        Clear
      </button>
      <button
        onClick={() => setStatus('confirm-remove')}
        className="text-xs text-gray-300 hover:text-red-400 transition-colors px-1"
        title="Remove employee from project"
      >
        ✕
      </button>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-800">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  project: ProjektAnalysisProject;
  forecasts: Forecast[];
  teamMembers: TeamMember[];
}

export default function ProjektAnalysisDetailClient({ project, forecasts, teamMembers }: Props) {
  const router = useRouter();
  const isAdmin = useRole() === 'admin';
  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const [isPending, startTransition] = useTransition();

  // ── Period filter ──────────────────────────────────────────────────────────
  const allMonthsSorted = useMemo(() => [...new Set(project.entries.map(e => e.month))].sort(), [project.entries]);
  const dataMin = allMonthsSorted[0] ?? '';
  const dataMax = allMonthsSorted[allMonthsSorted.length - 1] ?? '';
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [filterStart, setFilterStart] = useState(`${currentYear}-01`);
  const [filterEnd, setFilterEnd] = useState(currentMonth);

  const filteredEntries = useMemo(() => {
    if (!filterStart && !filterEnd) return project.entries;
    return project.entries.filter(e =>
      (!filterStart || e.month >= filterStart) && (!filterEnd || e.month <= filterEnd)
    );
  }, [project.entries, filterStart, filterEnd]);

  // ── Derived base data ──────────────────────────────────────────────────────
  const months = useMemo(() => [...new Set(filteredEntries.map(e => e.month))].sort(), [filteredEntries]);
  const users = useMemo(() => {
    const fromEntries = filteredEntries.map(e => e.user);
    return [...new Set([...project.members, ...fromEntries])].sort();
  }, [filteredEntries, project.members]);
  const tasks = useMemo(() => [...new Set(filteredEntries.map(e => e.task))].sort(), [filteredEntries]);
  const totalHours = useMemo(() => filteredEntries.reduce((s, e) => s + e.spentTime, 0), [filteredEntries]);
  const workHours = useMemo(() => filteredEntries.filter(e => e.activity === 'Work').reduce((s, e) => s + e.spentTime, 0), [filteredEntries]);
  const opsHours = useMemo(() => filteredEntries.filter(e => e.activity === 'Operations').reduce((s, e) => s + e.spentTime, 0), [filteredEntries]);

  const userTotalHours = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of filteredEntries) m[e.user] = (m[e.user] || 0) + e.spentTime;
    return m;
  }, [filteredEntries]);

  const taskTotalHours = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of filteredEntries) m[e.task] = (m[e.task] || 0) + e.spentTime;
    return m;
  }, [filteredEntries]);

  const years = useMemo(() => [...new Set(filteredEntries.map(e => e.month.slice(0, 4)))].sort(), [filteredEntries]);

  const taskYearHours = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const e of filteredEntries) {
      const y = e.month.slice(0, 4);
      if (!m[e.task]) m[e.task] = {};
      m[e.task][y] = (m[e.task][y] || 0) + e.spentTime;
    }
    return m;
  }, [filteredEntries]);

  const isFiltered = (!!dataMin && filterStart > dataMin) || (!!dataMax && filterEnd < dataMax);

  // ── Linked forecast data ───────────────────────────────────────────────────
  const linkedForecast = useMemo(
    () => forecasts.find(f => f.id === project.linkedForecastId) ?? null,
    [forecasts, project.linkedForecastId]
  );

  const planningEntries = useMemo((): ProjektAnalysisEntry[] => {
    if (!linkedForecast) return [];
    const memberMap = new Map([
      ...teamMembers.map(m => [m.id, m.name] as [string, string]),
      ...linkedForecast.ghostMembers.map(g => [g.id, g.name] as [string, string]),
    ]);
    const projectMap = new Map(linkedForecast.projects.map(p => [p.id, p.name]));
    const entries: ProjektAnalysisEntry[] = [];
    for (const a of linkedForecast.assignments) {
      const taskName = projectMap.get(a.projectId) ?? a.projectId;
      const userName = memberMap.get(a.memberId) ?? a.memberId;
      for (const [month, hours] of Object.entries(a.plannedHours)) {
        if (hours > 0) entries.push({ task: taskName, month, user: userName, activity: 'Work', spentTime: hours });
      }
    }
    return entries;
  }, [linkedForecast, teamMembers]);

  // ── Member settings (local editable state) ────────────────────────────────
  const [memberRates, setMemberRates] = useState<Record<string, { costRate: number; billingRate: number }>>(() => {
    const m: Record<string, { costRate: number; billingRate: number }> = {};
    for (const s of project.memberSettings) m[s.user] = { costRate: s.costRate, billingRate: s.billingRate };
    return m;
  });
  useEffect(() => {
    const m: Record<string, { costRate: number; billingRate: number }> = {};
    for (const s of project.memberSettings) m[s.user] = { costRate: s.costRate, billingRate: s.billingRate };
    setMemberRates(m);
  }, [project.memberSettings]);

  async function saveMemberRate(user: string, field: 'costRate' | 'billingRate', value: number) {
    const updated = { ...memberRates, [user]: { ...(memberRates[user] ?? { costRate: 0, billingRate: 0 }), [field]: value } };
    setMemberRates(updated);
    const settings: ProjektAnalysisMemberSettings[] = users.map(u => ({
      user: u,
      costRate: updated[u]?.costRate ?? 0,
      billingRate: updated[u]?.billingRate ?? 0,
    }));
    startTransition(async () => {
      await updateProjektAnalysisMemberSettings(project.id, settings);
      router.refresh();
    });
  }

  // ── Economics ──────────────────────────────────────────────────────────────
  const userEconomics = useMemo(() => users.map(user => {
    const hours = userTotalHours[user] || 0;
    const r = memberRates[user] ?? { costRate: 0, billingRate: 0 };
    return { user, hours, cost: hours * r.costRate, revenue: hours * r.billingRate, pl: hours * (r.billingRate - r.costRate) };
  }), [users, userTotalHours, memberRates]);
  const totalCost = useMemo(() => userEconomics.reduce((s, e) => s + e.cost, 0), [userEconomics]);
  const totalRevenue = useMemo(() => userEconomics.reduce((s, e) => s + e.revenue, 0), [userEconomics]);

  // ── Project settings (type + contract) ────────────────────────────────────
  const [projectSettings, setProjectSettings] = useState({
    projectType: project.projectType,
    contractHours: project.contractHours,
    contractValue: project.contractValue,
  });
  useEffect(() => {
    setProjectSettings({
      projectType: project.projectType,
      contractHours: project.contractHours,
      contractValue: project.contractValue,
    });
  }, [project.projectType, project.contractHours, project.contractValue]);

  async function saveProjectSettings(next: typeof projectSettings) {
    setProjectSettings(next);
    await updateProjektAnalysisProjectSettings(project.id, next);
    router.refresh();
  }

  // ── Nachträge ──────────────────────────────────────────────────────────────
  const [changes, setChanges] = useState<ProjektAnalysisChange[]>(project.changes);
  useEffect(() => { setChanges(project.changes); }, [project.changes]);
  const [addingChange, setAddingChange] = useState(false);
  const [newChangeDesc, setNewChangeDesc] = useState('');
  const [newChangeVal, setNewChangeVal] = useState('');

  async function saveChanges(next: ProjektAnalysisChange[]) {
    setChanges(next);
    await updateProjektAnalysisChanges(project.id, next);
    router.refresh();
  }

  function handleAddChange() {
    const val = Math.max(0, Number(newChangeVal) || 0);
    if (!newChangeDesc.trim() || val === 0) return;
    const next = [...changes, { id: crypto.randomUUID(), description: newChangeDesc.trim(), value: val }];
    setAddingChange(false);
    setNewChangeDesc('');
    setNewChangeVal('');
    saveChanges(next);
  }

  function handleRemoveChange(id: string) {
    saveChanges(changes.filter(c => c.id !== id));
  }

  // ── Forecast state ─────────────────────────────────────────────────────────
  const [forecastDraft, setForecastDraft] = useState<ProjektAnalysisForecast>(project.forecast);
  useEffect(() => { setForecastDraft(project.forecast); }, [project.forecast]);
  const [forecastSaving, setForecastSaving] = useState(false);

  async function handleSaveForecast() {
    setForecastSaving(true);
    await updateProjektAnalysisForecast(project.id, forecastDraft);
    router.refresh();
    setForecastSaving(false);
  }

  function setTicketField(task: string, field: keyof ProjektAnalysisTicketForecast, value: number | boolean) {
    setForecastDraft(prev => ({
      ...prev,
      tickets: prev.tickets.map(t => t.task === task ? { ...t, [field]: value } : t),
    }));
  }

  function setTicketPlanYear(task: string, year: string, value: number) {
    setForecastDraft(prev => ({
      ...prev,
      tickets: prev.tickets.map(t => t.task === task
        ? { ...t, planPerYear: { ...(t.planPerYear ?? {}), [year]: value } }
        : t
      ),
    }));
  }

  // ── Expandable rows ────────────────────────────────────────────────────────
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const toggleUser = (u: string) => setExpandedUsers(prev => { const n = new Set(prev); n.has(u) ? n.delete(u) : n.add(u); return n; });
  const toggleTask = (t: string) => setExpandedTasks(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });

  const uploaded = new Date(project.uploadedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <a href="/projekt-analysis" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
              Projekt Analysis
            </a>
            <span className="text-gray-300">/</span>
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          </div>
          <p className="text-sm text-gray-400">
            {months.length} months · {users.length} employees · {tasks.length} tickets · Last upload {uploaded}
          </p>
        </div>
      </div>

      {/* Project Settings */}
      <div className="bg-white rounded-lg ring-1 ring-gray-200 px-5 py-4 mb-5 flex flex-wrap items-center gap-6">
        <div>
          <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wider">Project Type</p>
          <div className="flex gap-2">
            {(['time-and-material', 'festpreis'] as ProjektAnalysisType[]).map((type) => (
              <button
                key={type}
                onClick={isAdmin ? () => saveProjectSettings({ ...projectSettings, projectType: type }) : undefined}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                  projectSettings.projectType === type
                    ? 'bg-slate-700 text-white border-slate-700'
                    : 'bg-white text-gray-500 border-gray-200' + (isAdmin ? ' hover:border-gray-300 hover:text-gray-700' : ' cursor-default')
                }`}
              >
                {type === 'time-and-material' ? 'Time & Material' : 'Festpreis'}
              </button>
            ))}
          </div>
        </div>

        {projectSettings.projectType === 'festpreis' && (
          <>
            <div>
              <p className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">Contract Hours</p>
              {isAdmin ? (
                <RateInput
                  value={projectSettings.contractHours}
                  suffix="h"
                  placeholder="e.g. 2000"
                  onCommit={(v) => saveProjectSettings({ ...projectSettings, contractHours: v })}
                />
              ) : <span className="text-sm text-gray-700">{projectSettings.contractHours || '—'}h</span>}
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">Contract Value</p>
              {isAdmin ? (
                <RateInput
                  value={projectSettings.contractValue}
                  suffix="€"
                  placeholder="e.g. 250000"
                  onCommit={(v) => saveProjectSettings({ ...projectSettings, contractValue: v })}
                />
              ) : <span className="text-sm text-gray-700">{projectSettings.contractValue ? fmtEur(projectSettings.contractValue) : '—'}</span>}
            </div>

            {/* Nachträge */}
            <div className="border-l border-gray-200 pl-6">
              <div className="flex items-center gap-3 mb-2">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Nachträge</p>
                {changes.length > 0 && (
                  <span className="text-xs font-semibold text-emerald-600">
                    +{fmtEur(changes.reduce((s, c) => s + c.value, 0))}
                  </span>
                )}
                {isAdmin && (
                  <button
                    onClick={() => setAddingChange(true)}
                    className="text-xs text-slate-500 hover:text-slate-700 border border-gray-200 rounded px-2 py-0.5 hover:border-gray-300 transition-colors"
                  >
                    + Add
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {changes.map(c => (
                  <div key={c.id} className="flex items-center gap-2 text-xs">
                    <span className="text-emerald-600 font-medium shrink-0">+{fmtEur(c.value)}</span>
                    <span className="text-gray-500 truncate max-w-[180px]" title={c.description}>{c.description}</span>
                    {isAdmin && (
                      <button
                        onClick={() => handleRemoveChange(c.id)}
                        className="text-gray-300 hover:text-red-400 transition-colors shrink-0 ml-auto"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {isAdmin && addingChange && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Description"
                      value={newChangeDesc}
                      onChange={(e) => setNewChangeDesc(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddChange(); if (e.key === 'Escape') setAddingChange(false); }}
                      className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 w-36"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="€ value"
                      value={newChangeVal}
                      onChange={(e) => setNewChangeVal(e.target.value.replace(/[^0-9.]/g, ''))}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddChange(); if (e.key === 'Escape') setAddingChange(false); }}
                      className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 w-20"
                    />
                    <button onClick={handleAddChange} className="text-xs text-white bg-slate-600 hover:bg-slate-700 px-2 py-1 rounded transition-colors">Add</button>
                    <button onClick={() => setAddingChange(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Period filter */}
      <div className="bg-white rounded-lg ring-1 ring-gray-200 px-5 py-3 mb-5 flex flex-wrap items-center gap-4">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Period</span>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={filterStart}
            min={dataMin}
            max={filterEnd || dataMax}
            onChange={(e) => setFilterStart(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          <span className="text-gray-400 text-sm">→</span>
          <input
            type="month"
            value={filterEnd}
            min={filterStart || dataMin}
            max={dataMax}
            onChange={(e) => setFilterEnd(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
        {isFiltered && (
          <button
            onClick={() => { setFilterStart(dataMin); setFilterEnd(dataMax); }}
            className="text-xs text-slate-500 hover:text-slate-700 border border-gray-200 rounded px-2.5 py-1 hover:border-gray-300 transition-colors"
          >
            Clear
          </button>
        )}
        <span className="text-xs text-gray-400 ml-auto">
          {isFiltered
            ? `${months.length} of ${allMonthsSorted.length} months`
            : `${allMonthsSorted.length} months`}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab
                ? 'border-slate-600 text-slate-700'
                : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {activeTab === 'Overview' && (
        <div className="space-y-6">
          {projectSettings.projectType === 'time-and-material' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <KpiCard label="Total Hours" value={fmtH(totalHours)} sub={`${months.length} months`} />
              <KpiCard label="Work Hours" value={fmtH(workHours)} sub={`${totalHours > 0 ? Math.round((workHours / totalHours) * 100) : 0}%`} />
              <KpiCard label="Operations Hours" value={fmtH(opsHours)} sub={`${totalHours > 0 ? Math.round((opsHours / totalHours) * 100) : 0}%`} />
              <KpiCard
                label="Total Revenue"
                value={totalRevenue > 0 ? fmtEur(totalRevenue) : '—'}
                sub={totalRevenue > 0 ? undefined : 'Set billing rates'}
              />
              <KpiCard
                label="Net P&L"
                value={totalCost > 0 || totalRevenue > 0 ? fmtEur(totalRevenue - totalCost) : '—'}
                sub={totalRevenue > 0 ? `Cost: ${fmtEur(totalCost)}` : undefined}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <KpiCard label="Total Hours" value={fmtH(totalHours)} sub={`${months.length} months`} />
              <KpiCard
                label="Hours Remaining"
                value={projectSettings.contractHours > 0 ? fmtH(Math.max(0, projectSettings.contractHours - totalHours)) : '—'}
                sub={projectSettings.contractHours > 0 ? `of ${fmtH(projectSettings.contractHours)}` : 'Set contract hours'}
              />
              <KpiCard
                label="Hours Used"
                value={projectSettings.contractHours > 0 ? `${Math.round((totalHours / projectSettings.contractHours) * 100)}%` : '—'}
                sub={projectSettings.contractHours > 0 ? fmtH(totalHours) : undefined}
              />
              <KpiCard
                label="Contract Value"
                value={projectSettings.contractValue > 0 ? fmtEur(projectSettings.contractValue + changes.reduce((s, c) => s + c.value, 0)) : '—'}
                sub={changes.length > 0 ? `incl. ${changes.length} Nachtrag${changes.length > 1 ? 'träge' : ''}` : undefined}
              />
              <KpiCard
                label="Total Cost"
                value={totalCost > 0 ? fmtEur(totalCost) : '—'}
                sub={totalCost > 0 ? undefined : 'Set cost rates'}
              />
              <KpiCard
                label="Margin"
                value={(() => {
                  const tv = projectSettings.contractValue + changes.reduce((s, c) => s + c.value, 0);
                  return totalCost > 0 && tv > 0 ? fmtEur(tv - totalCost) : '—';
                })()}
                sub={(() => {
                  const tv = projectSettings.contractValue + changes.reduce((s, c) => s + c.value, 0);
                  return totalCost > 0 && tv > 0 ? `${Math.round(((tv - totalCost) / tv) * 100)}%` : undefined;
                })()}
              />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MonthlyByTicketChart entries={filteredEntries} />
            <MonthlyByUserChart entries={filteredEntries} />
          </div>
          <ActivitySplitChart entries={filteredEntries} />
        </div>
      )}

      {/* ── Employees Tab ── */}
      {activeTab === 'Employees' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-400 font-medium">
                    <th className="text-left px-4 py-3">Employee</th>
                    <th className="text-right px-4 py-3">Total h</th>
                    <th className="text-right px-4 py-3">Work h</th>
                    <th className="text-right px-4 py-3">Ops h</th>
                    <th className="text-right px-4 py-3">Cost Rate</th>
                    <th className="text-right px-4 py-3">Billing Rate</th>
                    <th className="text-right px-4 py-3">Cost</th>
                    <th className="text-right px-4 py-3">Revenue</th>
                    <th className="text-right px-4 py-3">P&L</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {userEconomics.map((row) => {
                    const workH = filteredEntries.filter(e => e.user === row.user && e.activity === 'Work').reduce((s, e) => s + e.spentTime, 0);
                    const opsH = row.hours - workH;
                    const isExpanded = expandedUsers.has(row.user);
                    const rates = memberRates[row.user] ?? { costRate: 0, billingRate: 0 };
                    return (
                      <Fragment key={row.user}>
                        <tr
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => toggleUser(row.user)}
                        >
                          <td className="px-4 py-3 font-medium text-gray-800">
                            <span className="flex items-center gap-2">
                              <span className={`text-gray-300 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                              {row.user}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">{fmtH(row.hours)}</td>
                          <td className="px-4 py-3 text-right text-gray-400">{fmtH(workH)}</td>
                          <td className="px-4 py-3 text-right text-gray-400">{fmtH(opsH)}</td>
                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            {isAdmin ? (
                              <RateInput value={rates.costRate} onCommit={(v) => saveMemberRate(row.user, 'costRate', v)} />
                            ) : <span className="text-sm text-gray-600">{rates.costRate > 0 ? `${rates.costRate} €/h` : '—'}</span>}
                          </td>
                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            {isAdmin ? (
                              <RateInput value={rates.billingRate} onCommit={(v) => saveMemberRate(row.user, 'billingRate', v)} />
                            ) : <span className="text-sm text-gray-600">{rates.billingRate > 0 ? `${rates.billingRate} €/h` : '—'}</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">{row.cost > 0 ? fmtEur(row.cost) : <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{row.revenue > 0 ? fmtEur(row.revenue) : <span className="text-gray-300">—</span>}</td>
                          <td className={`px-4 py-3 text-right font-medium ${row.pl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {row.cost > 0 || row.revenue > 0 ? fmtEur(row.pl) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            {isAdmin && (
                              <EmployeeExcelUpload
                                projectId={project.id}
                                userName={row.user}
                                onDone={() => router.refresh()}
                              />
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-50 border-b border-gray-100">
                            <td colSpan={10} className="px-6 py-4">
                              <EmployeeDetailTable
                                user={row.user}
                                entries={filteredEntries}
                                months={months}
                                tasks={tasks}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-gray-200">
                  <tr className="text-sm font-semibold text-gray-700">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right">{fmtH(totalHours)}</td>
                    <td className="px-4 py-3 text-right">{fmtH(workHours)}</td>
                    <td className="px-4 py-3 text-right">{fmtH(opsHours)}</td>
                    <td colSpan={2} />
                    <td className="px-4 py-3 text-right">{totalCost > 0 ? fmtEur(totalCost) : '—'}</td>
                    <td className="px-4 py-3 text-right">{totalRevenue > 0 ? fmtEur(totalRevenue) : '—'}</td>
                    <td className={`px-4 py-3 text-right ${totalRevenue - totalCost >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {totalCost > 0 || totalRevenue > 0 ? fmtEur(totalRevenue - totalCost) : '—'}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          {isPending && <p className="text-xs text-gray-400">Saving…</p>}
          {isAdmin && <AddEmployeeRow projectId={project.id} onDone={() => router.refresh()} />}
        </div>
      )}

      {/* ── Tickets Tab ── */}
      {activeTab === 'Tickets' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-400 font-medium">
                    <th className="text-left px-4 py-3">Ticket</th>
                    <th className="text-right px-4 py-3">Actual h</th>
                    <th className="text-right px-4 py-3">Plan h</th>
                    <th className="text-right px-4 py-3">Δ</th>
                    <th className="text-right px-4 py-3">Billing</th>
                    <th className="text-right px-4 py-3">Rate</th>
                    <th className="text-right px-4 py-3">Revenue</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tasks.map((task) => {
                    const hours = taskTotalHours[task] || 0;
                    const fc = forecastDraft.tickets.find(t => t.task === task) ?? { task, expectedHours: 0, billable: false, rate: 0 };
                    const revenue = fc.billable ? hours * fc.rate : 0;
                    const isExpanded = expandedTasks.has(task);
                    const planTotal = fc.expectedHours || 0;
                    const delta = planTotal > 0 ? hours - planTotal : null;
                    return (
                      <Fragment key={task}>
                        <tr
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => toggleTask(task)}
                        >
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-2">
                              <span className={`text-gray-300 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                              <span className="font-mono text-xs text-gray-400 shrink-0">{ticketId(task)}</span>
                              <span className="text-gray-700 truncate max-w-[280px]" title={ticketLabel(task)}>
                                {ticketLabel(task)}
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">{fmtH(hours)}</td>
                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <RateInput
                              value={planTotal}
                              suffix="h"
                              placeholder="—"
                              onCommit={(v) => setTicketField(task, 'expectedHours', v)}
                            />
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-medium">
                            {delta !== null
                              ? <span className={delta > 0 ? 'text-red-500' : 'text-emerald-600'}>{delta >= 0 ? '+' : ''}{fmtH(delta)}</span>
                              : <span className="text-gray-300">—</span>
                            }
                          </td>
                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => {
                                setTicketField(task, 'billable', !fc.billable);
                              }}
                              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ml-auto ${
                                fc.billable
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-gray-100 border-gray-200 text-gray-400 hover:border-gray-300'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${fc.billable ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                              {fc.billable ? 'Billable' : 'Internal'}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            {fc.billable ? (
                              <RateInput
                                value={fc.rate}
                                onCommit={(v) => setTicketField(task, 'rate', v)}
                              />
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-emerald-600 font-medium">
                            {revenue > 0 ? fmtEur(revenue) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3" />
                        </tr>
                        {isExpanded && (
                          <tr className="bg-gray-50">
                            <td colSpan={8} className="px-8 py-4">
                              <div className="space-y-4">
                                {/* Per-year breakdown */}
                                {years.length > 0 && (
                                  <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Yearly Breakdown</p>
                                    <table className="text-xs w-full max-w-xs">
                                      <thead>
                                        <tr className="text-gray-400">
                                          <th className="text-left pr-4 py-1 font-medium">Year</th>
                                          <th className="text-right pr-4 py-1 font-medium">Actual h</th>
                                          <th className="text-right pr-4 py-1 font-medium">Plan h</th>
                                          <th className="text-right py-1 font-medium">Δ</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {years.map(year => {
                                          const actual = taskYearHours[task]?.[year] || 0;
                                          const plan = fc.planPerYear?.[year] || 0;
                                          const d = plan > 0 ? actual - plan : null;
                                          return (
                                            <tr key={year}>
                                              <td className="pr-4 py-1.5 font-medium text-gray-700">{year}</td>
                                              <td className="text-right pr-4 py-1.5 text-gray-600">{fmtH(actual)}</td>
                                              <td className="text-right pr-4 py-1.5" onClick={(e) => e.stopPropagation()}>
                                                <RateInput
                                                  value={plan}
                                                  suffix="h"
                                                  placeholder="—"
                                                  onCommit={(v) => setTicketPlanYear(task, year, v)}
                                                />
                                              </td>
                                              <td className="text-right py-1.5 font-medium">
                                                {d !== null
                                                  ? <span className={d > 0 ? 'text-red-500' : 'text-emerald-600'}>{d >= 0 ? '+' : ''}{fmtH(d)}</span>
                                                  : <span className="text-gray-300">—</span>
                                                }
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                                {/* Employee breakdown */}
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">By Employee</p>
                                  <table className="text-xs w-full max-w-xs">
                                    <thead>
                                      <tr className="text-gray-400">
                                        <th className="text-left pr-4 py-1 font-medium">Employee</th>
                                        <th className="text-right py-1 font-medium">Hours</th>
                                        <th className="text-right py-1 font-medium">Share</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {users.map(user => {
                                        const h = filteredEntries
                                          .filter(e => e.user === user && e.task === task)
                                          .reduce((s, e) => s + e.spentTime, 0);
                                        if (h === 0) return null;
                                        return (
                                          <tr key={user}>
                                            <td className="pr-4 py-1 text-gray-600">{user}</td>
                                            <td className="text-right py-1 text-gray-700">{fmtH(h)}</td>
                                            <td className="text-right py-1 text-gray-400">
                                              {hours > 0 ? `${Math.round((h / hours) * 100)}%` : '—'}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {isAdmin && <div className="flex justify-end">
            <button
              onClick={handleSaveForecast}
              disabled={forecastSaving}
              className="bg-slate-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              {forecastSaving ? 'Saving…' : 'Save Billing Settings'}
            </button>
          </div>}
        </div>
      )}

      {/* ── Trends Tab ── */}
      {activeTab === 'Trends' && (
        <div className="space-y-4">
          {/* Universal */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <VelocityChart entries={filteredEntries} />
            <TeamCompositionChart entries={filteredEntries} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MonthlyByTicketChart entries={filteredEntries} />
            <MonthlyByUserChart entries={filteredEntries} />
          </div>
          <ActivitySplitChart entries={filteredEntries} />

          {/* T&M specific */}
          {projectSettings.projectType === 'time-and-material' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <MonthlyBillingChart entries={filteredEntries} memberSettings={project.memberSettings} />
              <EconomicsChart entries={filteredEntries} memberSettings={project.memberSettings} />
            </div>
          )}

          {/* Festpreis specific */}
          {projectSettings.projectType === 'festpreis' && (
            <>
              <FestpreisKalkulationChart
                entries={filteredEntries}
                contractHours={projectSettings.contractHours}
                contractValue={projectSettings.contractValue}
                changes={changes}
                monthsRemaining={forecastDraft.monthsRemaining}
              />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <FestpreisHoursBurndownChart
                  entries={filteredEntries}
                  contractHours={projectSettings.contractHours}
                />
                <FestpreisCostChart
                  entries={filteredEntries}
                  memberSettings={project.memberSettings}
                  contractValue={projectSettings.contractValue + changes.reduce((s, c) => s + c.value, 0)}
                  monthsRemaining={forecastDraft.monthsRemaining}
                />
              </div>
              <EconomicsChart entries={filteredEntries} memberSettings={project.memberSettings} />
            </>
          )}

          <CumulativeChart entries={filteredEntries} totalExpectedHours={forecastDraft.totalExpectedHours} />
        </div>
      )}

      {/* ── Forecast Tab ── */}
      {activeTab === 'Forecast' && (
        <div className="space-y-6">
          {/* Inputs */}
          {isAdmin && <div className="bg-white rounded-lg ring-1 ring-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-800">Forecast Settings</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Link Planning Project</span>
                <select
                  value={project.linkedForecastId ?? ''}
                  onChange={async (e) => {
                    await linkForecast(project.id, e.target.value || null);
                    router.refresh();
                  }}
                  className="text-xs border border-gray-200 rounded-md px-2 py-1 text-gray-600 focus:outline-none focus:ring-2 focus:ring-slate-400 max-w-[200px]"
                >
                  <option value="">— None —</option>
                  {forecasts.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Months remaining in project</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={forecastDraft.monthsRemaining || ''}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9]/g, '');
                    setForecastDraft(prev => ({ ...prev, monthsRemaining: v === '' ? 0 : Math.max(0, Number(v)) }));
                  }}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  placeholder="e.g. 6"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Total expected hours (project budget)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={forecastDraft.totalExpectedHours || ''}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9]/g, '');
                    setForecastDraft(prev => ({ ...prev, totalExpectedHours: v === '' ? 0 : Math.max(0, Number(v)) }));
                  }}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  placeholder="e.g. 5000"
                />
              </div>
            </div>

            {/* Per-ticket expected hours */}
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Expected Hours per Ticket</h4>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {forecastDraft.tickets.map((fc) => {
                const spent = taskTotalHours[fc.task] || 0;
                const remaining = fc.expectedHours > 0 ? Math.max(0, fc.expectedHours - spent) : null;
                return (
                  <div key={fc.task} className="flex items-center gap-3">
                    <span className="font-mono text-xs text-gray-400 w-14 shrink-0">{ticketId(fc.task)}</span>
                    <span className="text-xs text-gray-600 flex-1 truncate" title={ticketLabel(fc.task)}>
                      {ticketLabel(fc.task)}
                    </span>
                    <span className="text-xs text-gray-400 w-20 text-right shrink-0">spent: {fmtH(spent)}</span>
                    <div className="shrink-0">
                      <RateInput
                        value={fc.expectedHours}
                        suffix="h"
                        placeholder="expected"
                        onCommit={(v) => setTicketField(fc.task, 'expectedHours', v)}
                      />
                    </div>
                    {remaining !== null && (
                      <span className={`text-xs w-20 text-right shrink-0 ${remaining === 0 ? 'text-red-400' : 'text-gray-400'}`}>
                        left: {fmtH(remaining)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={handleSaveForecast}
                disabled={forecastSaving}
                className="bg-slate-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                {forecastSaving ? 'Saving…' : 'Save Forecast'}
              </button>
            </div>
          </div>}

          {/* Forecast charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ForecastBurnupChart
              entries={filteredEntries}
              monthsRemaining={forecastDraft.monthsRemaining}
              totalExpectedHours={forecastDraft.totalExpectedHours}
            />
            <TicketProgressChart
              entries={filteredEntries}
              ticketForecasts={forecastDraft.tickets}
            />
          </div>

          {/* Trend charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <VelocityChart entries={filteredEntries} />
            <TeamCompositionChart entries={filteredEntries} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MonthlyByTicketChart entries={filteredEntries} />
            <MonthlyByUserChart entries={filteredEntries} />
          </div>
          <ActivitySplitChart entries={filteredEntries} />
          <CumulativeChart entries={filteredEntries} totalExpectedHours={forecastDraft.totalExpectedHours} />

          {projectSettings.projectType === 'time-and-material' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <MonthlyBillingChart entries={filteredEntries} memberSettings={project.memberSettings} />
              <EconomicsChart entries={filteredEntries} memberSettings={project.memberSettings} />
            </div>
          )}

          {projectSettings.projectType === 'festpreis' && (
            <>
              <FestpreisKalkulationChart
                entries={filteredEntries}
                contractHours={projectSettings.contractHours}
                contractValue={projectSettings.contractValue}
                changes={changes}
                monthsRemaining={forecastDraft.monthsRemaining}
              />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <FestpreisHoursBurndownChart
                  entries={filteredEntries}
                  contractHours={projectSettings.contractHours}
                />
                <FestpreisCostChart
                  entries={filteredEntries}
                  memberSettings={project.memberSettings}
                  contractValue={projectSettings.contractValue + changes.reduce((s, c) => s + c.value, 0)}
                  monthsRemaining={forecastDraft.monthsRemaining}
                />
              </div>
              <EconomicsChart entries={filteredEntries} memberSettings={project.memberSettings} />
            </>
          )}

          {/* ── Planning overlay ── */}
          {linkedForecast && planningEntries.length > 0 && (
            <>
              <div className="flex items-center gap-3 pt-2">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-1">
                  Plan · {linkedForecast.name}
                </span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <VelocityChart entries={planningEntries} />
                <TeamCompositionChart entries={planningEntries} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <MonthlyByTicketChart entries={planningEntries} />
                <MonthlyByUserChart entries={planningEntries} />
              </div>
              <CumulativeChart entries={planningEntries} totalExpectedHours={forecastDraft.totalExpectedHours} />
            </>
          )}
          {linkedForecast && planningEntries.length === 0 && (
            <div className="flex items-center gap-3 pt-2">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400 px-1">Plan · {linkedForecast.name} · no entries</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
