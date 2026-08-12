'use client';

import { useState, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { fmtH, type Locale } from '@/lib/i18n';
import type { FmoTicket, FmoWbsEntry, FmoEntry } from '@/lib/types';
import { assignTicketWbs } from '@/actions/fmo';

function TicketRow({
  ticket,
  hours,
  wbsEntries,
}: {
  ticket: FmoTicket;
  hours: number;
  wbsEntries: Record<string, FmoWbsEntry>;
}) {
  const tCommon = useTranslations('common');
  const tTickets = useTranslations('tickets');
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
      <td className="px-8 py-2 font-mono text-xs text-slate-600">{ticket.id}</td>
      <td className="px-4 py-2 text-xs text-slate-800 max-w-xs truncate" title={ticket.name}>{ticket.name}</td>
      <td className="px-4 py-2 text-xs text-slate-500">{ticket.project}</td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <select
            defaultValue={ticket.wbsCode ?? ''}
            onChange={(e) => change(e.target.value)}
            disabled={saving}
            className="border border-slate-300 rounded px-2 py-1 text-xs w-48"
          >
            <option value="">— {tTickets('unassigned')} —</option>
            {sortedWbs.map((w) => (
              <option key={w.code} value={w.code}>{w.code} · {w.label}</option>
            ))}
          </select>
          {saving && <span className="text-xs text-slate-400">{tCommon('saving')}</span>}
          {saved  && <span className="text-xs text-green-600">{tCommon('success')}</span>}
          {error  && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </td>
      <td className="px-4 py-2 text-xs text-slate-500 text-right">{fmtH(hours, locale)}</td>
    </tr>
  );
}

interface Props {
  tickets: FmoTicket[];
  wbsEntries: Record<string, FmoWbsEntry>;
  entries: FmoEntry[];
}

export default function TicketsTree({ tickets, wbsEntries, entries }: Props) {
  const t = useTranslations('tickets');
  const tCommon = useTranslations('common');
  const tWbs = useTranslations('wbs');
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());

  function toggleExpand(code: string) {
    setExpandedCodes(prev => {
      const n = new Set(prev);
      n.has(code) ? n.delete(code) : n.add(code);
      return n;
    });
  }

  const hoursMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const e of entries) {
      if (e.ticketId) map.set(e.ticketId, (map.get(e.ticketId) ?? 0) + e.spentTime);
    }
    return map;
  }, [entries]);

  const { byWbs, unassigned } = useMemo(() => {
    const byWbs = new Map<string, FmoTicket[]>();
    const unassigned: FmoTicket[] = [];
    for (const tk of tickets) {
      if (tk.wbsCode) {
        const list = byWbs.get(tk.wbsCode) ?? [];
        list.push(tk);
        byWbs.set(tk.wbsCode, list);
      } else {
        unassigned.push(tk);
      }
    }
    return { byWbs, unassigned };
  }, [tickets]);

  const wbsGroups = useMemo(() => {
    const codes = [...byWbs.keys()].sort((a, b) => a.localeCompare(b));
    return codes.map(code => ({
      code,
      entry: wbsEntries[code],
      tickets: byWbs.get(code)!,
    }));
  }, [byWbs, wbsEntries]);

  return (
    <div className="space-y-1">
      {wbsGroups.map(({ code, entry, tickets: groupTickets }) => {
        const isExpanded = expandedCodes.has(code);
        const label = entry?.label ?? code;
        return (
          <div key={code} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer"
              onClick={() => toggleExpand(code)}
            >
              <span className={`text-slate-400 text-xs transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
              <span className="font-mono text-xs text-slate-500 shrink-0">{code}</span>
              <span className="text-sm font-medium text-slate-800 flex-1 truncate">{label}</span>
              <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5 shrink-0">
                {groupTickets.length}
              </span>
            </div>
            {isExpanded && (
              <div className="border-t border-slate-100">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/60 text-xs text-slate-500">
                    <tr>
                      <th className="px-8 py-2 text-left font-medium">{tCommon('id')}</th>
                      <th className="px-4 py-2 text-left font-medium">{tCommon('name')}</th>
                      <th className="px-4 py-2 text-left font-medium">{tCommon('project')}</th>
                      <th className="px-4 py-2 text-left font-medium">{t('assignWbs')}</th>
                      <th className="px-4 py-2 text-right font-medium">{tCommon('hours')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {groupTickets.map(tk => (
                      <TicketRow
                        key={tk.id}
                        ticket={tk}
                        hours={hoursMap.get(tk.id) ?? 0}
                        wbsEntries={wbsEntries}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {unassigned.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
          <div
            className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-amber-100/50"
            onClick={() => toggleExpand('__unassigned__')}
          >
            <span className={`text-amber-400 text-xs transition-transform shrink-0 ${expandedCodes.has('__unassigned__') ? 'rotate-90' : ''}`}>▶</span>
            <span className="text-sm font-semibold text-amber-800">{tWbs('unassignedTickets')}</span>
            <span className="text-xs text-amber-600 bg-amber-100 rounded-full px-2 py-0.5 ml-auto">
              {unassigned.length}
            </span>
          </div>
          {expandedCodes.has('__unassigned__') && (
            <div className="border-t border-amber-200">
              <table className="w-full text-sm">
                <thead className="bg-amber-50/80 text-xs text-amber-700">
                  <tr>
                    <th className="px-8 py-2 text-left font-medium">{tCommon('id')}</th>
                    <th className="px-4 py-2 text-left font-medium">{tCommon('name')}</th>
                    <th className="px-4 py-2 text-left font-medium">{tCommon('project')}</th>
                    <th className="px-4 py-2 text-left font-medium">{t('assignWbs')}</th>
                    <th className="px-4 py-2 text-right font-medium">{tCommon('hours')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {unassigned.map(tk => (
                    <TicketRow
                      key={tk.id}
                      ticket={tk}
                      hours={hoursMap.get(tk.id) ?? 0}
                      wbsEntries={wbsEntries}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {wbsGroups.length === 0 && unassigned.length === 0 && (
        <div className="bg-white rounded-lg border border-slate-200 px-4 py-8 text-center text-slate-400 text-sm">
          {t('noTickets')}
        </div>
      )}
    </div>
  );
}
