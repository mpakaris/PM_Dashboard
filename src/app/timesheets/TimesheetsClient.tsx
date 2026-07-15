'use client';

import { useState, useEffect, useRef, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TEntry {
  project: string;
  task: string;
  month: string; // YYYY-MM
  user: string;
  spentTime: number;
}

interface TStore {
  entries: TEntry[];
  uploadedAt: string;
  sources: string[];
}

const LS_KEY = 'timesheets_v1';
const EMPTY: TStore = { entries: [], uploadedAt: '', sources: [] };

// ─── CSV Helpers ──────────────────────────────────────────────────────────────

function parseLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQ = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i += 2; }
      else { inQ = !inQ; i++; }
    } else if (ch === ',' && !inQ) {
      fields.push(cur.trim()); cur = ''; i++;
    } else {
      cur += ch; i++;
    }
  }
  fields.push(cur.trim());
  return fields;
}

function datToMonth(dateStr: string): string {
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return '';
  const [, m, y] = parts;
  if (!m || !y) return '';
  return `${y}-${m.padStart(2, '0')}`;
}

async function parseFile(file: File): Promise<TEntry[]> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headerRaw = parseLine(lines[0]);
  const h = headerRaw.map(x => x.toLowerCase().replace(/\s+/g, '_'));
  const iProject = h.indexOf('project');
  const iTask    = h.indexOf('task');
  const iDate    = h.indexOf('date');
  const iUser    = h.indexOf('user');
  const iTime    = h.findIndex(x => x.includes('spent'));
  if ([iProject, iTask, iDate, iUser, iTime].some(x => x < 0)) return [];
  const entries: TEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const project   = cols[iProject]?.trim() ?? '';
    const task      = cols[iTask]?.trim() ?? '';
    const dateStr   = cols[iDate]?.trim() ?? '';
    const user      = cols[iUser]?.trim() ?? '';
    const spentTime = parseFloat(cols[iTime]?.trim() ?? '0') || 0;
    const month     = datToMonth(dateStr);
    if (!month || !user || spentTime <= 0) continue;
    entries.push({ project, task, month, user, spentTime });
  }
  return entries;
}

// ─── Display Helpers ──────────────────────────────────────────────────────────

function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

function fmtH(h: number): string {
  return h.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + 'h';
}

// ─── Hide Button ──────────────────────────────────────────────────────────────

function HideBtn({ isHidden, onToggle }: { isHidden: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={isHidden ? 'Restore row' : 'Hide row'}
      className={`w-5 h-5 flex items-center justify-center rounded text-xs transition-colors ${
        isHidden
          ? 'text-indigo-500 bg-indigo-50 hover:bg-indigo-100'
          : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'
      }`}
    >
      {isHidden ? '↩' : '–'}
    </button>
  );
}

// ─── Person Table ─────────────────────────────────────────────────────────────

