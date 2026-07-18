'use client';

import { useState, useMemo, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  SubContractorStore, SubContractor, SubMember, SubInvoice, SubInvoiceLine,
  ElsapMirror, AppData, InvoicingStore,
} from '@/lib/types';
import { createSubReference, deleteSubInvoice } from '@/actions/subcontractors';

interface Props {
  subStore: SubContractorStore;
  mirror: ElsapMirror;
  appData: AppData;
  invoicingStore: InvoicingStore;
}

const MONTHS_DE = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
function monthLabel(m: string) { const [y, mo] = m.split('-'); return `${MONTHS_DE[parseInt(mo) - 1]} ${y}`; }
function fmtH(h: number)    { return h.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' h'; }
function fmtSubH(h: number) { return h.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' h'; }
function fmtEur(n: number) { return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); }

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SubInvoicesClient({ subStore, mirror, appData, invoicingStore }: Props) {
  const router = useRouter();
  const [, startT] = useTransition();
  const [activeTab, setActiveTab] = useState<'match' | 'references'>('match');
  const [selectedSubId, setSelectedSubId] = useState(subStore.subContractors[0]?.id ?? '');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  function refresh() { startT(() => router.refresh()); }
  function toggleMonth(m: string) {
    setExpandedMonths(prev => { const n = new Set(prev); n.has(m) ? n.delete(m) : n.add(m); return n; });
  }

  const selectedSub = subStore.subContractors.find(s => s.id === selectedSubId);
  const subSapUsers = useMemo(() => new Set(selectedSub?.members.map(m => m.sapUser) ?? []), [selectedSub]);
  const relevantRows = useMemo(() =>
    mirror.rows.filter(r => r.status === 'Verbucht' && subSapUsers.has(r.sapUser)),
    [mirror.rows, subSapUsers]
  );
  const months = useMemo(() => {
    const s = new Set(relevantRows.map(r => `${r.jahr}-${String(r.periode).padStart(2, '0')}`));
    return [...s].sort().reverse();
  }, [relevantRows]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Invoicing Subs</h1>
        <p className="text-gray-500 text-sm">Match sub contractor invoices against ELSAP entries.</p>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-gray-200 mb-6">
        {(['match', 'references'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}>
            {tab === 'match' ? 'Match' : 'References'}
          </button>
        ))}
      </div>

      {activeTab === 'match' ? (
        subStore.subContractors.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 px-6 py-16 text-center text-gray-400 text-sm">
            No sub contractors configured. Add one under <strong>Organisation › Subs</strong> first.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700 shrink-0">Sub Contractor</label>
              <select value={selectedSubId} onChange={e => setSelectedSubId(e.target.value)}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white min-w-64">
                {subStore.subContractors.map(s => (
                  <option key={s.id} value={s.id}>{s.shortName || s.name}</option>
                ))}
              </select>
            </div>

            {selectedSub && months.length === 0 && (
              <div className="bg-white rounded-lg border border-gray-200 px-6 py-12 text-center text-gray-400 text-sm">
                No Verbucht ELSAP entries found for {selectedSub.shortName || selectedSub.name}.
              </div>
            )}

            {selectedSub && months.map(month => (
              <MonthCard
                key={month} month={month}
                rows={relevantRows.filter(r => `${r.jahr}-${String(r.periode).padStart(2, '0')}` === month)}
                sub={selectedSub}
                invoices={subStore.invoices.filter(i => i.subContractorId === selectedSubId && i.month === month)}
                invoicingStore={invoicingStore}
                expanded={expandedMonths.has(month)}
                onToggle={() => toggleMonth(month)}
                onRefresh={refresh}
              />
            ))}
          </div>
        )
      ) : (
        <ReferencesView subStore={subStore} mirror={mirror} invoicingStore={invoicingStore} />
      )}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ElsapEntry { key: string; project: string; role: string; hours: number; }
interface PersonData  { sapUser: string; name: string; entries: ElsapEntry[]; totalHours: number; }

