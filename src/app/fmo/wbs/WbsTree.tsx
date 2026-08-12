'use client';

import { useState, useMemo } from 'react';
import type { FmoWbsEntry, FmoTicket, FmoEntry, WbsSubCategory } from '@/lib/types';

const TYPE1_COLORS: Record<string, string> = {
  V: 'bg-green-100 text-green-800',
  I: 'bg-slate-100 text-slate-700',
};
const TYPE1_LABELS: Record<string, string> = {
  V: 'Billable',
  I: 'Internal',
};
const TYPE2_COLORS: Record<string, string> = {
  admin:     'bg-slate-100 text-slate-700',
  training:  'bg-yellow-100 text-yellow-800',
  presales:  'bg-blue-100 text-blue-800',
  portfolio: 'bg-purple-100 text-purple-800',
  opm:       'bg-orange-100 text-orange-800',
  absence:   'bg-red-100 text-red-800',
};

function Type1Badge({ code }: { code: string }) {
  const prefix = code[0] ?? '?';
  const label  = TYPE1_LABELS[prefix] ?? 'Unknown';
  const color  = TYPE1_COLORS[prefix] ?? 'bg-rose-100 text-rose-800';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>{label}</span>;
}

function Type2Badge({ entry, subCategories }: { entry: FmoWbsEntry; subCategories: Record<string, WbsSubCategory> }) {
  if (entry.billingClass === 'V') return <span className="text-slate-400">—</span>;
  const slug  = entry.subCategoryOverride ?? entry.subCategory;
  if (!slug)  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-800">Unmapped</span>;
  const label = subCategories[slug]?.label ?? slug;
  const color = TYPE2_COLORS[slug] ?? 'bg-slate-100 text-slate-700';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>{label}</span>;
}

interface Props {
  wbsEntries: FmoWbsEntry[];
  subCategories: Record<string, WbsSubCategory>;
  tickets: FmoTicket[];
  entries: FmoEntry[];
  search: string;
}

