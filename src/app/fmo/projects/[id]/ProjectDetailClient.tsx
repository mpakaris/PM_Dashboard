'use client';

import { useState, useMemo, useEffect, Fragment } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRole } from '@/components/RoleProvider';
import { useLocale } from 'next-intl';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Line, CartesianGrid, ReferenceLine,
  PieChart, Pie, Cell,
} from 'recharts';
import { fmtH, fmtEur, type Locale } from '@/lib/i18n';
import { opsContractActiveInMonth } from '@/lib/utils';
import { useToast } from '@/components/ToastProvider';
import { useConfirm } from '@/components/ConfirmDialogProvider';
import type {
  FmoProject, FmoEntry, FmoMember, FmoWbsEntry, FmoTicket,
  WbsSubCategory, FmoOperationContract, FmoProjectCategory,
  FmoProjectChange, FmoWorkPackage, FmoProjectMilestone,
  FmoChangeStatus, FmoMilestoneStatus, FmoMilestoneType,
  FmoWorkPackageTask, FmoAcceptanceCriterion,
  Forecast,
} from '@/lib/types';
import {
  updateFmoProject, updateProjectConfig, setProjectMemberRate,
  upsertProjectOperationContract, removeProjectOperationContract,
  updateProjectFrame, upsertProjectChange, removeProjectChange,
  upsertWorkPackage, removeWorkPackage, addWorkPackageNote,
  toggleWorkPackageCriterion,
  upsertMilestone, removeMilestone,
} from '@/actions/fmoProjects';

type Tab = 'overview' | 'team' | 'tickets' | 'trends' | 'financials' | 'milestones' | 'forecast' | 'settings';

const COLORS = [
  '#4338ca', '#0f766e', '#c2410c', '#1d4ed8',
  '#7c3aed', '#a16207', '#b91c1c', '#475569', '#0e7490', '#9d174d',
];
const TOOLTIP_STYLE = {
  contentStyle: { fontSize: 12, borderRadius: 6, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,.06)' },
};

// ─── Ops Contract form ────────────────────────────────────────────────────────

