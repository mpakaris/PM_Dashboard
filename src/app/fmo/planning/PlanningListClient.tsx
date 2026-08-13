'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRole } from '@/components/RoleProvider';
import { FmoForecast, FmoProject } from '@/lib/types';
import { createFmoForecast, deleteFmoForecast } from '@/actions/fmoPlanning';
import { useToast } from '@/components/ToastProvider';
import { useConfirm } from '@/components/ConfirmDialogProvider';
import { getMonthsBetween } from '@/lib/utils';

function NewForecastForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName]             = useState('');
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth]     = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !startMonth || !endMonth) { setError('All fields required'); return; }
    setSaving(true);
    const r = await createFmoForecast(name, startMonth, endMonth);
    setSaving(false);
    if (r.ok) { onClose(); router.push(`/fmo/planning/${r.id}`); }
    else setError(r.error ?? 'Error');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-sm font-semibold text-slate-800">New Planning Scenario</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Scenario Name</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Q3 2026 Planning"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Start Month</label>
              <input type="month" value={startMonth} onChange={e => setStartMonth(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">End Month</label>
              <input type="month" value={endMonth} min={startMonth} onChange={e => setEndMonth(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none" />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="text-sm text-slate-500 px-4 py-2">Cancel</button>
            <button type="submit" disabled={saving}
              className="bg-slate-800 text-white text-sm px-4 py-2 rounded hover:bg-slate-700 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PlanningListClient({
  forecasts,
  projects,
}: {
  forecasts: FmoForecast[];
  projects: FmoProject[];
}) {
  const router   = useRouter();
  const isAdmin  = useRole() === 'admin';
  const confirm  = useConfirm();
  const toast    = useToast();
  const [showForm, setShowForm] = useState(false);

  async function handleDelete(id: string, name: string) {
    if (!await confirm(`Delete scenario "${name}"?`, { destructive: true, confirmLabel: 'Delete' })) return;
    await deleteFmoForecast(id);
    router.refresh();
    toast.success('Scenario deleted');
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {showForm && <NewForecastForm onClose={() => setShowForm(false)} />}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">FMO Planning</h1>
        {isAdmin && (
          <button onClick={() => setShowForm(true)}
            className="px-3 py-1.5 bg-slate-800 text-white text-sm rounded hover:bg-slate-700">
            + New Scenario
          </button>
        )}
      </div>

      {projects.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          No projects yet. <Link href="/fmo/projects" className="underline">Create a project first</Link> before planning.
        </div>
      )}

      {forecasts.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 px-6 py-12 text-center text-slate-400">
          No planning scenarios yet. Create one to start planning resource allocation.
        </div>
      ) : (
        <div className="space-y-3">
          {forecasts.map(f => {
            const months = getMonthsBetween(f.startMonth, f.endMonth);
            const totalPlanned = f.projects.reduce((s, p) => s + p.assignments.reduce((as, a) =>
              as + Object.values(a.plannedHours).reduce((hs, h) => hs + h, 0), 0), 0);
            return (
              <div key={f.id} className="bg-white rounded-lg border border-slate-200 px-5 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <Link href={`/fmo/planning/${f.id}`} className="text-base font-semibold text-slate-800 hover:text-indigo-700">
                    {f.name}
                  </Link>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {f.startMonth} → {f.endMonth} · {months.length} months · {f.projects.length} project{f.projects.length !== 1 ? 's' : ''}
                    {totalPlanned > 0 && ` · ${totalPlanned.toFixed(0)}h planned`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/fmo/planning/${f.id}`}
                    className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-3 py-1.5 hover:border-indigo-300 transition-colors">
                    Open →
                  </Link>
                  {isAdmin && (
                    <button onClick={() => handleDelete(f.id, f.name)}
                      className="text-xs text-gray-300 hover:text-red-400 transition-colors">×</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