export default function WbsTree({ wbsEntries, subCategories, tickets, entries, search }: Props) {
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

  const ticketsByWbs = useMemo(() => {
    const map = new Map<string, FmoTicket[]>();
    for (const t of tickets) {
      if (t.wbsCode) {
        const list = map.get(t.wbsCode) ?? [];
        list.push(t);
        map.set(t.wbsCode, list);
      }
    }
    return map;
  }, [tickets]);

  const unassignedTickets = useMemo(() => tickets.filter(t => !t.wbsCode), [tickets]);

  const q = search.toLowerCase();

  const sortedWbs = useMemo(() =>
    [...wbsEntries].sort((a, b) => a.code.localeCompare(b.code)),
    [wbsEntries]
  );

  const visibleWbs = useMemo(() => {
    if (!q) return sortedWbs;
    return sortedWbs.filter(entry => {
      const wbsMatch = entry.code.toLowerCase().includes(q) || entry.label.toLowerCase().includes(q);
      if (wbsMatch) return true;
      const children = ticketsByWbs.get(entry.code) ?? [];
      return children.some(t => String(t.id).includes(q) || t.name.toLowerCase().includes(q));
    });
  }, [sortedWbs, q, ticketsByWbs]);

  const visibleUnassigned = useMemo(() => {
    if (!q) return unassignedTickets;
    return unassignedTickets.filter(t => String(t.id).includes(q) || t.name.toLowerCase().includes(q));
  }, [unassignedTickets, q]);

  function childTickets(code: string): FmoTicket[] {
    const children = ticketsByWbs.get(code) ?? [];
    if (!q) return children;
    const wbsEntry = wbsEntries.find(w => w.code === code);
    const wbsMatch = wbsEntry && (wbsEntry.code.toLowerCase().includes(q) || wbsEntry.label.toLowerCase().includes(q));
    if (wbsMatch) return children;
    return children.filter(t => String(t.id).includes(q) || t.name.toLowerCase().includes(q));
  }

  return (
    <div className="space-y-1">
      {visibleWbs.map(entry => {
        const children = ticketsByWbs.get(entry.code) ?? [];
        const visibleChildren = childTickets(entry.code);
        const isExpanded = expandedCodes.has(entry.code);
        return (
          <div key={entry.code} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div
              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer"
              onClick={() => toggleExpand(entry.code)}
            >
              <span className={`text-slate-400 text-xs transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
              <span className="font-mono text-xs text-slate-700 shrink-0">{entry.code}</span>
              <span className="text-sm text-slate-800 flex-1 truncate">{entry.label || <span className="italic text-slate-400">—</span>}</span>
              <div className="flex items-center gap-2 shrink-0">
                <Type1Badge code={entry.code} />
                <Type2Badge entry={entry} subCategories={subCategories} />
                <span className="text-xs text-slate-400">{entry.syncSource}</span>
                <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                  {children.length} ticket{children.length !== 1 ? 's' : ''}
                </span>
                {(entry.billingClass !== undefined) && (
                  <>
                    <span className="text-xs text-slate-400">
                      Budget: {entry.budgetHours != null ? `${entry.budgetHours}h` : '—'}
                    </span>
                    <span className="text-xs text-slate-400">
                      {entry.budgetValue != null ? `${entry.budgetValue.toLocaleString('de-DE')} €` : '—'}
                    </span>
                  </>
                )}
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-slate-100">
                {visibleChildren.length === 0 ? (
                  <div className="px-8 py-3 text-xs text-slate-400 italic">No tickets</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50/60">
                      <tr className="text-slate-500">
                        <th className="px-8 py-2 text-left font-medium">ID</th>
                        <th className="px-4 py-2 text-left font-medium">Name</th>
                        <th className="px-4 py-2 text-left font-medium">Project</th>
                        <th className="px-4 py-2 text-right font-medium">Hours</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {visibleChildren.map(t => (
                        <tr key={t.id} className="hover:bg-slate-50/60">
                          <td className="px-8 py-2 font-mono text-slate-500">{t.id}</td>
                          <td className="px-4 py-2 text-slate-700 max-w-xs truncate" title={t.name}>{t.name}</td>
                          <td className="px-4 py-2 text-slate-500">{t.project}</td>
                          <td className="px-4 py-2 text-right text-slate-600">{(hoursMap.get(t.id) ?? 0).toFixed(1)}h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        );
      })}

      {(visibleUnassigned.length > 0 || (!q && unassignedTickets.length > 0)) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
          <div
            className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-amber-100/50"
            onClick={() => toggleExpand('__unassigned__')}
          >
            <span className={`text-amber-400 text-xs transition-transform shrink-0 ${expandedCodes.has('__unassigned__') ? 'rotate-90' : ''}`}>▶</span>
            <span className="text-sm font-semibold text-amber-800">⚠ Unassigned Tickets</span>
            <span className="text-xs text-amber-600 bg-amber-100 rounded-full px-2 py-0.5 ml-auto">
              {visibleUnassigned.length} ticket{visibleUnassigned.length !== 1 ? 's' : ''}
            </span>
          </div>
          {expandedCodes.has('__unassigned__') && visibleUnassigned.length > 0 && (
            <div className="border-t border-amber-200">
              <table className="w-full text-xs">
                <thead className="bg-amber-50/80">
                  <tr className="text-amber-700">
                    <th className="px-8 py-2 text-left font-medium">ID</th>
                    <th className="px-4 py-2 text-left font-medium">Name</th>
                    <th className="px-4 py-2 text-left font-medium">Project</th>
                    <th className="px-4 py-2 text-right font-medium">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {visibleUnassigned.map(t => (
                    <tr key={t.id} className="hover:bg-amber-50">
                      <td className="px-8 py-2 font-mono text-amber-700">{t.id}</td>
                      <td className="px-4 py-2 text-slate-700 max-w-xs truncate" title={t.name}>{t.name}</td>
                      <td className="px-4 py-2 text-slate-500">{t.project}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{(hoursMap.get(t.id) ?? 0).toFixed(1)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
