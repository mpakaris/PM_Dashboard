'use client';

import { useState, useMemo, useRef, useTransition, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ElsapMirror, ElsapRow } from '@/lib/types';
import { importElsapCsv, applyElsapToDb } from '@/actions/elsap';
import Modal from '@/components/Modal';

interface Props {
  mirror: ElsapMirror;
}

function formatTs(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

function monthLabel(periode: number, yr: number) {
  return `${String(periode).padStart(2, '0')}/${yr}`;
}

type SortKey = 'periode' | 'name' | 'posText' | 'stunden' | 'status';

export default function ElsapClient({ mirror }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [importing, setImporting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [importResult, setImportResult] = useState<{ added: number; updated: number; skipped: number; total: number; error?: string } | null>(null);
  const [applyResult, setApplyResult] = useState<{ roles: number; members: number; projects: number; assignments: number; error?: string } | null>(null);
  const [errorModal, setErrorModal] = useState<string | null>(null);

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [filterName, setFilterName] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterVerrechnet, setFilterVerrechnet] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('periode');
  const [sortAsc, setSortAsc] = useState(true);
  const [visibleCount, setVisibleCount] = useState(100);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const allNames = useMemo(() => [...new Set(mirror.rows.map((r) => r.name).filter(Boolean))].sort(), [mirror.rows]);
  const allProjects = useMemo(() => [...new Set(mirror.rows.map((r) => r.posText).filter(Boolean))].sort(), [mirror.rows]);
  const allMonths = useMemo(
    () => [...new Set(mirror.rows.map((r) => `${r.jahr}-${String(r.periode).padStart(2, '0')}`))]
      .sort()
      .map((m) => ({ value: m, label: m })),
    [mirror.rows]
  );
  const allStatuses = useMemo(() => [...new Set(mirror.rows.map((r) => r.status).filter(Boolean))].sort(), [mirror.rows]);

  const filtered = useMemo(() => {
    let rows = mirror.rows;
    if (filterName) rows = rows.filter((r) => r.name === filterName);
    if (filterProject) rows = rows.filter((r) => r.posText === filterProject);
    if (filterMonth) {
      const [y, m] = filterMonth.split('-');
      rows = rows.filter((r) => r.jahr === parseInt(y) && r.periode === parseInt(m));
    }
    if (filterStatus) rows = rows.filter((r) => r.status === filterStatus);
    if (filterVerrechnet === 'yes') rows = rows.filter((r) => !!r.verrechnet);
    if (filterVerrechnet === 'no') rows = rows.filter((r) => !r.verrechnet);

    rows = [...rows].sort((a, b) => {
      let av: string | number, bv: string | number;
      switch (sortKey) {
        case 'periode': av = a.jahr * 100 + a.periode; bv = b.jahr * 100 + b.periode; break;
        case 'name': av = a.name; bv = b.name; break;
        case 'posText': av = a.posText; bv = b.posText; break;
        case 'stunden': av = a.stunden; bv = b.stunden; break;
        case 'status': av = a.status; bv = b.status; break;
        default: av = 0; bv = 0;
      }
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
    return rows;
  }, [mirror.rows, filterName, filterProject, filterMonth, filterStatus, filterVerrechnet, sortKey, sortAsc]);

  const totalHours = filtered.reduce((s, r) => s + r.stunden, 0);

  // Reset visible count when filtered results change
  useEffect(() => { setVisibleCount(100); }, [filterName, filterProject, filterMonth, filterStatus, filterVerrechnet, sortKey, sortAsc]);

  // Expand visible rows as user scrolls to the sentinel
  const expandVisible = useCallback(() => {
    setVisibleCount((c) => Math.min(c + 100, filtered.length));
  }, [filtered.length]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) expandVisible(); },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [expandVisible]);

  const visibleRows = filtered.slice(0, visibleCount);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
  }

  function clearFilters() {
    setFilterName('');
    setFilterProject('');
    setFilterMonth('');
    setFilterStatus('');
    setFilterVerrechnet('');
  }

  async function handleImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    const fd = new FormData();
    fd.append('file', file);
    const res = await importElsapCsv(fd);
    setImportResult(res);
    setImporting(false);
    if (!res.error) {
      if (fileRef.current) fileRef.current.value = '';
      startTransition(() => router.refresh());
    }
  }

  async function handleApply() {
    setApplying(true);
    setApplyResult(null);
    const res = await applyElsapToDb();
    setApplying(false);
    if (res.error) {
      setErrorModal(res.error);
    } else {
      setApplyResult(res);
      startTransition(() => router.refresh());
    }
  }

  const SortTh = ({ label, k }: { label: string; k: SortKey }) => (
    <th
      className="text-left px-3 py-2.5 font-medium text-gray-600 cursor-pointer hover:text-slate-600 select-none whitespace-nowrap"
      onClick={() => toggleSort(k)}
    >
      {label} {sortKey === k ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">ELSAP Import</h1>
        <p className="text-gray-500 text-sm">Upload SAP billing exports to mirror confirmed hours and sync to the dashboard.</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-400 mb-0.5">Total Rows (2026)</p>
          <p className="text-2xl font-bold text-gray-800">{mirror.rows.length.toLocaleString('de-DE')}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-400 mb-0.5">Verbucht Rows</p>
          <p className="text-2xl font-bold text-emerald-700">
            {mirror.rows.filter((r) => r.status === 'Verbucht').length.toLocaleString('de-DE')}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-400 mb-0.5">Last Import</p>
          <p className="text-sm font-semibold text-gray-700 mt-1">{formatTs(mirror.lastImport)}</p>
          {mirror.importStats && mirror.lastImport && (
            <p className="text-xs text-gray-400 mt-0.5">
              +{mirror.importStats.added} new · {mirror.importStats.updated} updated · {mirror.importStats.skipped} skipped
            </p>
          )}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-400 mb-0.5">Last Applied</p>
          <p className="text-sm font-semibold text-gray-700 mt-1">{formatTs(mirror.lastApply)}</p>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap items-start gap-4 mb-6">
        {/* Upload Form */}
        <form onSubmit={handleImport} className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50 cursor-pointer"
          />
          <button
            type="submit"
            disabled={importing || isPending}
            className="bg-slate-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-40"
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
        </form>

        {/* Apply Button */}
        <button
          onClick={handleApply}
          disabled={applying || mirror.rows.length === 0 || isPending}
          className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40"
        >
          {applying ? 'Applying…' : 'Apply to Dashboard'}
        </button>
      </div>

      {/* Result Banners */}
      {importResult && (
        <div className={`mb-4 px-4 py-3 rounded-md text-sm ${importResult.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
          {importResult.error
            ? `Import failed: ${importResult.error}`
            : `Import complete — ${importResult.added} rows added, ${importResult.updated} updated, ${importResult.skipped} unchanged. Mirror total: ${importResult.total} rows.`}
        </div>
      )}
      {applyResult && !applyResult.error && (
        <div className="mb-4 px-4 py-3 rounded-md text-sm bg-sky-50 text-sky-700 border border-sky-200">
          Applied to dashboard — {applyResult.roles} new roles, {applyResult.members} new members, {applyResult.projects} new projects, {applyResult.assignments} new assignments. Planned hours were not changed. Billed hours recomputed from Verbucht rows.
        </div>
      )}

      {/* Filter Bar */}
      {mirror.rows.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Person</label>
              <select
                value={filterName}
                onChange={(e) => { setFilterName(e.target.value); }}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400 min-w-[160px]"
              >
                <option value="">All persons</option>
                {allNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Project</label>
              <select
                value={filterProject}
                onChange={(e) => { setFilterProject(e.target.value); }}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400 min-w-[200px]"
              >
                <option value="">All projects</option>
                {allProjects.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Month</label>
              <select
                value={filterMonth}
                onChange={(e) => { setFilterMonth(e.target.value); }}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                <option value="">All months</option>
                {allMonths.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); }}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                <option value="">All statuses</option>
                {allStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Verrechnet</label>
              <select
                value={filterVerrechnet}
                onChange={(e) => { setFilterVerrechnet(e.target.value); }}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                <option value="">All</option>
                <option value="yes">Invoiced</option>
                <option value="no">Not invoiced</option>
              </select>
            </div>
            {(filterName || filterProject || filterMonth || filterStatus || filterVerrechnet) && (
              <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 border border-gray-200 rounded hover:bg-gray-50">
                Clear filters
              </button>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-gray-400">{filtered.length.toLocaleString('de-DE')} rows</span>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5">
              <span className="text-xs text-slate-500 font-medium">Subtotal</span>
              <span className="text-lg font-bold text-slate-700">
                {totalHours.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {mirror.rows.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 px-6 py-16 text-center text-gray-400 text-sm">
          No data yet. Upload an ELSAP CSV to start.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <SortTh label="Month" k="periode" />
                  <SortTh label="Person" k="name" />
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">Position</th>
                  <SortTh label="Project" k="posText" />
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">PO No.</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">Activity</th>
                  <SortTh label="Hours" k="stunden" />
                  <SortTh label="Status" k="status" />
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">Verrechnet</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, idx) => (
                  <tr key={row.id} className={`border-b border-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                    <td className="px-3 py-2 font-medium text-gray-700 whitespace-nowrap">{monthLabel(row.periode, row.jahr)}</td>
                    <td className="px-3 py-2 text-gray-800 whitespace-nowrap">{row.name || <span className="text-gray-400">{row.sapUser}</span>}</td>
                    <td className="px-3 py-2 text-gray-500 max-w-[180px] truncate" title={row.leistZText}>{row.leistZText}</td>
                    <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate" title={row.posText}>{row.posText}</td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap font-mono">{row.einkBeleg}</td>
                    <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate" title={row.aktivitaet}>{row.aktivitaet}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-700 whitespace-nowrap">
                      {row.stunden.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 3 })}h
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${row.status === 'Verbucht' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                      {row.verrechnet
                        ? <span className="bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded text-xs font-medium">{row.verrechnet}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td colSpan={6} className="px-3 py-2 text-xs font-semibold text-slate-600">
                    Subtotal — {filtered.length.toLocaleString('de-DE')} rows
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-slate-700 whitespace-nowrap">
                    {totalHours.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Sentinel + load-more indicator */}
          <div ref={sentinelRef} className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-400 text-center">
            {visibleCount < filtered.length
              ? `Showing ${visibleCount} of ${filtered.length} rows — scroll to load more`
              : `${filtered.length} rows`}
          </div>
        </div>
      )}
      {errorModal && (
        <Modal title="Apply to Dashboard — Error" onClose={() => setErrorModal(null)}>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-md">
              <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-red-700 mb-1">Apply failed</p>
                <p className="text-sm text-red-600">{errorModal}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              No data was changed. Please check the ELSAP mirror has Verbucht rows and try again.
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setErrorModal(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-md transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