function PersonTable({ entries }: { entries: TEntry[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setHidden(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }

  function rowHidden(project: string, task?: string) {
    if (hidden.has(`p:${project}`)) return true;
    if (task !== undefined && hidden.has(`t:${project}:::${task}`)) return true;
    return false;
  }

  const months = useMemo(
    () => [...new Set(entries.map(e => e.month))].sort(),
    [entries]
  );

  const tree = useMemo(() => {
    const map = new Map<string, Map<string, Map<string, number>>>();
    for (const e of entries) {
      if (!map.has(e.project)) map.set(e.project, new Map());
      const tMap = map.get(e.project)!;
      if (!tMap.has(e.task)) tMap.set(e.task, new Map());
      const mMap = tMap.get(e.task)!;
      mMap.set(e.month, (mMap.get(e.month) ?? 0) + e.spentTime);
    }
    return map;
  }, [entries]);

  // totals only from visible rows
  const visibleEntries = useMemo(
    () => entries.filter(e => !rowHidden(e.project, e.task)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, hidden]
  );

  const grandTotal = visibleEntries.reduce((s, e) => s + e.spentTime, 0);
  const totalPerMonth = useMemo(() => {
    const t: Record<string, number> = {};
    for (const e of visibleEntries) t[e.month] = (t[e.month] ?? 0) + e.spentTime;
    return t;
  }, [visibleEntries]);

  const hiddenCount = hidden.size;

  return (
    <div>
      {hiddenCount > 0 && (
        <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-600 flex items-center gap-2">
          <span>{hiddenCount} row{hiddenCount !== 1 ? 's' : ''} hidden — excluded from totals</span>
          <button type="button" onClick={() => setHidden(new Set())} className="underline hover:text-amber-800">
            restore all
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-max">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-200">
              <th className="w-8 px-2 py-2 sticky left-0 bg-gray-100" />
              <th className="text-left px-3 py-2 font-medium text-gray-600 min-w-[260px] sticky left-8 bg-gray-100">
                Project / Task
              </th>
              {months.map(m => (
                <th key={m} className="text-right px-3 py-2 font-medium text-gray-600 min-w-[72px] whitespace-nowrap">
                  {fmtMonth(m)}
                </th>
              ))}
              <th className="text-right px-3 py-2 font-medium text-gray-700 min-w-[72px]">Total</th>
            </tr>
          </thead>
          <tbody>
            {[...tree.entries()].map(([project, taskMap]) => {
              const projHidden = hidden.has(`p:${project}`);

              // visible hours for this project (task-level hides respected)
              const visProj = entries.filter(e => e.project === project && !rowHidden(e.project, e.task));
              const projPerMonth: Record<string, number> = {};
              for (const e of visProj) projPerMonth[e.month] = (projPerMonth[e.month] ?? 0) + e.spentTime;
              const projTotal = Object.values(projPerMonth).reduce((a, b) => a + b, 0);

              return (
                <>
                  {/* Project row */}
                  <tr key={`proj-${project}`} className={`border-b border-indigo-100 ${projHidden ? 'opacity-40' : 'bg-indigo-50'}`}>
                    <td className={`px-2 py-1.5 sticky left-0 ${projHidden ? 'bg-white' : 'bg-indigo-50'}`}>
                      <HideBtn isHidden={projHidden} onToggle={() => toggle(`p:${project}`)} />
                    </td>
                    <td className={`px-3 py-1.5 font-semibold sticky left-8 ${projHidden ? 'line-through text-gray-400 bg-white' : 'text-indigo-700 bg-indigo-50'}`}>
                      {project}
                    </td>
                    {months.map(m => (
                      <td key={m} className={`px-3 py-1.5 text-right font-medium ${projHidden ? 'text-gray-300' : 'text-indigo-600'}`}>
                        {!projHidden && projPerMonth[m] ? fmtH(projPerMonth[m]) : '—'}
                      </td>
                    ))}
                    <td className={`px-3 py-1.5 text-right font-bold ${projHidden ? 'text-gray-300' : 'text-indigo-700'}`}>
                      {projHidden ? '—' : fmtH(projTotal)}
                    </td>
                  </tr>

                  {/* Task rows */}
                  {[...taskMap.entries()].map(([task, monthMap]) => {
                    const taskHid = rowHidden(project, task);
                    const taskTotal = taskHid ? 0 : [...monthMap.values()].reduce((a, b) => a + b, 0);
                    return (
                      <tr key={`task-${task}`} className={`border-b border-gray-50 ${taskHid ? 'opacity-40' : 'hover:bg-gray-50/60'}`}>
                        <td className="px-2 py-1.5 sticky left-0 bg-white">
                          <HideBtn isHidden={taskHid} onToggle={() => toggle(`t:${project}:::${task}`)} />
                        </td>
                        <td className={`px-3 py-1.5 pl-5 sticky left-8 bg-white max-w-[280px] truncate ${taskHid ? 'line-through text-gray-400' : 'text-gray-600'}`} title={task}>
                          ↳ {task}
                        </td>
                        {months.map(m => {
                          const h = taskHid ? 0 : (monthMap.get(m) ?? 0);
                          return (
                            <td key={m} className={`px-3 py-1.5 text-right ${h > 0 ? 'text-gray-700 font-medium' : 'text-gray-200'}`}>
                              {h > 0 ? fmtH(h) : '—'}
                            </td>
                          );
                        })}
                        <td className={`px-3 py-1.5 text-right ${taskHid ? 'text-gray-300' : 'text-gray-600 font-semibold'}`}>
                          {taskHid ? '—' : fmtH(taskTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
              <td className="sticky left-0 bg-gray-50" />
              <td className="px-3 py-2 text-gray-700 sticky left-8 bg-gray-50">
                Total{hiddenCount > 0 && <span className="ml-1 text-xs font-normal text-amber-500">(visible only)</span>}
              </td>
              {months.map(m => (
                <td key={m} className="px-3 py-2 text-right text-indigo-700">
                  {totalPerMonth[m] ? fmtH(totalPerMonth[m]) : '—'}
                </td>
              ))}
              <td className="px-3 py-2 text-right text-indigo-700 font-bold">{fmtH(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TimesheetsClient() {
  const [store, setStore] = useState<TStore>(EMPTY);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setStore(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  function saveStore(s: TStore) {
    setStore(s);
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const files = Array.from(fileRef.current?.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    setUploadMsg(null);
    const allNew: TEntry[] = [];
    const newSources: string[] = [];
    for (const file of files) {
      allNew.push(...await parseFile(file));
      newSources.push(file.name);
    }
    saveStore({ entries: allNew, uploadedAt: new Date().toISOString(), sources: newSources });
    setUploadMsg(`Imported ${allNew.length} entries from ${files.length} file${files.length > 1 ? 's' : ''}.`);
    if (fileRef.current) fileRef.current.value = '';
    setUploading(false);
  }

  function handleClear() {
    if (!confirm('Clear all timesheet data from local storage?')) return;
    saveStore(EMPTY);
    setUploadMsg(null);
  }

  const userMap = useMemo(() => {
    const map = new Map<string, TEntry[]>();
    for (const e of store.entries) {
      if (!map.has(e.user)) map.set(e.user, []);
      map.get(e.user)!.push(e);
    }
    return map;
  }, [store.entries]);

  const users = useMemo(() => [...userMap.keys()].sort(), [userMap]);
  const overallTotal = store.entries.reduce((s, e) => s + e.spentTime, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Timesheets</h1>
        <p className="text-gray-500 text-sm">Upload team member CSV exports to see monthly hours per project and ticket.</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <form onSubmit={handleUpload} className="flex items-center gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">CSV files (one per team member)</label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                multiple
                className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50 cursor-pointer"
              />
            </div>
            <button
              type="submit"
              disabled={uploading}
              className="self-end bg-indigo-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-40"
            >
              {uploading ? 'Importing…' : 'Upload'}
            </button>
          </form>

          <button
            onClick={handleClear}
            className="self-end text-xs text-red-500 hover:text-red-700 border border-red-200 px-3 py-1.5 rounded hover:bg-red-50 transition-colors"
          >
            Clear all
          </button>
        </div>

        {uploadMsg && <p className="mt-3 text-sm text-emerald-600 font-medium">{uploadMsg}</p>}

        {store.sources.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-400">Loaded:</span>
            {store.sources.map(s => (
              <span key={s} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s}</span>
            ))}
            <span className="text-xs text-gray-400 ml-2">·</span>
            <span className="text-xs text-gray-500">
              {users.length} people · {store.entries.length} entries · {fmtH(overallTotal)} total
            </span>
          </div>
        )}
      </div>

      {users.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 px-6 py-16 text-center text-gray-400 text-sm">
          No data yet. Upload CSV files to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {users.map(user => {
            const entries = userMap.get(user)!;
            const total = entries.reduce((s, e) => s + e.spentTime, 0);
            const months = [...new Set(entries.map(e => e.month))].sort();
            const isOpen = !!expanded[user];
            return (
              <div key={user} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded(prev => ({ ...prev, [user]: !prev[user] }))}
                  className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-gray-400 text-xs transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                    <span className="font-semibold text-gray-800">{user}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {months.length} month{months.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-gray-400">
                      {months.length > 0 && `${fmtMonth(months[0])} – ${fmtMonth(months[months.length - 1])}`}
                    </span>
                    <span className="text-indigo-600 font-bold">{fmtH(total)}</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-gray-100">
                    <PersonTable entries={entries} />
                  </div>
                )}
              </div>
            );
          })}
          <div className="bg-gray-50 rounded-lg border border-gray-200 px-5 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-600">Grand Total — all {users.length} people</span>
            <span className="text-lg font-bold text-indigo-700">{fmtH(overallTotal)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
