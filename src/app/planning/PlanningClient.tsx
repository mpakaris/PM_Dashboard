'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Forecast } from '@/lib/types';
import { createForecast, deleteForecast } from '@/actions/forecasts';

interface Props {
  forecasts: Forecast[];
}

export default function PlanningClient({ forecasts }: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    const id = await createForecast(newName.trim());
    router.push(`/planning/${id}`);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planning</h1>
          <p className="text-sm text-gray-400 mt-0.5">Forecast resource demand — independent from real project data</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-slate-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-700 transition-colors"
        >
          New Forecast
        </button>
      </div>

      {forecasts.length === 0 ? (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 px-6 py-16 text-center">
          <p className="text-gray-400 text-sm mb-4">No forecasts yet. Create one to start planning.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-slate-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            Create First Forecast
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {forecasts.map((f) => (
            <ForecastCard
              key={f.id}
              forecast={f}
              onDelete={async () => {
                if (!confirm(`Delete "${f.name}"? This cannot be undone.`)) return;
                await deleteForecast(f.id);
                router.refresh();
              }}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">New Forecast</h2>
            <input
              autoFocus
              type="text"
              placeholder="e.g. Planning 2027"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false); }}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowCreate(false); setNewName(''); }} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="bg-slate-600 text-white px-4 py-1.5 rounded-md text-sm font-medium hover:bg-slate-700 disabled:opacity-40"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ForecastCard({ forecast, onDelete }: { forecast: Forecast; onDelete: () => void }) {
  const router = useRouter();
  const created = new Date(forecast.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const totalAllocated = forecast.assignments.reduce(
    (s, a) => s + Object.values(a.plannedHours).reduce((x, v) => x + v, 0), 0
  );

  return (
    <div
      onClick={() => router.push(`/planning/${forecast.id}`)}
      className="bg-white rounded-lg ring-1 ring-gray-200 p-5 cursor-pointer hover:ring-slate-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-gray-800 group-hover:text-slate-700 transition-colors leading-tight">
          {forecast.name}
        </h3>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0"
        >
          Delete
        </button>
      </div>
      <div className="space-y-1 text-xs text-gray-400">
        <div className="flex justify-between">
          <span>Projects</span>
          <span className="font-medium text-gray-600">{forecast.projects.length}</span>
        </div>
        <div className="flex justify-between">
          <span>Ghost members</span>
          <span className="font-medium text-gray-600">{forecast.ghostMembers.length}</span>
        </div>
        <div className="flex justify-between">
          <span>Total allocated</span>
          <span className="font-medium text-slate-600">{totalAllocated}h</span>
        </div>
        <div className="flex justify-between pt-1 border-t border-gray-100">
          <span>Created</span>
          <span>{created}</span>
        </div>
      </div>
    </div>
  );
}
