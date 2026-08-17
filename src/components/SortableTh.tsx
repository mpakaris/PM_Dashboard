'use client';

import type { ReactNode } from 'react';

export function SortableTh({
  col, label, sortKey, sortDir, onSort, right, className,
}: {
  col: string;
  label: ReactNode;
  sortKey: string;
  sortDir: 'asc' | 'desc';
  onSort: (col: string) => void;
  right?: boolean;
  className?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-4 py-2 font-medium cursor-pointer select-none whitespace-nowrap group ${right ? 'text-right' : 'text-left'} ${className ?? ''}`}
    >
      <span className="inline-flex items-center gap-1">
        {!right && label}
        <span className={`text-[10px] leading-none ${active ? 'text-slate-600' : 'text-slate-300 group-hover:text-slate-400'}`}>
          {active ? (sortDir === 'desc' ? '▼' : '▲') : '⇅'}
        </span>
        {right && label}
      </span>
    </th>
  );
}

export function useTableSort<K extends string>(defaultKey: K, defaultDir: 'asc' | 'desc' = 'desc') {
  // Intentionally not a hook — callers own useState; this is a pure helper.
  // Use inline useState + onSort pattern shown below.
}

export function sortBy<T>(
  rows: T[],
  key: string,
  dir: 'asc' | 'desc',
  getValue: (row: T, key: string) => number | string | null | undefined,
): T[] {
  return [...rows].sort((a, b) => {
    const av = getValue(a, key);
    const bv = getValue(b, key);
    const an = av ?? (typeof av === 'number' ? -Infinity : '');
    const bn = bv ?? (typeof bv === 'number' ? -Infinity : '');
    const cmp = typeof an === 'string'
      ? (an as string).localeCompare(bn as string)
      : (an as number) - (bn as number);
    return dir === 'desc' ? -cmp : cmp;
  });
}

export function onSortToggle<K extends string>(
  col: K,
  current: K,
  dir: 'asc' | 'desc',
  setKey: (k: K) => void,
  setDir: (d: 'asc' | 'desc') => void,
) {
  if (current === col) setDir(dir === 'desc' ? 'asc' : 'desc');
  else { setKey(col); setDir('desc'); }
}
