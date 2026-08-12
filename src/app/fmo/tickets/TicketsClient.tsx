'use client';

import { useState, useMemo, useEffect } from 'react';
import type { FmoTicket, FmoWbsEntry, FmoEntry } from '@/lib/types';
import { assignTicketWbs, reclassifyAllEntries } from '@/actions/fmo';
import TicketsTree from './TicketsTree';

const LS_KEY = 'fmo-tickets-view';

type Filter = 'all' | 'assigned' | 'unassigned';

function StatusBadge({ assigned }: { assigned: boolean }) {
  return assigned
    ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Assigned</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Unassigned</span>;
}

function TicketRow({
  ticket,
  hours,
  wbsEntries,
}: {
  ticket: FmoTicket;
  hours: number;
  wbsEntries: Record<string, FmoWbsEntry>;
}) {
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  async function change(wbsCode: string) {
    setSaving(true); setSaved(false); setError('');
    const r = await assignTicketWbs(ticket.id, wbsCode || null);
    setSaving(false);
    if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    else setError(r.error ?? 'Error');
  }

  const sortedWbs = Object.values(wbsEntries).sort((a, b) => a.code.localeCompare(b.code));

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 font-mono text-xs text-slate-600">{ticket.id}</td>
      <td className="px-4 py-3 text-sm text-slate-800 max-w-xs truncate" title={ticket.name}>{ticket.name}</td>
      <td className="px-4 py-3 text-xs text-slate-500">{ticket.project}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <select
            defaultValue={ticket.wbsCode ?? ''}
            onChange={(e) => change(e.target.value)}
            disabled={saving}
            className="border border-slate-300 rounded px-2 py-1 text-xs w-52"
          >
            <option value="">— unassigned —</option>
            {sortedWbs.map((w) => (
              <option key={w.code} value={w.code}>{w.code} · {w.label}</option>
            ))}
          </select>
          {saving && <span className="text-xs text-slate-400">Saving…</span>}
          {saved  && <span className="text-xs text-green-600">Saved</span>}
          {error  && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </td>
      <td className="px-4 py-3"><StatusBadge assigned={!!ticket.wbsCode} /></td>
      <td className="px-4 py-3 text-xs text-slate-500 text-right">{hours.toFixed(1)}h</td>
    </tr>
  );
}

export default function TicketsClient({
  tickets,
  wbsEntries,
  entries,
}: {
  tickets: FmoTicket[];
  wbsEntries: Record<string, FmoWbsEntry>;
  entries: FmoEntry[];
}) {
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<Filter>('all');
  const [reclassifying, setReclassifying] = useState(false);
  const [reclassResult, setReclassResult] = useState('');
  const [view, setView]       = useState<'flat' | 'tree'>('flat');

  useEffect(() => {
    const v = localStorage.getItem(LS_KEY);
    if (v === 'tree') setView('tree');
  }, []);

  const hoursMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const e of entries) {
      if (e.ticketId) map.set(e.ticketId, (map.get(e.ticketId) ?? 0) + e.spentTime);
    }
    return map;
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tickets
      .filter((t) => {
        if (filter === 'assigned'   && !t.wbsCode) return false;
        if (filter === 'unassigned' &&  t.wbsCode) return false;
        if (q && !String(t.id).includes(q) && !t.name.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if (!a.wbsCode && b.wbsCode) return -1;
        if (a.wbsCode && !b.wbsCode) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [tickets, search, filter]);

  const unassignedCount = tickets.filter((t) => !t.wbsCode).length;

  async function reclass() {
    if (!confirm(`Recompute categories for all ${entries.length} entries using current WBS assignments. Continue?`)) return;
    setReclassifying(true);
    const r = await reclassifyAllEntries();
    setReclassifying(false);
    if (r.ok) setReclassResult(`Reclassified ${r.reclassified} entries. ${r.unmapped} remain unmapped.`);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Tickets</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 border border-slate-200 rounded-md overflow-hidden text-xs">
            <button
              onClick={() => { setView('flat'); localStorage.setItem(LS_KEY, 'flat'); }}
              className={`px-3 py-1.5 transition-colors ${view === 'flat' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Flat
            </button>
            <button
              onClick={() => { setView('tree'); localStorage.setItem(LS_KEY, 'tree'); }}
              className={`px-3 py-1.5 transition-colors ${view === 'tree' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Tree
            </button>
          </div>
          <button
            onClick={reclass}
            disabled={reclassifying}
            className="px-3 py-1.5 text-xs bg-slate-700 text-white rounded hover:bg-slate-600 disabled:opacity-50"
          >
            {reclassifying ? 'Reclassifying…' : 'Reclassify All'}
          </button>
        </div>
      </div>

      {reclassResult && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{reclassResult}</p>}

      {unassignedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded px-4 py-3 text-sm text-amber-800">
          {unassignedCount} ticket(s) need WBS assignment
        </div>
      )}

      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ID or name…"
          className="border border-slate-300 rounded px-3 py-1.5 text-sm w-64"
        />
        {view === 'flat' && (
          <>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="all">All</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>
            <span className="text-sm text-slate-500">Showing {filtered.length} of {tickets.length}</span>
          </>
        )}
      </div>

      {view === 'tree' && (
        <TicketsTree tickets={filtered} wbsEntries={wbsEntries} entries={entries} />
      )}

      {view === 'flat' && (
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">ID</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Name</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Project</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">WBS Assignment</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">Hours</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((t) => (
              <TicketRow
                key={t.id}
                ticket={t}
                hours={hoursMap.get(t.id) ?? 0}
                wbsEntries={wbsEntries}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">No tickets found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
