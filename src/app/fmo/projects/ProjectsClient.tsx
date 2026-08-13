'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRole } from '@/components/RoleProvider';
import { FmoProject, FmoWbsEntry, FmoTicket } from '@/lib/types';
import { createFmoProject, updateFmoProject, deleteFmoProject } from '@/actions/fmoProjects';
import { fmtEur } from '@/lib/i18n';
import type { ProjectFinancials } from './page';

type Mode = 'wbs' | 'tickets' | 'mixed';
type BillingFilter = 'all' | 'V' | 'I';

function detectMode(p: FmoProject): Mode {
  const hasWbs   = p.wbsCodes.length > 0;
  const hasExtra = (p.ticketIds ?? []).length > 0;
  if (hasWbs && hasExtra) return 'mixed';
  if (!hasWbs && hasExtra) return 'tickets';
  return 'wbs';
}

function BillingPill({ v, active, onClick, label }: { v: BillingFilter; active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded border transition-colors ${
        active ? 'bg-slate-800 text-white border-slate-800' : 'text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700'
      }`}>
      {label}
    </button>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
      </svg>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full pl-8 pr-7 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-slate-400" />
      {value && (
        <button type="button" onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">×</button>
      )}
    </div>
  );
}

function ProjectForm({
  wbsEntries,
  tickets,
  project,
  onClose,
}: {
  wbsEntries: Record<string, FmoWbsEntry>;
  tickets: Record<string, FmoTicket>;
  project?: FmoProject;
  onClose: () => void;
}) {
  const t      = useTranslations('projects');
  const router = useRouter();
  const isEdit = !!project;

  const [name, setName]               = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [mode, setMode]               = useState<Mode>(project ? detectMode(project) : 'wbs');
  const [selectedWbs, setSelectedWbs] = useState<string[]>(project?.wbsCodes ?? []);
  const [excludedTickets, setExcludedTickets] = useState<number[]>(project?.excludedTicketIds ?? []);
  const [selectedTickets, setSelectedTickets] = useState<number[]>(project?.ticketIds ?? []);
  const [billingFilter, setBillingFilter]     = useState<BillingFilter>('all');
  const [wbsQuery, setWbsQuery]       = useState('');
  const [ticketQuery, setTicketQuery] = useState('');
  const [expandedWbs, setExpandedWbs] = useState<Set<string>>(new Set(project?.wbsCodes ?? []));
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  const allTickets = useMemo(() => Object.values(tickets), [tickets]);

  const ticketsByWbs = useMemo(() => {
    const map = new Map<string, FmoTicket[]>();
    for (const t of allTickets) {
      if (!t.wbsCode) continue;
      const list = map.get(t.wbsCode) ?? [];
      list.push(t);
      map.set(t.wbsCode, list);
    }
    return map;
  }, [allTickets]);

  const sortedWbs = useMemo(() =>
    Object.values(wbsEntries)
      .filter(w => billingFilter === 'all' || w.billingClass === billingFilter)
      .filter(w => !wbsQuery || w.code.toLowerCase().includes(wbsQuery.toLowerCase()) || w.label.toLowerCase().includes(wbsQuery.toLowerCase()))
      .sort((a, b) => a.code.localeCompare(b.code)),
    [wbsEntries, billingFilter, wbsQuery],
  );

  const filteredIndividualTickets = useMemo(() => {
    const q = ticketQuery.toLowerCase();
    return allTickets
      .filter(t => billingFilter === 'all' || t.billingClass === billingFilter)
      .filter(t => !q || String(t.id).includes(q) || t.name.toLowerCase().includes(q) || (t.project ?? '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allTickets, billingFilter, ticketQuery]);

  const coveredByWbs = (t: FmoTicket) =>
    t.wbsCode !== null && selectedWbs.includes(t.wbsCode) && !excludedTickets.includes(t.id);

  function toggleWbs(code: string) {
    if (selectedWbs.includes(code)) {
      const codeTickets = new Set((ticketsByWbs.get(code) ?? []).map(t => t.id));
      setExcludedTickets(prev => prev.filter(id => !codeTickets.has(id)));
      setSelectedWbs(prev => prev.filter(c => c !== code));
    } else {
      setSelectedWbs(prev => [...prev, code]);
    }
  }

  function toggleExclusion(ticketId: number) {
    setExcludedTickets(prev => prev.includes(ticketId) ? prev.filter(id => id !== ticketId) : [...prev, ticketId]);
  }

  function toggleTicket(ticketId: number) {
    setSelectedTickets(prev => prev.includes(ticketId) ? prev.filter(id => id !== ticketId) : [...prev, ticketId]);
  }

  function toggleExpand(code: string) {
    setExpandedWbs(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError(t('form.errorName')); return; }
    if (!selectedWbs.length && !selectedTickets.length) {
      setError(t('form.errorScope')); return;
    }
    const wbs   = mode === 'tickets' ? [] : selectedWbs;
    const extra = mode === 'wbs'     ? [] : selectedTickets;
    const excl  = mode === 'tickets' ? [] : excludedTickets;

    setSaving(true);
    const r = isEdit
      ? await updateFmoProject(project!.id, name, description, wbs, extra, excl)
      : await createFmoProject(name, description, wbs, extra, excl);
    setSaving(false);
    if (r.ok) { onClose(); router.refresh(); }
    else setError((r as any).error ?? t('form.errorName'));
  }

  const showWbs     = mode === 'wbs'     || mode === 'mixed';
  const showTickets = mode === 'tickets' || mode === 'mixed';
  const totalWbsTickets = selectedWbs.reduce((s, c) => s + (ticketsByWbs.get(c)?.length ?? 0), 0);
  const effectiveWbs    = totalWbsTickets - excludedTickets.length;

  const billingLabels: Record<BillingFilter, string> = {
    all: t('form.all'),
    V:   t('form.billable'),
    I:   t('form.internal'),
  };

  const billingLabel = (cls: string | null) => cls === 'V' ? t('form.billable') : t('form.internal');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-base font-semibold text-gray-800">
            {isEdit ? t('form.editTitle', { name: project!.name }) : t('form.newTitle')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('form.projectName')}</label>
              <input autoFocus value={name} onChange={e => setName(e.target.value)}
                placeholder={t('form.projectNamePlaceholder')}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('form.descriptionOpt')}</label>
              <input value={description} onChange={e => setDescription(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">{t('form.projectScope')}</p>
            <div className="flex gap-2">
              {([
                ['wbs',     t('form.byWbs'),        t('form.byWbsDesc')],
                ['tickets', t('form.byTickets'),     t('form.byTicketsDesc')],
                ['mixed',   t('form.wbsAndExtras'),  t('form.wbsAndExtrasDesc')],
              ] as const).map(([m, label, desc]) => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className={`flex-1 text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                    mode === m ? 'border-slate-700 bg-slate-50' : 'border-slate-200 hover:border-slate-400'
                  }`}>
                  <span className="font-medium text-slate-800 block">{label}</span>
                  <span className="text-slate-400">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 shrink-0">{t('form.filter')}</span>
            <div className="flex gap-1">
              {(['all', 'V', 'I'] as const).map(v => (
                <BillingPill key={v} v={v} label={billingLabels[v]} active={billingFilter === v} onClick={() => setBillingFilter(v)} />
              ))}
            </div>
          </div>

          {showWbs && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-slate-500">
                  {t('form.wbsCodes')}
                  {selectedWbs.length > 0 && (
                    <span className="ml-1 text-slate-400">
                      ({t('form.wbsSelectedSummary', { count: selectedWbs.length, tickets: effectiveWbs })})
                    </span>
                  )}
                </p>
                {selectedWbs.length > 0 && (
                  <button type="button" onClick={() => { setSelectedWbs([]); setExcludedTickets([]); }}
                    className="text-xs text-slate-400 hover:text-slate-600">{t('form.clear')}</button>
                )}
              </div>
              <SearchInput value={wbsQuery} onChange={setWbsQuery} placeholder={t('form.searchWbs')} />
              <div className="mt-1.5 border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {sortedWbs.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-slate-400 text-center">{t('form.noWbsMatch')}</p>
                ) : sortedWbs.map(w => {
                  const wbsTickets = ticketsByWbs.get(w.code) ?? [];
                  const isSelected = selectedWbs.includes(w.code);
                  const isExpanded = expandedWbs.has(w.code);
                  const exclCount  = isSelected ? wbsTickets.filter(t => excludedTickets.includes(t.id)).length : 0;
                  return (
                    <div key={w.code}>
                      <div className={`flex items-center gap-2 px-3 py-2 hover:bg-slate-50 ${isSelected ? 'bg-indigo-50/40' : ''}`}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleWbs(w.code)} className="rounded shrink-0" />
                        {wbsTickets.length > 0
                          ? <button type="button" onClick={() => toggleExpand(w.code)} className="text-slate-400 hover:text-slate-600 shrink-0 w-4 text-center">{isExpanded ? '▾' : '▸'}</button>
                          : <span className="w-4 shrink-0" />
                        }
                        <span className="font-mono text-xs text-slate-500 shrink-0">{w.code}</span>
                        <span className="text-sm text-slate-700 truncate flex-1">{w.label}</span>
                        {wbsTickets.length > 0 && (
                          <span className="text-xs text-slate-400 shrink-0">
                            {isSelected && exclCount > 0
                              ? `${wbsTickets.length - exclCount}/${wbsTickets.length} tickets`
                              : `${wbsTickets.length} tickets`}
                          </span>
                        )}
                        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${w.billingClass === 'V' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {billingLabel(w.billingClass)}
                        </span>
                      </div>
                      {isExpanded && wbsTickets.length > 0 && (
                        <div className="border-t border-slate-100 bg-slate-50/60">
                          {wbsTickets.map(ticket => {
                            const isExcluded = excludedTickets.includes(ticket.id);
                            return (
                              <label key={ticket.id} className={`flex items-center gap-2 pl-8 pr-3 py-1.5 hover:bg-slate-100 cursor-pointer ${isExcluded ? 'opacity-50' : ''}`}>
                                <input type="checkbox" checked={isSelected && !isExcluded} disabled={!isSelected}
                                  onChange={() => isSelected && toggleExclusion(ticket.id)} className="rounded shrink-0" />
                                <span className="font-mono text-xs text-slate-400 shrink-0">#{ticket.id}</span>
                                <span className="text-xs text-slate-600 truncate">{ticket.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {wbsQuery && sortedWbs.length > 0 && (
                <p className="text-xs text-slate-400 mt-1">
                  {t('form.shownOf', { shown: sortedWbs.length, total: Object.keys(wbsEntries).length })}
                </p>
              )}
            </div>
          )}

          {showTickets && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-slate-500">
                  {mode === 'mixed' ? t('form.extraTickets') : t('form.tickets')}
                  {selectedTickets.length > 0 && (
                    <span className="ml-1 text-slate-400">({t('form.selectedCount', { count: selectedTickets.length })})</span>
                  )}
                </p>
                {selectedTickets.length > 0 && (
                  <button type="button" onClick={() => setSelectedTickets([])} className="text-xs text-slate-400 hover:text-slate-600">
                    {t('form.clear')}
                  </button>
                )}
              </div>
              <SearchInput value={ticketQuery} onChange={setTicketQuery} placeholder={t('form.searchTicket')} />
              <div className="mt-1.5 border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {filteredIndividualTickets.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-slate-400 text-center">{t('form.noTicketsMatch')}</p>
                ) : filteredIndividualTickets.map(ticket => {
                  const covered = coveredByWbs(ticket);
                  const checked = selectedTickets.includes(ticket.id);
                  return (
                    <label key={ticket.id} className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${covered ? 'opacity-40 cursor-default' : 'hover:bg-slate-50'}`}>
                      <input type="checkbox" checked={checked || covered} disabled={covered}
                        onChange={() => !covered && toggleTicket(ticket.id)} className="rounded shrink-0" />
                      <span className="font-mono text-xs text-slate-400 shrink-0">#{ticket.id}</span>
                      <span className="text-sm text-slate-700 truncate flex-1">{ticket.name}</span>
                      {covered
                        ? <span className="text-xs text-slate-400 shrink-0">{t('form.viaWbs')}</span>
                        : ticket.wbsCode && <span className="font-mono text-xs text-slate-400 shrink-0">{ticket.wbsCode}</span>
                      }
                      <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${ticket.billingClass === 'V' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {billingLabel(ticket.billingClass)}
                      </span>
                    </label>
                  );
                })}
              </div>
              {ticketQuery && filteredIndividualTickets.length > 0 && (
                <p className="text-xs text-slate-400 mt-1">
                  {t('form.shownOf', { shown: filteredIndividualTickets.length, total: allTickets.length })}
                </p>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 shrink-0">
          <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2">
            {t('form.cancel')}
          </button>
          <button onClick={submit} disabled={saving}
            className="bg-slate-800 text-white text-sm px-4 py-2 rounded hover:bg-slate-700 disabled:opacity-50">
            {saving
              ? (isEdit ? t('form.saving') : t('form.creating'))
              : (isEdit ? t('form.save') : t('form.create'))
            }
          </button>
        </div>
      </div>
    </div>
  );
}

