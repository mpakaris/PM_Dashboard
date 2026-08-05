'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/components/RoleProvider';
import { ProjektAnalysisProject } from '@/lib/types';
import { uploadProjektAnalysisCSV, deleteProjektAnalysisProject } from '@/actions/projektAnalysis';

interface Props {
  projects: ProjektAnalysisProject[];
}

export default function ProjektAnalysisClient({ projects }: Props) {
  const router = useRouter();
  const isAdmin = useRole() === 'admin';
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    const fd = new FormData();
    fd.append('file', file);
    const result = await uploadProjektAnalysisCSV(fd);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    if (!result.ok) { setError(result.error ?? 'Upload failed'); return; }
    router.push(`/projekt-analysis/${result.projectId}`);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projekt Analysis</h1>
          <p className="text-sm text-gray-400 mt-0.5">Upload SecTrack CSV exports to analyse project performance</p>
        </div>
        {isAdmin && (
          <div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleUpload} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="bg-slate-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Upload CSV'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 px-6 py-16 text-center">
          <p className="text-gray-400 text-sm mb-4">
            No projects yet. Upload a CSV file named after your project (e.g. <span className="font-mono">Barmer.csv</span>).
          </p>
          {isAdmin && (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="bg-slate-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-700 transition-colors"
            >
              Upload First CSV
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onDelete={isAdmin ? async () => {
                if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
                await deleteProjektAnalysisProject(p.id);
                router.refresh();
              } : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project, onDelete }: { project: ProjektAnalysisProject; onDelete?: () => void }) {
  const router = useRouter();
  const totalHours = project.entries.reduce((s, e) => s + e.spentTime, 0);
  const users = [...new Set(project.entries.map(e => e.user))];
  const tasks = [...new Set(project.entries.map(e => e.task))];
  const months = [...new Set(project.entries.map(e => e.month))].sort();
  const uploaded = new Date(project.uploadedAt).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const periodLabel = months.length > 0
    ? `${months[0].slice(0, 7)} → ${months[months.length - 1].slice(0, 7)}`
    : '—';

  return (
    <div
      onClick={() => router.push(`/projekt-analysis/${project.id}`)}
      className="bg-white rounded-lg ring-1 ring-gray-200 p-5 cursor-pointer hover:ring-slate-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-gray-800 group-hover:text-slate-700 transition-colors leading-tight">
          {project.name}
        </h3>
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0"
          >
            Delete
          </button>
        )}
      </div>
      <div className="space-y-1 text-xs text-gray-400">
        <div className="flex justify-between">
          <span>Employees</span>
          <span className="font-medium text-gray-600">{users.length}</span>
        </div>
        <div className="flex justify-between">
          <span>Tickets</span>
          <span className="font-medium text-gray-600">{tasks.length}</span>
        </div>
        <div className="flex justify-between">
          <span>Total hours</span>
          <span className="font-medium text-slate-600">
            {totalHours.toLocaleString('de-DE', { maximumFractionDigits: 1 })}h
          </span>
        </div>
        <div className="flex justify-between">
          <span>Period</span>
          <span>{periodLabel}</span>
        </div>
        <div className="flex justify-between pt-1 border-t border-gray-100">
          <span>Last upload</span>
          <span>{uploaded}</span>
        </div>
      </div>
    </div>
  );
}
