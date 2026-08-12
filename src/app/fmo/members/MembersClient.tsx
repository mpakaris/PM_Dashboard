'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { fmtH, type Locale } from '@/lib/i18n';
import type { FmoMember, FmoEntry } from '@/lib/types';

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

  const hoursMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) map.set(e.user, (map.get(e.user) ?? 0) + e.spentTime);
    return map;
  }, [entries]);

  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name));
  const externCount = sorted.filter((m) => m.type === 'extern').length;
  const internCount = sorted.filter((m) => m.type === 'intern').length;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <span className="text-sm text-slate-500">{t('countSummary', { extern: externCount, intern: internCount })}</span>
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
              <th className="px-4 py-3 text-left font-semibold text-slate-600">{t('actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((m) => {
              const hours = hoursMap.get(m.name) ?? 0;
              return (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {m.name}
                    {m.costRate === 0 && (
                      <span className="ml-2 text-amber-500" title={t('missingCost')}>⚠</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={m.type} tIntern={t('intern')} tExtern={t('extern')} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{m.partnerCompany || <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{m.costRate > 0 ? `${m.costRate} €/h` : <span className="text-amber-600">—</span>}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{fmtH(hours, locale)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/fmo/members/${m.id}`} className="text-xs text-slate-500 hover:text-slate-800 underline">{tCommon('edit')}</Link>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">{t('noMembers')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
