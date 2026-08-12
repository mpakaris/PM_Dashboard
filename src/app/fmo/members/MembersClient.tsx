'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { fmtH, type Locale } from '@/lib/i18n';
import type { FmoMember, FmoEntry } from '@/lib/types';

type MatchReason =
  | { kind: 'ticket'; label: string; hours: number }
  | { kind: 'project'; label: string; hours: number }
  | null;

function TypeBadge({ type, tIntern, tExtern }: { type: 'intern' | 'extern'; tIntern: string; tExtern: string }) {
  return type === 'intern'
    ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">{tIntern}</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">{tExtern}</span>;
}

export default function MembersClient({
  members,
  entries,
}: {
  members: FmoMember[];
  entries: FmoEntry[];
}) {
  const t = useTranslations('members');
  const tCommon = useTranslations('common');
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [query, setQuery] = useState('');

  const byMember = useMemo(() => {
    const map = new Map<string, FmoEntry[]>();
    for (const e of entries) {
      if (!map.has(e.user)) map.set(e.user, []);
      map.get(e.user)!.push(e);
    }
    return map;
  }, [entries]);

  const hoursMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const [user, es] of byMember) {
      map.set(user, es.reduce((s, e) => s + e.spentTime, 0));
    }
    return map;
  }, [byMember]);

  const sorted = useMemo(() => [...members].sort((a, b) => a.name.localeCompare(b.name)), [members]);

  const filteredWithReason = useMemo<{ m: FmoMember; reason: MatchReason }[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted.map(m => ({ m, reason: null }));

    const result: { m: FmoMember; reason: MatchReason }[] = [];
    for (const m of sorted) {
      // Name match — no reason badge needed
      if (m.name.toLowerCase().includes(q)) {
        result.push({ m, reason: null });
        continue;
      }

      const memberEntries = byMember.get(m.name) ?? [];

      // Ticket match (by name or numeric id)
      const ticketEntries = memberEntries.filter(e =>
        e.ticketName.toLowerCase().includes(q) ||
        (e.ticketId !== null && String(e.ticketId).includes(q))
      );
      if (ticketEntries.length) {
        // pick the ticket with most hours as the representative label
        const byTicket = new Map<string, { label: string; hours: number }>();
        for (const e of ticketEntries) {
          const key = e.ticketId != null ? String(e.ticketId) : e.ticketName;
          const ex = byTicket.get(key) ?? {
            label: e.ticketId != null ? `#${e.ticketId} · ${e.ticketName}` : e.ticketName,
            hours: 0,
          };
          ex.hours += e.spentTime;
          byTicket.set(key, ex);
        }
        const top = [...byTicket.values()].sort((a, b) => b.hours - a.hours)[0];
        result.push({ m, reason: { kind: 'ticket', label: top.label, hours: top.hours } });
        continue;
      }

      // Project match
      const projectEntries = memberEntries.filter(e => e.project.toLowerCase().includes(q));
      if (projectEntries.length) {
        const byProject = new Map<string, number>();
        for (const e of projectEntries) byProject.set(e.project, (byProject.get(e.project) ?? 0) + e.spentTime);
        const topProject = [...byProject.entries()].sort((a, b) => b[1] - a[1])[0];
        result.push({ m, reason: { kind: 'project', label: topProject[0], hours: topProject[1] } });
      }
    }
    return result;
  }, [sorted, byMember, query]);

  const externCount = sorted.filter(m => m.type === 'extern').length;
  const internCount = sorted.filter(m => m.type === 'intern').length;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <span className="text-sm text-slate-500">{t('countSummary', { extern: externCount, intern: internCount })}</span>
      </div>

      {/* Smart search */}
      <div className="space-y-1">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, ticket or project…"
            className="w-full pl-9 pr-9 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-lg leading-none"
            >
              ×
            </button>
          )}
        </div>
        {query && (
          <p className="text-xs text-slate-400 pl-1">
            {filteredWithReason.length} of {sorted.length} members
          </p>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">{t('name')}</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">{t('type')}</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">{t('partnerCompany')}</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">{t('costRate')}</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">{t('totalHours')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredWithReason.map(({ m, reason }) => {
              const hours = hoursMap.get(m.name) ?? 0;
              return (
                <tr
                  key={m.id}
                  onClick={() => router.push(`/fmo/members/${m.id}`)}
                  className="hover:bg-slate-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{m.name}</span>
                      {m.costRate === 0 && (
                        <span className="text-amber-500" title={t('missingCost')}>⚠</span>
                      )}
                      {reason && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-normal ${
                          reason.kind === 'ticket'
                            ? 'bg-indigo-50 text-indigo-600'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {reason.kind === 'ticket' ? 'Ticket' : 'Project'}:{' '}
                          {reason.label.length > 42 ? reason.label.slice(0, 42) + '…' : reason.label}
                          {' '}· {fmtH(reason.hours, locale)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={m.type} tIntern={t('intern')} tExtern={t('extern')} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{m.partnerCompany || <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{m.costRate > 0 ? `${m.costRate} €/h` : <span className="text-amber-600">—</span>}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{fmtH(hours, locale)}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/fmo/members/${m.id}`}
                      onClick={e => e.stopPropagation()}
                      className="text-xs text-slate-400 hover:text-slate-700 whitespace-nowrap"
                    >
                      Details →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filteredWithReason.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {query ? `No members match "${query}"` : t('noMembers')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
