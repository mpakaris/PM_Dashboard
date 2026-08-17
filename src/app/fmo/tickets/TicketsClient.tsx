'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { fmtH, type Locale } from '@/lib/i18n';
import type { FmoTicket, FmoWbsEntry, FmoEntry } from '@/lib/types';
import { assignTicketWbs, reclassifyAllEntries } from '@/actions/fmo';
import { useToast } from '@/components/ToastProvider';
import { SortableTh } from '@/components/SortableTh';
import { useConfirm } from '@/components/ConfirmDialogProvider';
import TicketsTree from './TicketsTree';

const LS_KEY = 'fmo-tickets-view';

type Filter = 'all' | 'assigned' | 'unassigned';

function StatusBadge({ assigned }: { assigned: boolean }) {
  const t = useTranslations('tickets');
  return assigned
    ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">{t('assigned')}</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">{t('unassigned')}</span>;
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
  const t = useTranslations('tickets');
  const tCommon = useTranslations('common');
  const locale = useLocale() as Locale;
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  async function change(wbsCode: string) {
    setSaving(true); setSaved(false); setError('');
    const r = await assignTicketWbs(ticket.id, wbsCode || null);
    setSaving(false);
    if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    else setError(r.error ?? tCommon('error'));
  }

  const sortedWbs = Object.values(wbsEntries).sort((a, b) => a.code.localeCompare(b.code));

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 font-mono text-xs text-slate-600">
        <Link href={`/fmo/tickets/${ticket.id}`} className="text-indigo-600 hover:text-indigo-800">#{ticket.id}</Link>
      </td>
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
            <option value="">— {t('unassigned')} —</option>
            {sortedWbs.map((w) => (
              <option key={w.code} value={w.code}>{w.code} · {w.label}</option>
            ))}
          </select>
          {saving && <span className="text-xs text-slate-400">{tCommon('saving')}</span>}
          {saved  && <span className="text-xs text-green-600">{tCommon('success')}</span>}
          {error  && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </td>
      <td className="px-4 py-3"><StatusBadge assigned={!!ticket.wbsCode} /></td>
      <td className="px-4 py-3 text-xs text-slate-500 text-right">{fmtH(hours, locale)}</td>
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
  const t = useTranslations('tickets');
  const tCommon = useTranslations('common');
  const tWbs = useTranslations('wbs');
  const confirm = useConfirm();
  const toast   = useToast();
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<Filter>('all');
  const [ticketSk, setTicketSk] = useState<'id' | 'name' | 'project' | 'hours'>('id');
  const [ticketSd, setTicketSd] = useState<'asc' | 'desc'>('asc');
  function onTicketSort(col: string) {
    const k = col as typeof ticketSk;
    if (ticketSk === k) setTicketSd(d => d === 'desc' ? 'asc' : 'desc');
    else { setTicketSk(k); setTicketSd(k === 'hours' ? 'desc' : 'asc'); }
  }
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
      .filter((tk) => {
        if (filter === 'assigned'   && !tk.wbsCode) return false;
        if (filter === 'unassigned' &&  tk.wbsCode) return false;
        if (q && !String(tk.id).includes(q) && !tk.name.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if (!a.wbsCode && b.wbsCode) return -1;
        if (a.wbsCode && !b.wbsCode) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [tickets, search, filter]);

  const sortedFiltered = useMemo(() =>
    [...filtered].sort((a, b) => {
      let cmp = 0;
      if      (ticketSk === 'id')      cmp = a.id - b.id;
      else if (ticketSk === 'name')    cmp = a.name.localeCompare(b.name);
      else if (ticketSk === 'project') cmp = (a.project ?? '').localeCompare(b.project ?? '');
      else if (ticketSk === 'hours')   cmp = (hoursMap.get(a.id) ?? 0) - (hoursMap.get(b.id) ?? 0);
      return ticketSd === 'desc' ? -cmp : cmp;
    }),
  [filtered, ticketSk, ticketSd, hoursMap]);

  const unassignedCount = tickets.filter((tk) => !tk.wbsCode).length;

  async function reclass() {
    if (!await confirm(tWbs('reclassifyConfirm', { count: entries.length }), { confirmLabel: 'Reclassify' })) return;
    setReclassifying(true);
    const r = await reclassifyAllEntries();
    setReclassifying(false);
    if (r.ok) {
      setReclassResult(tWbs('reclassifyDone', { reclassified: r.reclassified, unmapped: r.unmapped }));
      toast.success(`Reclassified ${r.reclassified} entries`);
    } else {
      toast.error('Reclassification failed');
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 border border-slate-200 rounded-md overflow-hidden text-xs">
            <button
              onClick={() => { setView('flat'); localStorage.setItem(LS_KEY, 'flat'); }}
              className={`px-3 py-1.5 transition-colors ${view === 'flat' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              {tCommon('flatView')}
            </button>
            <button
              onClick={() => { setView('tree'); localStorage.setItem(LS_KEY, 'tree'); }}
              className={`px-3 py-1.5 transition-colors ${view === 'tree' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              {tCommon('treeView')}
            </button>
          </div>
          <button
            onClick={reclass}
            disabled={reclassifying}
            className="px-3 py-1.5 text-xs bg-slate-700 text-white rounded hover:bg-slate-600 disabled:opacity-50"
          >
            {reclassifying ? t('reclassifying') : tWbs('reclassifyAll')}
          </button>
        </div>
      </div>

      {reclassResult && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{reclassResult}</p>}

      {unassignedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded px-4 py-3 text-sm text-amber-800">
          {t('needsAssignment', { count: unassignedCount })}
        </div>
      )}

      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="border border-slate-300 rounded px-3 py-1.5 text-sm w-64"
        />
        {view === 'flat' && (
          <>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="all">{tCommon('all')}</option>
              <option value="assigned">{t('assigned')}</option>
              <option value="unassigned">{t('unassigned')}</option>
            </select>
            <span className="text-sm text-slate-500">{t('showingOf', { filtered: filtered.length, total: tickets.length })}</span>
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
              <SortableTh col="id"      label={t('id')}       sortKey={ticketSk} sortDir={ticketSd} onSort={onTicketSort} className="py-3 font-semibold text-slate-600" />
              <SortableTh col="name"    label={t('name')}     sortKey={ticketSk} sortDir={ticketSd} onSort={onTicketSort} className="py-3 font-semibold text-slate-600" />
              <SortableTh col="project" label={t('project')}  sortKey={ticketSk} sortDir={ticketSd} onSort={onTicketSort} className="py-3 font-semibold text-slate-600" />
              <th className="px-4 py-3 text-left font-semibold text-slate-600">{t('assignWbs')}</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">{t('status')}</th>
              <SortableTh col="hours"   label={t('hours')}    sortKey={ticketSk} sortDir={ticketSd} onSort={onTicketSort} right className="py-3 font-semibold text-slate-600" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedFiltered.map((tk) => (
              <TicketRow
                key={tk.id}
                ticket={tk}
                hours={hoursMap.get(tk.id) ?? 0}
                wbsEntries={wbsEntries}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">{t('noTickets')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