function buildPersonData(rows: ElsapMirror['rows']): PersonData[] {
  const map = new Map<string, PersonData>();
  for (const r of rows) {
    const p = map.get(r.sapUser) ?? { sapUser: r.sapUser, name: r.name || r.sapUser, entries: [], totalHours: 0 };
    p.totalHours += r.stunden;
    const role = r.leistZText || '(no role)', project = r.posText || '(no project)', key = `${project}|${role}`;
    const ex = p.entries.find(e => e.key === key);
    if (ex) ex.hours += r.stunden; else p.entries.push({ key, project, role, hours: r.stunden });
    map.set(r.sapUser, p);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function getFactor(member: SubMember | null, entries: ElsapEntry[], set1Rates: Record<string, number>) {
  if (!member) return 1;
  const rh: Record<string, number> = {};
  for (const e of entries) rh[e.role] = (rh[e.role] ?? 0) + e.hours;
  const elsapRole = Object.entries(rh).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  return (member.role !== elsapRole && set1Rates[member.role] && set1Rates[elsapRole])
    ? set1Rates[member.role] / set1Rates[elsapRole] : 1;
}

// ─── Month card ───────────────────────────────────────────────────────────────

function MonthCard({ month, rows, sub, invoices, invoicingStore, expanded, onToggle, onRefresh }: {
  month: string; rows: ElsapMirror['rows']; sub: SubContractor;
  invoices: SubInvoice[]; invoicingStore: InvoicingStore;
  expanded: boolean; onToggle: () => void; onRefresh: () => void;
}) {
  const persons = useMemo(() => buildPersonData(rows), [rows]);

  const referencedKeys = useMemo(() => {
    const result: Record<string, Set<string>> = {};
    for (const inv of invoices)
      for (const line of inv.lines) {
        if (!result[line.sapUser]) result[line.sapUser] = new Set();
        for (const k of line.elsapEntryKeys) result[line.sapUser].add(k);
      }
    return result;
  }, [invoices]);

  const [checked, setChecked] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    setChecked(prev => {
      const next: Record<string, Set<string>> = {};
      for (const p of persons) {
        const ref = referencedKeys[p.sapUser] ?? new Set();
        next[p.sapUser] = new Set([...(prev[p.sapUser] ?? [])].filter(k => !ref.has(k)));
      }
      return next;
    });
  }, [invoices, persons, referencedKeys]);

  function toggle(sapUser: string, key: string) {
    setChecked(prev => {
      const cur = new Set(prev[sapUser] ?? []);
      cur.has(key) ? cur.delete(key) : cur.add(key);
      return { ...prev, [sapUser]: cur };
    });
  }
  function toggleAll(sapUser: string, keys: string[]) {
    setChecked(prev => {
      const cur = prev[sapUser] ?? new Set();
      return { ...prev, [sapUser]: cur.size === keys.length ? new Set() : new Set(keys) };
    });
  }

  const totalElsap = persons.reduce((s, p) => s + p.totalHours, 0);
  const unreferencedH = persons.reduce((s, p) => {
    const ref = referencedKeys[p.sapUser] ?? new Set();
    return s + p.entries.filter(e => !ref.has(e.key)).reduce((h, e) => h + e.hours, 0);
  }, 0);
  const allReferenced = unreferencedH === 0 && invoices.length > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left">
        <svg className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-semibold text-gray-800 text-sm">{monthLabel(month)}</span>
        <span className="text-xs text-gray-400">{persons.length} member{persons.length !== 1 ? 's' : ''}</span>
        <span className="text-xs text-gray-500 tabular-nums">{fmtH(totalElsap)} ELSAP</span>
        {allReferenced ? (
          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-medium">✓ Fully referenced</span>
        ) : (
          <>
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-medium tabular-nums">{fmtH(totalElsap - unreferencedH)} referenced</span>
            <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded font-medium">{invoices.length} reference{invoices.length !== 1 ? 's' : ''}</span>
            {unreferencedH > 0 && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium tabular-nums">{fmtH(unreferencedH)} open</span>}
          </>
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          <div className="divide-y divide-gray-100">
            {persons.map(person => (
              <PersonSection
                key={person.sapUser}
                person={person}
                member={sub.members.find(m => m.sapUser === person.sapUser) ?? null}
                invoicingStore={invoicingStore}
                invoices={invoices}
                referencedKeys={referencedKeys[person.sapUser] ?? new Set()}
                checked={checked[person.sapUser] ?? new Set()}
                onToggle={key => toggle(person.sapUser, key)}
                onToggleAll={keys => toggleAll(person.sapUser, keys)}
              />
            ))}
          </div>

          <ReferencePanel
            month={month} sub={sub} persons={persons}
            checked={checked} invoicingStore={invoicingStore}
            invoices={invoices} onRefresh={onRefresh}
          />
        </div>
      )}
    </div>
  );
}

