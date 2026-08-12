'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRole } from '@/components/RoleProvider';
import { FmoProject, FmoWbsEntry, FmoTicket } from '@/lib/types';
import { createFmoProject, updateFmoProject, deleteFmoProject } from '@/actions/fmoProjects';

type Mode = 'wbs' | 'tickets' | 'mixed';
type BillingFilter = 'all' | 'V' | 'I';

function detectMode(p: FmoProject): Mode {
  const hasWbs   = p.wbsCodes.length > 0;
  const hasExtra = (p.ticketIds ?? []).length > 0;
  if (hasWbs && hasExtra) return 'mixed';
  if (!hasWbs && hasExtra) return 'tickets';
  return 'wbs';
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function BillingPill({ v, active, onClick }: { v: BillingFilter; active: boolean; onClick: () => void }) {
  const labels: Record<BillingFilter, string> = { all: 'All', V: 'Billable', I: 'Internal' };
  return (
    <button type="button" onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded border transition-colors ${
        active ? 'bg-slate-800 text-white border-slate-800' : 'text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700'
      }`}>
      {labels[v]}
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

// ─── Create / Edit form ───────────────────────────────────────────────────────

function ProjectForm({
  wbsEntries,
  tickets,
  project,      // undefined = create, defined = edit
  onClose,
}: {
  wbsEntries: Record<string, FmoWbsEntry>;
  tickets: Record<string, FmoTicket>;
  project?: FmoProject;
  onClose: () => void;
}) {
  const router   = useRouter();
  const isEdit   = !!project;

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
    if (!name.trim()) { setError('Project name required'); return; }
    if (!selectedWbs.length && !selectedTickets.length) {
      setError('Select at least one WBS code or ticket'); return;
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
    else setError((r as any).error ?? 'Error');
  }

  const showWbs     = mode === 'wbs'     || mode === 'mixed';
  const showTickets = mode === 'tickets' || mode === 'mixed';
  const totalWbsTickets = selectedWbs.reduce((s, c) => s + (ticketsByWbs.get(c)?.length ?? 0), 0);
  const effectiveWbs    = totalWbsTickets - excludedTickets.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-base font-semibold text-gray-800">
            {isEdit ? `Edit "${project!.name}"` : 'New Project'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Name + Description */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Project Name</label>
              <input autoFocus value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Barmer IAM"
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Description (optional)</label>
              <input value={description} onChange={e => setDescription(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
            </div>
          </div>

          {/* Mode selector */}
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">Project scope</p>
            <div className="flex gap-2">
              {([
                ['wbs',     'By WBS',       'All tickets under selected WBS codes'],
                ['tickets', 'By Tickets',   'Hand-pick individual tickets'],
                ['mixed',   'WBS + extras', 'WBS codes with additional individual tickets'],
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

          {/* Billing filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 shrink-0">Filter</span>
            <div className="flex gap-1">
              {(['all', 'V', 'I'] as const).map(v => (
                <BillingPill key={v} v={v} active={billingFilter === v} onClick={() => setBillingFilter(v)} />
              ))}
            </div>
          </div>

          {/* ── WBS section ── */}
          {showWbs && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-slate-500">
                  WBS Codes
                  {selectedWbs.length > 0 && (
                    <span className="ml-1 text-slate-400">
                      ({selectedWbs.length} selected · {effectiveWbs} tickets)
                    </span>
                  )}
                </p>
                {selectedWbs.length > 0 && (
                  <button type="button" onClick={() => { setSelectedWbs([]); setExcludedTickets([]); }}
                    className="text-xs text-slate-400 hover:text-slate-600">Clear</button>
                )}
              </div>
              <SearchInput value={wbsQuery} onChange={setWbsQuery} placeholder="Search WBS code or label…" />
              <div className="mt-1.5 border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {sortedWbs.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-slate-400 text-center">No WBS codes match</p>
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
                            {isSelected && exclCount > 0 ? `${wbsTickets.length - exclCount}/${wbsTickets.length} tickets` : `${wbsTickets.length} tickets`}
                          </span>
                        )}
                        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${w.billingClass === 'V' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {w.billingClass === 'V' ? 'Billable' : 'Internal'}
                        </span>
                      </div>
                      {isExpanded && wbsTickets.length > 0 && (
                        <div className="border-t border-slate-100 bg-slate-50/60">
                          {wbsTickets.map(t => {
                            const isExcluded = excludedTickets.includes(t.id);
                            return (
                              <label key={t.id} className={`flex items-center gap-2 pl-8 pr-3 py-1.5 hover:bg-slate-100 cursor-pointer ${isExcluded ? 'opacity-50' : ''}`}>
                                <input type="checkbox" checked={isSelected && !isExcluded} disabled={!isSelected}
                                  onChange={() => isSelected && toggleExclusion(t.id)} className="rounded shrink-0" />
                                <span className="font-mono text-xs text-slate-400 shrink-0">#{t.id}</span>
                                <span className="text-xs text-slate-600 truncate">{t.name}</span>
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
                <p className="text-xs text-slate-400 mt-1">{sortedWbs.length} of {Object.keys(wbsEntries).length} shown</p>
              )}
            </div>
          )}

          {/* ── Individual Tickets section ── */}
          {showTickets && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-slate-500">
                  {mode === 'mixed' ? 'Extra Tickets' : 'Tickets'}
                  {selectedTickets.length > 0 && <span className="ml-1 text-slate-400">({selectedTickets.length} selected)</span>}
                </p>
                {selectedTickets.length > 0 && (
                  <button type="button" onClick={() => setSelectedTickets([])} className="text-xs text-slate-400 hover:text-slate-600">Clear</button>
                )}
              </div>
              <SearchInput value={ticketQuery} onChange={setTicketQuery} placeholder="Search ticket ID or name…" />
              <div className="mt-1.5 border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {filteredIndividualTickets.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-slate-400 text-center">No tickets match</p>
                ) : filteredIndividualTickets.map(t => {
                  const covered = coveredByWbs(t);
                  const checked = selectedTickets.includes(t.id);
                  return (
                    <label key={t.id} className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${covered ? 'opacity-40 cursor-default' : 'hover:bg-slate-50'}`}>
                      <input type="checkbox" checked={checked || covered} disabled={covered}
                        onChange={() => !covered && toggleTicket(t.id)} className="rounded shrink-0" />
                      <span className="font-mono text-xs text-slate-400 shrink-0">#{t.id}</span>
                      <span className="text-sm text-slate-700 truncate flex-1">{t.name}</span>
                      {covered
                        ? <span className="text-xs text-slate-400 shrink-0">via WBS</span>
                        : t.wbsCode && <span className="font-mono text-xs text-slate-400 shrink-0">{t.wbsCode}</span>
                      }
                      <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${t.billingClass === 'V' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {t.billingClass === 'V' ? 'Billable' : 'Internal'}
                      </span>
                    </label>
                  );
                })}
              </div>
              {ticketQuery && filteredIndividualTickets.length > 0 && (
                <p className="text-xs text-slate-400 mt-1">{filteredIndividualTickets.length} of {allTickets.length} shown</p>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 shrink-0">
          <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="bg-slate-800 text-white text-sm px-4 py-2 rounded hover:bg-slate-700 disabled:opacity-50">
            {saving ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Project')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Projects list ────────────────────────────────────────────────────────────

export default function ProjectsClient({
  projects,
  wbsEntries,
  tickets,
}: {
  projects: FmoProject[];
  wbsEntries: Record<string, FmoWbsEntry>;
  tickets: Record<string, FmoTicket>;
}) {
  const router  = useRouter();
  const isAdmin = useRole() === 'admin';
  const [showForm, setShowForm]         = useState(false);
  const [editingProject, setEditingProject] = useState<FmoProject | null>(null);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete project "${name}"?`)) return;
    await deleteFmoProject(id);
    router.refresh();
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {showForm && (
        <ProjectForm wbsEntries={wbsEntries} tickets={tickets} onClose={() => setShowForm(false)} />
      )}
      {editingProject && (
        <ProjectForm wbsEntries={wbsEntries} tickets={tickets} project={editingProject} onClose={() => setEditingProject(null)} />
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
        {isAdmin && (
          <button onClick={() => setShowForm(true)}
            className="px-3 py-1.5 bg-slate-800 text-white text-sm rounded hover:bg-slate-700">
            + New Project
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 px-6 py-12 text-center text-slate-400">
          No projects yet. Create one to group WBS codes and analyse your data.
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map(project => (
            <div
              key={project.id}
              onClick={() => router.push(`/fmo/projects/${project.id}`)}
              className="bg-white rounded-lg border border-slate-200 px-5 py-4 flex items-center gap-4 cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all"
            >
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-slate-800">{project.name}</p>
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
                      +{project.ticketIds.length} ticket{project.ticketIds.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isAdmin && (
                  <button
                    onClick={e => { e.stopPropagation(); setEditingProject(project); }}
                    className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded px-3 py-1.5 hover:border-slate-400 transition-colors"
                  >
                    Edit
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
          ))}
        </div>
      )}
    </div>
  );
}
