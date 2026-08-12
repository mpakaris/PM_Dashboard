'use client';

import { useRef, useState } from 'react';
import { uploadFmoCSV, seedFromDataSource } from '@/actions/fmo';
import type { FmoStore, FmoImportStats } from '@/lib/types';

function StatsRow({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <span className={warn && value > 0 ? 'text-amber-600 font-medium' : 'text-slate-700'}>
      {value} {label}
    </span>
  );
}

function ImportStats({ stats }: { stats: FmoImportStats }) {
  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 text-sm space-y-1">
      <p className="font-semibold text-slate-700 mb-2">Last import result</p>
      <div className="flex flex-wrap gap-4">
        <StatsRow label="added" value={stats.added} />
        <StatsRow label="updated" value={stats.updated} />
        <StatsRow label="duplicates" value={stats.duplicates} />
        <StatsRow label="new tickets" value={stats.newTickets} warn />
        <StatsRow label="new members" value={stats.newMembers} warn />
        <StatsRow label="unmapped" value={stats.unmapped} warn />
      </div>
    </div>
  );
}

export default function ImportClient({ store }: { store: FmoStore }) {
  const [files, setFiles]     = useState<File[]>([]);
  const [dragging, setDrag]   = useState(false);
  const [busy, setBusy]       = useState(false);
  const [result, setResult]   = useState<{ ok: boolean; error?: string; stats?: FmoImportStats } | null>(null);

  const [seedBusy, setSeedBusy]   = useState(false);
  const [seedResult, setSeedResult] = useState<{ ok: boolean; error?: string; wbsLabelsAdded?: number; ticketsBackfilled?: number; entriesReclassified?: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const excelRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) => f.name.endsWith('.csv'));
    setFiles((prev) => [...prev, ...dropped]);
  }

  async function upload() {
    if (!files.length) return;
    setBusy(true);
    setResult(null);
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    const r = await uploadFmoCSV(fd);
    setBusy(false);
    setResult(r);
    if (r.ok) setFiles([]);
  }

  async function seedExcel() {
    const file = excelRef.current?.files?.[0];
    if (!file) return;
    setSeedBusy(true);
    setSeedResult(null);
    const fd = new FormData();
    fd.append('excelFile', file);
    const r = await seedFromDataSource(fd);
    setSeedBusy(false);
    setSeedResult(r);
    if (excelRef.current) excelRef.current.value = '';
  }

  const lastUpload = store.lastUpload
    ? new Date(store.lastUpload).toLocaleString()
    : 'Never';

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900">Import SecTrack Data</h1>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
          dragging ? 'border-slate-500 bg-slate-50' : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <p className="text-slate-500 text-sm">Drag & drop CSV files here, or click to choose</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          multiple
          className="hidden"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600 font-medium">Selected files:</p>
          <ul className="text-sm text-slate-700 space-y-0.5">
            {files.map((f) => <li key={f.name} className="font-mono">• {f.name}</li>)}
          </ul>
          <button
            onClick={upload}
            disabled={busy}
            className="px-4 py-2 bg-slate-800 text-white text-sm rounded hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? 'Uploading…' : `Upload ${files.length} file(s)`}
          </button>
        </div>
      )}

      {result && !result.ok && (
        <p className="text-sm text-red-600">{result.error}</p>
      )}
      {result?.ok && result.stats && <ImportStats stats={result.stats} />}

      {/* Status */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 text-sm space-y-1">
        <p className="font-semibold text-slate-700 mb-2">Data Sources</p>
        <p className="text-slate-500">Last import: <span className="text-slate-800">{lastUpload}</span></p>
        {store.sources.length > 0 && (
          <p className="text-slate-500">
            Files imported:{' '}
            <span className="text-slate-700 font-mono text-xs">{store.sources.join(', ')}</span>
          </p>
        )}
        {store.importStats.added > 0 && <ImportStats stats={store.importStats} />}
      </div>

      {/* Excel seed */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 text-sm space-y-3">
        <p className="font-semibold text-slate-700">Seed from Therese_Board.xlsx</p>
        <p className="text-slate-500 text-xs">
          Upload the Excel file to populate WBS labels, employee types, and backfill
          ticket→WBS mappings for legacy entries (7-column format).
        </p>
        <div className="flex items-center gap-3">
          <input
            ref={excelRef}
            type="file"
            accept=".xlsx"
            className="text-xs text-slate-600"
          />
          <button
            onClick={seedExcel}
            disabled={seedBusy}
            className="px-3 py-1.5 bg-slate-700 text-white text-xs rounded hover:bg-slate-600 disabled:opacity-50"
          >
            {seedBusy ? 'Seeding…' : 'Seed'}
          </button>
        </div>
        {seedResult && !seedResult.ok && (
          <p className="text-xs text-red-600">{seedResult.error}</p>
        )}
        {seedResult?.ok && (
          <p className="text-xs text-green-700">
            WBS labels added: {seedResult.wbsLabelsAdded} · Legacy tickets backfilled: {seedResult.ticketsBackfilled} · Entries reclassified: {seedResult.entriesReclassified}
          </p>
        )}
      </div>
    </div>
  );
}