function OpsContractForm({
  projectId, allTickets, initialContract, onDone, onCancel,
}: {
  projectId: string;
  allTickets: FmoTicket[];
  initialContract?: FmoOperationContract;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isEdit = !!initialContract;
  const [name, setName]                   = useState(initialContract?.name ?? '');
  const [type, setType]                   = useState<'fixprice' | 'hourly'>(initialContract?.type ?? 'fixprice');
  const [monthlyAmount, setMonthlyAmount] = useState(String(initialContract?.defaultMonthlyAmount ?? ''));
  const [startDate, setStartDate]         = useState(initialContract?.startDate ?? '');
  const [endDate, setEndDate]             = useState(initialContract?.endDate ?? '');
  const [selected, setSelected]           = useState<number[]>(initialContract?.ticketIds ?? []);
  const [query, setQuery]                 = useState('');
  const [saving, setSaving]               = useState(false);

  const filtered = allTickets
    .filter(t => !query || String(t.id).includes(query) || t.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    await upsertProjectOperationContract(projectId, {
      ...(initialContract ?? {}),
      name: name.trim(), type, ticketIds: selected,
      defaultMonthlyAmount: type === 'fixprice' ? (parseFloat(monthlyAmount) || 0) : 0,
      monthlyOverrides: initialContract?.monthlyOverrides ?? {},
      startDate: type === 'fixprice' && startDate ? startDate : undefined,
      endDate:   type === 'fixprice' && endDate   ? endDate   : undefined,
    });
    setSaving(false);
    onDone();
  }

  return (
    <div className="border border-indigo-100 rounded-lg p-4 bg-indigo-50/30 space-y-3">
      <p className="text-xs font-semibold text-slate-600">{isEdit ? `Editing: ${initialContract!.name}` : 'New Operations Contract'}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Contract Name</label>
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Operations Support"
            className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Billing Type</label>
          <div className="flex gap-1 mt-1">
            {(['fixprice', 'hourly'] as const).map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={`flex-1 text-xs px-2 py-1.5 rounded border transition-colors ${
                  type === t ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-300 text-slate-600 hover:border-slate-500'
                }`}>
                {t === 'fixprice' ? 'Pauschal / Fix' : 'Per Hour'}
              </button>
            ))}
          </div>
        </div>
      </div>
      {type === 'fixprice' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Monthly Amount (€)</label>
            <input type="number" min="0" value={monthlyAmount} onChange={e => setMonthlyAmount(e.target.value)}
              className="w-40 border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Flat Fee Start <span className="text-slate-400 font-normal">(first month the fee applies)</span>
              </label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Flat Fee End <span className="text-slate-400 font-normal">(optional — leave blank if ongoing)</span>
              </label>
              <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
            </div>
          </div>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Tickets ({selected.length} selected)
        </label>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tickets…"
          className="w-full border border-slate-200 rounded px-3 py-1.5 text-xs focus:outline-none focus:border-slate-400 mb-1" />
        <div className="border border-slate-200 rounded max-h-40 overflow-y-auto divide-y divide-slate-50 bg-white">
          {filtered.map(t => (
            <label key={t.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" checked={selected.includes(t.id)}
                onChange={() => setSelected(prev => prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id])} />
              <span className="font-mono text-xs text-slate-400">#{t.id}</span>
              <span className="text-xs text-slate-700 truncate">{t.name}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="text-sm text-slate-500 px-3 py-1.5">Cancel</button>
        <button type="button" onClick={save} disabled={saving || !name.trim()}
          className="bg-slate-800 text-white text-sm px-4 py-1.5 rounded hover:bg-slate-700 disabled:opacity-50">
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Contract'}
        </button>
      </div>
    </div>
  );
}

// ─── Work Package Form (Add + Edit) ───────────────────────────────────────────

function WorkPackageForm({
  projectId, initial, allTickets, onDone, onCancel,
}: {
  projectId: string;
  initial?: FmoWorkPackage;
  allTickets: FmoTicket[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const isEdit = !!initial;
  const [name, setName]               = useState(initial?.name ?? '');
  const [startDate, setStartDate]     = useState(initial?.startDate ?? '');
  const [endDate, setEndDate]         = useState(initial?.endDate ?? '');
  const [budgetHours, setBudgetHours] = useState(String(initial?.budgetHours || ''));
  const [description, setDescription] = useState(initial?.description ?? '');
  const [tasks, setTasks]             = useState<Array<{ id: string; text: string }>>(
    (initial?.tasks ?? []).length > 0 ? initial!.tasks! : [{ id: crypto.randomUUID(), text: '' }]
  );
  const [criteria, setCriteria]       = useState<Array<{ id: string; text: string; checked: boolean }>>(
    (initial?.acceptanceCriteria ?? []).length > 0
      ? initial!.acceptanceCriteria!
      : [{ id: crypto.randomUUID(), text: '', checked: false }]
  );
  const [selectedTickets, setSelectedTickets] = useState<number[]>(initial?.ticketIds ?? []);
  const [ticketQuery, setTicketQuery]         = useState('');
  const [saving, setSaving] = useState(false);

  const filteredTickets = allTickets
    .filter(t => !ticketQuery || String(t.id).includes(ticketQuery) || t.name.toLowerCase().includes(ticketQuery.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  function addTask() { setTasks(p => [...p, { id: crypto.randomUUID(), text: '' }]); }
  function removeTask(id: string) { setTasks(p => p.filter(t => t.id !== id)); }
  function updateTask(id: string, text: string) { setTasks(p => p.map(t => t.id === id ? { ...t, text } : t)); }

  function addCriterion() { setCriteria(p => [...p, { id: crypto.randomUUID(), text: '', checked: false }]); }
  function removeCriterion(id: string) { setCriteria(p => p.filter(c => c.id !== id)); }
  function updateCriterion(id: string, text: string) { setCriteria(p => p.map(c => c.id === id ? { ...c, text } : c)); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await upsertWorkPackage(projectId, {
      ...(isEdit ? { id: initial!.id } : {}),
      name: name.trim(),
      budgetHours: parseFloat(budgetHours) || 0,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      description: description.trim() || undefined,
      tasks: tasks.filter(t => t.text.trim()) as FmoWorkPackageTask[],
      acceptanceCriteria: criteria.filter(c => c.text.trim()) as FmoAcceptanceCriterion[],
      ticketIds: selectedTickets,
    });
    setSaving(false);
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="border border-slate-200 rounded-lg p-4 bg-indigo-50/30 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-3">
          <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} required
            placeholder="e.g. LDAP Integration"
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Planned Start</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Planned End</label>
          <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)}
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Budget Hours <span className="text-slate-300 font-normal">(opt.)</span></label>
          <input type="number" min="0" value={budgetHours} onChange={e => setBudgetHours(e.target.value)}
            placeholder="0"
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
        </div>
      </div>

      {/* Linked Tickets */}
      {allTickets.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Linked Tickets <span className="text-slate-300 font-normal">({selectedTickets.length} selected — used for planned vs booked tracking)</span>
          </label>
          <input value={ticketQuery} onChange={e => setTicketQuery(e.target.value)}
            placeholder="Search tickets…"
            className="w-full border border-slate-200 rounded px-3 py-1.5 text-xs focus:outline-none focus:border-slate-400 mb-1" />
          <div className="border border-slate-200 rounded max-h-36 overflow-y-auto divide-y divide-slate-50 bg-white">
            {filteredTickets.map(t => (
              <label key={t.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={selectedTickets.includes(t.id)}
                  onChange={() => setSelectedTickets(prev =>
                    prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id]
                  )} />
                <span className="font-mono text-xs text-slate-400">#{t.id}</span>
                <span className="text-xs text-slate-700 truncate">{t.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Description <span className="text-slate-300 font-normal">(optional)</span></label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
          placeholder="What this work package covers…"
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-slate-500">Tasks</label>
          <button type="button" onClick={addTask} className="text-xs text-indigo-500 hover:text-indigo-700">+ Task</button>
        </div>
        <div className="space-y-1.5">
          {tasks.map((t, i) => (
            <div key={t.id} className="flex items-center gap-2">
              <span className="text-slate-300 text-xs shrink-0">•</span>
              <input value={t.text} onChange={e => updateTask(t.id, e.target.value)}
                placeholder={`Task ${i + 1}…`}
                className="flex-1 border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400" />
              {tasks.length > 1 && (
                <button type="button" onClick={() => removeTask(t.id)} className="text-slate-300 hover:text-red-400 shrink-0">×</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-slate-500">Acceptance Criteria</label>
          <button type="button" onClick={addCriterion} className="text-xs text-indigo-500 hover:text-indigo-700">+ Criterion</button>
        </div>
        <div className="space-y-1.5">
          {criteria.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2">
              <span className="w-4 h-4 rounded border border-slate-300 bg-white shrink-0" />
              <input value={c.text} onChange={e => updateCriterion(c.id, e.target.value)}
                placeholder={`Criterion ${i + 1}…`}
                className="flex-1 border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400" />
              {criteria.length > 1 && (
                <button type="button" onClick={() => removeCriterion(c.id)} className="text-slate-300 hover:text-red-400 shrink-0">×</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="text-sm text-slate-500 px-3 py-1.5">Cancel</button>
        <button type="submit" disabled={saving || !name.trim()}
          className="bg-slate-800 text-white text-sm px-4 py-1.5 rounded hover:bg-slate-700 disabled:opacity-50">
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Work Package'}
        </button>
      </div>
    </form>
  );
}

// ─── Work Package Card ────────────────────────────────────────────────────────

function WorkPackageCard({
  projectId, wp, totalBudgetHours, totalBudgetEur, isAdmin, onDone,
  entries, allTickets,
}: {
  projectId: string;
  wp: FmoWorkPackage;
  totalBudgetHours: number;
  totalBudgetEur: number;
  isAdmin: boolean;
  onDone: () => void;
  entries: FmoEntry[];
  allTickets: FmoTicket[];
}) {
  const router  = useRouter();
  const confirm = useConfirm();
  const toast   = useToast();
  const [open, setOpen]                     = useState(false);
  const [showNote, setShowNote]             = useState(false);
  const [noteText, setNoteText]             = useState('');
  const [noteCompletion, setNoteCompletion] = useState(0);
  const [editing, setEditing]               = useState(false);
  const [saving, setSaving]                 = useState(false);

  const latest        = wp.notes.length > 0 ? wp.notes[wp.notes.length - 1] : null;
  const pct           = latest?.completion ?? 0;
  const wpEur         = totalBudgetHours > 0 && wp.budgetHours > 0 ? Math.round(wp.budgetHours / totalBudgetHours * totalBudgetEur) : 0;
  const wpPctOfTotal  = totalBudgetHours > 0 && wp.budgetHours > 0 ? Math.round(wp.budgetHours / totalBudgetHours * 100) : 0;
  const checkedCount  = (wp.acceptanceCriteria ?? []).filter(c => c.checked).length;
  const totalCriteria = (wp.acceptanceCriteria ?? []).length;
  const allDone       = totalCriteria > 0 && checkedCount === totalCriteria;

  // ── Booked hours from linked tickets ────────────────────────────────────────
  const linkedSet  = useMemo(() => new Set(wp.ticketIds ?? []), [wp.ticketIds]);
  const hasLinks   = linkedSet.size > 0;

  const wpEntries  = useMemo(() =>
    hasLinks ? entries.filter(e => e.ticketId !== null && linkedSet.has(e.ticketId)) : [],
    [entries, linkedSet, hasLinks]
  );
  const bookedHours = useMemo(() => wpEntries.reduce((s, e) => s + e.spentTime, 0), [wpEntries]);
  const budget      = wp.budgetHours;
  const overBudget  = budget > 0 && bookedHours > budget;
  const burnPct     = budget > 0 ? Math.min(100, Math.round(bookedHours / budget * 100)) : null;

  // ── Mini burndown data (monthly incremental + cumulative) ───────────────────
  const burndownData = useMemo(() => {
    if (!hasLinks || wpEntries.length === 0) return [];
    const monthMap = new Map<string, number>();
    for (const e of wpEntries) monthMap.set(e.month, (monthMap.get(e.month) ?? 0) + e.spentTime);
    const months = [...monthMap.keys()].sort();
    let cum = 0;
    return months.map(m => {
      cum += monthMap.get(m)!;
      return {
        month: m.slice(5),
        monthly: Math.round(monthMap.get(m)! * 10) / 10,
        cumulative: Math.round(cum * 10) / 10,
      };
    });
  }, [wpEntries, hasLinks]);

  const linkedTicketNames = useMemo(() =>
    allTickets.filter(t => linkedSet.has(t.id)),
    [allTickets, linkedSet]
  );

  if (editing && isAdmin) {
    return (
      <WorkPackageForm
        projectId={projectId}
        initial={wp}
        allTickets={allTickets}
        onDone={() => { setEditing(false); onDone(); router.refresh(); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  async function saveNote() {
    if (!noteText.trim()) return;
    setSaving(true);
    await addWorkPackageNote(projectId, wp.id, { statusText: noteText.trim(), completion: noteCompletion });
    setSaving(false);
    setShowNote(false);
    setNoteText('');
    setNoteCompletion(pct);
    onDone();
    router.refresh();
  }

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">

      {/* Header */}
      <div
        className="flex items-start gap-3 px-4 py-3 bg-slate-50 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        <svg
          className={`w-4 h-4 text-slate-400 shrink-0 mt-0.5 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">{wp.name}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
            {(wp.startDate || wp.endDate) && (
              <p className="text-xs text-slate-400">
                {wp.startDate ? new Date(wp.startDate + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : '?'}
                {' → '}
                {wp.endDate ? new Date(wp.endDate + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : '?'}
              </p>
            )}
            {wp.budgetHours > 0 && !hasLinks && (
              <p className="text-xs text-slate-400">
                {wp.budgetHours}h planned{wpPctOfTotal > 0 && ` · ${wpPctOfTotal}% of total`}{wpEur > 0 && ` · ${wpEur.toLocaleString('de-DE')} €`}
              </p>
            )}
            {totalCriteria > 0 && (
              <p className={`text-xs font-medium ${allDone ? 'text-emerald-600' : 'text-slate-400'}`}>
                {checkedCount}/{totalCriteria} criteria {allDone ? '✓' : ''}
              </p>
            )}
          </div>
        </div>

        {/* Booked vs planned KPI (when linked) */}
        {hasLinks && budget > 0 && (
          <div className="shrink-0 text-right">
            <p className={`text-lg font-bold leading-tight ${overBudget ? 'text-red-500' : burnPct !== null && burnPct >= 80 ? 'text-amber-600' : 'text-slate-700'}`}>
              {Math.round(bookedHours * 10) / 10}h
            </p>
            <p className="text-xs text-slate-400">of {budget}h</p>
          </div>
        )}
        {!hasLinks && pct > 0 && (
          <div className="shrink-0 text-right">
            <p className={`text-lg font-bold ${pct >= 100 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : 'text-slate-700'}`}>{pct}%</p>
            <p className="text-xs text-slate-400">done</p>
          </div>
        )}

        {isAdmin && (
          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={() => { setEditing(true); setOpen(true); }}
              className="text-xs text-slate-400 hover:text-slate-700 border border-slate-200 rounded px-2 py-1">
              Edit
            </button>
            <button onClick={async () => {
              if (!await confirm(`Delete "${wp.name}"?`, { destructive: true, confirmLabel: 'Delete' })) return;
              await removeWorkPackage(projectId, wp.id);
              router.refresh();
              toast.success(`"${wp.name}" deleted`);
            }} className="text-gray-300 hover:text-red-400">×</button>
          </div>
        )}
      </div>

      {open && (<>

      {/* Budget burn bar */}
      {hasLinks && budget > 0 && (
        <div className="h-1.5 bg-slate-100">
          <div className={`h-full transition-all ${overBudget ? 'bg-red-400' : burnPct !== null && burnPct >= 80 ? 'bg-amber-400' : 'bg-indigo-500'}`}
            style={{ width: `${Math.min(100, burnPct ?? 0)}%` }} />
        </div>
      )}

      {/* Note-based progress bar (no ticket links) */}
      {!hasLinks && pct > 0 && (
        <div className="h-1.5 bg-slate-100">
          <div className={`h-full transition-all ${pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-400' : 'bg-indigo-500'}`}
            style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      )}

      {/* Linked tickets row */}
      {hasLinks && (
        <div className="px-4 py-2.5 border-t border-slate-50 flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-slate-400 shrink-0">Tickets:</span>
          {linkedTicketNames.map(t => (
            <span key={t.id} className="text-xs font-mono bg-indigo-50 border border-indigo-100 text-indigo-600 rounded px-1.5 py-0.5">
              #{t.id} <span className="font-sans font-normal text-slate-500 truncate max-w-[120px] inline-block align-bottom">{t.name}</span>
            </span>
          ))}
          {hasLinks && budget === 0 && bookedHours > 0 && (
            <span className="text-xs text-slate-400 ml-1">{Math.round(bookedHours * 10) / 10}h booked</span>
          )}
        </div>
      )}

      {/* Mini burndown chart */}
      {hasLinks && burndownData.length > 0 && (
        <div className="px-4 pt-2 pb-3 border-t border-slate-50">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Burndown</p>
            {budget > 0 && (
              <p className={`text-xs font-medium ${overBudget ? 'text-red-500' : 'text-slate-400'}`}>
                {overBudget ? `+${Math.round((bookedHours - budget) * 10) / 10}h over` : `${Math.round((budget - bookedHours) * 10) / 10}h remaining`}
              </p>
            )}
          </div>
          <ResponsiveContainer width="100%" height={100}>
            <ComposedChart data={burndownData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} interval={0} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${v}h`} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 4, border: '1px solid #e2e8f0' }}
                formatter={(v, name) => [`${v}h`, name === 'monthly' ? 'Monthly' : 'Cumulative']} />
              {budget > 0 && (
                <ReferenceLine y={budget} stroke="#b91c1c" strokeDasharray="4 2"
                  label={{ value: `${budget}h`, position: 'right', fontSize: 9, fill: '#b91c1c' }} />
              )}
              <Bar dataKey="monthly" fill="#c7d2fe" name="monthly" radius={[2, 2, 0, 0]} />
              <Line type="monotone" dataKey="cumulative" stroke="#4338ca" strokeWidth={1.5} dot={{ r: 2 }} name="cumulative" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Description */}
      {wp.description && (
        <div className="px-4 py-3 border-t border-slate-50">
          <p className="text-xs text-slate-500 whitespace-pre-wrap">{wp.description}</p>
        </div>
      )}

      {/* Tasks */}
      {(wp.tasks ?? []).length > 0 && (
        <div className="px-4 py-3 border-t border-slate-50">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Tasks</p>
          <ul className="space-y-1">
            {(wp.tasks ?? []).map(t => (
              <li key={t.id} className="flex items-start gap-2 text-xs text-slate-700">
                <span className="text-slate-300 mt-0.5 shrink-0">•</span>
                <span>{t.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Acceptance Criteria */}
      {totalCriteria > 0 && (
        <div className="px-4 py-3 border-t border-slate-50">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Acceptance Criteria</p>
          <ul className="space-y-1.5">
            {(wp.acceptanceCriteria ?? []).map(c => (
              <li key={c.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={isAdmin ? async () => { await toggleWorkPackageCriterion(projectId, wp.id, c.id); router.refresh(); } : undefined}
                  disabled={!isAdmin}
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    c.checked
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-slate-300 bg-white'
                  } ${isAdmin ? 'cursor-pointer hover:border-slate-500' : 'cursor-default'}`}>
                  {c.checked && (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <span className={`text-xs ${c.checked ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{c.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Status Notes */}
      {wp.notes.length > 0 && (
        <div className="border-t border-slate-50 divide-y divide-slate-50 max-h-48 overflow-y-auto">
          {[...wp.notes].reverse().map(note => (
            <div key={note.id} className="flex items-start gap-3 px-4 py-2.5">
              <div className="shrink-0">
                <p className={`text-sm font-bold ${note.completion >= 100 ? 'text-emerald-600' : 'text-slate-600'}`}>{note.completion}%</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-700">{note.statusText}</p>
                <p className="text-xs text-slate-400">{new Date(note.timestamp).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add note */}
      {isAdmin && (
        <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50/50">
          {!showNote ? (
            <button onClick={() => setShowNote(true)} className="text-xs text-indigo-500 hover:text-indigo-700">+ Add Status Note</button>
          ) : (
            <div className="space-y-2 py-1">
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={2}
                placeholder="Status update…"
                className="w-full border border-slate-300 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none" />
              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-500 shrink-0">Completion</label>
                <input type="range" min="0" max="100" step="5" value={noteCompletion}
                  onChange={e => setNoteCompletion(Number(e.target.value))} className="flex-1" />
                <span className="text-sm font-bold text-slate-700 w-10 text-right">{noteCompletion}%</span>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowNote(false)} className="text-xs text-slate-500 px-3 py-1">Cancel</button>
                <button type="button" onClick={saveNote} disabled={saving || !noteText.trim()}
                  className="bg-slate-800 text-white text-xs px-3 py-1 rounded hover:bg-slate-700 disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save Note'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      </>)}
    </div>
  );
}

// ─── Gantt Chart ─────────────────────────────────────────────────────────────

const ROW_H   = 32;   // px — height of each data row
const LABEL_W = 192;  // px — fixed label column width

function d2t(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00').getTime();
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`w-3 h-3 shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ProjectGantt({ project }: { project: FmoProject }) {
  const wps        = (project.workPackages  ?? []);
  const milestones = [...(project.milestones ?? [])].sort((a, b) => a.date.localeCompare(b.date));

  const datedWps   = wps.filter(wp => wp.startDate && wp.endDate);
  const undatedWps = wps.filter(wp => !wp.startDate || !wp.endDate);

  const [wpOpen, setWpOpen] = useState(false);
  const [msOpen, setMsOpen] = useState(false);

  if (datedWps.length === 0 && milestones.length === 0) return null;

  // ── Time range ──────────────────────────────────────────────────────────────
  const allDates: string[] = [
    ...datedWps.flatMap(wp => [wp.startDate!, wp.endDate!]),
    ...milestones.map(ms => ms.date),
    ...(project.startDate ? [project.startDate] : []),
    ...(project.endDate   ? [project.endDate]   : []),
  ];
  const rawMin     = allDates.reduce((a, b) => a < b ? a : b);
  const rawMax     = allDates.reduce((a, b) => a > b ? a : b);
  const rangeStart = new Date(rawMin + 'T00:00:00');
  rangeStart.setDate(1);
  const rangeEnd = new Date(rawMax + 'T00:00:00');
  rangeEnd.setMonth(rangeEnd.getMonth() + 1, 1);
  const span = rangeEnd.getTime() - rangeStart.getTime();

  function pct(dateStr: string): number {
    return Math.max(0, Math.min(100, (d2t(dateStr) - rangeStart.getTime()) / span * 100));
  }

  // ── Month header ticks ───────────────────────────────────────────────────────
  const months: { label: string; p: number }[] = [];
  const cur = new Date(rangeStart);
  while (cur < rangeEnd) {
    months.push({ label: cur.toLocaleString('default', { month: 'short', year: '2-digit' }), p: (cur.getTime() - rangeStart.getTime()) / span * 100 });
    cur.setMonth(cur.getMonth() + 1);
  }
  const n    = months.length;
  const step = n <= 6 ? 1 : n <= 12 ? 2 : n <= 24 ? 3 : n <= 48 ? 6 : 12;

  const today    = new Date().toISOString().slice(0, 10);
  const todayPct = pct(today);
  const showToday = todayPct > 0 && todayPct < 100;

  // ── Heights (collapse-aware) ─────────────────────────────────────────────────
  const HEADER_H  = 28;
  const SECTION_H = 24;

  const wpRowsH  = datedWps.length * ROW_H + (undatedWps.length > 0 ? undatedWps.length * 22 : 0);
  const msRowsH  = milestones.length * ROW_H;
  const wpSectionH = datedWps.length > 0 ? SECTION_H + (wpOpen ? wpRowsH : 0) : 0;
  const msSectionH = milestones.length > 0 ? SECTION_H + (msOpen ? msRowsH : 0) : 0;
  const gapH       = datedWps.length > 0 && milestones.length > 0 ? 8 : 0;
  const totalBarH  = wpSectionH + gapH + msSectionH;

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
        <h3 className="text-sm font-semibold text-gray-800">Project Timeline</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          {datedWps.length} work package{datedWps.length !== 1 ? 's' : ''} · {milestones.length} milestone{milestones.length !== 1 ? 's' : ''}
          {showToday && <span className="ml-2 text-red-400">· red line = today</span>}
        </p>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 560 }} className="px-5 pb-5 pt-4">

          {/* Month header */}
          <div className="flex" style={{ height: HEADER_H }}>
            <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="shrink-0" />
            <div className="flex-1 relative">
              {months.map((m, i) => (
                <div key={m.label} style={{ left: `${m.p}%` }}
                  className="absolute top-0 flex flex-col items-start select-none pointer-events-none">
                  {i % step === 0 && <span className="text-[10px] text-slate-400 whitespace-nowrap pr-1">{m.label}</span>}
                  <div className={`w-px bg-slate-200 mt-0.5 ${i % step === 0 ? 'h-2' : 'h-1'}`} />
                </div>
              ))}
            </div>
          </div>

          {/* Chart body */}
          <div className="flex">

            {/* ── Label column ── */}
            <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="shrink-0 pr-3">

              {datedWps.length > 0 && (
                <>
                  {/* WP section header */}
                  <button
                    type="button"
                    onClick={() => setWpOpen(o => !o)}
                    style={{ height: SECTION_H }}
                    className="w-full flex items-center gap-1.5 hover:text-slate-600 select-none"
                  >
                    <Chevron open={wpOpen} />
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                      Work Packages ({datedWps.length + undatedWps.length})
                    </span>
                  </button>
                  {wpOpen && (
                    <>
                      {datedWps.map(wp => {
                        const completion = wp.notes.length > 0 ? wp.notes[wp.notes.length - 1].completion : 0;
                        return (
                          <div key={wp.id} style={{ height: ROW_H }} className="flex flex-col justify-center">
                            <span className="text-xs text-slate-700 truncate leading-tight" title={wp.name}>{wp.name}</span>
                            <span className="text-[10px] text-slate-400 leading-none">
                              {wp.budgetHours > 0 ? `${wp.budgetHours}h` : ''}{completion > 0 ? ` · ${completion}%` : ''}
                            </span>
                          </div>
                        );
                      })}
                      {undatedWps.map(wp => (
                        <div key={wp.id} style={{ height: 22 }} className="flex items-center">
                          <span className="text-[10px] text-slate-400 italic truncate" title={wp.name}>{wp.name} (no dates)</span>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}

              {datedWps.length > 0 && milestones.length > 0 && <div style={{ height: gapH }} />}

              {milestones.length > 0 && (
                <>
                  {/* Milestone section header */}
                  <button
                    type="button"
                    onClick={() => setMsOpen(o => !o)}
                    style={{ height: SECTION_H }}
                    className="w-full flex items-center gap-1.5 hover:text-slate-600 select-none"
                  >
                    <Chevron open={msOpen} />
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                      Milestones ({milestones.length})
                    </span>
                  </button>
                  {msOpen && milestones.map(ms => {
                    const color = ms.status === 'reached' ? '#16a34a' : ms.status === 'delayed' ? '#dc2626' : '#64748b';
                    return (
                      <div key={ms.id} style={{ height: ROW_H }} className="flex flex-col justify-center">
                        <span className="text-xs truncate leading-tight" style={{ color }} title={ms.name}>{ms.name}</span>
                        <span className="text-[10px] text-slate-400 leading-none">{ms.date}</span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {/* ── Bar / marker column ── */}
            <div className="flex-1 relative" style={{ height: totalBarH }}>

              {/* Month grid lines */}
              {months.slice(1).map(m => (
                <div key={m.label} style={{ left: `${m.p}%` }}
                  className="absolute inset-y-0 w-px bg-slate-100 pointer-events-none" />
              ))}

              {/* Today line */}
              {showToday && (
                <div style={{ left: `${todayPct}%`, opacity: 0.7 }}
                  className="absolute inset-y-0 w-px bg-red-400 z-10 pointer-events-none" />
              )}

              {/* WP section header row (bar side — empty, keeps alignment) */}
              {datedWps.length > 0 && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: SECTION_H }}
                  className="border-b border-slate-100 bg-slate-50/40" />
              )}

              {/* WP bars */}
              {wpOpen && datedWps.length > 0 && (() => {
                let offsetY = SECTION_H;
                return datedWps.map(wp => {
                  const top  = offsetY; offsetY += ROW_H;
                  const l    = pct(wp.startDate!);
                  const r    = pct(wp.endDate!);
                  const w    = Math.max(r - l, 0.5);
                  const completion = wp.notes.length > 0 ? wp.notes[wp.notes.length - 1].completion : 0;
                  return (
                    <div key={wp.id}
                      title={`${wp.name}\n${wp.startDate} → ${wp.endDate}${completion > 0 ? ` · ${completion}% done` : ''}`}
                      style={{ position: 'absolute', top: top + 6, left: `${l}%`, width: `${w}%`, height: ROW_H - 12 }}
                      className="rounded overflow-hidden border border-indigo-300 bg-indigo-50"
                    >
                      {completion > 0 && <div style={{ width: `${completion}%` }} className="h-full bg-indigo-400 opacity-50" />}
                      {w > 4 && (
                        <span className="absolute inset-0 flex items-center px-1.5 text-[10px] font-medium text-indigo-800 truncate">
                          {completion > 0 ? `${completion}%` : ''}
                        </span>
                      )}
                    </div>
                  );
                });
              })()}

              {/* MS section header row (bar side) */}
              {milestones.length > 0 && (
                <div style={{ position: 'absolute', top: wpSectionH + gapH, left: 0, right: 0, height: SECTION_H }}
                  className="border-b border-slate-100 bg-slate-50/40" />
              )}

              {/* Milestone markers */}
              {msOpen && milestones.length > 0 && (() => {
                const msTop0 = wpSectionH + gapH + SECTION_H;
                return milestones.map((ms, i) => {
                  const topCenter   = msTop0 + i * ROW_H + ROW_H / 2;
                  const l           = pct(ms.date);
                  const isPayment   = ms.milestoneType === 'payment';
                  const borderColor = ms.status === 'reached' ? '#16a34a' : ms.status === 'delayed' ? '#dc2626' : '#64748b';
                  const bgColor     = isPayment
                    ? (ms.status === 'reached' ? '#fef9c3' : '#fef3c7')
                    : (ms.status === 'reached' ? '#dcfce7' : ms.status === 'delayed' ? '#fee2e2' : '#f1f5f9');
                  const D = 14;
                  return (
                    <div key={ms.id} title={`${ms.name} — ${ms.date} (${ms.status})`}
                      style={{ position: 'absolute', top: topCenter - D / 2, left: `${l}%`,
                        width: D, height: D, transform: 'translateX(-50%) rotate(45deg)',
                        background: bgColor, border: `2px solid ${borderColor}`, borderRadius: 2, zIndex: 5 }}
                    />
                  );
                });
              })()}

              {/* Today label */}
              {showToday && (
                <div style={{ position: 'absolute', bottom: -18, left: `${todayPct}%`, transform: 'translateX(-50%)' }}>
                  <span className="text-[10px] text-red-400 whitespace-nowrap select-none">Today</span>
                </div>
              )}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-6 pt-3 border-t border-slate-100">
            <span className="flex items-center gap-1.5 text-[10px] text-slate-400"><span className="inline-block w-4 h-3 rounded border border-indigo-300 bg-indigo-50" /> Work package</span>
            <span className="flex items-center gap-1.5 text-[10px] text-slate-400"><span className="inline-block w-4 h-3 rounded border border-indigo-300 bg-indigo-400 opacity-50" /> Completion fill</span>
            <span className="flex items-center gap-1.5 text-[10px] text-slate-400"><span className="inline-block w-3 h-3 rotate-45 border-2 border-slate-500 bg-slate-100" /> Milestone</span>
            <span className="flex items-center gap-1.5 text-[10px] text-slate-400"><span className="inline-block w-3 h-3 rotate-45 border-2 border-amber-400 bg-amber-100" /> Payment</span>
            <span className="flex items-center gap-1.5 text-[10px] text-slate-400"><span className="inline-block w-px h-3 bg-green-600" /> Reached</span>
            <span className="flex items-center gap-1.5 text-[10px] text-slate-400"><span className="inline-block w-px h-3 bg-red-500" /> Delayed</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Milestones Tab ───────────────────────────────────────────────────────────

function MilestonesTab({
  project, isAdmin, totalBudgetEur, showMilestoneForm, setShowMilestoneForm,
}: {
  project: FmoProject;
  isAdmin: boolean;
  totalBudgetEur: number;
  showMilestoneForm: boolean;
  setShowMilestoneForm: (v: boolean) => void;
}) {
  const router  = useRouter();
  const confirm = useConfirm();
  const toast   = useToast();
  const [editingMs, setEditingMs]     = useState<FmoProjectMilestone | null>(null);
  const [msTableOpen, setMsTableOpen] = useState(false);

  const today  = new Date().toISOString().slice(0, 10);
  const sorted = [...(project.milestones ?? [])].sort((a, b) => a.date.localeCompare(b.date));


  const totalPayments = sorted.reduce((s, m) => s + m.paymentAmount, 0);
  const releasedPay   = sorted.filter(m => m.status === 'reached').reduce((s, m) => s + m.paymentAmount, 0);
  const upcomingPay   = sorted.filter(m => m.status === 'upcoming').reduce((s, m) => s + m.paymentAmount, 0);
  const delayedPay    = sorted.filter(m => m.status === 'delayed').reduce((s, m) => s + m.paymentAmount, 0);
  const hasPayments   = totalPayments > 0;
  const fmt           = (n: number) => n.toLocaleString('de-DE') + ' €';

  // Progress bar denominator = full project value (contract + approved changes); fall back to milestone sum
  const projectValue    = totalBudgetEur > 0 ? totalBudgetEur : totalPayments;
  const pctReleased     = projectValue > 0 ? Math.round(releasedPay  / projectValue * 100) : 0;
  const pctUpcoming     = projectValue > 0 ? Math.round(upcomingPay  / projectValue * 100) : 0;
  const pctDelayed      = projectValue > 0 ? Math.round(delayedPay   / projectValue * 100) : 0;

  function relDate(d: string) {
    const diff = Math.round((new Date(d + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000);
    if (diff === 0)  return 'Today';
    if (diff === 1)  return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff > 0)    return diff < 365 ? `in ${diff} days` : `in ${Math.round(diff / 30)} months`;
    return (-diff) < 365 ? `${-diff} days ago` : `${Math.round(-diff / 30)} months ago`;
  }

  // Build chronological timeline items with a "Today" marker inserted
  type TLItem = { type: 'milestone'; ms: FmoProjectMilestone } | { type: 'today' };
  const timelineItems: TLItem[] = [];
  let todayPlaced = false;
  for (const ms of sorted) {
    if (!todayPlaced && ms.date > today) { timelineItems.push({ type: 'today' }); todayPlaced = true; }
    timelineItems.push({ type: 'milestone', ms });
  }
  if (!todayPlaced) timelineItems.push({ type: 'today' });

  const isPaymentMs = (ms: FmoProjectMilestone) => (ms.milestoneType ?? 'milestone') === 'payment';

  const statusLabel = (ms: FmoProjectMilestone) => {
    if (isPaymentMs(ms)) {
      return ms.status === 'reached' ? 'Paid ✓' : ms.status === 'delayed' ? 'Overdue ⚠' : 'Pending';
    }
    return ms.status === 'reached' ? 'Reached ✓' : ms.status === 'delayed' ? 'Delayed ⚠' : 'Upcoming';
  };

  const dotCls = (ms: FmoProjectMilestone, active: boolean) =>
    ms.status === 'reached' ? 'bg-emerald-500 border-emerald-500' :
    ms.status === 'delayed'  ? 'bg-red-400 border-red-400' :
    active ? 'bg-indigo-400 border-indigo-400' : 'bg-white border-slate-300';

  return (
    <div className="space-y-6">

      {/* ── Summary cards ── */}
      {hasPayments && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-400 mb-1">Project Value</p>
            <p className="text-lg font-bold text-slate-800">{fmt(projectValue)}</p>
            {totalBudgetEur > 0 && totalPayments !== totalBudgetEur && (
              <p className="text-xs text-slate-400 mt-0.5">{fmt(totalPayments)} via milestones</p>
            )}
          </div>
          <div className="bg-white rounded-lg border border-emerald-200 p-4">
            <p className="text-xs text-slate-400 mb-1">Paid</p>
            <p className="text-lg font-bold text-emerald-600">{fmt(releasedPay)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{pctReleased}% of project value</p>
          </div>
          <div className="bg-white rounded-lg border border-amber-200 p-4">
            <p className="text-xs text-slate-400 mb-1">Planned</p>
            <p className="text-lg font-bold text-amber-600">{fmt(upcomingPay)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{pctUpcoming}% of project value</p>
          </div>
          {delayedPay > 0 ? (
            <div className="bg-white rounded-lg border border-red-200 p-4">
              <p className="text-xs text-slate-400 mb-1">Delayed</p>
              <p className="text-lg font-bold text-red-500">{fmt(delayedPay)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{pctDelayed}% of project value</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <p className="text-xs text-slate-400 mb-1">Unplanned</p>
              <p className="text-lg font-bold text-slate-400">{fmt(Math.max(0, projectValue - totalPayments))}</p>
              <p className="text-xs text-slate-400 mt-0.5">{Math.max(0, 100 - pctReleased - pctUpcoming)}% not yet scheduled</p>
            </div>
          )}
        </div>
      )}

      {/* ── Payment progress ── */}
      {hasPayments && (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-slate-600">Payment Progress</p>
            <p className="text-xs text-slate-400">{fmt(releasedPay)} paid · {fmt(projectValue)} total project value</p>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pctReleased}%` }} />
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${pctUpcoming}%` }} />
            {delayedPay > 0 && <div className="h-full bg-red-400 transition-all" style={{ width: `${pctDelayed}%` }} />}
          </div>
          <div className="flex gap-4 mt-2">
            <span className="flex items-center gap-1 text-xs text-slate-500"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Paid</span>
            <span className="flex items-center gap-1 text-xs text-slate-500"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Planned</span>
            {delayedPay > 0 && <span className="flex items-center gap-1 text-xs text-slate-500"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Delayed</span>}
            <span className="flex items-center gap-1 text-xs text-slate-500"><span className="w-2 h-2 rounded-full bg-slate-200 inline-block" /> Unscheduled</span>
          </div>
        </div>
      )}

      {/* ── Add / Edit form ── */}
      {showMilestoneForm && isAdmin && !editingMs && (
        <MilestoneForm projectId={project.id}
          onDone={() => { setShowMilestoneForm(false); router.refresh(); }}
          onCancel={() => setShowMilestoneForm(false)} />
      )}
      {editingMs && isAdmin && (
        <MilestoneForm projectId={project.id} initial={editingMs}
          onDone={() => { setEditingMs(null); router.refresh(); }}
          onCancel={() => setEditingMs(null)} />
      )}

      {/* ── Empty state ── */}
      {sorted.length === 0 && !showMilestoneForm && (
        <div className="bg-white rounded-lg border border-slate-200 px-6 py-12 text-center">
          <p className="text-sm text-slate-400">No milestones yet.</p>
          {isAdmin && (
            <button onClick={() => setShowMilestoneForm(true)}
              className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-3 py-1.5">
              + Add First Milestone
            </button>
          )}
        </div>
      )}

      {/* ── Milestone table ── */}
      {sorted.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div
            className="flex items-center justify-between px-5 py-3 bg-slate-50 cursor-pointer select-none"
            onClick={() => setMsTableOpen(o => !o)}
          >
            <div className="flex items-center gap-2">
              <svg className={`w-4 h-4 text-slate-400 transition-transform ${msTableOpen ? '' : '-rotate-90'}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Milestones ({sorted.length})
              </span>
            </div>
            {isAdmin && !showMilestoneForm && (
              <button
                onClick={e => { e.stopPropagation(); setShowMilestoneForm(true); setMsTableOpen(true); }}
                className="text-xs text-indigo-500 hover:text-indigo-700"
              >
                + Add
              </button>
            )}
          </div>
          {msTableOpen && <table className="w-full text-sm">
            <thead className="text-xs text-slate-400 font-medium border-b border-slate-100 bg-slate-50/50">
              <tr>
                <th className="px-5 py-2.5 text-left">Name</th>
                <th className="px-4 py-2.5 text-left">Date</th>
                <th className="px-4 py-2.5 text-left">When</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                {hasPayments && <th className="px-4 py-2.5 text-right">Payment</th>}
                <th className="px-4 py-2.5 text-left">Notes</th>
                {isAdmin && <th className="px-4 py-2.5 w-8" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sorted.map(ms => {
                const isPay = isPaymentMs(ms);
                const statusCls =
                  ms.status === 'reached' ? 'bg-emerald-100 text-emerald-700' :
                  ms.status === 'delayed'  ? 'bg-red-100 text-red-600' :
                  'bg-slate-100 text-slate-500';
                return (
                  <tr key={ms.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isPay ? 'bg-violet-50 text-violet-600' : 'bg-indigo-50 text-indigo-600'}`}>
                          {isPay ? '€' : '◆'}
                        </span>
                        <span className="font-medium text-slate-800">{ms.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {new Date(ms.date + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{relDate(ms.date)}</td>
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <select
                          value={ms.status}
                          onChange={async e => {
                            await upsertMilestone(project.id, { ...ms, status: e.target.value as FmoMilestoneStatus });
                            router.refresh();
                          }}
                          className={`text-xs font-medium px-2 py-1 rounded border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-300 ${statusCls}`}
                        >
                          <option value="upcoming">{isPay ? 'Pending' : 'Upcoming'}</option>
                          <option value="reached">{isPay ? 'Paid ✓' : 'Reached ✓'}</option>
                          <option value="delayed">{isPay ? 'Overdue ⚠' : 'Delayed ⚠'}</option>
                        </select>
                      ) : (
                        <span className={`text-xs font-medium px-2 py-1 rounded ${statusCls}`}>{statusLabel(ms)}</span>
                      )}
                    </td>
                    {hasPayments && (
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {ms.paymentAmount > 0
                          ? <span className={ms.status === 'reached' ? 'text-emerald-600' : 'text-slate-600'}>{fmt(ms.paymentAmount)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                    )}
                    <td className="px-4 py-3 text-xs text-slate-400 max-w-xs">
                      {isAdmin ? (
                        <input
                          defaultValue={ms.notes ?? ''}
                          placeholder="Notes…"
                          className="w-full bg-transparent border-0 border-b border-transparent hover:border-slate-200 focus:border-indigo-300 focus:outline-none text-slate-600 placeholder:text-slate-300 py-0.5"
                          onBlur={async e => {
                            const val = e.target.value.trim() || undefined;
                            if (val !== (ms.notes ?? undefined)) {
                              await upsertMilestone(project.id, { ...ms, notes: val });
                              router.refresh();
                            }
                          }}
                        />
                      ) : (
                        <span className="truncate">{ms.notes ?? '—'}</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setShowMilestoneForm(false); setEditingMs(ms); }}
                            title="Edit"
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            onClick={async () => {
                              if (!await confirm(`Delete milestone "${ms.name}"?`, { destructive: true, confirmLabel: 'Delete' })) return;
                              await removeMilestone(project.id, ms.id);
                              router.refresh();
                              toast.success('Milestone deleted');
                            }}
                            title="Delete"
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6M14 11v6" />
                              <path d="M9 6V4h6v2" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>}
        </div>
      )}
    </div>
  );
}

// ─── Change Order Form ────────────────────────────────────────────────────────

function ChangeOrderForm({ projectId, onDone, onCancel }: { projectId: string; onDone: () => void; onCancel: () => void }) {
  const [name, setName]               = useState('');
  const [budgetHours, setBudgetHours] = useState('');
  const [budgetEur, setBudgetEur]     = useState('');
  const [saving, setSaving]           = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await upsertProjectChange(projectId, {
      name: name.trim(),
      budgetHours: parseFloat(budgetHours) || 0,
      budgetEur:   parseFloat(budgetEur)   || 0,
      status: 'pending',
    });
    setSaving(false);
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="px-5 py-4 border-b border-slate-100 bg-indigo-50/30 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-3">
          <label className="block text-xs font-medium text-slate-500 mb-1">Change Order Name</label>
          <input value={name} onChange={e => setName(e.target.value)} required
            placeholder="e.g. Nachtrag 1 — LDAP Scope Extension"
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Additional Hours</label>
          <input type="number" min="0" value={budgetHours} onChange={e => setBudgetHours(e.target.value)}
            placeholder="0"
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Additional € Value</label>
          <input type="number" min="0" value={budgetEur} onChange={e => setBudgetEur(e.target.value)}
            placeholder="0"
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="text-sm text-slate-500 px-3 py-1.5">Cancel</button>
        <button type="submit" disabled={saving || !name.trim()}
          className="bg-slate-800 text-white text-sm px-4 py-1.5 rounded hover:bg-slate-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Add Change Order'}
        </button>
      </div>
    </form>
  );
}

// ─── Milestone / Payment Form ──────────────────────────────────────────────────

function MilestoneForm({ projectId, onDone, onCancel, defaultType = 'milestone', initial }: {
  projectId: string;
  onDone: () => void;
  onCancel: () => void;
  defaultType?: FmoMilestoneType;
  initial?: FmoProjectMilestone;
}) {
  const isEdit = !!initial;
  const [msType, setMsType]         = useState<FmoMilestoneType>(initial?.milestoneType ?? defaultType);
  const [name, setName]             = useState(initial?.name ?? '');
  const [date, setDate]             = useState(initial?.date ?? '');
  const [paymentAmount, setPayment] = useState(initial?.paymentAmount ? String(initial.paymentAmount) : '');
  const [notes, setNotes]           = useState(initial?.notes ?? '');
  const [saving, setSaving]         = useState(false);
  const isPayment = msType === 'payment';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !date) return;
    if (isPayment && !paymentAmount) return;
    setSaving(true);
    await upsertMilestone(projectId, {
      ...(isEdit ? { id: initial!.id, status: initial!.status } : { status: 'upcoming' }),
      milestoneType: msType,
      name: name.trim(),
      date,
      paymentAmount: isPayment ? parseFloat(paymentAmount) || 0 : 0,
      notes: notes.trim() || undefined,
    });
    setSaving(false);
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="px-5 py-4 border-b border-slate-100 bg-indigo-50/30 space-y-3">
      {/* Type selector */}
      <div className="flex gap-2">
        {(['milestone', 'payment'] as const).map(t => (
          <button key={t} type="button" onClick={() => setMsType(t)}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${
              msType === t ? 'bg-slate-800 text-white border-slate-800' : 'text-slate-500 border-slate-200 hover:border-slate-400'
            }`}>
            {t === 'milestone' ? '◆ Milestone' : '€ Payment'}
          </button>
        ))}
        <p className="text-xs text-slate-400 self-center ml-1">
          {isPayment ? 'A payment release event with a € amount.' : 'A project event or delivery checkpoint.'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            {isPayment ? 'Payment Name' : 'Milestone Name'}
          </label>
          <input value={name} onChange={e => setName(e.target.value)} required
            placeholder={isPayment ? 'e.g. Abschlagsrechnung 1' : 'e.g. Go-Live Phase 1'}
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
        </div>
      </div>

      {isPayment && (
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Amount (€)</label>
          <input type="number" min="0" value={paymentAmount} onChange={e => setPayment(e.target.value)} required
            placeholder="0"
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Notes <span className="text-slate-300 font-normal">(optional)</span></label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          placeholder={isPayment ? 'Invoice number, payment terms…' : 'Acceptance criteria, delivery items…'}
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none" />
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="text-sm text-slate-500 px-3 py-1.5">Cancel</button>
        <button type="submit" disabled={saving || !name.trim() || !date || (isPayment && !paymentAmount)}
          className="bg-slate-800 text-white text-sm px-4 py-1.5 rounded hover:bg-slate-700 disabled:opacity-50">
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : isPayment ? 'Add Payment' : 'Add Milestone'}
        </button>
      </div>
    </form>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProjectDetailClient({
  project, entries, wbs, members, tickets, subCategories, forecasts,
}: {
  project: FmoProject;
  entries: FmoEntry[];
  wbs: Record<string, FmoWbsEntry>;
  members: Record<string, FmoMember>;
  tickets: Record<string, FmoTicket>;
  subCategories: Record<string, WbsSubCategory>;
  allProjects: FmoProject[];
  forecasts: Forecast[];
}) {
  const router  = useRouter();
  const isAdmin = useRole() === 'admin';
  const locale  = useLocale() as Locale;
  const confirm = useConfirm();
  const toast   = useToast();

  const [activeTab, setActiveTab]         = useState<Tab>('overview');
  const [projType, setProjType]           = useState(project.projectType ?? 'tm');
  const [projCategory, setProjCategory]   = useState<FmoProjectCategory>(project.projectCategory ?? 'client');
  const [contractValue, setContractValue] = useState(String(project.contractValue ?? 0));
  const [contractHours, setContractHours] = useState(String(project.contractHours ?? 0));
  const [savingConfig, setSavingConfig]   = useState(false);
  const [editingWbs, setEditingWbs]       = useState(false);
  const [selectedWbs, setSelectedWbs]     = useState<string[]>(project.wbsCodes);
  const [savingWbs, setSavingWbs]         = useState(false);
  const [showOpsForm, setShowOpsForm]         = useState(false);
  const [editingContract, setEditingContract] = useState<FmoOperationContract | null>(null);
  // Fixed Price frame
  const [startDate, setStartDate]     = useState(project.startDate ?? '');
  const [endDate, setEndDate]         = useState(project.endDate ?? '');
  const [budgetHours, setBudgetHours] = useState(String(project.budgetHours ?? ''));
  const [budgetEur, setBudgetEur]     = useState(String(project.budgetEur ?? ''));
  const [fteHours, setFteHours]       = useState(String(project.fteHours ?? 1600));
  const [savingFrame, setSavingFrame] = useState(false);
  const [retroHover, setRetroHover] = useState<{ month: string; planned: Array<{ label: string; value: number }>; actual: Array<{ label: string; value: number }> } | null>(null);
  // Inline add forms
  const [showChangeForm, setShowChangeForm]       = useState(false);
  const [showWpForm, setShowWpForm]               = useState(false);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [wpSectionOpen, setWpSectionOpen]         = useState(false);
  // Dashboard period filter (KPI cards) — default: Jan → today of current year
  const [dashboardRange, setDashboardRange] = useState<{ from: string; to: string }>(() => {
    const now  = new Date();
    const year = now.getFullYear();
    const mo   = String(now.getMonth() + 1).padStart(2, '0');
    return { from: `${year}-01`, to: `${year}-${mo}` };
  });

  // ── Lookups ────────────────────────────────────────────────────────────────

  const nameToMember = useMemo(() =>
    Object.fromEntries(Object.values(members).map(m => [m.name, m])), [members]);

  // Tickets in fixprice ops contracts → revenue comes from flat fee, not per-hour billing
  const fixOpsTicketSet = useMemo(() =>
    new Set((project.operationContracts ?? []).filter(c => c.type === 'fixprice').flatMap(c => c.ticketIds)),
    [project.operationContracts]);

  // ALL ops contract tickets (hourly + fixprice) → used for Dev vs Ops split
  const allOpsTicketSet = useMemo(() =>
    new Set((project.operationContracts ?? []).flatMap(c => c.ticketIds)),
    [project.operationContracts]);

  // ── Dashboard period filter ────────────────────────────────────────────────

  const dashboardEntries = useMemo(() =>
    dashboardRange.from
      ? entries.filter(e => e.month >= dashboardRange.from && e.month <= dashboardRange.to)
      : entries,
    [entries, dashboardRange]);

  // ── KPI totals (scoped to dashboardEntries) ────────────────────────────────

  const totalHours    = useMemo(() => dashboardEntries.reduce((s, e) => s + e.spentTime, 0), [dashboardEntries]);
  const billableHours = useMemo(() => dashboardEntries.filter(e => e.billingClass === 'V').reduce((s, e) => s + e.spentTime, 0), [dashboardEntries]);
  const devHoursAll   = useMemo(() => dashboardEntries.filter(e => e.ticketId === null || !allOpsTicketSet.has(e.ticketId)).reduce((s, e) => s + e.spentTime, 0), [dashboardEntries, allOpsTicketSet]);
  const opsHoursAll   = useMemo(() => dashboardEntries.filter(e => e.ticketId !== null && allOpsTicketSet.has(e.ticketId)).reduce((s, e) => s + e.spentTime, 0), [dashboardEntries, allOpsTicketSet]);

  // Member summary (period-scoped)
  const memberSummary = useMemo(() => {
    const map = new Map<string, { member: FmoMember; hours: number; tmHours: number; opsHours: number; fixOpsHours: number; cost: number; revenue: number }>();
    for (const e of dashboardEntries) {
      const m = nameToMember[e.user];
      if (!m) continue;
      const ex = map.get(m.id) ?? { member: m, hours: 0, tmHours: 0, opsHours: 0, fixOpsHours: 0, cost: 0, revenue: 0 };
      ex.hours += e.spentTime;
      ex.cost  += e.spentTime * (m.costRate ?? 0);
      const isAnyOps = e.ticketId !== null && allOpsTicketSet.has(e.ticketId);
      const isFixOps = e.ticketId !== null && fixOpsTicketSet.has(e.ticketId);
      if (isAnyOps) {
        ex.opsHours += e.spentTime;
        if (isFixOps) ex.fixOpsHours += e.spentTime;
        else ex.revenue += e.spentTime * ((project.memberRates ?? {})[m.id]?.billingRate ?? 0); // hourly ops
      } else {
        ex.tmHours  += e.spentTime;
        ex.revenue  += e.spentTime * ((project.memberRates ?? {})[m.id]?.billingRate ?? 0);
      }
      map.set(m.id, ex);
    }

    // Distribute fixprice ops pauschal revenue proportionally by fixOpsHours
    const totalFixOpsHours = [...map.values()].reduce((s, r) => s + r.fixOpsHours, 0);
    if (totalFixOpsHours > 0) {
      const months = [...new Set(dashboardEntries.map(e => e.month))];
      const totalPauschal = months.reduce((s, month) =>
        s + (project.operationContracts ?? []).filter(c => c.type === 'fixprice')
          .reduce((cs, c) => opsContractActiveInMonth(c, month)
            ? cs + ((c.monthlyOverrides ?? {})[month] ?? c.defaultMonthlyAmount)
            : cs, 0), 0);
      for (const row of map.values()) {
        row.revenue += totalPauschal * (row.fixOpsHours / totalFixOpsHours);
      }
    }

    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [dashboardEntries, nameToMember, fixOpsTicketSet, allOpsTicketSet, project.memberRates, project.operationContracts]);

  // Ticket summary (period-scoped)
  const ticketSummary = useMemo(() => {
    const map = new Map<number | string, { name: string; wbsCode: string | null; billingClass: string | null; subCategory: string | null; hours: number }>();
    for (const e of dashboardEntries) {
      const key = e.ticketId ?? e.ticketName;
      const ex = map.get(key);
      if (ex) ex.hours += e.spentTime;
      else map.set(key, { name: e.ticketName, wbsCode: e.wbsCode, billingClass: e.billingClass, subCategory: e.subCategory, hours: e.spentTime });
    }
    return [...map.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.hours - a.hours);
  }, [dashboardEntries]);

  const [expandedTickets, setExpandedTickets] = useState<Set<number | string>>(new Set());

  const ticketMonthly = useMemo(() => {
    const map = new Map<number | string, Map<string, number>>();
    for (const e of dashboardEntries) {
      const key = e.ticketId ?? e.ticketName;
      if (!map.has(key)) map.set(key, new Map());
      const m = map.get(key)!;
      m.set(e.month, (m.get(e.month) ?? 0) + e.spentTime);
    }
    return map;
  }, [dashboardEntries]);

  // Economics totals (period-scoped)
  const totalEconAll = useMemo(() => {
    let devCost = 0, opsCost = 0, devRevenue = 0, opsHourlyRevenue = 0;
    for (const e of dashboardEntries) {
      const m = nameToMember[e.user];
      if (!m) continue;
      const costRate    = m.costRate ?? 0;
      const billingRate = (project.memberRates ?? {})[m.id]?.billingRate ?? 0;
      const isOps       = e.ticketId !== null && allOpsTicketSet.has(e.ticketId);
      const isFixOps    = e.ticketId !== null && fixOpsTicketSet.has(e.ticketId);
      if (isOps) {
        opsCost += e.spentTime * costRate;
        // fixprice ops: flat fee covers revenue — don't add hourly billing on top
        if (!isFixOps) opsHourlyRevenue += e.spentTime * billingRate;
      } else {
        devCost    += e.spentTime * costRate;
        devRevenue += e.spentTime * billingRate;
      }
    }
    const months = [...new Set(dashboardEntries.map(e => e.month))];
    const opsPauschalRevenue = months.reduce((s, month) =>
      s + (project.operationContracts ?? []).filter(c => c.type === 'fixprice')
        .reduce((cs, c) => opsContractActiveInMonth(c, month)
          ? cs + ((c.monthlyOverrides ?? {})[month] ?? c.defaultMonthlyAmount)
          : cs, 0), 0);
    const opsRevenue = Math.round(opsPauschalRevenue + opsHourlyRevenue);
    const cost       = Math.round(devCost + opsCost);
    const revenue    = Math.round(devRevenue) + opsRevenue;
    return {
      cost, revenue, pl: revenue - cost,
      devCost:    Math.round(devCost),    opsCost:    Math.round(opsCost),
      devRevenue: Math.round(devRevenue), opsRevenue,
      devPl: Math.round(devRevenue - devCost), opsPl: Math.round(opsRevenue - opsCost),
    };
  }, [dashboardEntries, nameToMember, project.operationContracts, project.memberRates, allOpsTicketSet, fixOpsTicketSet]);

  const marginAll = totalEconAll.revenue > 0 ? Math.round(totalEconAll.pl / totalEconAll.revenue * 100) : 0;

  // ── Category-derived flags ────────────────────────────────────────────────

  const isClientProject = projCategory === 'client';
  const showBillingCols = isClientProject && projType === 'tm';

  // Reset active tab when category/type changes make it unavailable
  useEffect(() => {
    const validTabs = new Set<Tab>([
      'overview', 'team', 'tickets', 'trends', 'forecast', 'settings',
      ...(isClientProject ? ['financials' as Tab] : []),
      ...(isClientProject && projType === 'fixprice' ? ['milestones' as Tab] : []),
    ]);
    if (!validTabs.has(activeTab)) setActiveTab('overview');
  }, [projCategory, projType, activeTab]);

  // ── Chart data (same period filter as KPIs) ───────────────────────────────

  // Velocity
  const velocityData = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of dashboardEntries) totals.set(e.month, (totals.get(e.month) ?? 0) + e.spentTime);
    const months = [...totals.keys()].sort();
    return months.map((month, i) => {
      const h = totals.get(month)!;
      const slice = months.slice(Math.max(0, i - 2), i + 1);
      const avg = slice.reduce((s, m) => s + (totals.get(m) ?? 0), 0) / slice.length;
      return { month: month.slice(0, 7), hours: h, avg3m: Math.round(avg * 10) / 10 };
    });
  }, [dashboardEntries]);

  // Dev vs Operations monthly
  const devVsOpsData = useMemo(() => {
    const monthMap = new Map<string, { Development: number; Operations: number }>();
    for (const e of dashboardEntries) {
      const isOps = e.ticketId !== null && allOpsTicketSet.has(e.ticketId);
      const row = monthMap.get(e.month) ?? { Development: 0, Operations: 0 };
      if (isOps) row.Operations += e.spentTime;
      else        row.Development += e.spentTime;
      monthMap.set(e.month, row);
    }
    const months = [...monthMap.keys()].sort();
    return months.map(month => {
      const r = monthMap.get(month)!;
      const total = r.Development + r.Operations;
      return {
        month: month.slice(0, 7),
        Development: Math.round(r.Development * 10) / 10,
        Operations:  Math.round(r.Operations  * 10) / 10,
        'Ops %': total > 0 ? Math.round(r.Operations / total * 100) : 0,
      };
    });
  }, [dashboardEntries, allOpsTicketSet]);

  // Category stacked bar
  const { categoryData, categoryKeys } = useMemo(() => {
    const monthMap = new Map<string, Map<string, number>>();
    const catSet   = new Set<string>();
    for (const e of dashboardEntries) {
      if (!monthMap.has(e.month)) monthMap.set(e.month, new Map());
      const label = e.billingClass === 'V'
        ? 'Billable'
        : (e.subCategory ? (subCategories[e.subCategory]?.label ?? e.subCategory) : 'Unmapped');
      catSet.add(label);
      const m = monthMap.get(e.month)!;
      m.set(label, (m.get(label) ?? 0) + e.spentTime);
    }
    const months = [...monthMap.keys()].sort();
    const cats   = [...catSet];
    const data   = months.map(month => {
      const row: Record<string, any> = { month: month.slice(0, 7) };
      const m = monthMap.get(month)!;
      for (const cat of cats) row[cat] = m.get(cat) ?? 0;
      return row;
    });
    return { categoryData: data, categoryKeys: cats };
  }, [dashboardEntries, subCategories]);

  // Monthly by member (top 5)
  const topMembers = useMemo(() => memberSummary.slice(0, 5).map(ms => ms.member.name), [memberSummary]);
  const monthlyByMember = useMemo(() => {
    const months = [...new Set(dashboardEntries.map(e => e.month))].sort();
    return months.map(month => {
      const row: Record<string, any> = { month: month.slice(0, 7) };
      for (const name of topMembers)
        row[name] = dashboardEntries.filter(e => e.month === month && e.user === name).reduce((s, e) => s + e.spentTime, 0);
      return row;
    });
  }, [dashboardEntries, topMembers]);

  // Economics by month (chart-range)
  const economicsByMonth = useMemo(() => {
    const monthTotals = new Map<string, { cost: number; tmRevenue: number; opsRevenue: number }>();
    for (const e of dashboardEntries) {
      const m   = nameToMember[e.user];
      const row = monthTotals.get(e.month) ?? { cost: 0, tmRevenue: 0, opsRevenue: 0 };
      if (m) {
        row.cost += e.spentTime * (m.costRate ?? 0);
        const isFixOps = e.ticketId !== null && fixOpsTicketSet.has(e.ticketId);
        if (!isFixOps) row.tmRevenue += e.spentTime * ((project.memberRates ?? {})[m.id]?.billingRate ?? 0);
      }
      monthTotals.set(e.month, row);
    }
    const fixOpsContracts = (project.operationContracts ?? []).filter(c => c.type === 'fixprice');
    for (const [month, row] of monthTotals)
      row.opsRevenue = fixOpsContracts.reduce((s, c) => opsContractActiveInMonth(c, month)
        ? s + ((c.monthlyOverrides ?? {})[month] ?? c.defaultMonthlyAmount)
        : s, 0);
    const months = [...monthTotals.keys()].sort();
    let cumPl = 0;
    return months.map(month => {
      const r       = monthTotals.get(month)!;
      const revenue = r.tmRevenue + r.opsRevenue;
      const pl      = revenue - r.cost;
      cumPl        += pl;
      return {
        month:      month.slice(0, 7),
        cost:       Math.round(r.cost),
        tmRevenue:  Math.round(r.tmRevenue),
        opsRevenue: Math.round(r.opsRevenue),
        revenue:    Math.round(revenue),
        pl:         Math.round(pl),
        cumPl:      Math.round(cumPl),
      };
    });
  }, [dashboardEntries, nameToMember, fixOpsTicketSet, project.memberRates, project.operationContracts]);

  // Ops contract profitability (fixprice only, chart-range)
  const opsContractAnalysis = useMemo(() => {
    const months = [...new Set(dashboardEntries.map(e => e.month))].sort();
    return (project.operationContracts ?? []).filter(c => c.type === 'fixprice').map(c => {
      const ctSet    = new Set(c.ticketIds);
      const ctEntries = dashboardEntries.filter(e => e.ticketId !== null && ctSet.has(e.ticketId));
      const hours    = ctEntries.reduce((s, e) => s + e.spentTime, 0);
      const cost     = ctEntries.reduce((s, e) => s + e.spentTime * (nameToMember[e.user]?.costRate ?? 0), 0);
      const revenue  = months.reduce((s, m) => opsContractActiveInMonth(c, m)
        ? s + ((c.monthlyOverrides ?? {})[m] ?? c.defaultMonthlyAmount)
        : s, 0);
      const pl       = revenue - cost;
      const margin   = revenue > 0 ? Math.round(pl / revenue * 100) : null;
      const implied  = hours > 0 ? revenue / hours : 0;
      return { contract: c, hours: Math.round(hours * 10) / 10, cost: Math.round(cost), revenue: Math.round(revenue), implied: Math.round(implied), pl: Math.round(pl), margin };
    });
  }, [dashboardEntries, nameToMember, project.operationContracts]);

  const hasRates     = Object.values(project.memberRates ?? {}).some(r => r.billingRate > 0);
  const hasCostRates = Object.values(members).some(m => (m.costRate ?? 0) > 0);
  const hasOpsFixed  = (project.operationContracts ?? []).some(c => c.type === 'fixprice');
  const hasOps       = allOpsTicketSet.size > 0;

  // ── Three-bucket financials by month (chart-range) ─────────────────────────

  const threeWayByMonth = useMemo(() => {
    const fixOpsContracts = (project.operationContracts ?? []).filter(c => c.type === 'fixprice');
    const monthMap = new Map<string, { devCost: number; devRev: number; adminCost: number; opsCost: number; opsRev: number }>();

    for (const e of dashboardEntries) {
      const member      = nameToMember[e.user];
      const costRate    = member?.costRate ?? 0;
      const billingRate = member ? ((project.memberRates ?? {})[member.id]?.billingRate ?? 0) : 0;
      const isOps       = e.ticketId !== null && allOpsTicketSet.has(e.ticketId);
      const isFixOps    = e.ticketId !== null && fixOpsTicketSet.has(e.ticketId);

      const row = monthMap.get(e.month) ?? { devCost: 0, devRev: 0, adminCost: 0, opsCost: 0, opsRev: 0 };
      if (isOps) {
        row.opsCost += e.spentTime * costRate;
        if (!isFixOps) row.opsRev += e.spentTime * billingRate;
      } else if (e.billingClass === 'I') {
        row.adminCost += e.spentTime * costRate;
      } else {
        row.devCost += e.spentTime * costRate;
        row.devRev  += e.spentTime * billingRate;
      }
      monthMap.set(e.month, row);
    }

    // Fixprice ops revenue = monthly flat fees, only within each contract's active date range
    for (const [month, row] of monthMap) {
      row.opsRev += fixOpsContracts.reduce((s, c) => opsContractActiveInMonth(c, month)
        ? s + ((c.monthlyOverrides ?? {})[month] ?? c.defaultMonthlyAmount)
        : s, 0);
    }

    const months = [...monthMap.keys()].sort();
    let cumPl = 0;
    return months.map(month => {
      const r         = monthMap.get(month)!;
      const totalCost = r.devCost + r.adminCost + r.opsCost;
      const totalRev  = r.devRev + r.opsRev;
      const pl        = totalRev - totalCost;
      cumPl          += pl;
      return {
        month:      month.slice(0, 7),
        devCost:    Math.round(r.devCost),
        adminCost:  Math.round(r.adminCost),
        opsCost:    Math.round(r.opsCost),
        totalCost:  Math.round(totalCost),
        devRev:     Math.round(r.devRev),
        opsRev:     Math.round(r.opsRev),
        totalRev:   Math.round(totalRev),
        pl:         Math.round(pl),
        cumPl:      Math.round(cumPl),
        devMargin:  r.devRev  > 0 ? Math.round((r.devRev  - r.devCost)  / r.devRev  * 100) : null,
        opsMargin:  r.opsRev  > 0 ? Math.round((r.opsRev  - r.opsCost)  / r.opsRev  * 100) : null,
        totMargin:  totalRev  > 0 ? Math.round((totalRev  - totalCost)  / totalRev  * 100) : null,
      };
    });
  }, [dashboardEntries, nameToMember, fixOpsTicketSet, allOpsTicketSet, project.memberRates, project.operationContracts]);

  // ── Three-bucket KPI totals (dashboard-period) ─────────────────────────────

  const threeWayTotals = useMemo(() => {
    const fixOpsContracts = (project.operationContracts ?? []).filter(c => c.type === 'fixprice');
    let devCost = 0, devRev = 0, devH = 0;
    let adminCost = 0, adminH = 0;
    let opsCost = 0, opsRev = 0, opsH = 0;

    for (const e of dashboardEntries) {
      const member      = nameToMember[e.user];
      const costRate    = member?.costRate ?? 0;
      const billingRate = member ? ((project.memberRates ?? {})[member.id]?.billingRate ?? 0) : 0;
      const isOps       = e.ticketId !== null && allOpsTicketSet.has(e.ticketId);
      const isFixOps    = e.ticketId !== null && fixOpsTicketSet.has(e.ticketId);

      if (isOps) {
        opsCost += e.spentTime * costRate; opsH += e.spentTime;
        if (!isFixOps) opsRev += e.spentTime * billingRate;
      } else if (e.billingClass === 'I') {
        adminCost += e.spentTime * costRate; adminH += e.spentTime;
      } else {
        devCost += e.spentTime * costRate; devRev += e.spentTime * billingRate; devH += e.spentTime;
      }
    }

    const months = [...new Set(dashboardEntries.map(e => e.month))];
    opsRev += months.reduce((s, month) =>
      s + fixOpsContracts.reduce((cs, c) => opsContractActiveInMonth(c, month)
        ? cs + ((c.monthlyOverrides ?? {})[month] ?? c.defaultMonthlyAmount)
        : cs, 0), 0);

    const totalCost = devCost + adminCost + opsCost;
    const totalRev  = devRev + opsRev;
    const margin    = (rev: number, cost: number) => rev > 0 ? Math.round((rev - cost) / rev * 100) : null;
    return {
      dev:   { cost: Math.round(devCost),   rev: Math.round(devRev),  hours: devH,   margin: margin(devRev,  devCost)  },
      admin: { cost: Math.round(adminCost), hours: adminH },
      ops:   { cost: Math.round(opsCost),   rev: Math.round(opsRev),  hours: opsH,   margin: margin(opsRev,  opsCost)  },
      total: { cost: Math.round(totalCost), rev: Math.round(totalRev), pl: Math.round(totalRev - totalCost), margin: margin(totalRev, totalCost) },
    };
  }, [dashboardEntries, nameToMember, fixOpsTicketSet, allOpsTicketSet, project.memberRates, project.operationContracts]);

  // Fixed Price computed values
  const totalBudgetHours = useMemo(() => {
    const base   = project.budgetHours ?? 0;
    const extras = (project.changes ?? []).filter(c => c.status === 'approved').reduce((s, c) => s + c.budgetHours, 0);
    return base + extras;
  }, [project.budgetHours, project.changes]);

  const totalBudgetEur = useMemo(() => {
    const base   = project.budgetEur ?? 0;
    const extras = (project.changes ?? []).filter(c => c.status === 'approved').reduce((s, c) => s + c.budgetEur, 0);
    return base + extras;
  }, [project.budgetEur, project.changes]);

  const impliedRate = totalBudgetHours > 0 && totalBudgetEur > 0
    ? Math.round(totalBudgetEur / totalBudgetHours)
    : 0;

  const burndownData = useMemo(() => {
    if (!totalBudgetHours) return [];
    const monthTotals = new Map<string, number>();
    for (const e of entries) monthTotals.set(e.month, (monthTotals.get(e.month) ?? 0) + e.spentTime);
    const months = [...monthTotals.keys()].sort();
    let cum = 0;
    return months.map(month => {
      cum += monthTotals.get(month)!;
      return { month: month.slice(0, 7), consumed: Math.round(cum * 10) / 10, budget: totalBudgetHours };
    });
  }, [entries, totalBudgetHours]);

  // ── Forecast tab data ──────────────────────────────────────────────────────

  const linkedForecastScenarios = useMemo(() => {
    const result: Array<{ forecast: Forecast; forecastProjectId: string; forecastProjectName: string }> = [];
    for (const fc of forecasts) {
      for (const fp of fc.projects) {
        if (fp.fmoProjectId === project.id) {
          result.push({ forecast: fc, forecastProjectId: fp.id, forecastProjectName: fp.name });
        }
      }
    }
    return result;
  }, [forecasts, project.id]);

  // Per-project planned hours: key → month → hours
  const plannedByMonthByProject = useMemo(() => {
    const result = new Map<string, Map<string, number>>();
    for (const { forecast: fc, forecastProjectId, forecastProjectName } of linkedForecastScenarios) {
      const key = `p_${forecastProjectId}`;
      const monthMap = new Map<string, number>();
      for (const asgn of fc.assignments.filter(a => a.projectId === forecastProjectId)) {
        for (const [month, hours] of Object.entries(asgn.plannedHours)) {
          monthMap.set(month, (monthMap.get(month) ?? 0) + hours);
        }
      }
      result.set(key, monthMap);
    }
    return result;
  }, [linkedForecastScenarios]);

  // Forecast project display metadata (key, label, colour)
  const forecastProjectKeys = useMemo(() =>
    linkedForecastScenarios.map(({ forecast: fc, forecastProjectId, forecastProjectName }, i) => ({
      key: `p_${forecastProjectId}`,
      label: linkedForecastScenarios.length > 1
        ? `${fc.name} → ${forecastProjectName}`
        : 'Planned',
      color: COLORS[(i + 1) % COLORS.length], // offset from 0 so planned colours don't clash with actual/line indigo
    }))
  , [linkedForecastScenarios]);

  // Total planned per month (sum across all projects — used for avg3m extension + retrospective)
  const plannedByMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const monthMap of plannedByMonthByProject.values()) {
      for (const [month, hours] of monthMap) {
        map.set(month, (map.get(month) ?? 0) + hours);
      }
    }
    return map;
  }, [plannedByMonthByProject]);

  const actualByMonthAll = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      if (dashboardRange.from && e.month < dashboardRange.from) continue;
      if (dashboardRange.to   && e.month > dashboardRange.to)   continue;
      map.set(e.month, (map.get(e.month) ?? 0) + e.spentTime);
    }
    return map;
  }, [entries, dashboardRange]);

  const lastActualMonth = useMemo(() => {
    const months = [...actualByMonthAll.keys()].sort();
    return months.length > 0 ? months[months.length - 1] : null;
  }, [actualByMonthAll]);

  const combinedChartData = useMemo(() => {
    const allMonths = [...new Set([...actualByMonthAll.keys(), ...plannedByMonth.keys()])].sort();
    return allMonths.map((m, idx) => {
      const isActual = !lastActualMonth || m <= lastActualMonth;
      const actual   = isActual ? (actualByMonthAll.get(m) ?? null) : null;

      // Per-project planned bars (only for future months)
      const perProject: Record<string, number | null> = {};
      for (const [key, monthMap] of plannedByMonthByProject) {
        perProject[key] = !isActual ? (monthMap.get(m) ?? null) : null;
      }

      // 3M avg extends across both actual and planned
      const slice = allMonths.slice(Math.max(0, idx - 2), idx + 1);
      const avg3m = Math.round(
        slice.reduce((s, am) => s + ((!lastActualMonth || am <= lastActualMonth)
          ? (actualByMonthAll.get(am) ?? 0)
          : (plannedByMonth.get(am) ?? 0)), 0)
        / slice.length * 10
      ) / 10;

      return { month: m.slice(0, 7), actual, ...perProject, avg3m };
    });
  }, [actualByMonthAll, plannedByMonthByProject, plannedByMonth, lastActualMonth]);

  const retroData = useMemo(() => {
    return [...plannedByMonth.keys()]
      .filter(m => actualByMonthAll.has(m))
      .sort()
      .map(m => ({
        month: m.slice(0, 7),
        planned: plannedByMonth.get(m) ?? 0,
        actual: actualByMonthAll.get(m) ?? 0,
      }));
  }, [plannedByMonth, actualByMonthAll]);

  // Cumulative actual (solid line) + projected (dashed line from last actual onward)
  const cumulativeData = useMemo(() => {
    const allMonths = [...new Set([...actualByMonthAll.keys(), ...plannedByMonth.keys()])].sort();
    let cumA = 0; let cumP = 0;
    return allMonths.map(m => {
      const isActual = !lastActualMonth || m <= lastActualMonth;
      if (isActual) cumA += actualByMonthAll.get(m) ?? 0;
      else          cumP += plannedByMonth.get(m) ?? 0;
      return {
        month: m.slice(0, 7),
        cumActual:    isActual ? cumA : null,
        cumProjected: !isActual ? (cumA + cumP) : null,
      };
    });
  }, [actualByMonthAll, plannedByMonth, lastActualMonth]);

  // Per-ticket actual hours in retro months: ticketLabel → month → hours
  const actualByTicketMonth = useMemo(() => {
    const result = new Map<string, Map<string, number>>();
    for (const e of entries) {
      if (dashboardRange.from && e.month < dashboardRange.from) continue;
      if (dashboardRange.to   && e.month > dashboardRange.to)   continue;
      const label = e.ticketName || (e.ticketId != null ? `#${e.ticketId}` : 'No ticket');
      if (!result.has(label)) result.set(label, new Map());
      result.get(label)!.set(e.month, (result.get(label)!.get(e.month) ?? 0) + e.spentTime);
    }
    return result;
  }, [entries, dashboardRange]);

  // Top 8 tickets by total hours in retro months; rest collapsed into "Other"
  const retroTicketSlices = useMemo(() => {
    const retroMonths = new Set(retroData.map(r => r.month));
    const totals = [...actualByTicketMonth.entries()]
      .map(([label, mm]) => ({
        label,
        total: [...mm.entries()].filter(([m]) => retroMonths.has(m)).reduce((s, [, h]) => s + h, 0),
      }))
      .filter(t => t.total > 0)
      .sort((a, b) => b.total - a.total);

    const top   = totals.slice(0, 8);
    const other = totals.slice(8);
    return { top, hasOther: other.length > 0 };
  }, [actualByTicketMonth, retroData]);

  // Retro chart: planned by ForecastProject, actual by ticket
  const retroBreakdownData = useMemo(() =>
    retroData.map(r => {
      const entry: Record<string, string | number | null> = { month: r.month };
      // Planned — one segment per linked forecast project
      for (const { key } of forecastProjectKeys) {
        entry[`plan_${key}`] = plannedByMonthByProject.get(key)?.get(r.month) ?? null;
      }
      // Actual — one segment per top ticket, one for "Other"
      let otherHours = 0;
      for (const [label, mm] of actualByTicketMonth) {
        const isTop = retroTicketSlices.top.some(t => t.label === label);
        const h = mm.get(r.month) ?? 0;
        if (isTop) entry[`act_${label}`] = h || null;
        else       otherHours += h;
      }
      if (retroTicketSlices.hasOther) entry['act_Other'] = otherHours || null;
      return entry;
    })
  , [retroData, forecastProjectKeys, plannedByMonthByProject, actualByTicketMonth, retroTicketSlices]);

  // Pie chart: total planned hours per linked forecast project
  const forecastPieData = useMemo(() =>
    forecastProjectKeys.map(({ key, label, color }) => ({
      name: label,
      value: [...(plannedByMonthByProject.get(key)?.values() ?? [])].reduce((s, h) => s + h, 0),
      color,
    })).filter(d => d.value > 0)
  , [forecastProjectKeys, plannedByMonthByProject]);

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview',   label: 'Overview' },
    { id: 'team',       label: 'Team' },
    { id: 'tickets',    label: 'Tickets' },
    { id: 'trends',     label: 'Trends' },
    ...(isClientProject ? [{ id: 'financials' as Tab, label: 'Financials' }] : []),
    ...(isClientProject && projType === 'fixprice' ? [{ id: 'milestones' as Tab, label: 'Milestones' }] : []),
    { id: 'forecast',   label: 'Forecast' },
    { id: 'settings',   label: 'Settings' },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-6xl">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link href="/fmo/projects" className="text-slate-400 hover:text-slate-600 text-sm">← Projects</Link>
          <span className="text-slate-300">/</span>
          <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
            !isClientProject
              ? 'bg-slate-100 border-slate-200 text-slate-600'
              : projType === 'tm'
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-violet-50 border-violet-200 text-violet-700'
          }`}>
            {!isClientProject
              ? ({ internal: 'Internal', presales: 'Pre-Sales', training: 'Training', portfolio: 'Portfolio' } as Record<string, string>)[projCategory] ?? projCategory
              : projType === 'tm' ? 'T&M' : 'Fixed Price'}
          </span>
        </div>
        {project.description && <p className="text-sm text-slate-500">{project.description}</p>}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {project.wbsCodes.map(code => (
            <span key={code} className={`text-xs px-2 py-0.5 rounded-full font-mono border ${
              code.startsWith('V.') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              {code}{wbs[code]?.label && <span className="ml-1 font-sans font-normal">{wbs[code].label}</span>}
            </span>
          ))}
          {(project.ticketIds ?? []).length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full border bg-indigo-50 border-indigo-200 text-indigo-600">
              +{project.ticketIds.length} tickets
            </span>
          )}
        </div>
      </div>

      {/* Period filter for KPI cards */}
      {(() => {
        const now     = new Date();
        const year    = now.getFullYear();
        const mo      = String(now.getMonth() + 1).padStart(2, '0');
        const ytdFrom = `${year}-01`;
        const ytdTo   = `${year}-${mo}`;

        function mo_(n: number) {
          const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }

        const isYtd     = dashboardRange.from === ytdFrom && dashboardRange.to === ytdTo;
        const isAllTime = dashboardRange.from === '' && dashboardRange.to === '';
        const is3m      = dashboardRange.from === mo_(-3) && dashboardRange.to === mo_(0);
        const is6m      = dashboardRange.from === mo_(-6) && dashboardRange.to === mo_(0);
        const is12m     = dashboardRange.from === mo_(-12) && dashboardRange.to === mo_(0);
        const isCustom  = !isYtd && !isAllTime && !is3m && !is6m && !is12m;

        const btnCls = (active: boolean) =>
          `text-xs px-2.5 py-1 rounded border transition-colors ${
            active
              ? 'bg-slate-800 text-white border-slate-800'
              : 'text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700'
          }`;

        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400 shrink-0">Period</span>
            <div className="flex gap-1">
              <button onClick={() => setDashboardRange({ from: ytdFrom, to: ytdTo })} className={btnCls(isYtd)}>
                This Year
              </button>
              <button onClick={() => setDashboardRange({ from: mo_(-3), to: mo_(0) })} className={btnCls(is3m)}>
                Last 3 Months
              </button>
              <button onClick={() => setDashboardRange({ from: mo_(-6), to: mo_(0) })} className={btnCls(is6m)}>
                Last 6 Months
              </button>
              <button onClick={() => setDashboardRange({ from: mo_(-12), to: mo_(0) })} className={btnCls(is12m)}>
                Last 12 Months
              </button>
              <button onClick={() => setDashboardRange({ from: '', to: '' })} className={btnCls(isAllTime)}>
                All Time
              </button>
            </div>
            {/* Custom date pickers — hidden when All Time is active */}
            {!isAllTime && (
              <div className="flex items-center gap-1.5">
                <input type="month" value={dashboardRange.from}
                  onChange={e => setDashboardRange(r => ({ ...r, from: e.target.value, to: r.to || e.target.value }))}
                  className="border border-slate-200 rounded px-2 py-1 text-xs text-slate-600 focus:outline-none focus:border-slate-400" />
                <span className="text-slate-300 text-xs">→</span>
                <input type="month" value={dashboardRange.to} min={dashboardRange.from}
                  onChange={e => setDashboardRange(r => ({ ...r, to: e.target.value }))}
                  className="border border-slate-200 rounded px-2 py-1 text-xs text-slate-600 focus:outline-none focus:border-slate-400" />
              </div>
            )}
            {isCustom && (
              <button onClick={() => setDashboardRange({ from: ytdFrom, to: ytdTo })}
                className="text-xs text-slate-400 hover:text-slate-700 underline underline-offset-2">
                This Year
              </button>
            )}
          </div>
        );
      })()}

      {/* KPI cards — layout depends on category + project type */}
      {!isClientProject ? (
        // ── Non-billable: Total Hours | Top Contributor | Total Cost ──────────
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(() => {
            const topMember = memberSummary[0];
            return [
              {
                label: 'Total Hours',
                value: fmtH(totalHours, locale),
                sub: `${memberSummary.length} members · ${ticketSummary.length} tickets`,
                cls: 'text-slate-800',
              },
              {
                label: 'Top Contributor',
                value: topMember?.member.name ?? '—',
                sub: topMember ? fmtH(topMember.hours, locale) : undefined,
                cls: 'text-slate-800',
              },
              {
                label: 'Total Cost',
                value: hasCostRates && totalEconAll.cost > 0 ? fmtEur(totalEconAll.cost) : '—',
                sub: !hasCostRates ? 'Set cost rates in member profiles' : undefined,
                cls: 'text-red-600',
              },
            ];
          })().map(kpi => (
            <div key={kpi.label} className="bg-white rounded-lg border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-400 mb-1">{kpi.label}</p>
              <p className={`text-xl font-bold truncate ${kpi.cls}`}>{kpi.value}</p>
              {kpi.sub && <p className="text-xs text-slate-400">{kpi.sub}</p>}
            </div>
          ))}
        </div>
      ) : projType === 'fixprice' ? (
        // ── Fixed Price: Contract Value vs Cost Hours ──────────────────────────
        <div className="space-y-3">
          {/* Row 1: Hours progress */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(() => {
              const approvedChanges    = (project.changes ?? []).filter(c => c.status === 'approved');
              const changeHours        = approvedChanges.reduce((s, c) => s + c.budgetHours, 0);
              const baseHours          = project.budgetHours ?? 0;
              const remaining          = totalBudgetHours > 0 ? totalBudgetHours - totalHours : null;
              const burnPct            = totalBudgetHours > 0 ? Math.round(totalHours / totalBudgetHours * 100) : null;
              const overBudget         = remaining !== null && remaining < 0;

              return [
                {
                  label: 'Hours Used',
                  value: fmtH(totalHours, locale),
                  sub: `${memberSummary.length} members · ${ticketSummary.length} tickets`,
                  cls: 'text-slate-800',
                },
                {
                  label: 'Budget Hours',
                  value: totalBudgetHours > 0 ? fmtH(totalBudgetHours, locale) : '—',
                  sub: approvedChanges.length > 0
                    ? `${fmtH(baseHours, locale)} base + ${fmtH(changeHours, locale)} changes`
                    : burnPct !== null ? `${burnPct}% used` : undefined,
                  cls: 'text-slate-800',
                },
                {
                  label: 'Hours Remaining',
                  value: remaining !== null ? fmtH(Math.abs(remaining), locale) : '—',
                  sub: overBudget ? 'over budget' : remaining !== null ? 'left' : undefined,
                  cls: overBudget ? 'text-red-500' : 'text-slate-800',
                },
                {
                  label: 'Budget Used',
                  value: burnPct !== null ? `${burnPct}%` : '—',
                  sub: burnPct !== null ? `${fmtH(totalHours, locale)} of ${fmtH(totalBudgetHours, locale)}` : undefined,
                  cls: burnPct !== null && burnPct > 100 ? 'text-red-500' : burnPct !== null && burnPct >= 80 ? 'text-amber-600' : 'text-slate-800',
                },
              ];
            })().map(kpi => (
              <div key={kpi.label} className="bg-white rounded-lg border border-slate-200 px-4 py-3">
                <p className="text-xs text-slate-400 mb-1">{kpi.label}</p>
                <p className={`text-xl font-bold ${kpi.cls}`}>{kpi.value}</p>
                {kpi.sub && <p className="text-xs text-slate-400">{kpi.sub}</p>}
              </div>
            ))}
          </div>
          {/* Row 2: Contract value vs actual cost */}
          {(hasCostRates || totalBudgetEur > 0) && (() => {
            const baseEur       = project.budgetEur ?? 0;
            const approvedChg   = (project.changes ?? []).filter(c => c.status === 'approved');
            const pendingChg    = (project.changes ?? []).filter(c => c.status === 'pending');
            const changeEur     = approvedChg.reduce((s, c) => s + c.budgetEur, 0);
            const contractValue = totalBudgetEur; // base + approved
            const actualCost    = totalEconAll.cost;
            const netProfit     = contractValue > 0 ? contractValue - actualCost : null;
            const margin        = contractValue > 0 && netProfit !== null
              ? Math.round(netProfit / contractValue * 100) : null;

            return (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">

                {/* Base contract */}
                <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
                  <p className="text-xs text-slate-400 mb-1">Base Contract</p>
                  <p className="text-xl font-bold text-emerald-700">{baseEur > 0 ? fmtEur(baseEur) : '—'}</p>
                </div>

                {/* Change Orders — always visible so the relationship is clear */}
                <div className={`rounded-lg border px-4 py-3 ${changeEur > 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200'}`}>
                  <p className="text-xs text-slate-400 mb-1">Change Orders</p>
                  <p className={`text-xl font-bold ${changeEur > 0 ? 'text-indigo-700' : 'text-slate-300'}`}>
                    {changeEur > 0 ? `+${fmtEur(changeEur)}` : '—'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {approvedChg.length > 0 && `${approvedChg.length} approved`}
                    {approvedChg.length > 0 && pendingChg.length > 0 && ' · '}
                    {pendingChg.length > 0 && `${pendingChg.length} pending`}
                    {approvedChg.length === 0 && pendingChg.length === 0 && 'none yet'}
                  </p>
                </div>

                {/* Cost so far */}
                <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
                  <p className="text-xs text-slate-400 mb-1">Cost so far</p>
                  <p className="text-xl font-bold text-red-600">{actualCost > 0 ? fmtEur(actualCost) : '—'}</p>
                </div>

                {/* Net Profit */}
                <div className={`rounded-lg border px-4 py-3 ${netProfit === null ? 'bg-white border-slate-200' : netProfit >= 0 ? 'bg-emerald-50/50 border-emerald-200' : 'bg-red-50/50 border-red-200'}`}>
                  <p className="text-xs text-slate-400 mb-1">Net Profit</p>
                  <p className={`text-xl font-bold ${netProfit === null ? 'text-slate-300' : netProfit >= 0 ? 'text-emerald-700' : 'text-red-500'}`}>
                    {netProfit !== null ? `${netProfit >= 0 ? '+' : ''}${fmtEur(netProfit)}` : '—'}
                  </p>
                  {contractValue > 0 && (
                    <p className="text-xs text-slate-400 mt-0.5">of {fmtEur(contractValue)}</p>
                  )}
                </div>

                {/* Margin */}
                <div className={`rounded-lg border px-4 py-3 ${margin === null ? 'bg-white border-slate-200' : margin >= 0 ? 'bg-emerald-50/50 border-emerald-200' : 'bg-red-50/50 border-red-200'}`}>
                  <p className="text-xs text-slate-400 mb-1">Margin</p>
                  <p className={`text-xl font-bold ${margin === null ? 'text-slate-300' : margin >= 0 ? 'text-emerald-700' : 'text-red-500'}`}>
                    {margin !== null ? `${margin}%` : '—'}
                  </p>
                </div>

              </div>
            );
          })()}
        </div>
      ) : (
        // ── Time & Material: hours + per-member billing ────────────────────────
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Hours',   value: fmtH(totalHours, locale) },
              { label: 'Development',   value: fmtH(devHoursAll, locale), sub: totalHours > 0 ? `${Math.round(devHoursAll / totalHours * 100)}%` : undefined },
              { label: 'Operations',    value: fmtH(opsHoursAll, locale), sub: totalHours > 0 ? `${Math.round(opsHoursAll / totalHours * 100)}%` : undefined },
              { label: 'Billable Share', value: totalHours > 0 ? `${Math.round(billableHours / totalHours * 100)}%` : '—', sub: `${memberSummary.length} members · ${ticketSummary.length} tickets` },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white rounded-lg border border-slate-200 px-4 py-3">
                <p className="text-xs text-slate-400 mb-1">{kpi.label}</p>
                <p className="text-xl font-bold text-slate-800">{kpi.value}</p>
                {kpi.sub && <p className="text-xs text-slate-400">{kpi.sub}</p>}
              </div>
            ))}
          </div>
          {(hasRates || hasCostRates) && (
            <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: 'Total Cost',
                  value: totalEconAll.cost > 0 ? fmtEur(totalEconAll.cost) : '—',
                  cls: 'text-red-600',
                  sub: totalEconAll.cost > 0 && totalEconAll.opsCost > 0
                    ? `Dev ${fmtEur(totalEconAll.devCost)} · Ops ${fmtEur(totalEconAll.opsCost)}`
                    : null,
                },
                {
                  label: 'Total Revenue',
                  value: totalEconAll.revenue > 0 ? fmtEur(totalEconAll.revenue) : '—',
                  cls: 'text-emerald-700',
                  sub: totalEconAll.revenue > 0 && totalEconAll.opsRevenue > 0
                    ? `Dev ${fmtEur(totalEconAll.devRevenue)} · Ops ${fmtEur(totalEconAll.opsRevenue)}`
                    : null,
                },
                {
                  label: 'Profit and Loss',
                  value: totalEconAll.revenue > 0 ? fmtEur(totalEconAll.pl) : '—',
                  cls: totalEconAll.pl >= 0 ? 'text-emerald-700' : 'text-red-500',
                  sub: totalEconAll.revenue > 0 && totalEconAll.opsRevenue > 0
                    ? `Dev ${fmtEur(totalEconAll.devPl)} · Ops ${fmtEur(totalEconAll.opsPl)}`
                    : null,
                },
                {
                  label: 'Margin',
                  value: totalEconAll.revenue > 0 ? `${marginAll}%` : '—',
                  cls: marginAll >= 0 ? 'text-emerald-700' : 'text-red-500',
                  sub: null,
                },
              ].map(kpi => (
                <div key={kpi.label} className="bg-white rounded-lg border border-slate-200 px-4 py-3">
                  <p className="text-xs text-slate-400 mb-1">{kpi.label}</p>
                  <p className={`text-xl font-bold ${kpi.cls}`}>{kpi.value}</p>
                  {kpi.sub && <p className="text-xs text-slate-400 mt-1">{kpi.sub}</p>}
                </div>
              ))}
            </div>

            {/* Dev vs Ops breakdown table */}
            {(hasRates || hasCostRates) && totalEconAll.opsRevenue > 0 && (
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Dev vs Operations — Cost &amp; Revenue Breakdown</p>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-500">
                      <th className="text-left px-4 py-2 font-medium">Bucket</th>
                      <th className="text-right px-4 py-2 font-medium">Cost</th>
                      <th className="text-right px-4 py-2 font-medium">Revenue</th>
                      <th className="text-right px-4 py-2 font-medium">P&amp;L</th>
                      <th className="text-right px-4 py-2 font-medium">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {[
                      { label: 'Development', cost: totalEconAll.devCost, revenue: totalEconAll.devRevenue, pl: totalEconAll.devPl },
                      { label: 'Operations',  cost: totalEconAll.opsCost, revenue: totalEconAll.opsRevenue, pl: totalEconAll.opsPl },
                    ].map(r => {
                      const margin = r.cost === 0 ? null : r.revenue === 0 ? -100 : Math.round(r.pl / r.revenue * 100);
                      return (
                        <tr key={r.label} className="hover:bg-slate-50/40">
                          <td className="px-4 py-2 font-medium text-slate-700">{r.label}</td>
                          <td className="px-4 py-2 text-right text-slate-600">{r.cost > 0 ? fmtEur(r.cost) : '—'}</td>
                          <td className="px-4 py-2 text-right text-emerald-700">{r.revenue > 0 ? fmtEur(r.revenue) : '—'}</td>
                          <td className={`px-4 py-2 text-right font-semibold ${r.pl >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                            {r.revenue > 0 ? `${r.pl >= 0 ? '+' : ''}${fmtEur(r.pl)}` : '—'}
                          </td>
                          <td className={`px-4 py-2 text-right ${margin === null ? 'text-slate-300' : margin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {margin !== null ? `${margin}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-xs">
                      <td className="px-4 py-2 text-slate-600">Total</td>
                      <td className="px-4 py-2 text-right text-slate-600">{fmtEur(totalEconAll.cost)}</td>
                      <td className="px-4 py-2 text-right text-emerald-700">{fmtEur(totalEconAll.revenue)}</td>
                      <td className={`px-4 py-2 text-right ${totalEconAll.pl >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {totalEconAll.pl >= 0 ? '+' : ''}{fmtEur(totalEconAll.pl)}
                      </td>
                      <td className={`px-4 py-2 text-right ${marginAll >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {totalEconAll.revenue > 0 ? `${marginAll}%` : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            </>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id ? 'border-slate-700 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {isClientProject && (project.operationContracts ?? []).length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Operations Contracts</p>
              </div>
              <div className="divide-y divide-slate-100">
                {(project.operationContracts ?? []).map(c => (
                  <div key={c.id} className="flex items-center gap-4 px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${c.type === 'fixprice' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}>
                      {c.type === 'fixprice' ? 'Pauschal' : 'Per Hour'}
                    </span>
                    <span className="text-sm font-medium text-slate-800 flex-1">{c.name}</span>
                    <span className="text-xs text-slate-400">{c.ticketIds.length} tickets</span>
                    {c.type === 'fixprice' && (
                      <span className="text-sm font-semibold text-slate-700">{fmtEur(c.defaultMonthlyAmount)}/mo</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Team at a Glance</p>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-400 font-medium">
                <tr>
                  <th className="px-5 py-2 text-left">Member</th>
                  <th className="px-4 py-2 text-right">Dev h</th>
                  <th className="px-4 py-2 text-right">Ops h</th>
                  <th className="px-4 py-2 text-right">Total h</th>
                  {!isClientProject && hasCostRates && <th className="px-4 py-2 text-right">Cost</th>}
                  {isClientProject && hasRates && <th className="px-4 py-2 text-right">Revenue</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {memberSummary.map(({ member, tmHours, opsHours, hours, cost, revenue }) => (
                  <tr key={member.id} className="hover:bg-slate-50">
                    <td className="px-5 py-2">
                      <div className="flex items-center gap-2">
                        <Link href={`/fmo/members/${member.id}`} className="text-indigo-600 hover:text-indigo-800 font-medium">{member.name}</Link>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${member.type === 'intern' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>{member.type}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-600">{tmHours > 0 ? fmtH(tmHours, locale) : '—'}</td>
                    <td className={`px-4 py-2 text-right ${opsHours > 0 ? 'text-violet-600 font-medium' : 'text-slate-400'}`}>{opsHours > 0 ? fmtH(opsHours, locale) : '—'}</td>
                    <td className="px-4 py-2 text-right font-medium text-slate-800">{fmtH(hours, locale)}</td>
                    {!isClientProject && hasCostRates && <td className="px-4 py-2 text-right text-red-600">{cost > 0 ? fmtEur(cost) : '—'}</td>}
                    {isClientProject && hasRates && <td className="px-4 py-2 text-right text-slate-700">{revenue > 0 ? fmtEur(revenue) : '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TEAM ── */}
      {activeTab === 'team' && (
        <div className="space-y-4">
          {isAdmin && showBillingCols && (
            <p className="text-xs text-slate-400">Set per-project billing rates below. Cost rates come from each member's profile.</p>
          )}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-medium">
                <tr>
                  <th className="px-4 py-3 text-left">Member</th>
                  <th className="px-4 py-3 text-right">Development Hours</th>
                  <th className="px-4 py-3 text-right">Operations Hours</th>
                  <th className="px-4 py-3 text-right">Cost Rate</th>
                  {showBillingCols && <th className="px-4 py-3 text-right">Billing Rate</th>}
                  <th className="px-4 py-3 text-right">Total Cost (€)</th>
                  {showBillingCols && <th className="px-4 py-3 text-right">Revenue (€)</th>}
                  {showBillingCols && <th className="px-4 py-3 text-right">Margin</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {memberSummary.map(({ member, tmHours, opsHours, fixOpsHours, cost, revenue }) => {
                  const revRounded  = Math.round(revenue);
                  const rowMargin   = cost === 0 ? null : revRounded === 0 ? -100 : Math.round((revRounded - cost) / revRounded * 100);
                  const billingRate = (project.memberRates ?? {})[member.id]?.billingRate ?? 0;
                  return (
                    <tr key={member.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Link href={`/fmo/members/${member.id}`} className="text-indigo-600 hover:text-indigo-800 font-medium">{member.name}</Link>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${member.type === 'intern' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}`}>{member.type}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{tmHours > 0 ? fmtH(tmHours, locale) : '—'}</td>
                      <td className={`px-4 py-2.5 text-right ${opsHours > 0 ? 'text-violet-600 font-medium' : 'text-slate-400'}`}>{opsHours > 0 ? fmtH(opsHours, locale) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500 text-xs">{member.costRate > 0 ? `${member.costRate} €/h` : '—'}</td>
                      {showBillingCols && (
                        <td className="px-4 py-2.5 text-right">
                          {isAdmin ? (
                            <input type="number" min="0" step="0.5"
                              defaultValue={billingRate || ''}
                              placeholder="—"
                              className="w-20 text-right border-0 border-b border-slate-200 bg-transparent text-sm focus:outline-none focus:border-indigo-400"
                              onBlur={async e => {
                                const val = parseFloat(e.target.value) || 0;
                                await setProjectMemberRate(project.id, member.id, val);
                                router.refresh();
                              }}
                            />
                          ) : (
                            <span className="text-slate-700 text-sm">{billingRate > 0 ? `${billingRate} €/h` : '—'}</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-right text-slate-700">{cost > 0 ? fmtEur(cost) : '—'}</td>
                      {showBillingCols && (
                        <td className="px-4 py-2.5 text-right">
                          {revRounded > 0 ? fmtEur(revRounded) : '—'}
                        </td>
                      )}
                      {showBillingCols && (
                        <td className={`px-4 py-2.5 text-right text-sm font-medium ${
                          rowMargin !== null ? (rowMargin >= 0 ? 'text-emerald-600' : 'text-red-500') : 'text-slate-400'
                        }`}>
                          {rowMargin !== null ? `${rowMargin}%` : '—'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {memberSummary.length > 0 && (
                <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-medium text-sm">
                  <tr>
                    <td className="px-4 py-2.5 text-slate-700">Total</td>
                    <td className="px-4 py-2.5 text-right text-slate-800">{fmtH(devHoursAll, locale)}</td>
                    <td className="px-4 py-2.5 text-right text-violet-600">{opsHoursAll > 0 ? fmtH(opsHoursAll, locale) : '—'}</td>
                    <td colSpan={showBillingCols ? 2 : 1} />
                    <td className="px-4 py-2.5 text-right text-slate-800">{totalEconAll.cost > 0 ? fmtEur(totalEconAll.cost) : '—'}</td>
                    {showBillingCols && <td className="px-4 py-2.5 text-right text-slate-800">{totalEconAll.revenue > 0 ? fmtEur(totalEconAll.revenue) : '—'}</td>}
                    {showBillingCols && (
                      <td className={`px-4 py-2.5 text-right ${totalEconAll.revenue > 0 ? (marginAll >= 0 ? 'text-emerald-600' : 'text-red-500') : 'text-slate-400'}`}>
                        {totalEconAll.revenue > 0 ? `${marginAll}%` : '—'}
                      </td>
                    )}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {showBillingCols && devHoursAll > 0 && (!hasCostRates || !hasRates) && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-1">
              {!hasCostRates && !hasRates && (
                <p className="text-xs text-amber-800 font-medium">
                  No cost rates or billing rates configured for this project.
                </p>
              )}
              {!hasCostRates && hasRates && (
                <p className="text-xs text-amber-800 font-medium">
                  Cost rates are missing — the Cost column shows "—".
                </p>
              )}
              {hasCostRates && !hasRates && (
                <p className="text-xs text-amber-800 font-medium">
                  No billing rates set — Revenue and Margin show "—".
                </p>
              )}
              <p className="text-xs text-amber-700">
                {!hasCostRates && 'Set cost rates in each member\'s profile. '}
                {!hasRates && 'Set per-project billing rates in the Billing Rate column above.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── TICKETS ── */}
      {activeTab === 'tickets' && (
        <div className="space-y-4">
          {hasOps && (
            <div className="flex gap-3 text-xs">
              <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 text-slate-600"><span className="w-2 h-2 rounded-full bg-slate-400 inline-block" /> Development / T&M</span>
              <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-violet-50 text-violet-600"><span className="w-2 h-2 rounded-full bg-violet-400 inline-block" /> Operations (Pauschal)</span>
              <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-50 text-blue-600"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Operations (Per Hour)</span>
            </div>
          )}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-medium">
                <tr>
                  <th className="px-4 py-3 text-left">Ticket</th>
                  <th className="px-4 py-3 text-left">WBS</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-right">Hours</th>
                  <th className="px-4 py-3 text-right">%</th>
                  <th className="px-4 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {ticketSummary.map(tk => {
                  const isFixOps   = typeof tk.id === 'number' && fixOpsTicketSet.has(tk.id as number);
                  const isHrOps    = typeof tk.id === 'number' && !isFixOps && allOpsTicketSet.has(tk.id as number);
                  const isExpanded = expandedTickets.has(tk.id);
                  const monthly    = ticketMonthly.get(tk.id);
                  return (
                    <Fragment key={String(tk.id)}>
                      <tr
                        className={`hover:bg-slate-50 cursor-pointer ${isFixOps ? 'bg-violet-50/30' : ''}`}
                        onClick={() => setExpandedTickets(prev => {
                          const next = new Set(prev);
                          if (next.has(tk.id)) next.delete(tk.id); else next.add(tk.id);
                          return next;
                        })}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {typeof tk.id === 'number' && (
                              <Link href={`/fmo/tickets/${tk.id}`} onClick={e => e.stopPropagation()} className="font-mono text-xs text-indigo-600 hover:text-indigo-800 shrink-0">#{tk.id}</Link>
                            )}
                            <span className="text-slate-700 truncate max-w-sm" title={tk.name}>{tk.name}</span>
                            {isFixOps && <span className="text-xs px-1.5 py-0.5 rounded bg-violet-100 text-violet-600 shrink-0">Pauschal Ops</span>}
                            {isHrOps  && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 shrink-0">Ops / Hr</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{tk.wbsCode ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${tk.billingClass === 'V' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                            {tk.billingClass === 'V' ? 'Billable' : 'Internal'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-700">{fmtH(tk.hours, locale)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-400 text-xs">{totalHours > 0 ? `${Math.round(tk.hours / totalHours * 100)}%` : '—'}</td>
                        <td className="px-4 py-2.5 text-center text-slate-400">
                          <svg className={`w-3.5 h-3.5 mx-auto transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </td>
                      </tr>
                      {isExpanded && monthly && (() => {
                        let cum = 0;
                        const bars = [...monthly.entries()]
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([month, hours]) => { cum += hours; return { month: month.slice(0, 7), hours, cumulative: Math.round(cum * 10) / 10 }; });
                        return (
                          <tr className="bg-indigo-50/30">
                            <td colSpan={6} className="px-6 py-4">
                              <ResponsiveContainer width="100%" height={160}>
                                <ComposedChart data={bars} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                                  <XAxis dataKey="month" tick={{ fontSize: 9 }} interval={0} angle={-35} textAnchor="end" height={36} />
                                  <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${v}h`} width={32} />
                                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [typeof v === 'number' ? fmtH(v, locale) : v, name === 'cumulative' ? 'Cumulative' : 'Monthly']} />
                                  <Bar dataKey="hours" fill="#6366f1" radius={[3, 3, 0, 0]} opacity={0.5} name="Monthly" />
                                  <Line type="monotone" dataKey="cumulative" stroke="#4338ca" strokeWidth={2} dot={{ r: 2, fill: '#4338ca' }} name="Cumulative" />
                                </ComposedChart>
                              </ResponsiveContainer>
                            </td>
                          </tr>
                        );
                      })()}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                <tr>
                  <td colSpan={3} className="px-4 py-2.5 font-medium text-slate-700">Total</td>
                  <td className="px-4 py-2.5 text-right font-bold text-slate-800">{fmtH(totalHours, locale)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500 text-xs">100%</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── TRENDS ── */}
      {activeTab === 'trends' && (
        <div className="space-y-6">

          {/* Velocity */}
          {velocityData.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Velocity & 3-Month Average</h3>
              <p className="text-xs text-gray-400 mb-4">Monthly hours (bars) · 3-month rolling average (line)</p>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={velocityData} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}h`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={v => typeof v === 'number' ? fmtH(v, locale) : v} />
                  <Bar dataKey="hours" fill="#dde1ff" name="Monthly Hours" radius={[3,3,0,0]} opacity={0.9} />
                  <Line type="monotone" dataKey="avg3m" stroke="#4338ca" strokeWidth={2} dot={{ r: 3 }} name="3M Avg" />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2">
                <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-200 inline-block" /> Monthly Hours</span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-4 border-t-2 border-indigo-700 inline-block" /> 3M Avg</span>
              </div>
            </div>
          )}

          {/* Dev vs Operations */}
          {hasOps && devVsOpsData.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Development vs Operations — Monthly Hours</h3>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={devVsOpsData} margin={{ top: 4, right: 40, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis yAxisId="left"  tick={{ fontSize: 11 }} tickFormatter={v => `${v}h`} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => name === 'Ops %' ? [`${v}%`, 'Operations share'] : [fmtH(Number(v), locale), String(name)]} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar yAxisId="left" dataKey="Development" stackId="a" fill="#4338ca" opacity={0.85} radius={[0,0,0,0]} />
                  <Bar yAxisId="left" dataKey="Operations"  stackId="a" fill="#7c3aed" opacity={0.85} radius={[3,3,0,0]} />
                  <Line yAxisId="right" type="monotone" dataKey="Ops %" stroke="#a16207" strokeWidth={1.5} strokeDasharray="4 2" dot={{ r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2">
                <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-700 inline-block" /> Development</span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-sm bg-violet-600 inline-block" /> Operations</span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-4 border-t-2 border-dashed border-yellow-700 inline-block" /> Ops %</span>
              </div>
            </div>
          )}

          {/* Category stacked bar */}
          {categoryData.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Monthly Hours by Category</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={categoryData} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}h`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={v => typeof v === 'number' ? fmtH(v, locale) : v} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  {categoryKeys.map((cat, i) => (
                    <Bar key={cat} dataKey={cat} stackId="a" fill={COLORS[i % COLORS.length]} opacity={0.88} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Monthly by member */}
          {monthlyByMember.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Monthly Hours by Member (Top 5)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyByMember} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}h`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={v => typeof v === 'number' ? fmtH(v, locale) : v} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  {topMembers.map((name, i) => (
                    <Bar key={name} dataKey={name} stackId="a" fill={COLORS[i % COLORS.length]} opacity={0.88} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Cost vs Revenue */}
          {economicsByMonth.length > 0 && (hasRates || hasCostRates) && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Cost vs Revenue per Month</h3>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={economicsByMonth} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [fmtEur(Number(v)), String(name)]} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="cost"      fill="#b91c1c" opacity={0.8}  name="Cost"        radius={[3,3,0,0]} />
                  <Bar dataKey="tmRevenue" fill="#0f766e" opacity={0.85} name="T&M Revenue" stackId="rev" radius={hasOpsFixed ? [0,0,0,0] : [3,3,0,0]} />
                  {hasOpsFixed && (
                    <Bar dataKey="opsRevenue" fill="#7c3aed" opacity={0.85} name="Ops (Pauschal)" stackId="rev" radius={[3,3,0,0]} />
                  )}
                  <Line type="monotone" dataKey="pl" stroke="#a16207" strokeWidth={2} dot={{ r: 3 }} name="Profit & Loss" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Cumulative Profit and Loss */}
          {economicsByMonth.length > 0 && hasRates && hasCostRates && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Cumulative Profit and Loss</h3>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={economicsByMonth} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [fmtEur(Number(v)), String(name)]} />
                  <Bar dataKey="revenue" fill="#dde1ff" name="Revenue" radius={[3,3,0,0]} opacity={0.7} />
                  <Line type="monotone" dataKey="cumPl" stroke="#4338ca" strokeWidth={2} dot={{ r: 3 }} name="Cumulative Profit and Loss" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {!hasRates && !hasCostRates && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              Configure member cost rates in member profiles and billing rates in the{' '}
              <button className="underline" onClick={() => setActiveTab('team')}>Team tab</button>{' '}
              to unlock financial charts.
            </div>
          )}

          {/* Fixed Price: Budget Burndown */}
          {(project.projectType ?? 'tm') === 'fixprice' && burndownData.length > 0 && totalBudgetHours > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Budget Burndown</h3>
              <p className="text-xs text-gray-400 mb-4">
                Cumulative hours consumed vs total budget of {totalBudgetHours}h
                {impliedRate > 0 && ` (${impliedRate} €/h implied)`}
              </p>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={burndownData} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}h`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={v => [`${v}h`, '']} />
                  <ReferenceLine y={totalBudgetHours} stroke="#b91c1c" strokeDasharray="6 3"
                    label={{ value: `Budget ${totalBudgetHours}h`, position: 'insideTopRight', fontSize: 10, fill: '#b91c1c' }} />
                  <Bar dataKey="consumed" fill="#4338ca" opacity={0.85} name="Hours consumed" radius={[3,3,0,0]} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Fixed Price: Work Package Progress overview */}
          {(project.projectType ?? 'tm') === 'fixprice' && (project.workPackages ?? []).length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Arbeitspakete — Completion Overview</h3>
              <div className="space-y-3">
                {(project.workPackages ?? []).map(wp => {
                  const latest = wp.notes.length > 0 ? wp.notes[wp.notes.length - 1] : null;
                  const pct    = latest?.completion ?? 0;
                  const wpPct  = totalBudgetHours > 0 ? Math.round(wp.budgetHours / totalBudgetHours * 100) : 0;
                  return (
                    <div key={wp.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-700 font-medium">{wp.name}</span>
                        <span className={`text-xs font-semibold ${pct >= 100 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : 'text-slate-600'}`}>
                          {pct}% · {wp.budgetHours}h ({wpPct}% of budget)
                        </span>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-400' : 'bg-indigo-500'}`}
                          style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      {latest && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{latest.statusText}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── FINANCIALS ── */}
      {activeTab === 'financials' && (
        <div className="space-y-6">

          {/* Guard: need at least cost rates */}
          {!hasCostRates && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              Configure member cost rates in member profiles to unlock cost breakdowns.
            </div>
          )}

          {/* KPI summary — layout depends on project type */}
          {hasCostRates && (() => {
            const allH = threeWayTotals.dev.hours + threeWayTotals.admin.hours + threeWayTotals.ops.hours;

            if (projType === 'fixprice') {
              // Fixed Price: Contract Value is the revenue, no per-hour billing
              const approvedChanges = (project.changes ?? []).filter(c => c.status === 'approved');
              const changeEur       = approvedChanges.reduce((s, c) => s + c.budgetEur, 0);
              const baseEur         = project.budgetEur ?? 0;
              const contractValue   = totalBudgetEur;
              const totalCost       = threeWayTotals.total.cost;
              const netProfit       = contractValue > 0 ? contractValue - totalCost : null;
              const margin          = contractValue > 0 && netProfit !== null
                ? Math.round(netProfit / contractValue * 100) : null;

              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-separate border-spacing-y-1 min-w-[520px]">
                    <thead>
                      <tr>
                        <th className="text-left text-xs font-medium text-slate-400 pb-1 pr-4 w-36" />
                        <th className="text-right text-xs font-semibold text-indigo-700 pb-1 px-3">Development</th>
                        {hasOps && <th className="text-right text-xs font-semibold text-violet-700 pb-1 px-3">Operations</th>}
                        <th className="text-right text-xs font-semibold text-slate-700 pb-1 px-3">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Contract Value (revenue) — spans all columns */}
                      {contractValue > 0 && (
                        <tr className="bg-emerald-50/40 rounded-lg">
                          <td className="text-xs text-slate-500 font-medium py-2.5 pr-4 pl-3 rounded-l-lg">
                            Contract Value
                            {approvedChanges.length > 0 && (
                              <span className="block text-slate-400 font-normal mt-0.5 text-[11px]">
                                {fmtEur(baseEur)} + {fmtEur(changeEur)} changes
                              </span>
                            )}
                          </td>
                          <td colSpan={hasOps ? 2 : 1} />
                          <td className="text-right font-bold text-emerald-700 py-2.5 px-3 rounded-r-lg">
                            {fmtEur(contractValue)}
                          </td>
                        </tr>
                      )}
                      {/* Cost breakdown by area */}
                      <tr className="bg-slate-50 rounded-lg">
                        <td className="text-xs text-slate-500 font-medium py-2.5 pr-4 pl-3 rounded-l-lg">
                          Cost
                          <span className="block text-slate-400 font-normal mt-0.5">
                            {allH > 0 ? fmtH(allH, locale) : ''}
                          </span>
                        </td>
                        <td className="text-right font-semibold text-indigo-700 py-2.5 px-3">
                          {threeWayTotals.dev.cost > 0 ? fmtEur(threeWayTotals.dev.cost) : '—'}
                          {threeWayTotals.dev.hours > 0 && (
                            <span className="block text-xs text-slate-400 font-normal">{fmtH(threeWayTotals.dev.hours, locale)}</span>
                          )}
                        </td>
                        {hasOps && (
                          <td className="text-right font-semibold text-violet-700 py-2.5 px-3">
                            {threeWayTotals.ops.cost > 0 ? fmtEur(threeWayTotals.ops.cost) : '—'}
                            {threeWayTotals.ops.hours > 0 && (
                              <span className="block text-xs text-slate-400 font-normal">{fmtH(threeWayTotals.ops.hours, locale)}</span>
                            )}
                          </td>
                        )}
                        <td className="text-right font-bold text-slate-900 py-2.5 px-3 rounded-r-lg">
                          {totalCost > 0 ? fmtEur(totalCost) : '—'}
                        </td>
                      </tr>
                      {/* Net Profit — total only (contract value can't be split by area) */}
                      {netProfit !== null && (
                        <tr className={`rounded-lg ${netProfit >= 0 ? 'bg-emerald-50/40' : 'bg-red-50/40'}`}>
                          <td className="text-xs text-slate-500 font-medium py-2.5 pr-4 pl-3 rounded-l-lg">Net Profit</td>
                          <td colSpan={hasOps ? 2 : 1} />
                          <td className={`text-right font-bold py-2.5 px-3 rounded-r-lg ${netProfit >= 0 ? 'text-emerald-700' : 'text-red-500'}`}>
                            {`${netProfit >= 0 ? '+' : ''}${fmtEur(netProfit)}`}
                          </td>
                        </tr>
                      )}
                      {/* Margin — total only */}
                      {margin !== null && (
                        <tr className="bg-slate-50 rounded-lg">
                          <td className="text-xs text-slate-500 font-medium py-2.5 pr-4 pl-3 rounded-l-lg">Margin</td>
                          <td colSpan={hasOps ? 2 : 1} />
                          <td className={`text-right font-bold text-base py-2.5 px-3 rounded-r-lg ${margin >= 0 ? 'text-emerald-700' : 'text-red-500'}`}>
                            {`${margin}%`}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            }

            // Time & Material: per-hour billing, Dev/Ops breakdown
            const devNp = threeWayTotals.dev.rev  - threeWayTotals.dev.cost;
            const opsNp = threeWayTotals.ops.rev  - threeWayTotals.ops.cost;
            const totNp = threeWayTotals.total.pl;

            return (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-separate border-spacing-y-1 min-w-[520px]">
                  <thead>
                    <tr>
                      <th className="text-left text-xs font-medium text-slate-400 pb-1 pr-4 w-36" />
                      <th className="text-right text-xs font-semibold text-emerald-700 pb-1 px-3">Development</th>
                      {hasOps && <th className="text-right text-xs font-semibold text-violet-700 pb-1 px-3">Operations</th>}
                      <th className="text-right text-xs font-semibold text-slate-700 pb-1 px-3">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hasRates && (
                      <tr className="bg-emerald-50/40 rounded-lg">
                        <td className="text-xs text-slate-500 font-medium py-2.5 pr-4 pl-3 rounded-l-lg">Revenue</td>
                        <td className="text-right font-semibold text-emerald-700 py-2.5 px-3">
                          {threeWayTotals.dev.rev > 0 ? fmtEur(threeWayTotals.dev.rev) : '—'}
                        </td>
                        {hasOps && (
                          <td className="text-right font-semibold text-violet-700 py-2.5 px-3">
                            {threeWayTotals.ops.rev > 0 ? fmtEur(threeWayTotals.ops.rev) : '—'}
                          </td>
                        )}
                        <td className="text-right font-bold text-emerald-800 py-2.5 px-3 rounded-r-lg">
                          {threeWayTotals.total.rev > 0 ? fmtEur(threeWayTotals.total.rev) : '—'}
                        </td>
                      </tr>
                    )}
                    <tr className="bg-slate-50 rounded-lg">
                      <td className="text-xs text-slate-500 font-medium py-2.5 pr-4 pl-3 rounded-l-lg">
                        Cost
                        <span className="block text-slate-400 font-normal mt-0.5">
                          {allH > 0 ? fmtH(allH, locale) : ''}
                        </span>
                      </td>
                      <td className="text-right font-semibold text-indigo-700 py-2.5 px-3">
                        {threeWayTotals.dev.cost > 0 ? fmtEur(threeWayTotals.dev.cost) : '—'}
                        {threeWayTotals.dev.hours > 0 && (
                          <span className="block text-xs text-slate-400 font-normal">{fmtH(threeWayTotals.dev.hours, locale)}</span>
                        )}
                      </td>
                      {hasOps && (
                        <td className="text-right font-semibold text-violet-700 py-2.5 px-3">
                          {threeWayTotals.ops.cost > 0 ? fmtEur(threeWayTotals.ops.cost) : '—'}
                          {threeWayTotals.ops.hours > 0 && (
                            <span className="block text-xs text-slate-400 font-normal">{fmtH(threeWayTotals.ops.hours, locale)}</span>
                          )}
                        </td>
                      )}
                      <td className="text-right font-bold text-slate-900 py-2.5 px-3 rounded-r-lg">
                        {threeWayTotals.total.cost > 0 ? fmtEur(threeWayTotals.total.cost) : '—'}
                      </td>
                    </tr>
                    {hasRates && (
                      <tr className={`rounded-lg ${totNp >= 0 ? 'bg-emerald-50/40' : 'bg-red-50/40'}`}>
                        <td className="text-xs text-slate-500 font-medium py-2.5 pr-4 pl-3 rounded-l-lg">Net Profit</td>
                        {[devNp, ...(hasOps ? [opsNp] : []), totNp].map((np, i) => {
                          const last = i === (hasOps ? 2 : 1);
                          return (
                            <td key={i} className={`text-right py-2.5 px-3 ${last ? 'rounded-r-lg font-bold' : 'font-semibold'} ${np >= 0 ? 'text-emerald-700' : 'text-red-500'}`}>
                              {np !== 0 ? `${np >= 0 ? '+' : ''}${fmtEur(np)}` : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                    {hasRates && (
                      <tr className="bg-slate-50 rounded-lg">
                        <td className="text-xs text-slate-500 font-medium py-2.5 pr-4 pl-3 rounded-l-lg">Margin</td>
                        {[threeWayTotals.dev.margin, ...(hasOps ? [threeWayTotals.ops.margin] : []), threeWayTotals.total.margin].map((m, i) => {
                          const last  = i === (hasOps ? 2 : 1);
                          const isPos = m !== null && m >= 0;
                          return (
                            <td key={i} className={`text-right py-2.5 px-3 ${last ? 'rounded-r-lg font-bold text-base' : 'font-semibold'} ${
                              m === null ? 'text-slate-300' : isPos ? 'text-emerald-700' : 'text-red-500'
                            }`}>
                              {m === null ? '—' : `${m}%`}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* Chart 1: Monthly Cost Breakdown */}
          {threeWayByMonth.length > 0 && hasCostRates && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Monthly Cost Breakdown</h3>
              <p className="text-xs text-gray-400 mb-4">Development · Operations — internal cost (hours × cost rate)</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={threeWayByMonth} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [fmtEur(Number(v)), String(name)]} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="devCost" fill="#4338ca" name="Development" opacity={0.85} stackId="cost" radius={hasOps ? [0,0,0,0] : [3,3,0,0]} />
                  {hasOps && <Bar dataKey="opsCost" fill="#7c3aed" name="Operations" opacity={0.85} stackId="cost" radius={[3,3,0,0]} />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Chart 2: Monthly Revenue Breakdown */}
          {threeWayByMonth.length > 0 && hasRates && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Monthly Revenue Breakdown</h3>
              <p className="text-xs text-gray-400 mb-4">Dev (T&M billing) · Ops (flat fee or hourly)</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={threeWayByMonth} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [fmtEur(Number(v)), String(name)]} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="devRev" fill="#059669" name="Dev Revenue" opacity={0.85} stackId="rev" radius={hasOps ? [0,0,0,0] : [3,3,0,0]} />
                  {hasOps && <Bar dataKey="opsRev" fill="#7c3aed" name="Ops Revenue" opacity={0.85} stackId="rev" radius={[3,3,0,0]} />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Chart 3: Cost vs Revenue + P&L line */}
          {threeWayByMonth.length > 0 && hasRates && hasCostRates && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Cost vs Revenue & Monthly Profit and Loss</h3>
              <p className="text-xs text-gray-400 mb-4">Total cost (red) vs total revenue (green) with monthly profit and loss line</p>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={threeWayByMonth} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis yAxisId="eur" tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <YAxis yAxisId="pl"  orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [fmtEur(Number(v)), String(name)]} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar   yAxisId="eur" dataKey="totalCost"  fill="#b91c1c" opacity={0.8}  name="Total Cost"    radius={[3,3,0,0]} />
                  <Bar   yAxisId="eur" dataKey="totalRev"   fill="#059669" opacity={0.75} name="Total Revenue" radius={[3,3,0,0]} />
                  <Line  yAxisId="pl"  type="monotone" dataKey="pl" stroke="#a16207" strokeWidth={2} dot={{ r: 3 }} name="Monthly P&L" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Chart 4: Margin % over time */}
          {threeWayByMonth.filter(d => d.totMargin !== null).length > 1 && hasRates && hasCostRates && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Margin % by Category</h3>
              <p className="text-xs text-gray-400 mb-4">Monthly margin per branch — shows which area is most productive</p>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={threeWayByMonth} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} domain={['auto', 'auto']} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [v !== null ? `${v}%` : '—', String(name)]} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <ReferenceLine y={0} stroke="#e2e8f0" />
                  <Line type="monotone" dataKey="devMargin" stroke="#4338ca" strokeWidth={2} dot={{ r: 3 }} connectNulls name="Dev Margin"   />
                  {hasOps && <Line type="monotone" dataKey="opsMargin" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} connectNulls name="Ops Margin"   />}
                  <Line type="monotone" dataKey="totMargin" stroke="#a16207" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} connectNulls name="Total Margin" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Chart 5: Cumulative Profit and Loss */}
          {threeWayByMonth.length > 1 && hasRates && hasCostRates && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Cumulative Profit and Loss</h3>
              <p className="text-xs text-gray-400 mb-4">Running total — does the project pay its way over time?</p>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={threeWayByMonth} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [fmtEur(Number(v)), String(name)]} />
                  <ReferenceLine y={0} stroke="#e2e8f0" />
                  <Bar dataKey="pl" name="Monthly P&L" fill="#dde1ff" radius={[3,3,0,0]} />
                  <Line type="monotone" dataKey="cumPl" stroke="#4338ca" strokeWidth={2} dot={{ r: 3 }} name="Cumulative Profit and Loss" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Ops Contract Profitability table */}
          {hasOpsFixed && opsContractAnalysis.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                <h3 className="text-sm font-semibold text-gray-800">Pauschal Operations — Profitability per Contract</h3>
                <p className="text-xs text-slate-400 mt-0.5">Revenue = fixed monthly fee · Cost = actual hours × member cost rate</p>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500 font-medium border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left">Contract</th>
                    <th className="px-4 py-3 text-right">Hours</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                    <th className="px-4 py-3 text-right">Implied €/h</th>
                    <th className="px-4 py-3 text-right">Net Profit</th>
                    <th className="px-4 py-3 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {opsContractAnalysis.map(({ contract, hours, cost, revenue, implied, pl, margin }) => (
                    <tr key={contract.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-800">{contract.name}</span>
                        <span className="ml-2 text-xs text-slate-400">{contract.ticketIds.length} tickets</span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">{hours > 0 ? fmtH(hours, locale) : '—'}</td>
                      <td className="px-4 py-3 text-right text-red-600">{cost > 0 ? fmtEur(cost) : '—'}</td>
                      <td className="px-4 py-3 text-right text-emerald-700 font-medium">{fmtEur(revenue)}</td>
                      <td className="px-4 py-3 text-right text-slate-500 text-xs">{implied > 0 ? `${implied} €/h` : '—'}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${pl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmtEur(pl)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${(margin ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {margin !== null ? `${margin}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!hasCostRates && !hasRates && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              No rates configured. Set cost rates in member profiles and billing rates in the{' '}
              <button className="underline" onClick={() => setActiveTab('team')}>Team tab</button>.
            </div>
          )}
        </div>
      )}

      {/* ── MILESTONES ── */}
      {activeTab === 'milestones' && (
        <div className="space-y-8">
          <ProjectGantt project={project} />
          <MilestonesTab
            project={project}
            isAdmin={isAdmin}
            totalBudgetEur={totalBudgetEur}
            showMilestoneForm={showMilestoneForm}
            setShowMilestoneForm={setShowMilestoneForm}
          />

          {/* Arbeitspakete */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div
              className="flex items-center justify-between px-5 py-3 bg-slate-50 cursor-pointer select-none"
              onClick={() => setWpSectionOpen(o => !o)}
            >
              <div className="flex items-center gap-2">
                <svg
                  className={`w-4 h-4 text-slate-400 transition-transform ${wpSectionOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">Arbeitspakete (Work Packages)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {(project.workPackages ?? []).length} packages
                    {(project.workPackages ?? []).some(w => w.budgetHours > 0) && (
                      <> · {(project.workPackages ?? []).reduce((s, w) => s + w.budgetHours, 0)}h allocated{totalBudgetHours > 0 && ` of ${totalBudgetHours}h`}</>
                    )}
                  </p>
                </div>
              </div>
              {isAdmin && !showWpForm && (
                <button
                  onClick={e => { e.stopPropagation(); setShowWpForm(true); setWpSectionOpen(true); }}
                  className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-3 py-1.5"
                >
                  + Add
                </button>
              )}
            </div>
            {wpSectionOpen && (
              <div className="p-5 space-y-4 border-t border-slate-100">
                {showWpForm && isAdmin && (
                  <WorkPackageForm projectId={project.id}
                    allTickets={Object.values(tickets)}
                    onDone={() => { setShowWpForm(false); router.refresh(); }}
                    onCancel={() => setShowWpForm(false)} />
                )}
                {(project.workPackages ?? []).map(wp => (
                  <WorkPackageCard
                    key={wp.id} wp={wp} projectId={project.id}
                    totalBudgetHours={totalBudgetHours} totalBudgetEur={totalBudgetEur}
                    isAdmin={isAdmin} onDone={() => router.refresh()}
                    entries={entries} allTickets={Object.values(tickets)}
                  />
                ))}
                {(project.workPackages ?? []).length === 0 && !showWpForm && (
                  <p className="text-sm text-slate-400">No work packages yet.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── FORECAST ── */}
      {activeTab === 'forecast' && (
        <div className="space-y-6">

          {linkedForecastScenarios.length === 0 ? (
            <div className="bg-white rounded-lg border border-slate-200 px-6 py-12 text-center text-slate-400 text-sm">
              <p className="mb-2 font-medium text-slate-600">No forecast linked to this project.</p>
              <p className="text-xs max-w-sm mx-auto">
                In <a href="/planning" className="underline text-indigo-600">Planning</a>, open a forecast scenario, add or edit a project, and choose <strong>&quot;{project.name}&quot;</strong> in the &quot;Link to FMO Project&quot; selector.
              </p>
            </div>
          ) : (
            <>
              {/* Linked scenario badges */}
              <div className="flex flex-wrap gap-2">
                {linkedForecastScenarios.map(({ forecast: fc, forecastProjectId, forecastProjectName }) => (
                  <a key={forecastProjectId} href={`/planning/${fc.id}`}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors">
                    {fc.name} → {forecastProjectName} ↗
                  </a>
                ))}
              </div>

              {combinedChartData.length === 0 && (
                <div className="bg-white rounded-lg border border-slate-200 px-6 py-8 text-center text-slate-400 text-sm">
                  No planned hours found in the linked forecast scenario(s). Add member assignments in{' '}
                  <a href={`/planning/${linkedForecastScenarios[0].forecast.id}`} className="underline text-indigo-600">Planning</a>.
                </div>
              )}

              {/* Chart 1: Monthly Hours — actual bars + planned bars + 3M avg */}
              {combinedChartData.length > 0 && (
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-800 mb-1">Velocity & 3-Month Average</h3>
                  <p className="text-xs text-gray-400 mb-4">
                    Monthly hours (bars) · 3-month rolling average (line) · Boundary: <span className="font-medium text-slate-600">{lastActualMonth ?? 'no actuals yet'}</span>
                  </p>
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={combinedChartData} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}h`} />
                      <Tooltip {...TOOLTIP_STYLE} formatter={v => typeof v === 'number' ? fmtH(v, locale) : v} />
                      <Bar dataKey="actual" stackId="col" fill="#dde1ff" opacity={0.9} name="Actual" radius={[3,3,0,0]} />
                      {forecastProjectKeys.map(({ key, label, color }, i) => (
                        <Bar key={key} dataKey={key} stackId="col" fill={color} opacity={0.75} name={label}
                          radius={i === forecastProjectKeys.length - 1 ? [3,3,0,0] : [0,0,0,0]} />
                      ))}
                      <Line type="monotone" dataKey="avg3m" stroke="#4338ca" strokeWidth={2} dot={{ r: 3 }} name="3M Avg" connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-4 mt-2">
                    <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-200 inline-block" /> Actual</span>
                    {forecastProjectKeys.map(({ key, label, color }) => (
                      <span key={key} className="flex items-center gap-1.5 text-xs text-gray-500">
                        <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} /> {label}
                      </span>
                    ))}
                    <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-4 border-t-2 border-indigo-700 inline-block" /> 3M Avg</span>
                  </div>
                </div>
              )}

              {/* Chart 2: Cumulative Actual vs Projected */}
              {cumulativeData.length > 0 && (
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-800 mb-1">Cumulative Hours — Actual vs. Projected</h3>
                  <p className="text-xs text-gray-400 mb-4">Running total of booked hours (indigo) continuing into forecast (amber)</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <ComposedChart data={cumulativeData} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}h`} />
                      <Tooltip {...TOOLTIP_STYLE} formatter={v => typeof v === 'number' ? fmtH(v, locale) : v} />
                      <Line type="monotone" dataKey="cumActual"    stroke="#4338ca" strokeWidth={2.5} dot={{ r: 3, fill: '#4338ca' }} name="Actual"    connectNulls={false} />
                      <Line type="monotone" dataKey="cumProjected" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: '#f59e0b' }} name="Projected" strokeDasharray="6 3" connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 mt-2">
                    <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-4 border-t-2 border-indigo-700 inline-block" /> Actual (cumulative)</span>
                    <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-4 border-t-2 border-dashed border-amber-400 inline-block" /> Projected (cumulative)</span>
                  </div>
                </div>
              )}

              {/* Chart 3: Planned distribution pie — only when ≥ 2 linked projects */}
              {forecastPieData.length >= 2 && (
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-800 mb-1">Planned Hours Distribution</h3>
                  <p className="text-xs text-gray-400 mb-4">Share of total planned hours per linked forecast project</p>
                  <div className="flex items-center justify-center gap-8">
                    <PieChart width={180} height={180}>
                      <Pie data={forecastPieData} cx={85} cy={85} innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
                        {forecastPieData.map((d, i) => <Cell key={i} fill={d.color} opacity={0.85} />)}
                      </Pie>
                      <Tooltip {...TOOLTIP_STYLE} formatter={(v) => typeof v === 'number' ? fmtH(v, locale) : v} />
                    </PieChart>
                    <div className="space-y-2.5">
                      {forecastPieData.map((d) => {
                        const total = forecastPieData.reduce((s, x) => s + x.value, 0);
                        const pct   = total > 0 ? Math.round(d.value / total * 100) : 0;
                        return (
                          <div key={d.name} className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-sm shrink-0 inline-block" style={{ background: d.color }} />
                            <span className="text-xs text-gray-700 font-medium">{d.name}</span>
                            <span className="text-xs text-gray-400">{fmtH(d.value, locale)} · {pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Chart 4: Retrospective — grouped bars + accuracy table */}
              {retroData.length > 0 && (() => {
                const tp  = retroData.reduce((s, r) => s + r.planned, 0);
                const ta  = retroData.reduce((s, r) => s + r.actual,  0);
                const acc = tp > 0 ? Math.round((ta / tp) * 100) : null;
                // deviation from 100% (symmetric: over-run and under-run are both bad)
                const dev = acc !== null ? Math.abs(acc - 100) : null;
                const badge = dev === null ? null
                  : dev <=  5 ? { label: 'Excellent', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
                  : dev <= 20 ? { label: 'Good',      cls: 'bg-green-50  text-green-700  border-green-200'   }
                  : dev <= 40 ? { label: 'Average',   cls: 'bg-amber-50  text-amber-700  border-amber-200'   }
                  : dev <= 60 ? { label: 'Poor',      cls: 'bg-orange-50 text-orange-700 border-orange-200'  }
                  :             { label: 'Bad',        cls: 'bg-red-50    text-red-700    border-red-200'     };
                const overrun = acc !== null && acc > 100;
                return (
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="text-sm font-semibold text-gray-800">Retrospective — Planned vs. Actual</h3>
                    {badge && (
                      <div className="flex items-center gap-2 shrink-0">
                        {acc !== null && (
                          <span className={`text-xs font-medium ${overrun ? 'text-red-600' : 'text-slate-500'}`}>
                            {acc}% {overrun ? '↑ over-run' : ''}
                          </span>
                        )}
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mb-4">Months where both a plan and actual bookings exist — how accurate was the forecast?</p>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={retroBreakdownData}
                      margin={{ top: 4, right: 8, left: 0, bottom: 8 }}
                      onMouseMove={(state: any) => {
                        if (!state.isTooltipActive || !state.activePayload?.length) { setRetroHover(null); return; }
                        const payload: any[] = state.activePayload;
                        setRetroHover({
                          month: String(state.activeLabel ?? ''),
                          planned: payload.filter((p: any) => String(p.dataKey).startsWith('plan_') && Number(p.value) > 0)
                            .map((p: any) => ({ label: forecastProjectKeys.find(k => `plan_${k.key}` === p.dataKey)?.label ?? String(p.dataKey).slice(8), value: Number(p.value) })),
                          actual: payload.filter((p: any) => String(p.dataKey).startsWith('act_') && Number(p.value) > 0)
                            .map((p: any) => ({ label: String(p.dataKey).slice(4), value: Number(p.value) })),
                        });
                      }}
                      onMouseLeave={() => setRetroHover(null)}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}h`} />
                      {/* Planned stacks — one segment per linked forecast project */}
                      {forecastProjectKeys.map(({ key, label, color }, i) => (
                        <Bar key={`plan_${key}`} dataKey={`plan_${key}`} stackId="planned"
                          fill={color} opacity={0.4} name={`plan_${key}`}
                          radius={i === forecastProjectKeys.length - 1 ? [3,3,0,0] : [0,0,0,0]} />
                      ))}
                      {/* Actual stacks — one segment per ticket (top 8 + Other) */}
                      {retroTicketSlices.top.map(({ label }, i) => (
                        <Bar key={`act_${label}`} dataKey={`act_${label}`} stackId="actual"
                          fill={COLORS[i % COLORS.length]} opacity={0.85} name={`act_${label}`}
                          radius={!retroTicketSlices.hasOther && i === retroTicketSlices.top.length - 1 ? [3,3,0,0] : [0,0,0,0]} />
                      ))}
                      {retroTicketSlices.hasOther && (
                        <Bar dataKey="act_Other" stackId="actual" fill="#94a3b8" opacity={0.6} name="act_Other" radius={[3,3,0,0]} />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3">
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-xs font-medium text-slate-500 shrink-0">Planned:</span>
                      {forecastProjectKeys.map(({ key, label, color }) => (
                        <span key={key} className="flex items-center gap-1.5 text-xs text-gray-500">
                          <span className="w-2.5 h-2.5 rounded-sm inline-block opacity-40" style={{ background: color }} />
                          {label}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-xs font-medium text-slate-500 shrink-0">Actual:</span>
                      {retroTicketSlices.top.map(({ label }, i) => (
                        <span key={label} className="flex items-center gap-1.5 text-xs text-gray-500">
                          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COLORS[i % COLORS.length] }} />
                          {label}
                        </span>
                      ))}
                      {retroTicketSlices.hasOther && (
                        <span className="flex items-center gap-1.5 text-xs text-gray-500">
                          <span className="w-2.5 h-2.5 rounded-sm bg-slate-400 inline-block opacity-60" />
                          Other
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Hover detail panel — sits below chart, never overlaps bars */}
                  {retroHover ? (
                    <div className="mt-3 bg-slate-50 border border-slate-100 rounded-lg px-4 py-3 flex gap-8 text-xs">
                      <span className="font-semibold text-slate-700 shrink-0">{retroHover.month}</span>
                      {retroHover.planned.length > 0 && (
                        <div>
                          <p className="font-medium text-slate-500 mb-1">Planned — {fmtH(retroHover.planned.reduce((s, i) => s + i.value, 0), locale)}</p>
                          {retroHover.planned.map(item => (
                            <p key={item.label} className="text-slate-400 pl-2">· {item.label}: {fmtH(item.value, locale)}</p>
                          ))}
                        </div>
                      )}
                      {retroHover.actual.length > 0 && (
                        <div>
                          <p className="font-medium text-slate-500 mb-1">Actual — {fmtH(retroHover.actual.reduce((s, i) => s + i.value, 0), locale)}</p>
                          {retroHover.actual.map(item => (
                            <p key={item.label} className="text-slate-400 pl-2">· {item.label}: {fmtH(item.value, locale)}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 h-[52px] bg-slate-50/50 border border-dashed border-slate-100 rounded-lg flex items-center justify-center text-xs text-slate-300">
                      Hover a bar to see breakdown
                    </div>
                  )}

                  {/* Pivoted table: months as columns */}
                  {(() => {
                    const tp  = retroData.reduce((s, r) => s + r.planned, 0);
                    const ta  = retroData.reduce((s, r) => s + r.actual,  0);
                    const td  = ta - tp;
                    const tAcc = tp > 0 ? Math.round((ta / tp) * 100) : null;

                    function accuracyBadge(acc: number | null) {
                      if (acc === null) return null;
                      const dev = Math.abs(acc - 100);
                      if (dev <=  5) return { label: 'Excellent', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
                      if (dev <= 20) return { label: 'Good',      cls: 'bg-green-50  text-green-700  border-green-200'   };
                      if (dev <= 40) return { label: 'Average',   cls: 'bg-amber-50  text-amber-700  border-amber-200'   };
                      if (dev <= 60) return { label: 'Poor',      cls: 'bg-orange-50 text-orange-700 border-orange-200'  };
                      return               { label: 'Bad',        cls: 'bg-red-50    text-red-700    border-red-200'     };
                    }

                    const months = retroData.map(r => r.month);
                    const hasTotal = retroData.length > 1;

                    return (
                      <div className="mt-4 overflow-x-auto">
                        <table className="text-xs border-collapse w-full">
                          <thead>
                            <tr className="border-b border-slate-100">
                              <th className="text-left py-2 pr-4 font-medium text-slate-500 min-w-[72px]"></th>
                              {months.map(m => (
                                <th key={m} className="text-center px-3 py-2 font-medium text-slate-600 min-w-[80px]">{m}</th>
                              ))}
                              {hasTotal && <th className="text-center px-3 py-2 font-semibold text-slate-700 min-w-[80px] border-l border-slate-100">Total</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {/* Planned row */}
                            <tr className="hover:bg-slate-50/40">
                              <td className="py-2 pr-4 font-medium text-slate-500">Planned</td>
                              {retroData.map(r => (
                                <td key={r.month} className="px-3 py-2 text-center text-slate-500">{fmtH(r.planned, locale)}</td>
                              ))}
                              {hasTotal && <td className="px-3 py-2 text-center font-semibold text-slate-500 border-l border-slate-100">{fmtH(tp, locale)}</td>}
                            </tr>
                            {/* Actual row */}
                            <tr className="hover:bg-slate-50/40">
                              <td className="py-2 pr-4 font-medium text-slate-700">Actual</td>
                              {retroData.map(r => (
                                <td key={r.month} className="px-3 py-2 text-center font-medium text-slate-700">{fmtH(r.actual, locale)}</td>
                              ))}
                              {hasTotal && <td className="px-3 py-2 text-center font-semibold text-slate-700 border-l border-slate-100">{fmtH(ta, locale)}</td>}
                            </tr>
                            {/* Delta row */}
                            <tr className="hover:bg-slate-50/40">
                              <td className="py-2 pr-4 font-medium text-slate-500">Delta</td>
                              {retroData.map(r => {
                                const d = r.actual - r.planned;
                                return (
                                  <td key={r.month} className={`px-3 py-2 text-center font-medium ${d > 0 ? 'text-red-600' : d < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                    {d >= 0 ? '+' : ''}{fmtH(d, locale)}
                                  </td>
                                );
                              })}
                              {hasTotal && (
                                <td className={`px-3 py-2 text-center font-semibold border-l border-slate-100 ${td > 0 ? 'text-red-600' : td < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                  {td >= 0 ? '+' : ''}{fmtH(td, locale)}
                                </td>
                              )}
                            </tr>
                            {/* Accuracy row */}
                            <tr className="hover:bg-slate-50/40">
                              <td className="py-2 pr-4 font-medium text-slate-500">Accuracy</td>
                              {retroData.map(r => {
                                const acc = r.planned > 0 ? Math.round((r.actual / r.planned) * 100) : null;
                                const over = acc !== null && acc > 100;
                                return (
                                  <td key={r.month} className={`px-3 py-2 text-center font-medium ${over ? 'text-red-600' : 'text-slate-500'}`}>
                                    {acc !== null ? `${acc}%` : '—'}
                                  </td>
                                );
                              })}
                              {hasTotal && (
                                <td className={`px-3 py-2 text-center font-medium border-l border-slate-100 ${tAcc !== null && tAcc > 100 ? 'text-red-600' : 'text-slate-500'}`}>
                                  {tAcc !== null ? `${tAcc}%` : '—'}
                                </td>
                              )}
                            </tr>
                            {/* Rating row */}
                            <tr className="hover:bg-slate-50/40">
                              <td className="py-2 pr-4 font-medium text-slate-500">Rating</td>
                              {retroData.map(r => {
                                const acc = r.planned > 0 ? Math.round((r.actual / r.planned) * 100) : null;
                                const b   = accuracyBadge(acc);
                                return (
                                  <td key={r.month} className="px-3 py-2 text-center">
                                    {b ? (
                                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${b.cls}`}>{b.label}</span>
                                    ) : '—'}
                                  </td>
                                );
                              })}
                              {hasTotal && (() => {
                                const b = accuracyBadge(tAcc);
                                return (
                                  <td className="px-3 py-2 text-center border-l border-slate-100">
                                    {b ? (
                                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${b.cls}`}>{b.label}</span>
                                    ) : '—'}
                                  </td>
                                );
                              })()}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* ── SETTINGS ── */}
      {activeTab === 'settings' && (
        <div className="space-y-6 max-w-2xl">

          {/* Project Category */}
          <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Project Category</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([
                ['client',    'Client',    'Billable client-facing project'],
                ['internal',  'Internal',  'Internal or admin work, not billable'],
                ['presales',  'Pre-Sales', 'Pre-sales activities, not billable'],
                ['training',  'Training',  'Training and education, not billable'],
                ['portfolio', 'Portfolio', 'Portfolio work, not billable'],
              ] as const).map(([cat, label, desc]) => (
                <button key={cat} type="button" onClick={() => isAdmin && setProjCategory(cat)} disabled={!isAdmin}
                  className={`text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
                    projCategory === cat ? 'border-slate-700 bg-slate-50' : 'border-slate-200 hover:border-slate-400'
                  } disabled:cursor-default`}>
                  <span className="font-medium block text-slate-800">{label}</span>
                  <span className="text-xs text-slate-400">{desc}</span>
                </button>
              ))}
            </div>
            {isAdmin && (
              <button disabled={savingConfig} onClick={async () => {
                setSavingConfig(true);
                await updateProjectConfig(project.id, { projectCategory: projCategory, projectType: projType, contractValue: parseFloat(contractValue) || 0, contractHours: parseFloat(contractHours) || 0 });
                setSavingConfig(false);
                router.refresh();
              }} className="px-4 py-2 bg-slate-800 text-white text-sm rounded hover:bg-slate-700 disabled:opacity-50">
                {savingConfig ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>

          {/* Billing Model + Operations (client projects only) */}
          {isClientProject && (<>

          {/* Billing Model */}
          <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Billing Model</h3>
            <div className="flex gap-2">
              {([
                ['tm',       'Time & Material', 'Each hour billed at per-member billing rate'],
                ['fixprice', 'Fixed Price',      'Fixed contract value with budget hours'],
              ] as const).map(([t, label, desc]) => (
                <button key={t} type="button" onClick={() => isAdmin && setProjType(t)} disabled={!isAdmin}
                  className={`flex-1 text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
                    projType === t ? 'border-slate-700 bg-slate-50' : 'border-slate-200 hover:border-slate-400'
                  } disabled:cursor-default`}>
                  <span className="font-medium block text-slate-800">{label}</span>
                  <span className="text-xs text-slate-400">{desc}</span>
                </button>
              ))}
            </div>
            {projType === 'fixprice' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Contract Value (€)</label>
                  <input type="number" min="0" value={contractValue} onChange={e => setContractValue(e.target.value)} disabled={!isAdmin}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Budget Hours (h)</label>
                  <input type="number" min="0" value={contractHours} onChange={e => setContractHours(e.target.value)} disabled={!isAdmin}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50" />
                </div>
              </div>
            )}
            {isAdmin && (
              <button disabled={savingConfig} onClick={async () => {
                setSavingConfig(true);
                await updateProjectConfig(project.id, { projectCategory: projCategory, projectType: projType, contractValue: parseFloat(contractValue) || 0, contractHours: parseFloat(contractHours) || 0 });
                setSavingConfig(false);
                router.refresh();
              }} className="px-4 py-2 bg-slate-800 text-white text-sm rounded hover:bg-slate-700 disabled:opacity-50">
                {savingConfig ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>

          {/* Operations Contracts */}
          <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Operations Contracts</h3>
                <p className="text-xs text-slate-400 mt-0.5">Pauschal: tickets covered by a flat monthly fee · Per Hour: tickets billed normally</p>
              </div>
              {isAdmin && !showOpsForm && (
                <button onClick={() => setShowOpsForm(true)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-3 py-1.5">
                  + Add Contract
                </button>
              )}
            </div>
            {showOpsForm && isAdmin && (
              <OpsContractForm projectId={project.id} allTickets={Object.values(tickets)}
                onDone={() => { setShowOpsForm(false); router.refresh(); }}
                onCancel={() => setShowOpsForm(false)} />
            )}
            {(project.operationContracts ?? []).length === 0 && !showOpsForm && !editingContract && (
              <p className="text-sm text-slate-400">No operations contracts yet.</p>
            )}
            {(project.operationContracts ?? []).map(c => (
              <div key={c.id} className="space-y-2">
                {editingContract?.id === c.id ? (
                  <OpsContractForm
                    projectId={project.id}
                    allTickets={Object.values(tickets)}
                    initialContract={c}
                    onDone={() => { setEditingContract(null); router.refresh(); }}
                    onCancel={() => setEditingContract(null)}
                  />
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{c.name}</p>
                      <p className="text-xs text-slate-500">
                        {c.type === 'fixprice' ? `${fmtEur(c.defaultMonthlyAmount)}/mo flat` : 'Per hour billed'}
                        {c.type === 'fixprice' && c.startDate && (
                          <> · from {c.startDate.slice(0, 7)}{c.endDate ? ` – ${c.endDate.slice(0, 7)}` : ' (ongoing)'}</>
                        )}
                        {' · '}{c.ticketIds.length} ticket{c.ticketIds.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${c.type === 'fixprice' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}>
                      {c.type === 'fixprice' ? 'Pauschal' : 'Per Hour'}
                    </span>
                    {isAdmin && (
                      <>
                        <button onClick={() => { setShowOpsForm(false); setEditingContract(c); }}
                          className="text-xs text-slate-400 hover:text-slate-700 border border-slate-200 rounded px-2 py-1 shrink-0">
                          Edit
                        </button>
                        <button onClick={async () => {
                          if (!await confirm(`Remove "${c.name}"?`, { destructive: true, confirmLabel: 'Remove' })) return;
                          await removeProjectOperationContract(project.id, c.id);
                          router.refresh();
                          toast.success(`"${c.name}" removed`);
                        }} className="text-gray-300 hover:text-red-400 shrink-0">×</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── Project Frame (Fixed Price) ── */}
          {(projType === 'fixprice') && (
            <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-800">Project Frame</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Start Date</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={!isAdmin}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">End Date</label>
                  <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} disabled={!isAdmin}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Budget Hours (h)</label>
                  <input type="number" min="0" value={budgetHours} onChange={e => setBudgetHours(e.target.value)} disabled={!isAdmin}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Or FTE <span className="text-slate-400 font-normal">(× {fteHours}h)</span>
                  </label>
                  <input type="number" min="0" step="0.1" disabled={!isAdmin}
                    value={parseFloat(budgetHours) > 0 && parseFloat(fteHours) > 0 ? Math.round(parseFloat(budgetHours) / parseFloat(fteHours) * 10) / 10 : ''}
                    onChange={e => setBudgetHours(String(Math.round(parseFloat(e.target.value) * parseFloat(fteHours))))}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Budget (€)</label>
                  <input type="number" min="0" value={budgetEur} onChange={e => setBudgetEur(e.target.value)} disabled={!isAdmin}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50" />
                </div>
              </div>
              {parseFloat(budgetHours) > 0 && parseFloat(budgetEur) > 0 && (
                <p className="text-xs text-slate-400">
                  Implied rate: {Math.round(parseFloat(budgetEur) / parseFloat(budgetHours))} €/h ·{' '}
                  Hours per FTE: <input type="number" value={fteHours} onChange={e => setFteHours(e.target.value)} disabled={!isAdmin}
                    className="w-16 border-b border-slate-300 bg-transparent text-xs text-center focus:outline-none focus:border-indigo-400" />
                </p>
              )}
              {isAdmin && (
                <button disabled={savingFrame} onClick={async () => {
                  setSavingFrame(true);
                  await updateProjectFrame(project.id, {
                    startDate, endDate,
                    budgetHours: parseFloat(budgetHours) || 0,
                    budgetEur:   parseFloat(budgetEur)   || 0,
                    fteHours:    parseFloat(fteHours)    || 1600,
                  });
                  setSavingFrame(false);
                  router.refresh();
                }} className="px-4 py-2 bg-slate-800 text-white text-sm rounded hover:bg-slate-700 disabled:opacity-50">
                  {savingFrame ? 'Saving…' : 'Save Frame'}
                </button>
              )}
            </div>
          )}

          {/* ── Nachträge (Fixed Price) ── */}
          {projType === 'fixprice' && (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">Nachträge (Change Orders)</h3>
                  <p className="text-xs text-slate-400">
                    {(project.changes ?? []).filter(c => c.status === 'approved').length} approved ·{' '}
                    +{(project.changes ?? []).filter(c => c.status === 'approved').reduce((s, c) => s + c.budgetHours, 0)}h ·{' '}
                    +{(project.changes ?? []).filter(c => c.status === 'approved').reduce((s, c) => s + c.budgetEur, 0).toLocaleString('de-DE')} €
                  </p>
                </div>
                {isAdmin && !showChangeForm && (
                  <button onClick={() => setShowChangeForm(true)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-3 py-1.5">
                    + Add
                  </button>
                )}
              </div>
              {showChangeForm && isAdmin && (
                <ChangeOrderForm projectId={project.id} onDone={() => { setShowChangeForm(false); router.refresh(); }} onCancel={() => setShowChangeForm(false)} />
              )}
              {(project.changes ?? []).length > 0 && (
                <table className="w-full text-sm">
                  <thead className="text-xs text-slate-400 font-medium border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-2 text-left">Name</th>
                      <th className="px-4 py-2 text-right">Hours</th>
                      <th className="px-4 py-2 text-right">€</th>
                      <th className="px-4 py-2 text-center">Status</th>
                      {isAdmin && <th className="px-4 py-2" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(project.changes ?? []).map(c => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-700">{c.name}</td>
                        <td className="px-4 py-2 text-right text-slate-600">+{c.budgetHours}h</td>
                        <td className="px-4 py-2 text-right text-slate-600">+{c.budgetEur.toLocaleString('de-DE')} €</td>
                        <td className="px-4 py-2 text-center">
                          {isAdmin ? (
                            <select value={c.status}
                              onChange={async e => {
                                await upsertProjectChange(project.id, { ...c, status: e.target.value as FmoChangeStatus });
                                router.refresh();
                              }}
                              className="text-xs border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none">
                              <option value="pending">Pending</option>
                              <option value="approved">Approved</option>
                              <option value="rejected">Rejected</option>
                            </select>
                          ) : (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              c.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                              c.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'
                            }`}>{c.status}</span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-2 text-center">
                            <button onClick={async () => { if (!await confirm(`Delete "${c.name}"?`, { destructive: true, confirmLabel: 'Delete' })) return; await removeProjectChange(project.id, c.id); router.refresh(); toast.success(`"${c.name}" deleted`); }}
                              className="text-gray-300 hover:text-red-400">×</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {(project.changes ?? []).length === 0 && !showChangeForm && (
                <p className="px-5 py-4 text-sm text-slate-400">No change orders yet.</p>
              )}
            </div>
          )}

          </>)}

          {/* WBS Scope */}
          <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">WBS / Ticket Scope</h3>
                <p className="text-xs text-slate-400 mt-0.5">Which WBS codes and tickets are included</p>
              </div>
              {isAdmin && (
                <button onClick={() => setEditingWbs(true)}
                  className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded px-3 py-1.5">
                  Edit WBS
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {project.wbsCodes.map(code => (
                <span key={code} className={`text-xs px-2 py-0.5 rounded-full font-mono border ${
                  code.startsWith('V.') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}>
                  {code}{wbs[code]?.label && <span className="ml-1 font-sans font-normal">{wbs[code].label}</span>}
                </span>
              ))}
              {(project.ticketIds ?? []).length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full border bg-indigo-50 border-indigo-200 text-indigo-600">
                  +{project.ticketIds.length} individual tickets
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* WBS edit modal */}
      {editingWbs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-sm font-semibold text-slate-800">Edit WBS Codes</h2>
              <button onClick={() => setEditingWbs(false)} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4">
              <div className="border border-slate-200 rounded divide-y divide-slate-100">
                {Object.values(wbs).sort((a, b) => a.code.localeCompare(b.code)).map(w => (
                  <label key={w.code} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={selectedWbs.includes(w.code)}
                      onChange={() => setSelectedWbs(prev => prev.includes(w.code) ? prev.filter(c => c !== w.code) : [...prev, w.code])} />
                    <span className="font-mono text-xs text-slate-500 shrink-0">{w.code}</span>
                    <span className="text-sm text-slate-700 truncate">{w.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t">
              <button onClick={() => setEditingWbs(false)} className="text-sm text-slate-500 px-4 py-2">Cancel</button>
              <button disabled={savingWbs} onClick={async () => {
                setSavingWbs(true);
                await updateFmoProject(project.id, project.name, project.description ?? '', selectedWbs, project.ticketIds ?? [], project.excludedTicketIds ?? []);
                setSavingWbs(false);
                setEditingWbs(false);
                router.refresh();
              }} className="bg-slate-800 text-white text-sm px-4 py-2 rounded hover:bg-slate-700 disabled:opacity-50">
                {savingWbs ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