// ─── Person section ───────────────────────────────────────────────────────────

function PersonSection({ person, member, invoicingStore, invoices, referencedKeys, checked, onToggle, onToggleAll }: {
  person: PersonData; member: SubMember | null;
  invoicingStore: InvoicingStore; invoices: SubInvoice[];
  referencedKeys: Set<string>; checked: Set<string>;
  onToggle: (key: string) => void; onToggleAll: (keys: string[]) => void;
}) {
  const set1Rates = invoicingStore.defaultRates;
  const factor    = getFactor(member, person.entries, set1Rates);
  const hasConv   = factor !== 1;

  const referenced = person.entries.filter(e => referencedKeys.has(e.key));
  const available  = person.entries.filter(e => !referencedKeys.has(e.key));
  const allChecked = available.length > 0 && available.every(e => checked.has(e.key));
  const selectedH  = available.filter(e => checked.has(e.key)).reduce((s, e) => s + e.hours, 0);
  const selectedSubH = hasConv ? Math.round(selectedH / factor * 10) / 10 : selectedH;

  function refFor(key: string): SubInvoice | undefined {
    return invoices.find(inv => inv.lines.some(l => l.sapUser === person.sapUser && l.elsapEntryKeys.includes(key)));
  }

  // Change 1: add Reference column at the end
  const cols = hasConv
    ? 'grid-cols-[1fr_auto_6rem_6rem_7rem_10rem]'
    : 'grid-cols-[1fr_auto_6rem_7rem_10rem]';

  return (
    <div className="px-5 py-4 space-y-2">
      {/* Name + role */}
      <div className="flex items-center justify-between">
        <span className="font-semibold text-gray-800">{person.name}</span>
        <div className="flex items-center gap-2">
          {!member && <span className="text-xs bg-red-100 text-red-600 rounded px-2 py-0.5">not configured</span>}
          {member && hasConv && (
            <span className="text-xs bg-amber-100 text-amber-700 rounded px-2 py-0.5">
              {member.role} → books as ELSAP · ×{factor.toFixed(4)}
            </span>
          )}
          {member && !hasConv && (
            <span className="text-xs bg-blue-100 text-blue-700 rounded px-2 py-0.5">{member.role}</span>
          )}
        </div>
      </div>

      {/* Column headers */}
      {(referenced.length > 0 || available.length > 0) && (
        <div className={`grid text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 pb-0.5 ${cols}`}>
          <span>Project</span>
          <span>Role</span>
          <span className="text-right">ELSAP h</span>
          {hasConv && <span className="text-right text-amber-500">Sub h</span>}
          <span className="text-right">Revenue</span>
          <span className="text-right">Ref</span>
        </div>
      )}

      {/* Referenced entries — green, locked */}
      {referenced.map(entry => {
        const ref = refFor(entry.key);
        const subH = hasConv ? Math.round(entry.hours / factor * 10) / 10 : null;
        return (
          <div key={entry.key}
            className={`grid items-center gap-2 px-2 py-2 text-xs bg-emerald-50 border border-emerald-200 rounded-md ${cols}`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-emerald-600 font-bold shrink-0">✓</span>
              <span className="text-gray-700 font-medium truncate">{entry.project}</span>
            </div>
            <span className="text-gray-400 bg-white border border-gray-200 rounded px-1.5 py-0.5 shrink-0">{entry.role}</span>
            <span className="tabular-nums text-gray-700 font-semibold text-right">{fmtH(entry.hours)}</span>
            {hasConv && <span className="tabular-nums text-amber-700 font-semibold text-right">{fmtSubH(subH!)}</span>}
            <span className="tabular-nums text-gray-400 text-right">
              {set1Rates[entry.role] ? fmtEur(entry.hours * set1Rates[entry.role]) : '—'}
            </span>
            <span className="text-emerald-700 font-semibold text-right truncate" title={ref?.label}>{ref?.label ?? '—'}</span>
          </div>
        );
      })}

      {/* Available entries — checkboxes */}
      {available.map(entry => {
        const isChecked = checked.has(entry.key);
        const subH = hasConv ? Math.round(entry.hours / factor * 10) / 10 : null;
        return (
          <div key={entry.key} onClick={() => onToggle(entry.key)}
            className={`grid items-center gap-2 px-2 py-1.5 rounded cursor-pointer select-none transition-colors text-xs ${cols} ${
              isChecked ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 hover:bg-gray-100 opacity-50'
            }`}>
            <div className="flex items-center gap-2 min-w-0">
              <input type="checkbox" checked={isChecked} onChange={() => onToggle(entry.key)}
                onClick={e => e.stopPropagation()}
                className="w-3.5 h-3.5 rounded border-gray-300 accent-emerald-600 pointer-events-none shrink-0" />
              <span className="text-gray-700 font-medium truncate">{entry.project}</span>
            </div>
            <span className="text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 shrink-0">{entry.role}</span>
            <span className="tabular-nums text-gray-700 font-medium text-right">{fmtH(entry.hours)}</span>
            {hasConv && <span className="tabular-nums text-amber-700 font-semibold text-right">{fmtSubH(subH!)}</span>}
            <span className="tabular-nums text-gray-400 text-right">
              {set1Rates[entry.role] ? fmtEur(entry.hours * set1Rates[entry.role]) : '—'}
            </span>
            <span />
          </div>
        );
      })}

      {/* Selected subtotal */}
      {available.length > 0 && (
        <div className={`grid items-center gap-2 px-2 py-1.5 bg-slate-100 rounded text-xs font-semibold border border-slate-200 ${cols}`}>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={allChecked}
              onChange={() => onToggleAll(available.map(e => e.key))}
              className="w-3.5 h-3.5 rounded border-gray-300 accent-emerald-600" />
            <span className="text-slate-600">Selected</span>
          </div>
          <span />
          <span className="tabular-nums text-slate-800 text-right">{fmtH(selectedH)}</span>
          {hasConv && <span className="tabular-nums text-amber-700 text-right">{fmtSubH(selectedSubH)}</span>}
          <span />
          <span />
        </div>
      )}

      {available.length === 0 && <p className="text-xs text-emerald-600 font-medium">✓ All entries referenced</p>}
    </div>
  );
}

// ─── Reference panel ──────────────────────────────────────────────────────────

function ReferencePanel({ month, sub, persons, checked, invoicingStore, invoices, onRefresh }: {
  month: string; sub: SubContractor; persons: PersonData[];
  checked: Record<string, Set<string>>; invoicingStore: InvoicingStore;
  invoices: SubInvoice[]; onRefresh: () => void;
}) {
  const set1Rates = invoicingStore.defaultRates;
  const [saving, setSaving] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');

  const selected = persons.flatMap(person => {
    const keys = [...(checked[person.sapUser] ?? [])];
    if (keys.length === 0) return [];
    const member = sub.members.find(m => m.sapUser === person.sapUser) ?? null;
    const factor = getFactor(member, person.entries, set1Rates);
    const elsapH = person.entries.filter(e => keys.includes(e.key)).reduce((s, e) => s + e.hours, 0);
    const subH   = factor !== 1 ? Math.round(elsapH / factor * 10) / 10 : elsapH;
    return [{ sapUser: person.sapUser, name: person.name, elsapH, subH, factor, keys }];
  });

  const hasSelection = selected.some(s => s.elsapH > 0);

  const canCreate = hasSelection && invoiceNumber.trim().length > 0;

  async function handleCreate() {
    if (!canCreate) return;
    setSaving(true);
    const lines: Omit<SubInvoiceLine, 'id'>[] = selected
      .filter(s => s.elsapH > 0)
      .map(s => ({ sapUser: s.sapUser, elsapEntryKeys: s.keys, applyFactor: s.factor !== 1 }));
    await createSubReference(sub.id, month, lines, invoiceNumber.trim());
    setInvoiceNumber('');
    setSaving(false);
    onRefresh();
  }

  return (
    <div className="border-t-2 border-gray-200 bg-slate-50">

      {/* Selection summary */}
      <div className="px-5 pt-3 pb-2 text-xs text-gray-500 space-y-0.5">
        {hasSelection ? selected.filter(s => s.elsapH > 0).map(s => (
          <div key={s.sapUser} className="flex items-center gap-3">
            <span className="text-gray-700 font-medium w-36 truncate">{s.name}</span>
            <span className="tabular-nums">{fmtH(s.elsapH)} ELSAP</span>
            {s.factor !== 1 && <span className="tabular-nums text-amber-600 font-semibold">{fmtSubH(s.subH)} sub</span>}
          </div>
        )) : (
          <span className="text-gray-400">Select entries above to create a reference.</span>
        )}
      </div>

      {/* Invoice number + create button — own row */}
      <div className="px-5 pb-3 flex items-center gap-2 border-b-2 border-gray-200">
        <input
          type="text"
          value={invoiceNumber}
          onChange={e => setInvoiceNumber(e.target.value)}
          placeholder="Invoice number"
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white w-48"
        />
        <button onClick={handleCreate} disabled={!canCreate || saving}
          className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40 whitespace-nowrap">
          {saving ? '…' : '+ Reference'}
        </button>
      </div>

      {/* Reference list */}
      {invoices.map(inv => {
        // Compute per-line financials
        const lineData = inv.lines.map(line => {
          const person  = persons.find(p => p.sapUser === line.sapUser);
          const member  = sub.members.find(m => m.sapUser === line.sapUser) ?? null;
          const entries = person?.entries.filter(e => line.elsapEntryKeys.includes(e.key)) ?? [];
          const elsapH  = entries.reduce((s, e) => s + e.hours, 0);
          const factor  = getFactor(member, person?.entries ?? [], set1Rates);
          const subH    = factor !== 1 ? Math.round(elsapH / factor * 10) / 10 : elsapH;
          const rh: Record<string,number> = {};
          for (const e of entries) rh[e.role] = (rh[e.role] ?? 0) + e.hours;
          const elsapRole  = Object.entries(rh).sort((a,b) => b[1]-a[1])[0]?.[0] ?? '';
          const subRate    = member ? (sub.rates[member.role] ?? 0) : 0;
          const cost       = subH * subRate;
          const revenue    = elsapH * (set1Rates[elsapRole] ?? 0);
          const margin     = revenue - cost;
          return { line, person, member, entries, elsapH, subH, factor, elsapRole, subRate, cost, revenue, margin };
        });

        const totCost    = lineData.reduce((s, d) => s + d.cost, 0);
        const totRevenue = lineData.reduce((s, d) => s + d.revenue, 0);
        const totMargin  = totRevenue - totCost;
        const totElsap   = lineData.reduce((s, d) => s + d.elsapH, 0);
        const totSub     = lineData.reduce((s, d) => s + d.subH, 0);

        return (
          <div key={inv.id} className="border-b border-gray-100 bg-white">
            {/* Reference header */}
            <div className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-800">{inv.label}</span>
              <span className="text-xs text-gray-400">{fmtDate(inv.createdAt)}</span>
              {totCost > 0 && <span className="text-xs text-gray-500 tabular-nums">Cost {fmtEur(totCost)}</span>}
              {totRevenue > 0 && <span className="text-xs text-gray-500 tabular-nums">Revenue {fmtEur(totRevenue)}</span>}
              {totMargin !== 0 && (
                <span className={`text-xs font-semibold tabular-nums ${totMargin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  Margin {fmtEur(totMargin)} ({totRevenue > 0 ? Math.round(totMargin / totRevenue * 100) : 0}%)
                </span>
              )}
              <button onClick={async () => {
                if (!confirm(`Delete ${inv.label}?`)) return;
                await deleteSubInvoice(inv.id); onRefresh();
              }} className="ml-auto text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 rounded px-2 py-0.5 transition-colors">
                Delete
              </button>
            </div>

            {/* Per-member rows with financials */}
            <div className="px-5 pb-2">
              {/* Col header */}
              <div className="grid grid-cols-[1fr_auto_6rem_6rem_7rem_7rem_7rem] text-xs font-semibold text-gray-400 uppercase tracking-wider py-1.5 border-b border-gray-100">
                <span>Member</span>
                <span>Role</span>
                <span className="text-right">ELSAP h</span>
                <span className="text-right text-amber-500">Sub h</span>
                <span className="text-right">Cost</span>
                <span className="text-right">Revenue</span>
                <span className="text-right">Margin</span>
              </div>
              {lineData.map(({ line, member, elsapH, subH, factor, elsapRole, subRate, cost, revenue, margin }) => (
                <div key={line.sapUser}
                  className="grid grid-cols-[1fr_auto_6rem_6rem_7rem_7rem_7rem] items-center text-xs py-1.5 border-b border-gray-50">
                  <span className="text-gray-800 font-medium">{member?.name ?? line.sapUser}</span>
                  <span className="text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 shrink-0 mr-1">{elsapRole}</span>
                  <span className="tabular-nums text-gray-700 text-right">{fmtH(elsapH)}</span>
                  <span className="tabular-nums text-amber-700 text-right">{factor !== 1 ? fmtSubH(subH) : '—'}</span>
                  <span className="tabular-nums text-gray-600 text-right">{subRate > 0 ? fmtEur(cost) : '—'}</span>
                  <span className="tabular-nums text-gray-600 text-right">{(set1Rates[elsapRole] ?? 0) > 0 ? fmtEur(revenue) : '—'}</span>
                  <span className={`tabular-nums font-semibold text-right ${margin > 0 ? 'text-emerald-600' : margin < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {(cost > 0 && revenue > 0) ? fmtEur(margin) : '—'}
                  </span>
                </div>
              ))}
              {/* Totals row */}
              {lineData.length > 1 && (
                <div className="grid grid-cols-[1fr_auto_6rem_6rem_7rem_7rem_7rem] items-center text-xs py-1.5 font-semibold">
                  <span className="text-gray-500">Total</span>
                  <span />
                  <span className="tabular-nums text-gray-900 text-right">{fmtH(totElsap)}</span>
                  <span className="tabular-nums text-amber-700 text-right">{totSub !== totElsap ? fmtSubH(totSub) : '—'}</span>
                  <span className="tabular-nums text-gray-700 text-right">{totCost > 0 ? fmtEur(totCost) : '—'}</span>
                  <span className="tabular-nums text-gray-700 text-right">{totRevenue > 0 ? fmtEur(totRevenue) : '—'}</span>
                  <span className={`tabular-nums text-right ${totMargin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {(totCost > 0 && totRevenue > 0) ? fmtEur(totMargin) : '—'}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {invoices.length === 0 && (
        <p className="px-5 py-3 text-xs text-gray-400">No references yet.</p>
      )}
    </div>
  );
}

// ─── Reference view data ──────────────────────────────────────────────────────

interface RefLineData {
  sapUser: string; name: string; memberRole: string; elsapRole: string;
  elsapH: number; subH: number; factor: number; subRate: number;
  cost: number; revenue: number; margin: number; projects: string[];
}
interface RefData {
  inv: SubInvoice; sub: SubContractor | undefined;
  lineData: RefLineData[];
  totElsapH: number; totCost: number; totRevenue: number; totMargin: number;
}

function buildRefData(subStore: SubContractorStore, mirror: ElsapMirror, invoicingStore: InvoicingStore): RefData[] {
  const set1Rates = invoicingStore.defaultRates;
  return subStore.invoices.map(inv => {
    const sub = subStore.subContractors.find(s => s.id === inv.subContractorId);
    const monthRows = mirror.rows.filter(r => {
      const rowMonth = `${r.jahr}-${String(r.periode).padStart(2, '0')}`;
      return r.status === 'Verbucht' && rowMonth === inv.month;
    });
    const lineData: RefLineData[] = inv.lines.map(line => {
      const lineRows = monthRows.filter(r => {
        if (r.sapUser !== line.sapUser) return false;
        const key = `${r.posText || '(no project)'}|${r.leistZText || '(no role)'}`;
        return line.elsapEntryKeys.includes(key);
      });
      const entryMap = new Map<string, { project: string; role: string; hours: number }>();
      for (const r of lineRows) {
        const project = r.posText || '(no project)', role = r.leistZText || '(no role)', key = `${project}|${role}`;
        const ex = entryMap.get(key);
        if (ex) ex.hours += r.stunden; else entryMap.set(key, { project, role, hours: r.stunden });
      }
      const entries = [...entryMap.values()];
      const elsapH  = lineRows.reduce((s, r) => s + r.stunden, 0);
      const member  = sub?.members.find(m => m.sapUser === line.sapUser) ?? null;
      const factor  = getFactor(member, entries, set1Rates);
      const subH    = factor !== 1 ? Math.round(elsapH / factor * 10) / 10 : elsapH;
      const rh: Record<string, number> = {};
      for (const e of entries) rh[e.role] = (rh[e.role] ?? 0) + e.hours;
      const elsapRole = Object.entries(rh).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      const subRate   = member && sub ? (sub.rates[member.role] ?? 0) : 0;
      const cost      = subH * subRate;
      const revenue   = elsapH * (set1Rates[elsapRole] ?? 0);
      return {
        sapUser: line.sapUser, name: member?.name ?? line.sapUser,
        memberRole: member?.role ?? '', elsapRole,
        elsapH, subH, factor, subRate, cost, revenue, margin: revenue - cost,
        projects: [...new Set(entries.map(e => e.project))],
      };
    });
    return {
      inv, sub, lineData,
      totElsapH:  lineData.reduce((s, d) => s + d.elsapH, 0),
      totCost:    lineData.reduce((s, d) => s + d.cost, 0),
      totRevenue: lineData.reduce((s, d) => s + d.revenue, 0),
      totMargin:  lineData.reduce((s, d) => s + d.margin, 0),
    };
  }).sort((a, b) => b.inv.createdAt.localeCompare(a.inv.createdAt));
}

// ─── References view ──────────────────────────────────────────────────────────

function ReferencesView({ subStore, mirror, invoicingStore }: {
  subStore: SubContractorStore; mirror: ElsapMirror; invoicingStore: InvoicingStore;
}) {
  const [query, setQuery]       = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const allRefs  = useMemo(() => buildRefData(subStore, mirror, invoicingStore), [subStore, mirror, invoicingStore]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allRefs;
    return allRefs.filter(ref =>
      ref.inv.label.toLowerCase().includes(q) ||
      (ref.sub?.name ?? '').toLowerCase().includes(q) ||
      (ref.sub?.shortName ?? '').toLowerCase().includes(q) ||
      monthLabel(ref.inv.month).toLowerCase().includes(q) ||
      ref.lineData.some(d =>
        d.name.toLowerCase().includes(q) ||
        d.memberRole.toLowerCase().includes(q) ||
        d.elsapRole.toLowerCase().includes(q) ||
        d.projects.some(p => p.toLowerCase().includes(q))
      )
    );
  }, [allRefs, query]);

  function toggle(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  if (allRefs.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 px-6 py-16 text-center text-gray-400 text-sm">
        No references yet. Create them in the <strong>Match</strong> tab first.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search by invoice №, sub contractor, member, project, role…"
            className="w-full pl-9 pr-8 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
          {query && (
            <button onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">×</button>
          )}
        </div>
        <span className="text-sm text-gray-400 shrink-0 tabular-nums">
          {filtered.length}{filtered.length !== allRefs.length ? `/${allRefs.length}` : ''} reference{allRefs.length !== 1 ? 's' : ''}
        </span>
      </div>

      {filtered.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 px-6 py-10 text-center text-gray-400 text-sm">
          No references match &ldquo;{query}&rdquo;
        </div>
      )}

      {filtered.map(ref => {
        const isExpanded = expanded.has(ref.inv.id);
        const subName    = ref.sub?.shortName || ref.sub?.name || '—';
        return (
          <div key={ref.inv.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <button onClick={() => toggle(ref.inv.id)}
              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left">
              <svg className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="font-semibold text-gray-800 text-sm shrink-0">{ref.inv.label}</span>
              <span className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5 shrink-0">{subName}</span>
              <span className="text-xs text-gray-400 shrink-0">{monthLabel(ref.inv.month)}</span>
              <span className="text-xs text-gray-400 tabular-nums shrink-0">{fmtDate(ref.inv.createdAt)}</span>
              <div className="flex items-center gap-3 ml-auto shrink-0">
                <span className="text-xs text-gray-400 tabular-nums">{fmtH(ref.totElsapH)} ELSAP</span>
                {ref.totCost > 0 && <span className="text-xs text-gray-500 tabular-nums">Cost {fmtEur(ref.totCost)}</span>}
                {ref.totRevenue > 0 && <span className="text-xs text-gray-500 tabular-nums">Rev {fmtEur(ref.totRevenue)}</span>}
                {ref.totMargin !== 0 && (
                  <span className={`text-xs font-semibold tabular-nums ${ref.totMargin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    Margin {fmtEur(ref.totMargin)} ({ref.totRevenue > 0 ? Math.round(ref.totMargin / ref.totRevenue * 100) : 0}%)
                  </span>
                )}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-100 px-5 pb-3">
                <div className="grid grid-cols-[1fr_auto_6rem_6rem_7rem_7rem_7rem] text-xs font-semibold text-gray-400 uppercase tracking-wider py-1.5 border-b border-gray-100">
                  <span>Member</span><span>Role</span>
                  <span className="text-right">ELSAP h</span>
                  <span className="text-right text-amber-500">Sub h</span>
                  <span className="text-right">Cost</span>
                  <span className="text-right">Revenue</span>
                  <span className="text-right">Margin</span>
                </div>
                {ref.lineData.map(d => (
                  <div key={d.sapUser}
                    className="grid grid-cols-[1fr_auto_6rem_6rem_7rem_7rem_7rem] items-center text-xs py-1.5 border-b border-gray-50">
                    <span className="text-gray-800 font-medium">{d.name}</span>
                    <span className="text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 shrink-0 mr-1">{d.elsapRole}</span>
                    <span className="tabular-nums text-gray-700 text-right">{fmtH(d.elsapH)}</span>
                    <span className="tabular-nums text-amber-700 text-right">{d.factor !== 1 ? fmtSubH(d.subH) : '—'}</span>
                    <span className="tabular-nums text-gray-600 text-right">{d.subRate > 0 ? fmtEur(d.cost) : '—'}</span>
                    <span className="tabular-nums text-gray-600 text-right">{(invoicingStore.defaultRates[d.elsapRole] ?? 0) > 0 ? fmtEur(d.revenue) : '—'}</span>
                    <span className={`tabular-nums font-semibold text-right ${d.margin > 0 ? 'text-emerald-600' : d.margin < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                      {(d.cost > 0 && d.revenue > 0) ? fmtEur(d.margin) : '—'}
                    </span>
                  </div>
                ))}
                {ref.lineData.length > 1 && (
                  <div className="grid grid-cols-[1fr_auto_6rem_6rem_7rem_7rem_7rem] items-center text-xs py-1.5 font-semibold">
                    <span className="text-gray-500">Total</span><span />
                    <span className="tabular-nums text-gray-900 text-right">{fmtH(ref.totElsapH)}</span>
                    <span />
                    <span className="tabular-nums text-gray-700 text-right">{ref.totCost > 0 ? fmtEur(ref.totCost) : '—'}</span>
                    <span className="tabular-nums text-gray-700 text-right">{ref.totRevenue > 0 ? fmtEur(ref.totRevenue) : '—'}</span>
                    <span className={`tabular-nums text-right ${ref.totMargin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {(ref.totCost > 0 && ref.totRevenue > 0) ? fmtEur(ref.totMargin) : '—'}
                    </span>
                  </div>
                )}
                {/* Projects tag list */}
                {(() => {
                  const projects = [...new Set(ref.lineData.flatMap(d => d.projects))];
                  return projects.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {projects.map(p => (
                        <span key={p} className="text-xs bg-gray-100 text-gray-500 rounded px-2 py-0.5">{p}</span>
                      ))}
                    </div>
                  ) : null;
                })()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
