'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { FmoWbsEntry, FmoTicket, FmoEntry, WbsSubCategory, FmoMember, FmoProject } from '@/lib/types';
import { fmtH, fmtEur, type Locale } from '@/lib/i18n';
import { entryBelongsToProject, opsContractActiveInMonth } from '@/lib/utils';
import { useToast } from '@/components/ToastProvider';
import { useConfirm } from '@/components/ConfirmDialogProvider';
import { ChartTimeFilter, initChartRange, type TimeRange } from '@/components/ChartTimeFilter';
import {
  ComposedChart, BarChart, Bar, Line, LineChart,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import WbsTree from './WbsTree';
import {
  addFmoWbs,
  updateFmoWbs,
  deleteFmoWbs,
  addFmoSubCategory,
  updateFmoSubCategoryLabel,
  deleteFmoSubCategory,
  setWbsSubCategoryOverride,
} from '@/actions/fmo';

const TOOLTIP_STYLE = {
  contentStyle: { fontSize: 12, borderRadius: 6, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,.06)' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE1_COLORS: Record<string, string> = {
  V: 'bg-green-100 text-green-800',
  I: 'bg-slate-100 text-slate-700',
};
// Labels are now resolved via useTranslations in components that render badges
const TYPE2_COLORS: Record<string, string> = {
  admin:     'bg-slate-100 text-slate-700',
  training:  'bg-yellow-100 text-yellow-800',
  presales:  'bg-blue-100 text-blue-800',
  portfolio: 'bg-purple-100 text-purple-800',
  opm:       'bg-orange-100 text-orange-800',
  absence:   'bg-red-100 text-red-800',
};

function Type1Badge({ code }: { code: string }) {
  const t = useTranslations('wbs');
  const prefix = code[0] ?? '?';
  const labels: Record<string, string> = { V: t('billable'), I: t('internal') };
  const label  = labels[prefix] ?? t('unknown');
  const color  = TYPE1_COLORS[prefix] ?? 'bg-rose-100 text-rose-800';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>{label}</span>;
}

function Type2Badge({ entry, subCategories }: { entry: FmoWbsEntry; subCategories: Record<string, WbsSubCategory> }) {
  const t = useTranslations('wbs');
  if (entry.billingClass === 'V') return <span className="text-slate-400">—</span>;
  const slug  = entry.subCategoryOverride ?? entry.subCategory;
  if (!slug)  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-800">{t('unmapped')}</span>;
  const label = subCategories[slug]?.label ?? slug;
  const color = TYPE2_COLORS[slug] ?? 'bg-slate-100 text-slate-700';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>{label}</span>;
}

// ─── WBS table row ────────────────────────────────────────────────────────────

function WbsRow({
  entry,
  subCategories,
}: {
  entry: FmoWbsEntry;
  subCategories: Record<string, WbsSubCategory>;
}) {
  const t = useTranslations('common');
  const tWbs = useTranslations('wbs');
  const confirm = useConfirm();
  const toast   = useToast();
  const [editing, setEditing]   = useState(false);
  const [label, setLabel]       = useState(entry.label);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  async function save() {
    setSaving(true);
    const r = await updateFmoWbs(entry.code, label);
    setSaving(false);
    if (r.ok) setEditing(false);
    else setError(r.error ?? t('error'));
  }

  async function remove() {
    if (!await confirm(`Delete WBS ${entry.code}?`, { destructive: true, confirmLabel: 'Delete' })) return;
    await deleteFmoWbs(entry.code);
    toast.success(`WBS ${entry.code} deleted`);
  }

  async function changeOverride(override: string) {
    await setWbsSubCategoryOverride(entry.code, override === '' ? null : override);
  }

  const isInternal = entry.billingClass === 'I';

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 font-mono text-xs text-slate-800">{entry.code}</td>
      <td className="px-4 py-3">
        {editing ? (
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1 text-sm w-full"
            autoFocus
          />
        ) : (
          <span className="text-slate-700">{entry.label || <span className="italic text-slate-400">—</span>}</span>
        )}
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </td>
      <td className="px-4 py-3"><Type1Badge code={entry.code} /></td>
      <td className="px-4 py-3">
        {editing && isInternal ? (
          <select
            defaultValue={entry.subCategoryOverride ?? ''}
            onChange={(e) => changeOverride(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1 text-sm"
          >
            <option value="">{tWbs('autoOverride')}</option>
            {Object.values(subCategories).map((sc) => (
              <option key={sc.id} value={sc.id}>{sc.label}</option>
            ))}
          </select>
        ) : (
          <Type2Badge entry={entry} subCategories={subCategories} />
        )}
      </td>
      <td className="px-4 py-3 text-xs text-slate-400">{entry.syncSource}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={save}
                disabled={saving}
                className="text-xs px-2 py-1 bg-slate-800 text-white rounded hover:bg-slate-700 disabled:opacity-50"
              >
                {saving ? t('saving') : t('save')}
              </button>
              <button onClick={() => { setEditing(false); setLabel(entry.label); setError(''); }} className="text-xs text-slate-500 hover:text-slate-700">
                {t('cancel')}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="text-xs text-slate-500 hover:text-slate-800">Edit</button>
              <button onClick={remove} className="text-xs text-red-500 hover:text-red-700">Delete</button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Add WBS form ─────────────────────────────────────────────────────────────

function AddWbsForm({ onClose }: { onClose: () => void }) {
  const t = useTranslations('common');
  const tWbs = useTranslations('wbs');
  const [code, setCode]   = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const r = await addFmoWbs(code.trim(), label.trim());
    setSaving(false);
    if (r.ok) onClose();
    else setError(r.error ?? t('error'));
  }

  return (
    <tr className="bg-slate-50 border-b border-slate-200">
      <td className="px-4 py-3">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="V.05921700.81.01"
          className="border border-slate-300 rounded px-2 py-1 text-sm font-mono w-full"
          autoFocus
        />
      </td>
      <td className="px-4 py-3">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={tWbs('label')}
          className="border border-slate-300 rounded px-2 py-1 text-sm w-full"
        />
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </td>
      <td className="px-4 py-3 text-xs text-slate-400">{t('autoDerived')}</td>
      <td className="px-4 py-3 text-xs text-slate-400">{t('autoDerived')}</td>
      <td className="px-4 py-3 text-xs text-slate-400">{t('manual')}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={submit}
            disabled={saving}
            className="text-xs px-2 py-1 bg-slate-800 text-white rounded hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? t('adding') : t('add')}
          </button>
          <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700">{t('cancel')}</button>
        </div>
      </td>
    </tr>
  );
}

// ─── Sub-category panel ───────────────────────────────────────────────────────

function SubCategoryPanel({
  subCategories,
  wbsEntries,
}: {
  subCategories: Record<string, WbsSubCategory>;
  wbsEntries: FmoWbsEntry[];
}) {
  const t = useTranslations('common');
  const tWbs = useTranslations('wbs');
  const toast = useToast();
  const [open, setOpen]       = useState(false);
  const [newSlug, setNewSlug] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  function refCount(slug: string) {
    return wbsEntries.filter((w) => w.subCategory === slug || w.subCategoryOverride === slug).length;
  }

  function slugify(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  async function addSub(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const r = await addFmoSubCategory(newSlug, newLabel);
    setSaving(false);
    if (r.ok) { setNewSlug(''); setNewLabel(''); setError(''); }
    else setError(r.error ?? t('error'));
  }

  async function removeSub(slug: string) {
    const r = await deleteFmoSubCategory(slug);
    if (!r.ok) toast.error(r.error ?? 'Failed to delete sub-category');
    else toast.success('Sub-category deleted');
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
      >
        <span className="font-semibold text-slate-700 text-sm">{tWbs('subCategories')}</span>
        <span className="text-slate-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100">
          <table className="w-full text-sm mt-3">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-100">
                <th className="py-2 text-left font-medium">Slug</th>
                <th className="py-2 text-left font-medium">{tWbs('label')}</th>
                <th className="py-2 text-left font-medium">{tWbs('usedByHeader')}</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {Object.values(subCategories).map((sc) => (
                <SubCategoryRow
                  key={sc.id}
                  sc={sc}
                  refCount={refCount(sc.id)}
                  onDelete={() => removeSub(sc.id)}
                />
              ))}
            </tbody>
          </table>

          <form onSubmit={addSub} className="flex items-end gap-2 pt-2 border-t border-slate-100">
            <div>
              <label className="text-xs text-slate-500">{tWbs('label')}</label>
              <input
                value={newLabel}
                onChange={(e) => { setNewLabel(e.target.value); setNewSlug(slugify(e.target.value)); }}
                placeholder="e.g. Training"
                className="mt-0.5 block border border-slate-300 rounded px-2 py-1 text-sm w-36"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">{tWbs('slugLabel')}</label>
              <input
                value={newSlug}
                onChange={(e) => setNewSlug(slugify(e.target.value))}
                placeholder="e.g. training"
                className="mt-0.5 block border border-slate-300 rounded px-2 py-1 text-sm w-32 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 bg-slate-800 text-white text-xs rounded hover:bg-slate-700 disabled:opacity-50"
            >
              {saving ? t('adding') : t('add')}
            </button>
          </form>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

function SubCategoryRow({
  sc,
  refCount,
  onDelete,
}: {
  sc: WbsSubCategory;
  refCount: number;
  onDelete: () => void;
}) {
  const t = useTranslations('common');
  const [editing, setEditing] = useState(false);
  const [label, setLabel]     = useState(sc.label);
  const [saving, setSaving]   = useState(false);

  async function save() {
    setSaving(true);
    await updateFmoSubCategoryLabel(sc.id, label);
    setSaving(false);
    setEditing(false);
  }

  return (
    <tr>
      <td className="py-2 pr-4 font-mono text-xs text-slate-600">{sc.id}</td>
      <td className="py-2 pr-4">
        {editing ? (
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="border border-slate-300 rounded px-2 py-0.5 text-sm w-36"
            autoFocus
          />
        ) : (
          <span className="text-sm text-slate-700">{sc.label}</span>
        )}
      </td>
      <td className="py-2 pr-4 text-xs text-slate-500">{refCount} WBS</td>
      <td className="py-2">
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={save} disabled={saving} className="text-xs px-2 py-0.5 bg-slate-800 text-white rounded">{saving ? '…' : t('save')}</button>
              <button onClick={() => { setEditing(false); setLabel(sc.label); }} className="text-xs text-slate-400">{t('cancel')}</button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="text-xs text-slate-500 hover:text-slate-800">{t('edit')}</button>
              <button
                onClick={onDelete}
                disabled={refCount > 0}
                className="text-xs text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
                title={refCount > 0 ? `Used by ${refCount} WBS entries` : undefined}
              >
                {t('delete')}
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

const LS_KEY = 'fmo-wbs-view';

export default function WbsClient({
  wbsEntries,
  subCategories,
  tickets = [],
  entries = [],
  members = {},
  projects = [],
}: {
  wbsEntries: FmoWbsEntry[];
  subCategories: Record<string, WbsSubCategory>;
  tickets?: FmoTicket[];
  entries?: FmoEntry[];
  members?: Record<string, FmoMember>;
  projects?: FmoProject[];
}) {
  const t      = useTranslations('common');
  const tWbs   = useTranslations('wbs');
  const locale = useLocale() as Locale;
  const sorted = [...wbsEntries].sort((a, b) => a.code.localeCompare(b.code));
  const wbsMap = useMemo(() => Object.fromEntries(wbsEntries.map(w => [w.code, w])), [wbsEntries]);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'wbs'>('dashboard');
  const [adding, setAdding]       = useState(false);
  const [view, setView]           = useState<'tree' | 'flat'>('tree');
  const [search, setSearch]       = useState('');
  const [dashRange, setDashRange] = useState<TimeRange>(() => initChartRange(entries));

  useEffect(() => {
    const v = localStorage.getItem(LS_KEY);
    if (v === 'flat') setView('flat');
  }, []);

  // ── Dashboard data ──────────────────────────────────────────────────────────
  const nameToMember = useMemo(() =>
    new Map(Object.values(members).map(m => [m.name, m]))
  , [members]);

  const rangedEntries = useMemo(() =>
    dashRange.from ? entries.filter(e => e.month >= dashRange.from && e.month <= dashRange.to) : entries
  , [entries, dashRange]);

  // Implied €/h rate for fixed price projects: total contract value ÷ total budgeted hours.
  // Used to distribute fixed price revenue proportionally across hours worked.
  const impliedRateByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of projects) {
      if (p.projectType !== 'fixprice') continue;
      const contractValue = (p.budgetEur ?? p.contractValue ?? 0)
        + (p.changes ?? []).filter(c => c.status === 'approved').reduce((s, c) => s + c.budgetEur, 0);
      const budgetHours   = p.budgetHours ?? p.contractHours ?? 0;
      map.set(p.id, budgetHours > 0 ? contractValue / budgetHours : 0);
    }
    return map;
  }, [projects]);

  function billingRateForEntry(e: FmoEntry, project: FmoProject | undefined, member: FmoMember | undefined): number {
    if (!project || !member) return 0;
    if (project.projectType === 'fixprice') return impliedRateByProject.get(project.id) ?? 0;
    return project.memberRates[member.id]?.billingRate ?? 0;
  }

  const wbsStats = useMemo(() => {
    const byWbs = new Map<string, { code: string; label: string; billingClass: string; totalHours: number; billableHours: number; internalHours: number; cost: number; revenue: number }>();
    for (const e of rangedEntries) {
      const code     = e.wbsCode ?? '__nowbs__';
      const wbsEntry = e.wbsCode ? wbsMap[e.wbsCode] : null;
      const member   = nameToMember.get(e.user);
      if (!byWbs.has(code)) byWbs.set(code, {
        code,
        label: wbsEntry?.label ?? (e.wbsCode ?? 'No WBS'),
        billingClass: wbsEntry?.billingClass ?? e.billingClass ?? '?',
        totalHours: 0, billableHours: 0, internalHours: 0, cost: 0, revenue: 0,
      });
      const s = byWbs.get(code)!;
      s.totalHours += e.spentTime;
      s.cost       += e.spentTime * (member?.costRate ?? 0);
      if (e.billingClass === 'V') {
        const project = projects.find(p => entryBelongsToProject(e, p));
        const rate    = billingRateForEntry(e, project, member);
        s.billableHours += e.spentTime;
        s.revenue       += e.spentTime * rate;
      } else {
        s.internalHours += e.spentTime;
      }
    }
    return [...byWbs.values()]
      .map(s => ({
        ...s,
        profit: s.revenue - s.cost,
        margin: s.cost === 0 ? null : s.revenue === 0 ? -100 : Math.round((s.revenue - s.cost) / s.revenue * 100),
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [rangedEntries, wbsMap, nameToMember, projects, impliedRateByProject]);

  const monthlyStats = useMemo(() => {
    const monthMap = new Map<string, { cost: number; revenue: number }>();
    for (const e of rangedEntries) {
      if (!monthMap.has(e.month)) monthMap.set(e.month, { cost: 0, revenue: 0 });
      const m      = monthMap.get(e.month)!;
      const member = nameToMember.get(e.user);
      m.cost += e.spentTime * (member?.costRate ?? 0);
      if (e.billingClass === 'V') {
        const project = projects.find(p => entryBelongsToProject(e, p));
        const rate    = billingRateForEntry(e, project, member);
        m.revenue += e.spentTime * rate;
      }
    }
    return [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([month, m]) => ({ month, cost: Math.round(m.cost), revenue: Math.round(m.revenue), profit: Math.round(m.revenue - m.cost) }));
  }, [rangedEntries, nameToMember, projects, impliedRateByProject]);

  // ── Category breakdown: Dev · Ops · Admin · Pre-Sales · Portfolio · … ──────
  const allOpsTickets = useMemo(() => {
    const fixOps = new Set<number>();
    const hourly = new Set<number>();
    for (const p of projects) {
      for (const c of (p.operationContracts ?? [])) {
        for (const tid of c.ticketIds) {
          c.type === 'fixprice' ? fixOps.add(tid) : hourly.add(tid);
        }
      }
    }
    return { fixOps, hourly, all: new Set([...fixOps, ...hourly]) };
  }, [projects]);

  const categoryStats = useMemo(() => {
    type Cat = { label: string; hours: number; cost: number; revenue: number; isInternal: boolean; color: string };
    const cats = new Map<string, Cat>();

    const CAT_META: Record<string, { label: string; color: string; isInternal: boolean }> = {
      __dev__:   { label: 'Development',   color: '#4338ca', isInternal: false },
      __ops__:   { label: 'Operations',    color: '#0f766e', isInternal: false },
      admin:     { label: 'Administration', color: '#94a3b8', isInternal: true  },
      presales:  { label: 'Pre-Sales',     color: '#6366f1', isInternal: true  },
      portfolio: { label: 'Portfolio',     color: '#818cf8', isInternal: true  },
      opm:       { label: 'OPM',           color: '#64748b', isInternal: true  },
      training:  { label: 'Training',      color: '#a5b4fc', isInternal: true  },
      absence:   { label: 'Absence',       color: '#cbd5e1', isInternal: true  },
      unmapped:  { label: 'Unmapped',      color: '#e2e8f0', isInternal: true  },
    };

    const getOrCreate = (key: string) => {
      if (!cats.has(key)) {
        const meta = CAT_META[key] ?? { label: key, color: '#94a3b8', isInternal: true };
        cats.set(key, { ...meta, hours: 0, cost: 0, revenue: 0 });
      }
      return cats.get(key)!;
    };

    for (const e of rangedEntries) {
      const member    = nameToMember.get(e.user);
      const costRate  = member?.costRate ?? 0;
      const project   = projects.find(p => entryBelongsToProject(e, p));
      const isOps     = e.ticketId !== null && allOpsTickets.all.has(e.ticketId);
      const isFixOps  = e.ticketId !== null && allOpsTickets.fixOps.has(e.ticketId);

      let key: string;
      if (e.billingClass === 'V' && isOps) key = '__ops__';
      else if (e.billingClass === 'V')     key = '__dev__';
      else                                 key = e.subCategory ?? 'unmapped';

      const s = getOrCreate(key);
      s.hours += e.spentTime;
      s.cost  += e.spentTime * costRate;
      if (e.billingClass === 'V' && !isFixOps) {
        s.revenue += e.spentTime * billingRateForEntry(e, project, member);
      }
    }

    // Distribute fixprice ops pauschal revenue into Ops category
    const months = [...new Set(rangedEntries.map(e => e.month))];
    for (const p of projects) {
      for (const c of (p.operationContracts ?? []).filter(c => c.type === 'fixprice')) {
        const rev = months.reduce((s, month) =>
          opsContractActiveInMonth(c, month) ? s + ((c.monthlyOverrides ?? {})[month] ?? c.defaultMonthlyAmount) : s, 0);
        if (rev > 0) getOrCreate('__ops__').revenue += rev;
      }
    }

    return [...cats.values()]
      .map(s => ({
        ...s,
        profit: Math.round(s.revenue - s.cost),
        cost:   Math.round(s.cost),
        revenue: Math.round(s.revenue),
        margin: s.cost === 0 ? null : s.revenue === 0 ? -100 : Math.round((s.revenue - s.cost) / s.revenue * 100),
      }))
      .filter(s => s.hours > 0)
      .sort((a, b) => {
        if (!a.isInternal && b.isInternal) return -1;
        if (a.isInternal && !b.isInternal) return 1;
        return b.revenue - a.revenue || b.cost - a.cost;
      });
  }, [rangedEntries, nameToMember, projects, allOpsTickets, impliedRateByProject]);

  // ── Pass 2: Billable vs Overhead stacked by sub-category ──────────────────
  const SUB_COLORS: Record<string, string> = {
    V:         '#4338ca', // indigo-700 — billable (primary brand colour)
    admin:     '#94a3b8', // slate-400  — administration
    presales:  '#6366f1', // indigo-500 — presales (lighter indigo)
    opm:       '#64748b', // slate-500  — operations management
    portfolio: '#818cf8', // indigo-400 — portfolio
    training:  '#a5b4fc', // indigo-300 — training (lightest indigo)
    absence:   '#cbd5e1', // slate-300  — absence (most neutral)
    unmapped:  '#e2e8f0', // slate-200  — unknown
  };
  const overheadMonthly = useMemo(() => {
    const cats = new Set<string>();
    const monthMap = new Map<string, Record<string, number>>();
    for (const e of rangedEntries) {
      if (!monthMap.has(e.month)) monthMap.set(e.month, {});
      const m   = monthMap.get(e.month)!;
      const cat = e.billingClass === 'V' ? 'V' : (e.subCategory ?? 'unmapped');
      cats.add(cat);
      m[cat] = (m[cat] ?? 0) + e.spentTime;
    }
    const catList = [...cats].sort((a, b) => (a === 'V' ? -1 : b === 'V' ? 1 : a.localeCompare(b)));
    const data = [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([month, m]) => ({ month, ...m }));
    return { data, catList };
  }, [rangedEntries]);

  // ── Pass 2: WBS horizontal profitability bars (top 15 by revenue) ──────────
  const wbsProfitBars = useMemo(() =>
    [...wbsStats].filter(r => r.totalHours > 0).slice(0, 15)
      .map(r => ({ name: r.label.length > 28 ? r.label.slice(0, 28) + '…' : r.label, revenue: Math.round(r.revenue), cost: Math.round(r.cost) }))
  , [wbsStats]);

  // ── Pass 3: Cumulative P&L ─────────────────────────────────────────────────
  const cumulativePL = useMemo(() => {
    let cum = 0;
    return monthlyStats.map(m => {
      cum += m.profit;
      return { month: m.month, cumulative: Math.round(cum) };
    });
  }, [monthlyStats]);

  // ── Pass 3: Top revenue contributors (per member) ─────────────────────────
  const topContributors = useMemo(() => {
    const byMember = new Map<string, { revenue: number; cost: number }>();
    for (const e of rangedEntries) {
      if (e.billingClass !== 'V') continue;
      if (!byMember.has(e.user)) byMember.set(e.user, { revenue: 0, cost: 0 });
      const s      = byMember.get(e.user)!;
      const member = nameToMember.get(e.user);
      const project = projects.find(p => entryBelongsToProject(e, p));
      const rate    = billingRateForEntry(e, project, member);
      s.revenue += e.spentTime * rate;
      s.cost    += e.spentTime * (member?.costRate ?? 0);
    }
    return [...byMember.entries()]
      .map(([name, s]) => ({ name: name.length > 20 ? name.slice(0, 20) + '…' : name, revenue: Math.round(s.revenue), cost: Math.round(s.cost) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [rangedEntries, nameToMember, projects, impliedRateByProject]);

  // ── Pass 3: Risk panel ─────────────────────────────────────────────────────
  const risks = useMemo(() => {
    const flags: { type: 'warning' | 'info'; title: string; detail: string }[] = [];
    // Missing billing rates
    const missingRates = wbsStats.filter(r => r.billingClass === 'V' && r.billableHours > 0 && r.revenue === 0);
    if (missingRates.length > 0)
      flags.push({ type: 'warning', title: `${missingRates.length} WBS element${missingRates.length > 1 ? 's' : ''} with no billing rate`, detail: missingRates.map(r => r.code === '__nowbs__' ? 'No WBS' : r.code).join(', ') });
    // Overhead ratio > 40%
    const billableH  = wbsStats.reduce((s, r) => s + r.billableHours, 0);
    const internalH  = wbsStats.reduce((s, r) => s + r.internalHours, 0);
    const ohRatio    = (billableH + internalH) > 0 ? Math.round(internalH / (billableH + internalH) * 100) : 0;
    if (ohRatio > 40)
      flags.push({ type: 'warning', title: `High overhead ratio: ${ohRatio}% of hours are internal`, detail: 'Target: keep overhead below 40% of total hours' });
    // Months with loss
    const lossMonths = monthlyStats.filter(m => m.profit < 0);
    if (lossMonths.length > 0)
      flags.push({ type: 'warning', title: `${lossMonths.length} loss-making month${lossMonths.length > 1 ? 's' : ''} in period`, detail: lossMonths.map(m => m.month).join(', ') });
    return flags;
  }, [wbsStats, monthlyStats]);

  const totalRevenue   = wbsStats.reduce((s, r) => s + r.revenue,       0);
  const totalCost      = wbsStats.reduce((s, r) => s + r.cost,          0);
  const totalProfit    = totalRevenue - totalCost;
  const totalBillableH = wbsStats.reduce((s, r) => s + r.billableHours, 0);
  const totalHours     = wbsStats.reduce((s, r) => s + r.totalHours,    0);
  const billableRatio  = totalHours > 0 ? Math.round(totalBillableH / totalHours * 100) : 0;
  const totalMargin    = totalCost === 0 ? null : totalRevenue === 0 ? -100 : Math.round(totalProfit / totalRevenue * 100);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{tWbs('title')}</h1>
        {activeTab === 'wbs' && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">{tWbs('entries', { count: sorted.length })}</span>
            <div className="flex items-center gap-1 border border-slate-200 rounded-md overflow-hidden text-xs">
              <button onClick={() => { setView('tree'); localStorage.setItem(LS_KEY, 'tree'); }}
                className={`px-3 py-1.5 transition-colors ${view === 'tree' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                {t('treeView')}
              </button>
              <button onClick={() => { setView('flat'); localStorage.setItem(LS_KEY, 'flat'); }}
                className={`px-3 py-1.5 transition-colors ${view === 'flat' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                {t('flatView')}
              </button>
            </div>
            <button onClick={() => setAdding(true)} className="px-3 py-1.5 bg-slate-800 text-white text-sm rounded hover:bg-slate-700">
              {tWbs('addWbs')}
            </button>
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {(['dashboard', 'wbs'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {tab === 'dashboard' ? 'Dashboard' : 'WBS Codes'}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD ── */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <ChartTimeFilter value={dashRange} defaultRange={initChartRange(entries)} onChange={setDashRange} />

          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Revenue',        value: fmtEur(totalRevenue, locale),  color: 'text-emerald-700' },
              { label: 'Cost',           value: fmtEur(totalCost, locale),     color: 'text-slate-800' },
              { label: 'Net Profit',     value: fmtEur(totalProfit, locale),   color: totalProfit >= 0 ? 'text-emerald-700' : 'text-red-600' },
              { label: 'Margin',         value: totalMargin !== null ? `${totalMargin}%` : '—', color: (totalMargin ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600' },
              { label: 'Billable Ratio', value: `${billableRatio}%`,           color: billableRatio >= 60 ? 'text-emerald-700' : billableRatio >= 40 ? 'text-amber-600' : 'text-red-600' },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-lg border border-slate-200 px-4 py-3">
                <p className="text-xs text-slate-400 mb-1">{k.label}</p>
                <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Category breakdown table */}
          {categoryStats.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Breakdown by Category</h3>
                <span className="text-xs text-slate-400">Development · Operations · Overhead</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500">
                    <th className="text-left px-4 py-2.5 font-medium">Category</th>
                    <th className="text-right px-4 py-2.5 font-medium">Hours</th>
                    <th className="text-right px-4 py-2.5 font-medium">Cost</th>
                    <th className="text-right px-4 py-2.5 font-medium">Revenue</th>
                    <th className="text-right px-4 py-2.5 font-medium">Profit / Loss</th>
                    <th className="text-right px-4 py-2.5 font-medium">Margin</th>
                    <th className="px-4 py-2.5 font-medium">Hours share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {categoryStats.map(r => (
                    <tr key={r.label} className="hover:bg-slate-50/40">
                      <td className="px-4 py-2.5 font-medium text-slate-700">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-sm inline-block shrink-0" style={{ background: r.color }} />
                          {r.label}
                          {r.isInternal && <span className="text-xs text-slate-400 font-normal">overhead</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{fmtH(r.hours, locale)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{r.cost > 0 ? fmtEur(r.cost, locale) : '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        {r.isInternal
                          ? <span className="text-slate-300">—</span>
                          : r.revenue > 0 ? <span className="text-indigo-700 font-medium">{fmtEur(r.revenue, locale)}</span> : <span className="text-slate-400">—</span>
                        }
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {r.isInternal
                          ? <span className="text-slate-400">{r.cost > 0 ? `-${fmtEur(r.cost, locale)}` : '—'}</span>
                          : <span className={`font-semibold ${r.profit >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                              {r.profit >= 0 ? '+' : ''}{fmtEur(r.profit, locale)}
                            </span>
                        }
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {r.isInternal
                          ? <span className="text-slate-400">−100%</span>
                          : <span className={r.margin === null ? 'text-slate-300' : r.margin >= 0 ? 'text-teal-700' : 'text-red-500'}>
                              {r.margin !== null ? `${r.margin}%` : '—'}
                            </span>
                        }
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${totalHours > 0 ? Math.round(r.hours / totalHours * 100) : 0}%`, background: r.color, opacity: 0.7 }} />
                          </div>
                          <span className="text-slate-400 w-7 text-right shrink-0">
                            {totalHours > 0 ? `${Math.round(r.hours / totalHours * 100)}%` : '—'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-xs">
                    <td className="px-4 py-2.5 text-slate-600">Total</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{fmtH(totalHours, locale)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{fmtEur(totalCost, locale)}</td>
                    <td className="px-4 py-2.5 text-right text-indigo-700 font-semibold">{fmtEur(totalRevenue, locale)}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${totalProfit >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                      {totalProfit >= 0 ? '+' : ''}{fmtEur(totalProfit, locale)}
                    </td>
                    <td className={`px-4 py-2.5 text-right ${(totalMargin ?? 0) >= 0 ? 'text-teal-700' : 'text-red-500'}`}>
                      {totalMargin !== null ? `${totalMargin}%` : '—'}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Monthly P&L chart */}
          {monthlyStats.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Monthly Revenue vs Cost</h3>
              <p className="text-xs text-gray-400 mb-4">Revenue (indigo) · Cost (slate) · Net Profit line (teal)</p>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={monthlyStats} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [fmtEur(Number(v), locale), String(name)]} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="cost"    fill="#94a3b8" opacity={0.75} name="Cost"    radius={[3,3,0,0]} />
                  <Bar dataKey="revenue" fill="#4338ca" opacity={0.80} name="Revenue" radius={[3,3,0,0]} />
                  <Line type="monotone" dataKey="profit" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} name="Profit" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Pass 3: Risk panel */}
          {risks.length > 0 && (
            <div className="space-y-2">
              {risks.map((r, i) => (
                <div key={i} className={`flex gap-3 px-4 py-3 rounded-lg border text-sm ${
                  r.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-200 text-blue-800'
                }`}>
                  <span className="shrink-0">{r.type === 'warning' ? '⚠' : 'ℹ'}</span>
                  <div>
                    <span className="font-medium">{r.title}</span>
                    <span className="ml-2 text-xs opacity-70">{r.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pass 2: Billable vs Overhead stacked */}
          {overheadMonthly.data.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Billable vs Overhead Hours — Monthly</h3>
              <p className="text-xs text-gray-400 mb-4">Hours by category — indigo = billable (V), muted tones = internal overhead</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={overheadMonthly.data} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}h`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={v => typeof v === 'number' ? fmtH(v, locale) : v} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  {overheadMonthly.catList.map(cat => (
                    <Bar key={cat} dataKey={cat} stackId="a"
                      fill={SUB_COLORS[cat] ?? '#94a3b8'} opacity={0.85}
                      name={cat === 'V' ? 'Billable' : cat}
                      radius={overheadMonthly.catList.indexOf(cat) === overheadMonthly.catList.length - 1 ? [3,3,0,0] : [0,0,0,0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Pass 2: WBS horizontal profitability bars */}
          {wbsProfitBars.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">WBS Profitability — Top 15 by Revenue</h3>
              <p className="text-xs text-gray-400 mb-4">Revenue (indigo) vs Cost (slate) per WBS element</p>
              <ResponsiveContainer width="100%" height={Math.max(200, wbsProfitBars.length * 36)}>
                <BarChart data={wbsProfitBars} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={160} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [fmtEur(Number(v), locale), String(name)]} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="revenue" fill="#4338ca" opacity={0.80} name="Revenue" radius={[0,3,3,0]} />
                  <Bar dataKey="cost"    fill="#94a3b8" opacity={0.75} name="Cost"    radius={[0,3,3,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Pass 3: Cumulative P&L */}
          {cumulativePL.length > 1 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Cumulative Profit &amp; Loss</h3>
              <p className="text-xs text-gray-400 mb-4">Running total — slope going up = healthy, inflection points show turning moments</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={cumulativePL} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={v => [fmtEur(Number(v), locale), 'Cumulative P&L']} />
                  <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="cumulative" stroke="#4338ca" strokeWidth={2.5} dot={{ r: 3 }} name="Cumulative P&L" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Pass 3: Top revenue contributors by member */}
          {topContributors.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Top Revenue Contributors</h3>
              <p className="text-xs text-gray-400 mb-4">Which team members generate the most billable revenue in the period</p>
              <ResponsiveContainer width="100%" height={Math.max(160, topContributors.length * 34)}>
                <BarChart data={topContributors} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={140} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [fmtEur(Number(v), locale), String(name)]} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="revenue" fill="#4338ca" opacity={0.80} name="Revenue" radius={[0,3,3,0]} />
                  <Bar dataKey="cost"    fill="#94a3b8" opacity={0.75} name="Cost"   radius={[0,3,3,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* WBS Breakdown table */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">WBS Element Breakdown</h3>
              <span className="text-xs text-slate-400">{wbsStats.length} elements · sorted by revenue</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500">
                    <th className="text-left px-4 py-2 font-medium">WBS Code</th>
                    <th className="text-left px-4 py-2 font-medium">Label</th>
                    <th className="text-left px-4 py-2 font-medium">Type</th>
                    <th className="text-right px-4 py-2 font-medium">Total h</th>
                    <th className="text-right px-4 py-2 font-medium">Billable h</th>
                    <th className="text-right px-4 py-2 font-medium">Internal h</th>
                    <th className="text-right px-4 py-2 font-medium">Cost</th>
                    <th className="text-right px-4 py-2 font-medium">Revenue</th>
                    <th className="text-right px-4 py-2 font-medium">Profit / Loss</th>
                    <th className="text-right px-4 py-2 font-medium">Margin</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {wbsStats.map((r) => {
                    const isProfitable = r.profit > 0;
                    const isInternal   = r.billingClass === 'I';
                    const noRevenue    = !isInternal && r.billableHours > 0 && r.revenue === 0;
                    return (
                      <tr key={r.code} className="hover:bg-slate-50/40">
                        <td className="px-4 py-2 font-mono text-slate-600">{r.code === '__nowbs__' ? '—' : r.code}</td>
                        <td className="px-4 py-2 text-slate-700 font-medium max-w-[200px] truncate">{r.label}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${r.billingClass === 'V' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                            {r.billingClass === 'V' ? 'Billable' : 'Internal'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-slate-600">{fmtH(r.totalHours, locale)}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{r.billableHours > 0 ? fmtH(r.billableHours, locale) : <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-2 text-right text-slate-400">{r.internalHours > 0 ? fmtH(r.internalHours, locale) : <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{fmtEur(r.cost, locale)}</td>
                        <td className="px-4 py-2 text-right">
                          {isInternal ? <span className="text-slate-300">—</span> : <span className="text-emerald-700">{fmtEur(r.revenue, locale)}</span>}
                        </td>
                        <td className={`px-4 py-2 text-right font-semibold ${isInternal ? 'text-slate-400' : isProfitable ? 'text-emerald-700' : 'text-red-600'}`}>
                          {isInternal ? '—' : `${r.profit >= 0 ? '+' : ''}${fmtEur(r.profit, locale)}`}
                        </td>
                        <td className={`px-4 py-2 text-right ${isInternal ? 'text-slate-400' : r.margin === null ? 'text-slate-300' : r.margin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {isInternal ? '—' : r.margin !== null ? `${r.margin}%` : '—'}
                        </td>
                        <td className="px-4 py-2">
                          {isInternal ? (
                            <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">Overhead</span>
                          ) : noRevenue ? (
                            <span className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">No rate</span>
                          ) : isProfitable ? (
                            <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">Profitable</span>
                          ) : (
                            <span className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">Loss</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-xs">
                    <td colSpan={3} className="px-4 py-2 text-slate-600">Total</td>
                    <td className="px-4 py-2 text-right text-slate-600">{fmtH(totalHours, locale)}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{fmtH(totalBillableH, locale)}</td>
                    <td className="px-4 py-2 text-right text-slate-400">{fmtH(totalHours - totalBillableH, locale)}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{fmtEur(totalCost, locale)}</td>
                    <td className="px-4 py-2 text-right text-emerald-700">{fmtEur(totalRevenue, locale)}</td>
                    <td className={`px-4 py-2 text-right ${totalProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {totalProfit >= 0 ? '+' : ''}{fmtEur(totalProfit, locale)}
                    </td>
                    <td className={`px-4 py-2 text-right ${(totalMargin ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {totalMargin !== null ? `${totalMargin}%` : '—'}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <p className="text-xs text-slate-400">Revenue = V-class hours × billing rate per project. Internal (I-class) entries show cost only. &ldquo;No rate&rdquo; = billing rate not configured in the project&apos;s Team tab.</p>
        </div>
      )}

      {/* ── WBS CODES ── */}
      {activeTab === 'wbs' && (
        <>
          {view === 'tree' && (
            <>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={tWbs('searchPlaceholder')}
                className="border border-slate-300 rounded px-3 py-1.5 text-sm w-72" />
              <WbsTree wbsEntries={wbsEntries} subCategories={subCategories} tickets={tickets} entries={entries} search={search} />
            </>
          )}

          {view === 'flat' && (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">{tWbs('code')}</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">{tWbs('label')}</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">{tWbs('type1')}</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">{tWbs('type2')}</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">{tWbs('source')}</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">{tWbs('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {adding && <AddWbsForm onClose={() => setAdding(false)} />}
                  {sorted.map((entry) => (
                    <WbsRow key={entry.code} entry={entry} subCategories={subCategories} />
                  ))}
                  {sorted.length === 0 && !adding && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">{tWbs('noEntries')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <SubCategoryPanel subCategories={subCategories} wbsEntries={wbsEntries} />
        </>
      )}
    </div>
  );
}
