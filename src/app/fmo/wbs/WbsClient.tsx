'use client';

import type { FmoWbsEntry, WbsSubCategory } from '@/lib/types';

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
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

function Type2Badge({
  entry,
  subCategories,
}: {
  entry: FmoWbsEntry;
  subCategories: Record<string, WbsSubCategory>;
}) {
  if (entry.billingClass === 'V') return <span className="text-slate-400">—</span>;

  const slug = entry.subCategoryOverride ?? entry.subCategory;
  if (!slug) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-800">
        Unmapped
      </span>
    );
  }

  const label = subCategories[slug]?.label ?? slug;
  const color = TYPE2_COLORS[slug] ?? 'bg-slate-100 text-slate-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

export default function WbsClient({
  wbsEntries,
  subCategories,
}: {
  wbsEntries: FmoWbsEntry[];
  subCategories: Record<string, WbsSubCategory>;
}) {
  const sorted = [...wbsEntries].sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">WBS Codes</h1>
        <span className="text-sm text-slate-500">{sorted.length} entries</span>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">WBS Code</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Label</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Type 1 (Billing Class)</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Type 2 (Sub-Category)</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((entry) => (
              <tr key={entry.code} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-800">{entry.code}</td>
                <td className="px-4 py-3 text-slate-700">{entry.label || <span className="text-slate-400 italic">—</span>}</td>
                <td className="px-4 py-3">
                  <Type1Badge code={entry.code} />
                </td>
                <td className="px-4 py-3">
                  <Type2Badge entry={entry} subCategories={subCategories} />
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{entry.syncSource}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No WBS codes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
