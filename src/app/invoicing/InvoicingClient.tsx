'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ElsapMirror, InvoicingStore, InvoiceLineItem } from '@/lib/types';
import {
  setDefaultRate, setRateOverride, setRoleOverride, removeRoleOverride,
  addInvoiceLine, removeInvoiceLine,
} from '@/actions/invoicing';

interface Props { mirror: ElsapMirror; store: InvoicingStore; }

// ─── View types ───────────────────────────────────────────────────────────────

interface ViewMember  { sapUser: string; name: string; hours: number; originalRole: string; }
interface ViewRole    {
  role: string; members: ViewMember[]; totalHours: number;
  invoiceLines: InvoiceLineItem[]; invoicedHours: number; remainingHours: number;
}
interface ViewProject {
  projectName: string; roles: ViewRole[];
  totalHours: number; invoicedHours: number; remainingHours: number;
}
interface ViewMonth   { month: string; label: string; projects: ViewProject[]; totalHours: number; }

// ─── Build view ───────────────────────────────────────────────────────────────

const MONTHS_DE = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

function buildView(rows: ElsapMirror['rows'], store: InvoicingStore): ViewMonth[] {
  const verbucht = rows.filter(r => r.status === 'Verbucht');
  const overrideMap = new Map(store.roleOverrides.map(o => [`${o.sapUser}|${o.month}|${o.projectName}`, o.role]));

  // Invoice lines lookup: "month|project|role" → lines[]
  const invMap = new Map<string, InvoiceLineItem[]>();
  for (const inv of store.invoices) {
    const k = `${inv.month}|${inv.projectName}|${inv.role}`;
    const list = invMap.get(k) ?? [];
    list.push(inv);
    invMap.set(k, list);
  }

  const acc = new Map<string, Map<string, Map<string, Map<string, { name: string; hours: number; originalRole: string }>>>> ();

  for (const row of verbucht) {
    if (!row.posText) continue;
    const month = `${row.jahr}-${String(row.periode).padStart(2, '0')}`;
    const orig  = row.leistZText || '(no role)';
    const role  = overrideMap.get(`${row.sapUser}|${month}|${row.posText}`) ?? orig;

    const pMap = acc.get(month) ?? new Map(); acc.set(month, pMap);
    const rMap = pMap.get(row.posText) ?? new Map(); pMap.set(row.posText, rMap);
    const mMap = rMap.get(role) ?? new Map(); rMap.set(role, mMap);

    const entry = mMap.get(row.sapUser) ?? { name: row.name || row.sapUser, hours: 0, originalRole: orig };
    entry.hours += row.stunden;
    mMap.set(row.sapUser, entry);
  }

  return [...acc.entries()].sort().reverse().map(([month, pMap]) => {
    const [y, m] = month.split('-');
    const label = `${MONTHS_DE[parseInt(m) - 1]} ${y}`;

    const projects: ViewProject[] = [...pMap.entries()].sort().map(([projectName, rMap]) => {
      const roles: ViewRole[] = [...rMap.entries()].sort().map(([role, mMap]) => {
        const members = [...mMap.entries()]
          .map(([sapUser, d]) => ({ sapUser, name: d.name, hours: d.hours, originalRole: d.originalRole }))
          .sort((a, b) => a.name.localeCompare(b.name));
        const totalHours    = members.reduce((s, m) => s + m.hours, 0);
        const invoiceLines  = invMap.get(`${month}|${projectName}|${role}`) ?? [];
        const invoicedHours = Math.round(invoiceLines.reduce((s, l) => s + l.invoicedHours, 0) * 1000) / 1000;
        const remainingHours = Math.round((totalHours - invoicedHours) * 1000) / 1000;
        return { role, members, totalHours, invoiceLines, invoicedHours, remainingHours };
      });

      const totalHours     = roles.reduce((s, r) => s + r.totalHours, 0);
      const invoicedHours  = roles.reduce((s, r) => s + r.invoicedHours, 0);
      const remainingHours = roles.reduce((s, r) => s + r.remainingHours, 0);
      return { projectName, roles, totalHours, invoicedHours, remainingHours };
    });

    return { month, label, projects, totalHours: projects.reduce((s, p) => s + p.totalHours, 0) };
  });
}

function getRate(store: InvoicingStore, month: string, projectName: string, role: string): number {
  return store.rateOverrides[`${month}|${projectName}|${role}`] ?? store.defaultRates[role] ?? 0;
}