function FinancialsGrid({ fin }: { fin: ProjectFinancials }) {
  const t = useTranslations('projects.financialsGrid');

  const hasCosts   = fin.total.cost > 0;
  const hasRevenue = fin.total.revenue > 0;
  const hasOps     = fin.ops.hours > 0 || fin.ops.revenue > 0;
  const hasAdmin   = fin.admin.hours > 0;

  if (!hasCosts && !hasRevenue) return null;

  const margin = (rev: number, cost: number) =>
    rev > 0 ? Math.round((rev - cost) / rev * 100) : null;

  const devMargin   = margin(fin.dev.revenue, fin.dev.cost);
  const opsMargin   = margin(fin.ops.revenue, fin.ops.cost);
  const totalMargin = margin(fin.total.revenue, fin.total.cost);

  const fmtV = (n: number) => n > 0 ? fmtEur(n) : '—';
  const fmtPct = (m: number | null) => m === null ? '—' : (
    <span className={m >= 0 ? 'text-emerald-600' : 'text-red-500'}>{m}%</span>
  );
  const fmtH = (h: number) => h > 0 ? `${h}h` : '—';

  const cols = [
    { key: 'dev',   label: t('development'), show: true,    color: 'text-indigo-700',  bg: 'bg-indigo-50' },
    { key: 'admin', label: t('admin'),        show: hasAdmin, color: 'text-slate-600',   bg: 'bg-slate-50'  },
    { key: 'ops',   label: t('operations'),   show: hasOps,  color: 'text-violet-700',  bg: 'bg-violet-50' },
    { key: 'total', label: t('total'),        show: true,    color: 'text-slate-800',   bg: 'bg-slate-100' },
  ].filter(c => c.show);

  return (
    <div className="mt-3 border-t border-slate-100 pt-3" onClick={e => e.stopPropagation()}>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left text-slate-400 font-normal pb-1.5 w-20" />
            {cols.map(c => (
              <th key={c.key} className={`text-right font-semibold pb-1.5 ${c.color}`}>
                <span className={`px-1.5 py-0.5 rounded ${c.bg}`}>{c.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          <tr>
            <td className="py-1 text-slate-400 font-medium">{t('cost')}</td>
            <td className="py-1 text-right text-slate-700">{fmtV(fin.dev.cost)}</td>
            {hasAdmin && <td className="py-1 text-right text-slate-700">{fmtV(fin.admin.cost)}</td>}
            {hasOps   && <td className="py-1 text-right text-slate-700">{fmtV(fin.ops.cost)}</td>}
            <td className="py-1 text-right font-semibold text-slate-800">{fmtV(fin.total.cost)}</td>
          </tr>
          <tr className="text-slate-400">
            <td className="pb-1.5" />
            <td className="pb-1.5 text-right">{fmtH(fin.dev.hours)}</td>
            {hasAdmin && <td className="pb-1.5 text-right">{fmtH(fin.admin.hours)}</td>}
            {hasOps   && <td className="pb-1.5 text-right">{fmtH(fin.ops.hours)}</td>}
            <td className="pb-1.5 text-right font-medium text-slate-500">
              {fmtH(Math.round((fin.dev.hours + fin.admin.hours + fin.ops.hours) * 10) / 10)}
            </td>
          </tr>
          {hasRevenue && (
            <tr>
              <td className="py-1.5 text-slate-400 font-medium">{t('revenue')}</td>
              <td className="py-1.5 text-right text-emerald-700">{fmtV(fin.dev.revenue)}</td>
              {hasAdmin && <td className="py-1.5 text-right text-slate-400">—</td>}
              {hasOps   && <td className="py-1.5 text-right text-emerald-700">{fmtV(fin.ops.revenue)}</td>}
              <td className="py-1.5 text-right font-semibold text-emerald-700">{fmtV(fin.total.revenue)}</td>
            </tr>
          )}
          {hasRevenue && (
            <tr className="border-t border-slate-200">
              <td className="pt-1.5 text-slate-400 font-medium">{t('margin')}</td>
              <td className="pt-1.5 text-right font-semibold">{fmtPct(devMargin)}</td>
              {hasAdmin && <td className="pt-1.5 text-right text-slate-400">—</td>}
              {hasOps   && <td className="pt-1.5 text-right font-semibold">{fmtPct(opsMargin)}</td>}
              <td className="pt-1.5 text-right font-bold text-base">{fmtPct(totalMargin)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function ProjectsClient({
  projects,
  wbsEntries,
  tickets,
  financials,
}: {
  projects: FmoProject[];
  wbsEntries: Record<string, FmoWbsEntry>;
  tickets: Record<string, FmoTicket>;
  financials: Record<string, ProjectFinancials>;
}) {
  const t       = useTranslations('projects');
  const tCommon = useTranslations('common');
  const router  = useRouter();
  const isAdmin = useRole() === 'admin';
  const [showForm, setShowForm]             = useState(false);
  const [editingProject, setEditingProject] = useState<FmoProject | null>(null);

  async function handleDelete(id: string, name: string) {
    if (!confirm(t('deleteConfirm', { name }))) return;
    await deleteFmoProject(id);
    router.refresh();
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {showForm && (
        <ProjectForm wbsEntries={wbsEntries} tickets={tickets} onClose={() => setShowForm(false)} />
      )}
      {editingProject && (
        <ProjectForm wbsEntries={wbsEntries} tickets={tickets} project={editingProject} onClose={() => setEditingProject(null)} />
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        {isAdmin && (
          <button onClick={() => setShowForm(true)}
            className="px-3 py-1.5 bg-slate-800 text-white text-sm rounded hover:bg-slate-700">
            {t('newProject')}
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 px-6 py-12 text-center text-slate-400">
          {t('noProjects')}
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map(project => {
            const fin = financials[project.id];
            return (
              <div
                key={project.id}
                onClick={() => router.push(`/fmo/projects/${project.id}`)}
                className="bg-white rounded-lg border border-slate-200 px-5 py-4 cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-base font-semibold text-slate-800">{project.name}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                        (project.projectType ?? 'tm') === 'tm'
                          ? 'bg-blue-50 border-blue-200 text-blue-700'
                          : 'bg-violet-50 border-violet-200 text-violet-700'
                      }`}>
                        {(project.projectType ?? 'tm') === 'tm' ? t('type.tm') : t('type.fixprice')}
                      </span>
                    </div>
                    {project.description && (
                      <p className="text-sm text-slate-500 mt-0.5">{project.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {project.wbsCodes.map(code => {
                        const w = wbsEntries[code];
                        return (
                          <span key={code} className={`text-xs px-2 py-0.5 rounded-full font-mono border ${
                            code.startsWith('V.') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                          }`}>
                            {code}{w?.label && <span className="ml-1 font-sans font-normal">{w.label}</span>}
                          </span>
                        );
                      })}
                      {(project.ticketIds ?? []).length > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full border bg-indigo-50 border-indigo-200 text-indigo-600">
                          {t('detail.ticketsBadge', { count: project.ticketIds.length })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 mt-0.5">
                    {isAdmin && (
                      <button
                        onClick={e => { e.stopPropagation(); setEditingProject(project); }}
                        className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded px-3 py-1.5 hover:border-slate-400 transition-colors"
                      >
                        {tCommon('edit')}
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(project.id, project.name); }}
                        className="text-xs text-gray-300 hover:text-red-400 transition-colors"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>

                {fin && <FinancialsGrid fin={fin} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
