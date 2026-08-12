'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRole } from '@/components/RoleProvider';
import { FmoProject, FmoWbsEntry } from '@/lib/types';
import { createFmoProject, deleteFmoProject } from '@/actions/fmoProjects';

function ProjectForm({
  wbsEntries,
  onClose,
}: {
  wbsEntries: Record<string, FmoWbsEntry>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [selectedWbs, setSelectedWbs] = useState<string[]>([]);
  const [wbsQuery, setWbsQuery]       = useState('');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  const sortedWbs = Object.values(wbsEntries).sort((a, b) => a.code.localeCompare(b.code));

  const filteredWbs = wbsQuery.trim()
    ? sortedWbs.filter(w =>
        w.code.toLowerCase().includes(wbsQuery.toLowerCase()) ||
        w.label.toLowerCase().includes(wbsQuery.toLowerCase())
      )
    : sortedWbs;

  function toggleWbs(code: string) {
    setSelectedWbs(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Project name required'); return; }
    if (!selectedWbs.length) { setError('Select at least one WBS code'); return; }
    setSaving(true);
    const r = await createFmoProject(name, description, selectedWbs);
    setSaving(false);
    if (r.ok) { onClose(); router.refresh(); }
    else setError(r.error ?? 'Error');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">New Project</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
        </div>
        <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
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
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-500">
                WBS Codes <span className="text-slate-400">({selectedWbs.length} selected)</span>
              </label>
              {selectedWbs.length > 0 && (
                <button type="button" onClick={() => setSelectedWbs([])}
                  className="text-xs text-slate-400 hover:text-slate-600">
                  Clear selection
                </button>
              )}
            </div>
            <div className="relative mb-1.5">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                value={wbsQuery}
                onChange={e => setWbsQuery(e.target.value)}
                placeholder="Search WBS code or label…"
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-slate-400"
              />
              {wbsQuery && (
                <button type="button" onClick={() => setWbsQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">×</button>
              )}
            </div>
            <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {filteredWbs.length === 0 ? (
                <p className="px-3 py-4 text-xs text-slate-400 text-center">No WBS codes match "{wbsQuery}"</p>
              ) : filteredWbs.map(w => (
                <label key={w.code} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={selectedWbs.includes(w.code)} onChange={() => toggleWbs(w.code)}
                    className="rounded text-indigo-600 shrink-0" />
                  <span className="font-mono text-xs text-slate-500 shrink-0">{w.code}</span>
                  <span className="text-sm text-slate-700 truncate">{w.label}</span>
                  <span className={`ml-auto text-xs px-1.5 py-0.5 rounded shrink-0 ${w.billingClass === 'V' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {w.billingClass === 'V' ? 'Billable' : 'Internal'}
                  </span>
                </label>
              ))}
            </div>
            {wbsQuery && filteredWbs.length > 0 && (
              <p className="text-xs text-slate-400 mt-1">{filteredWbs.length} of {sortedWbs.length} shown</p>
            )}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2">Cancel</button>
            <button type="submit" disabled={saving}
              className="bg-slate-800 text-white text-sm px-4 py-2 rounded hover:bg-slate-700 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProjectsClient({
  projects,
  wbsEntries,
}: {
  projects: FmoProject[];
  wbsEntries: Record<string, FmoWbsEntry>;
}) {
  const router   = useRouter();
  const isAdmin  = useRole() === 'admin';
  const [showForm, setShowForm] = useState(false);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete project "${name}"?`)) return;
    await deleteFmoProject(id);
    router.refresh();
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {showForm && <ProjectForm wbsEntries={wbsEntries} onClose={() => setShowForm(false)} />}

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
            <div key={project.id} className="bg-white rounded-lg border border-slate-200 px-5 py-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <Link href={`/fmo/projects/${project.id}`}
                  className="text-base font-semibold text-slate-800 hover:text-indigo-700">
                  {project.name}
                </Link>
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
                        {code}
                        {w?.label && <span className="ml-1 font-sans font-normal">{w.label}</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/fmo/projects/${project.id}`}
                  className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-3 py-1.5 hover:border-indigo-300 transition-colors">
                  Open →
                </Link>
                {isAdmin && (
                  <button onClick={() => handleDelete(project.id, project.name)}
                    className="text-xs text-gray-300 hover:text-red-400 transition-colors">×</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