function fmtH(h: number)   { return h.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' h'; }
function fmtEur(n: number) { return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Rate input ───────────────────────────────────────────────────────────────

function RateInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');
  if (editing) return (
    <input autoFocus
      className="w-20 text-right border border-slate-400 rounded px-1 py-0.5 text-sm tabular-nums"
      value={raw} onChange={e => setRaw(e.target.value)}
      onBlur={() => { const v = parseFloat(raw.replace(',', '.')); if (!isNaN(v) && v >= 0) onSave(v); setEditing(false); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }}
    />
  );
  return (
    <button onClick={() => { setRaw(value ? String(value) : ''); setEditing(true); }}
      className="text-slate-600 hover:underline text-sm tabular-nums cursor-text">
      {value ? value.toFixed(2) : '—'} €/h
    </button>
  );
}

// ─── Per-role invoice lines ───────────────────────────────────────────────────

function InvoiceLines({ month, projectName, role, members, rate, lines, onRefresh, isPending }: {
  month: string; projectName: string; role: string; members: ViewMember[];
  rate: number; lines: InvoiceLineItem[]; onRefresh: () => void; isPending: boolean;
}) {
  const [fakturaInput, setFakturaInput] = useState('');
  const [saving, setSaving]             = useState(false);

  // Hours already invoiced per sapUser across all saved lines
  const invoicedByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of lines) {
      for (const m of line.members ?? []) {
        map.set(m.sapUser, (map.get(m.sapUser) ?? 0) + m.hours);
      }
    }
    return map;
  }, [lines]);

  // Members still not fully invoiced
  const remainingMembers = useMemo(() =>
    members
      .map(m => ({ ...m, remainingH: Math.round((m.hours - (invoicedByUser.get(m.sapUser) ?? 0)) * 1000) / 1000 }))
      .filter(m => m.remainingH > 0.001),
    [members, invoicedByUser]
  );

  const totalInvoicedHours  = lines.reduce((s, l) => s + l.invoicedHours, 0);
  const totalHours          = members.reduce((s, m) => s + m.hours, 0);
  const totalRemainingHours = Math.round((totalHours - totalInvoicedHours) * 1000) / 1000;
  const isPostInvoice       = lines.length > 0 && totalRemainingHours > 0.001;

  // All remaining members checked by default (component remounts via key when lines change)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(remainingMembers.map(m => m.sapUser)));

  const selectedMembers    = remainingMembers.filter(m => selected.has(m.sapUser));
  const selectedHours      = Math.round(selectedMembers.reduce((s, m) => s + m.remainingH, 0) * 1000) / 1000;

  const fmtInput = (h: number) => h > 0.001
    ? h.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
  const [hoursInput, setHoursInput] = useState(() => fmtInput(selectedHours));
  useEffect(() => { setHoursInput(fmtInput(selectedHours)); }, [selectedHours]);

  function toggleMember(sapUser: string) {
    setSelected(prev => { const n = new Set(prev); n.has(sapUser) ? n.delete(sapUser) : n.add(sapUser); return n; });
  }

  async function handleAdd() {
    const hours = parseFloat(hoursInput.replace(',', '.'));
    if (!fakturaInput.trim() || isNaN(hours) || hours <= 0) return;
    if (selectedMembers.length === 0) return;
    // Hard guard — cannot invoice more than what's actually remaining
    const cappedHours = Math.min(hours, totalRemainingHours);
    setSaving(true);
    const invoicedMembers = selectedMembers.map(m => ({ sapUser: m.sapUser, name: m.name, hours: m.remainingH }));
    await addInvoiceLine(month, projectName, role, fakturaInput.trim(), cappedHours, invoicedMembers);
    setFakturaInput('');
    setSaving(false);
    onRefresh();
  }

  return (
    <div className="mt-2 space-y-2 border-t border-dashed border-gray-200 pt-2">

      {/* Saved invoice lines with traceability */}
      {lines.map(line => (
        <div key={line.id} className="bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 text-xs space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-emerald-600 font-bold">✓</span>
              <span className="tabular-nums text-gray-700 font-semibold">{fmtH(line.invoicedHours)}</span>
              {rate > 0 && <span className="tabular-nums text-slate-600">{fmtEur(line.invoicedHours * rate)}</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-emerald-700 font-semibold">{line.fakturaNumber}</span>
              <span className="text-gray-400">{fmtDate(line.invoicedAt)}</span>
              <button onClick={async () => { await removeInvoiceLine(line.id); onRefresh(); }}
                className="text-gray-300 hover:text-red-400 transition-colors font-bold ml-1">×</button>
            </div>
          </div>
          {line.members && line.members.length > 0 && (
            <div className="pl-4 space-y-0.5 border-t border-emerald-200 pt-1 mt-1">
              {line.members.map(m => (
                <div key={m.sapUser} className="flex justify-between text-gray-500">
                  <span>{m.name}</span>
                  <span className="tabular-nums">{fmtH(m.hours)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Remaining members with checkboxes */}
      {remainingMembers.length > 0 && (
        <div className="space-y-2">
          {isPostInvoice && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-md px-3 py-2">
              <span className="text-amber-500">⚠</span>
              <span className="text-xs font-semibold text-amber-700">
                {fmtH(totalRemainingHours)} added after last invoice
              </span>
              {rate > 0 && <span className="text-xs text-amber-600 ml-1">· {fmtEur(totalRemainingHours * rate)}</span>}
            </div>
          )}

          {/* Member checkboxes */}
          <div className="space-y-0.5">
            {remainingMembers.map(m => (
              <div key={m.sapUser}
                onClick={() => toggleMember(m.sapUser)}
                className={`flex items-center justify-between py-1 px-2 rounded cursor-pointer select-none transition-colors ${selected.has(m.sapUser) ? 'bg-emerald-50 hover:bg-emerald-100' : 'bg-gray-50 hover:bg-gray-100 opacity-50'}`}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={selected.has(m.sapUser)}
                    onChange={() => toggleMember(m.sapUser)}
                    onClick={e => e.stopPropagation()}
                    className="w-3.5 h-3.5 rounded border-gray-300 accent-emerald-600 pointer-events-none" />
                  <span className="text-xs text-gray-700">{m.name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="tabular-nums text-gray-500">{fmtH(m.remainingH)}</span>
                  {rate > 0 && <span className="tabular-nums text-gray-400 w-24 text-right">{fmtEur(m.remainingH * rate)}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Selected subtotal */}
          <div className="flex items-center justify-between px-2 py-1.5 bg-slate-100 rounded text-xs font-semibold border border-slate-200">
            <span className="text-slate-600">Selected for invoice</span>
            <div className="flex items-center gap-3">
              <span className="tabular-nums text-slate-800">{fmtH(selectedHours)}</span>
              {rate > 0 && <span className="tabular-nums text-slate-700">{fmtEur(selectedHours * rate)}</span>}
            </div>
          </div>

          {/* Input row */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <input value={fakturaInput} onChange={e => setFakturaInput(e.target.value)}
              placeholder="Faktura №"
              className="border border-gray-300 rounded px-3 py-1.5 text-sm w-40 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
            <input value={hoursInput} onChange={e => setHoursInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="Hours"
              className="border border-gray-300 rounded px-3 py-1.5 text-sm w-24 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
            <button onClick={handleAdd}
              disabled={!fakturaInput.trim() || !hoursInput.trim() || selectedMembers.length === 0 || saving || isPending}
              className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40 whitespace-nowrap">
              {saving ? '…' : '+ Invoice'}
            </button>
          </div>
        </div>
      )}

      {totalRemainingHours <= 0.001 && lines.length > 0 && (
        <p className="text-xs text-emerald-600 font-medium">✓ Fully invoiced</p>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function InvoicingClient({ mirror, store }: Props) {
  const router = useRouter();
  const [isPending, startT] = useTransition();
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [showRates, setShowRates] = useState(false);
  const [activeTab, setActiveTab] = useState<'invoice' | 'fakturas'>('invoice');

  const view     = useMemo(() => buildView(mirror.rows, store), [mirror.rows, store]);
  const allRoles = useMemo(() => [...new Set(mirror.rows.map(r => r.leistZText).filter(Boolean))].sort(), [mirror.rows]);

  function refresh() { startT(() => router.refresh()); }
  function toggle(month: string) {
    setExpandedMonths(prev => { const n = new Set(prev); n.has(month) ? n.delete(month) : n.add(month); return n; });
  }

  const cumulative = useMemo(() => {
    let invoicedH = 0, invoicedAmt = 0, remainingH = 0, remainingAmt = 0;
    for (const month of view) {
      for (const project of month.projects) {
        for (const role of project.roles) {
          const rate = getRate(store, month.month, project.projectName, role.role);
          invoicedH   += role.invoicedHours;
          invoicedAmt += role.invoicedHours * rate;
          remainingH  += role.remainingHours;
          remainingAmt += role.remainingHours * rate;
        }
      }
    }
    return { invoicedH, invoicedAmt, remainingH, remainingAmt };
  }, [view, store]);

  return (
    <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Invoicing</h1>
          <p className="text-gray-500 text-sm">Per role — exact invoiced hours per Faktura, remaining tracked automatically.</p>
        </div>
        {activeTab === 'invoice' && (
          <button onClick={() => setShowRates(v => !v)}
            className="text-sm border border-gray-300 rounded px-3 py-1.5 text-gray-600 hover:bg-gray-50 transition-colors">
            {showRates ? 'Hide' : 'Edit'} default rates
          </button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-gray-200 mb-6">
        {(['invoice', 'fakturas'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}>
            {tab === 'invoice' ? 'Ready to Invoice' : 'Fakturas'}
          </button>
        ))}
      </div>

      {activeTab === 'invoice' ? (
        <>
          {/* Cumulative stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-5 py-4">
              <p className="text-xs font-medium text-emerald-600 mb-2">Invoiced (all months)</p>
              <p className="text-2xl font-bold text-emerald-800 tabular-nums">{fmtEur(cumulative.invoicedAmt)}</p>
              <p className="text-sm text-emerald-600 mt-0.5 tabular-nums">{fmtH(cumulative.invoicedH)}</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-4">
              <p className="text-xs font-medium text-amber-600 mb-2">Remaining / pending</p>
              <p className="text-2xl font-bold text-amber-800 tabular-nums">{fmtEur(cumulative.remainingAmt)}</p>
              <p className="text-sm text-amber-600 mt-0.5 tabular-nums">{fmtH(cumulative.remainingH)}</p>
            </div>
          </div>

          {/* Default rates */}
          {showRates && (
            <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
              <p className="text-sm font-semibold text-gray-700 mb-3">Default rates per role</p>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                {allRoles.map(role => (
                  <div key={role} className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 rounded">
                    <span className="text-xs text-gray-600 truncate" title={role}>{role}</span>
                    <RateInput value={store.defaultRates[role] ?? 0} onSave={v => setDefaultRate(role, v).then(refresh)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {view.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 px-6 py-16 text-center text-gray-400 text-sm">
              No Verbucht entries found. Import ELSAP data first.
            </div>
          ) : (
            <div className="space-y-3">
              {view.map(month => (
                <MonthSection key={month.month} month={month} store={store} allRoles={allRoles}
                  expanded={expandedMonths.has(month.month)} onToggle={() => toggle(month.month)}
                  onRefresh={refresh} isPending={isPending} />
              ))}
            </div>
          )}
        </>
      ) : (
        <FakturaView store={store} />
      )}
    </div>
  );
}

// ─── Month totals ─────────────────────────────────────────────────────────────

function MonthTotals({ month, store }: { month: ViewMonth; store: InvoicingStore }) {
  let invoicedH = 0, invoicedAmt = 0, remainingH = 0, remainingAmt = 0;
  for (const p of month.projects) {
    for (const r of p.roles) {
      const rate = getRate(store, month.month, p.projectName, r.role);
      invoicedH   += r.invoicedHours;
      invoicedAmt += r.invoicedHours * rate;
      remainingH  += r.remainingHours;
      remainingAmt += r.remainingHours * rate;
    }
  }
  return (
    <div className="px-5 py-3 bg-slate-50 flex items-center justify-between gap-6 text-sm">
      <span className="font-semibold text-slate-600">{month.label} total</span>
      <div className="flex items-center gap-6 text-xs">
        <span className="text-slate-500">{fmtH(month.totalHours)} ELSAP</span>
        {invoicedH > 0 && <span className="text-emerald-700 font-medium tabular-nums">{fmtH(invoicedH)} · {fmtEur(invoicedAmt)} invoiced</span>}
        {remainingH > 0.001 && <span className="text-amber-600 font-medium tabular-nums">{fmtH(remainingH)} · {fmtEur(remainingAmt)} remaining</span>}
        <span className="font-bold text-slate-800 tabular-nums border-l border-slate-300 pl-6">{fmtEur(invoicedAmt + remainingAmt)}</span>
      </div>
    </div>
  );
}

// ─── Month section ────────────────────────────────────────────────────────────

function MonthSection({ month, store, allRoles, expanded, onToggle, onRefresh, isPending }: {
  month: ViewMonth; store: InvoicingStore; allRoles: string[];
  expanded: boolean; onToggle: () => void; onRefresh: () => void; isPending: boolean;
}) {
  let invoicedAmt = 0, remainingAmt = 0, totalAmt = 0;
  for (const p of month.projects) {
    for (const r of p.roles) {
      const rate = getRate(store, month.month, p.projectName, r.role);
      invoicedAmt  += r.invoicedHours * rate;
      remainingAmt += r.remainingHours * rate;
      totalAmt     += r.totalHours * rate;
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors text-left">
        <div className="flex items-center gap-3">
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-semibold text-gray-800 text-sm">{month.label}</span>
          <span className="text-xs text-gray-400">{month.projects.length} project{month.projects.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-gray-500 tabular-nums">{fmtH(month.totalHours)}</span>
          <span className="font-semibold text-slate-700 tabular-nums">{fmtEur(totalAmt)}</span>
          {invoicedAmt > 0 && <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-medium tabular-nums">{fmtEur(invoicedAmt)} invoiced</span>}
          {remainingAmt > 0.01 && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium tabular-nums">{fmtEur(remainingAmt)} pending</span>}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-100">
          {month.projects.map(project => (
            <ProjectCard key={project.projectName} project={project} month={month.month}
              store={store} allRoles={allRoles} onRefresh={onRefresh} isPending={isPending} />
          ))}
          <MonthTotals month={month} store={store} />
        </div>
      )}
    </div>
  );
}

// ─── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({ project, month, store, allRoles, onRefresh, isPending }: {
  project: ViewProject; month: string; store: InvoicingStore; allRoles: string[];
  onRefresh: () => void; isPending: boolean;
}) {
  const invoicedAmt  = project.roles.reduce((s, r) => s + r.invoicedHours  * getRate(store, month, project.projectName, r.role), 0);
  const remainingAmt = project.roles.reduce((s, r) => s + r.remainingHours * getRate(store, month, project.projectName, r.role), 0);
  const totalAmt     = invoicedAmt + remainingAmt;
  const fullyInvoiced = project.remainingHours <= 0.001 && project.totalHours > 0;

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800 text-sm">{project.projectName}</h3>
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${fullyInvoiced ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {fullyInvoiced ? '✓ Fully invoiced' : `${fmtH(project.remainingHours)} remaining`}
        </span>
      </div>

      <div className="mb-4 divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
        {project.roles.map(role => {
          const rate = getRate(store, month, project.projectName, role.role);
          const isOverride = `${month}|${project.projectName}|${role.role}` in store.rateOverrides;
          return (
            <div key={role.role} className="px-4 py-3 bg-white">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{role.role}</span>
                <div className="flex items-center gap-2 text-xs">
                  <RateInput value={rate} onSave={v => setRateOverride(month, project.projectName, role.role, v).then(onRefresh)} />
                  {isOverride && <span className="text-sky-600">(custom)</span>}
                </div>
              </div>

              <div className="space-y-0.5">
                {role.members.map(member => (
                  <MemberRow key={member.sapUser} member={member} month={month}
                    projectName={project.projectName} allRoles={allRoles}
                    rate={rate} store={store} onRefresh={onRefresh} />
                ))}
              </div>

              <div className="flex items-center mt-1.5 pt-1.5 border-t border-gray-100 text-xs text-gray-500">
                <span className="flex-1 font-medium">Subtotal</span>
                <span className="shrink-0 w-28 hidden sm:block" />
                <span className="shrink-0 w-16 text-right font-semibold text-gray-700 tabular-nums">{fmtH(role.totalHours)}</span>
                {rate > 0
                  ? <span className="shrink-0 w-28 text-right font-semibold text-slate-700 tabular-nums">{fmtEur(role.totalHours * rate)}</span>
                  : <span className="shrink-0 w-28" />}
              </div>

              <InvoiceLines
                key={`${month}|${project.projectName}|${role.role}|${role.invoiceLines.length}|${role.invoicedHours}`}
                month={month} projectName={project.projectName} role={role.role}
                members={role.members} rate={rate} lines={role.invoiceLines}
                onRefresh={onRefresh} isPending={isPending} />
            </div>
          );
        })}
      </div>

      {/* Project total bar */}
      <div className="flex items-center justify-between px-5 py-3 -mx-5 -mb-4 mt-3 bg-slate-700 border-t-2 border-slate-800">
        <div className="text-sm font-semibold text-white">
          {fmtH(project.totalHours)} ELSAP
          {invoicedAmt > 0 && <span className="ml-3 text-emerald-300">{fmtH(project.invoicedHours)} · {fmtEur(invoicedAmt)} invoiced</span>}
        </div>
        {remainingAmt > 0.01
          ? <span className="text-amber-300 text-sm font-medium tabular-nums">{fmtH(project.remainingHours)} · {fmtEur(remainingAmt)} pending</span>
          : project.totalHours > 0
            ? <span className="text-emerald-300 text-sm font-medium">✓ Fully invoiced</span>
            : null}
      </div>
    </div>
  );
}

// ─── Member row ───────────────────────────────────────────────────────────────

function MemberRow({ member, month, projectName, allRoles, rate, store, onRefresh }: {
  member: ViewMember; month: string; projectName: string; allRoles: string[];
  rate: number; store: InvoicingStore; onRefresh: () => void;
}) {
  const override = store.roleOverrides.find(o => o.sapUser === member.sapUser && o.month === month && o.projectName === projectName);

  async function handleRoleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRole = e.target.value;
    if (newRole === member.originalRole) await removeRoleOverride(member.sapUser, month, projectName);
    else await setRoleOverride(member.sapUser, month, projectName, newRole);
    onRefresh();
  }

  return (
    <div className="flex items-center justify-between py-0.5 pl-3 text-sm">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-gray-700 truncate">{member.name}</span>
        {override && <span className="text-xs text-sky-500 shrink-0">↪ overridden</span>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <select value={override?.role ?? member.originalRole} onChange={handleRoleChange}
          className="text-xs border border-gray-200 rounded px-1.5 py-0.5 text-gray-500 focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white">
          {allRoles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <span className="font-medium text-gray-700 tabular-nums w-16 text-right">{fmtH(member.hours)}</span>
        {rate > 0 && <span className="text-slate-500 tabular-nums w-28 text-right text-xs">{fmtEur(member.hours * rate)}</span>}
      </div>
    </div>
  );
}

// ─── Faktura view ─────────────────────────────────────────────────────────────

interface FakturaGroup {
  fakturaNumber: string;
  createdAt: string;
  periodStart: string; // "DD.MM.YYYY" — first day of earliest month
  periodEnd: string;   // "DD.MM.YYYY" — last day of latest month
  lines: InvoiceLineItem[];
  totalHours: number;
  totalAmount: number;
}

function buildFakturas(store: InvoicingStore): FakturaGroup[] {
  const map = new Map<string, InvoiceLineItem[]>();
  for (const inv of store.invoices) {
    const list = map.get(inv.fakturaNumber) ?? [];
    list.push(inv);
    map.set(inv.fakturaNumber, list);
  }
  const fmtDay = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return [...map.entries()]
    .map(([fakturaNumber, lines]) => {
      const sorted = [...lines].sort((a, b) => a.invoicedAt.localeCompare(b.invoicedAt));
      const months = [...new Set(lines.map(l => l.month))].sort();
      const [minY, minM] = months[0].split('-').map(Number);
      const [maxY, maxM] = months[months.length - 1].split('-').map(Number);
      return {
        fakturaNumber,
        lines: sorted,
        createdAt: sorted[0].invoicedAt,
        periodStart: fmtDay(new Date(minY, minM - 1, 1)),
        periodEnd:   fmtDay(new Date(maxY, maxM, 0)),   // day 0 of next month = last day of maxM
        totalHours: lines.reduce((s, l) => s + l.invoicedHours, 0),
        totalAmount: lines.reduce((s, l) => s + l.invoicedHours * getRate(store, l.month, l.projectName, l.role), 0),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function generateFakturaPDF(faktura: FakturaGroup, store: InvoicingStore) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  function monthLabel(m: string) {
    const [y, mo] = m.split('-');
    return `${MONTHS_DE[parseInt(mo) - 1]} ${y}`;
  }
  function num(n: number, decimals = 2) {
    return n.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Faktura', 14, 24);
  doc.setTextColor(80, 80, 80);
  doc.text(faktura.fakturaNumber, 46, 24);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Datum: ${new Date(faktura.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`, 14, 33);

  // Column x positions — member rows
  const C = { name: 20, hours: 152, rateCol: 170, amount: 196 };
  const trunc = (s: string, max: number) => s.length > max ? s.slice(0, max - 1) + '…' : s;

  let y = 46;

  for (const line of faktura.lines) {
    if (y > 255) { doc.addPage(); y = 20; }

    const rate = getRate(store, line.month, line.projectName, line.role);
    const members = line.members && line.members.length > 0
      ? line.members
      : [{ sapUser: '', name: '(gesamt)', hours: line.invoicedHours }];

    // Group header: month · project · role
    doc.setFillColor(240, 242, 244);
    doc.rect(14, y - 4.5, 182, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(60, 60, 60);
    doc.text(monthLabel(line.month), 16, y);
    doc.text(trunc(line.projectName, 28), 40, y);
    doc.text(trunc(line.role, 28), 110, y);
    doc.setTextColor(0, 0, 0);
    y += 7;

    // One row per member
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);

    for (const m of members) {
      if (y > 268) { doc.addPage(); y = 20; }
      doc.setDrawColor(225, 225, 225);
      doc.line(14, y - 2.5, 196, y - 2.5);

      doc.text(m.name, C.name, y);
      doc.text(num(m.hours) + ' h', C.hours, y, { align: 'right' });
      if (rate > 0) {
        doc.setTextColor(130, 130, 130);
        doc.setFontSize(7.5);
        doc.text(num(rate) + ' €/h', C.rateCol, y, { align: 'right' });
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.text(num(m.hours * rate) + ' €', C.amount, y, { align: 'right' });
        doc.setFont('helvetica', 'normal');
      }
      y += 6;
    }

    // Subtotal if >1 member
    if (members.length > 1) {
      if (y > 268) { doc.addPage(); y = 20; }
      doc.setDrawColor(100, 100, 100);
      doc.line(14, y - 2, 196, y - 2);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      doc.text('Summe', C.name, y);
      doc.text(num(line.invoicedHours) + ' h', C.hours, y, { align: 'right' });
      if (rate > 0) doc.text(num(line.invoicedHours * rate) + ' €', C.amount, y, { align: 'right' });
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      y += 8;
    } else {
      y += 3;
    }
  }

  // Grand total
  y += 4;
  doc.setDrawColor(0, 0, 0);
  doc.line(14, y - 2, 196, y - 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('Gesamt', 14, y + 5);
  doc.text(num(faktura.totalHours) + ' h', C.hours, y + 5, { align: 'right' });
  if (faktura.totalAmount > 0) doc.text(num(faktura.totalAmount) + ' €', C.amount, y + 5, { align: 'right' });

  doc.save(`Faktura_${faktura.fakturaNumber}.pdf`);
}

function FakturaView({ store }: { store: InvoicingStore }) {
  const fakturas = useMemo(() => buildFakturas(store), [store]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return fakturas;
    return fakturas.filter(f => {
      if (f.fakturaNumber.toLowerCase().includes(q)) return true;
      return f.lines.some(l =>
        l.projectName.toLowerCase().includes(q) ||
        l.role.toLowerCase().includes(q) ||
        (l.members ?? []).some(m => m.name.toLowerCase().includes(q))
      );
    });
  }, [fakturas, query]);

  function toggleExpand(num: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(num) ? n.delete(num) : n.add(num); return n; });
  }
  function toggleSelect(e: React.MouseEvent, num: string) {
    e.stopPropagation();
    setSelected(prev => { const n = new Set(prev); n.has(num) ? n.delete(num) : n.add(num); return n; });
  }
  function toggleSelectAll() {
    setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(f => f.fakturaNumber)));
  }

  async function downloadSelected() {
    const toDownload = filtered.filter(f => selected.has(f.fakturaNumber));
    setDownloading(true);
    for (let i = 0; i < toDownload.length; i++) {
      if (i > 0) await new Promise<void>(r => setTimeout(r, 350));
      await generateFakturaPDF(toDownload[i], store);
    }
    setDownloading(false);
  }

  if (fakturas.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 px-6 py-16 text-center text-gray-400 text-sm">
        No Fakturas found. Create invoice lines in the &ldquo;Ready to Invoice&rdquo; tab first.
      </div>
    );
  }

  const allSelected = filtered.length > 0 && filtered.every(f => selected.has(f.fakturaNumber));

  return (
    <div className="space-y-3">
      {/* Search + toolbar */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
          <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
            className="w-4 h-4 rounded border-gray-300 accent-emerald-600" />
        </label>
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by Faktura №, project, role, or member…"
            className="w-full pl-9 pr-8 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400"
          />
          {query && (
            <button onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              ×
            </button>
          )}
        </div>
        <span className="text-sm text-gray-400 shrink-0 tabular-nums">
          {filtered.length}{filtered.length !== fakturas.length ? `/${fakturas.length}` : ''} Faktura{fakturas.length !== 1 ? 's' : ''}
        </span>
        {selected.size > 0 && (
          <button onClick={downloadSelected} disabled={downloading}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40 shrink-0">
            {downloading ? '…' : `↓ PDF${selected.size > 1 ? 's' : ''} (${selected.size})`}
          </button>
        )}
      </div>

      {filtered.length === 0 && query && (
        <div className="bg-white rounded-lg border border-gray-200 px-6 py-10 text-center text-gray-400 text-sm">
          No Fakturas match &ldquo;{query}&rdquo;
        </div>
      )}

      {/* Faktura rows */}
      {filtered.map(f => (
        <div key={f.fakturaNumber} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => toggleExpand(f.fakturaNumber)}>
            <input type="checkbox" checked={selected.has(f.fakturaNumber)}
              onClick={e => toggleSelect(e, f.fakturaNumber)} onChange={() => {}}
              className="w-4 h-4 rounded border-gray-300 accent-emerald-600 shrink-0" />
            <svg className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${expanded.has(f.fakturaNumber) ? 'rotate-90' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-800 text-sm">{f.fakturaNumber}</div>
              <div className="text-xs text-gray-400 tabular-nums mt-0.5">{f.periodStart} – {f.periodEnd}</div>
            </div>
            <span className="text-xs text-gray-400 tabular-nums">{fmtDate(f.createdAt)}</span>
            <span className="text-xs text-gray-400">{f.lines.length} line{f.lines.length !== 1 ? 's' : ''}</span>
            <span className="text-xs text-gray-500 tabular-nums">{fmtH(f.totalHours)}</span>
            {f.totalAmount > 0 && <span className="text-sm font-semibold text-slate-700 tabular-nums">{fmtEur(f.totalAmount)}</span>}
            <button
              onClick={async e => { e.stopPropagation(); await generateFakturaPDF(f, store); }}
              className="text-xs text-emerald-600 hover:text-emerald-800 border border-emerald-200 hover:border-emerald-400 rounded px-2 py-0.5 transition-colors shrink-0 ml-1">
              ↓ PDF
            </button>
          </div>

          {expanded.has(f.fakturaNumber) && (
            <div className="border-t border-gray-100 divide-y divide-gray-100">
              {f.lines.map(line => {
                const rate = getRate(store, line.month, line.projectName, line.role);
                const [y, mo] = line.month.split('-');
                return (
                  <div key={line.id} className="px-6 py-3 bg-gray-50">
                    <div className="flex items-center justify-between text-sm gap-3">
                      <span className="text-xs text-gray-400 w-14 shrink-0 tabular-nums">
                        {MONTHS_DE[parseInt(mo) - 1]} {y}
                      </span>
                      <span className="font-medium text-gray-800 flex-1 truncate">{line.projectName}</span>
                      <span className="text-xs text-gray-500 truncate">{line.role}</span>
                      <div className="flex items-center gap-3 shrink-0 text-xs">
                        <span className="tabular-nums text-gray-700 font-medium">{fmtH(line.invoicedHours)}</span>
                        {rate > 0 && <span className="tabular-nums text-slate-600">{fmtEur(line.invoicedHours * rate)}</span>}
                        <span className="text-gray-400 tabular-nums">{fmtDate(line.invoicedAt)}</span>
                      </div>
                    </div>
                    {line.members && line.members.length > 0 && (
                      <div className="mt-1.5 pl-14 space-y-0.5">
                        {line.members.map(m => (
                          <div key={m.sapUser} className="flex items-center justify-between text-xs text-gray-500">
                            <span>{m.name}</span>
                            <div className="flex items-center gap-3 tabular-nums">
                              <span>{fmtH(m.hours)}</span>
                              {rate > 0 && <span className="text-gray-400 text-xs">{fmtEur(rate)} /h</span>}
                              {rate > 0 && <span className="font-medium text-gray-700 w-24 text-right">{fmtEur(m.hours * rate)}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
