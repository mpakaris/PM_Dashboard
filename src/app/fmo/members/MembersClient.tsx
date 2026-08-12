'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { FmoMember, FmoEntry } from '@/lib/types';

function TypeBadge({ type }: { type: 'intern' | 'extern' }) {
  return type === 'intern'
    ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Intern</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">Extern</span>;
}

export default function MembersClient({
  members,
  entries,
}: {
  members: FmoMember[];
  entries: FmoEntry[];
}) {
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
        <h1 className="text-2xl font-bold text-slate-900">Members</h1>
        <span className="text-sm text-slate-500">{externCount} Extern, {internCount} Intern</span>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Name</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Type</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Partner Company</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">Cost Rate</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">Total Hours</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Actions</th>
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
                      <span className="ml-2 text-amber-500" title="Cost rate not configured">⚠</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><TypeBadge type={m.type} /></td>
                  <td className="px-4 py-3 text-slate-600">{m.partnerCompany || <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{m.costRate > 0 ? `${m.costRate} €/h` : <span className="text-amber-600">—</span>}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{hours.toFixed(1)}h</td>
                  <td className="px-4 py-3">
                    <Link href={`/fmo/members/${m.id}`} className="text-xs text-slate-500 hover:text-slate-800 underline">Edit</Link>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No members yet — import a CSV first.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
