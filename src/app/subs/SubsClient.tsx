'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SubContractorStore, SubContractor, SubMember, ElsapMirror, InvoicingStore } from '@/lib/types';
import { upsertSubContractor, deleteSubContractor } from '@/actions/subcontractors';

interface Props {
  subStore: SubContractorStore;
  mirror: ElsapMirror;
  invoicingStore: InvoicingStore;
}

function fmtEur(n: number) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function SubsClient({ subStore, mirror, invoicingStore }: Props) {
  const router = useRouter();
  const [, startT] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);

  const allRoles = useMemo(() =>
    [...new Set(mirror.rows.map(r => r.leistZText).filter(Boolean))].sort(),
    [mirror.rows]
  );
  const elsapUsers = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of mirror.rows) if (r.sapUser && r.name) map.set(r.sapUser, r.name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [mirror.rows]);

  function refresh() { startT(() => router.refresh()); }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Sub Contractors</h1>
          <p className="text-gray-500 text-sm">Manage external sub contractors, their rate cards, and member assignments.</p>
        </div>
        <button onClick={() => setEditingId('new')}
          className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-emerald-700 transition-colors">
          + Add Sub Contractor
        </button>
      </div>

      <div className="space-y-3">
        {editingId === 'new' && (
          <SubContractorForm
            allRoles={allRoles} elsapUsers={elsapUsers}
            onSave={async data => { await upsertSubContractor(data); refresh(); setEditingId(null); }}
            onCancel={() => setEditingId(null)}
          />
        )}

        {subStore.subContractors.length === 0 && editingId !== 'new' && (
          <div className="bg-white rounded-lg border border-gray-200 px-6 py-16 text-center text-gray-400 text-sm">
            No sub contractors yet.
          </div>
        )}

        {subStore.subContractors.map(sub =>
          editingId === sub.id ? (
            <SubContractorForm key={sub.id}
              initial={sub} allRoles={allRoles} elsapUsers={elsapUsers}
              onSave={async data => { await upsertSubContractor({ ...data, id: sub.id }); refresh(); setEditingId(null); }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <SubContractorCard key={sub.id} sub={sub}
              invoiceCount={subStore.invoices.filter(i => i.subContractorId === sub.id).length}
              onEdit={() => setEditingId(sub.id)}
              onDelete={async () => {
                if (!confirm(`Delete ${sub.name}? All their invoices will also be removed.`)) return;
                await deleteSubContractor(sub.id);
                refresh();
              }}
            />
          )
        )}
      </div>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function SubContractorCard({ sub, invoiceCount, onEdit, onDelete }: {
  sub: SubContractor; invoiceCount: number; onEdit: () => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={() => setOpen(v => !v)} className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors">
          <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-gray-800">{sub.name}</span>
          {sub.shortName && <span className="ml-2 text-xs text-gray-400">({sub.shortName})</span>}
        </div>
        <span className="text-xs text-gray-400">{sub.members.length} member{sub.members.length !== 1 ? 's' : ''}</span>
        <span className="text-xs text-gray-400">{invoiceCount} invoice{invoiceCount !== 1 ? 's' : ''}</span>
        <button onClick={onEdit} className="text-xs text-sky-600 hover:text-sky-800 border border-sky-200 hover:border-sky-400 rounded px-2 py-0.5 transition-colors">Edit</button>
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 rounded px-2 py-0.5 transition-colors">Delete</button>
      </div>

      {open && (
        <div className="border-t border-gray-100 px-5 pb-4 pt-3 grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Rate Card (what they charge us)</p>
            {Object.keys(sub.rates).length === 0
              ? <p className="text-xs text-gray-400">No rates configured</p>
              : <div className="space-y-1">
                  {Object.entries(sub.rates).map(([role, rate]) => (
                    <div key={role} className="flex justify-between text-sm">
                      <span className="text-gray-700">{role}</span>
                      <span className="tabular-nums text-gray-600 font-medium">{fmtEur(rate)} /h</span>
                    </div>
                  ))}
                </div>
            }
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Members</p>
            {sub.members.length === 0
              ? <p className="text-xs text-gray-400">No members assigned</p>
              : <div className="space-y-1">
                  {sub.members.map(m => (
                    <div key={m.sapUser} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{m.name}</span>
                      <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">{m.role}</span>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

function SubContractorForm({ initial, allRoles, elsapUsers, onSave, onCancel }: {
  initial?: SubContractor;
  allRoles: string[];
  elsapUsers: [string, string][];
  onSave: (data: Omit<SubContractor, 'id'>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName]           = useState(initial?.name ?? '');
  const [shortName, setShortName] = useState(initial?.shortName ?? '');
  const [rates, setRates]         = useState<Record<string, number>>(initial?.rates ?? {});
  const [members, setMembers]     = useState<SubMember[]>(initial?.members ?? []);
  const [saving, setSaving]       = useState(false);
  const [newRateRole, setNewRateRole] = useState('');
  const [newRateVal, setNewRateVal]   = useState('');
  const [newMemberSap, setNewMemberSap]   = useState('');
  const [newMemberRole, setNewMemberRole] = useState('');

  function addRate() {
    const v = parseFloat(newRateVal.replace(',', '.'));
    if (!newRateRole || isNaN(v)) return;
    setRates(r => ({ ...r, [newRateRole]: v }));
    setNewRateRole(''); setNewRateVal('');
  }
  function removeRate(role: string) { setRates(r => { const n = { ...r }; delete n[role]; return n; }); }

  function addMember() {
    if (!newMemberSap || !newMemberRole || members.find(m => m.sapUser === newMemberSap)) return;
    const mName = elsapUsers.find(([u]) => u === newMemberSap)?.[1] ?? newMemberSap;
    setMembers(ms => [...ms, { sapUser: newMemberSap, name: mName, role: newMemberRole }]);
    setNewMemberSap(''); setNewMemberRole('');
  }
  function removeMember(sapUser: string) { setMembers(ms => ms.filter(m => m.sapUser !== sapUser)); }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ name: name.trim(), shortName: shortName.trim(), rates, members });
    setSaving(false);
  }

  return (
    <div className="bg-white rounded-lg border-2 border-emerald-300 p-5 space-y-5">
      <p className="font-semibold text-gray-800 text-sm">{initial ? 'Edit' : 'New'} Sub Contractor</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Full name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ventum Digital Identity Services GmbH"
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Short name</label>
          <input value={shortName} onChange={e => setShortName(e.target.value)} placeholder="Ventum"
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Rate Card (what they charge us)</p>
        <div className="space-y-1.5 mb-2">
          {Object.entries(rates).map(([role, rate]) => (
            <div key={role} className="flex items-center gap-3 bg-gray-50 rounded px-3 py-1.5">
              <span className="flex-1 text-sm text-gray-700">{role}</span>
              <span className="text-sm tabular-nums text-gray-600 font-medium">{fmtEur(rate)} /h</span>
              <button onClick={() => removeRate(role)} className="text-gray-300 hover:text-red-400 font-bold">×</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <select value={newRateRole} onChange={e => setNewRateRole(e.target.value)}
            className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white">
            <option value="">Role…</option>
            {allRoles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input value={newRateVal} onChange={e => setNewRateVal(e.target.value)} placeholder="€/h"
            onKeyDown={e => { if (e.key === 'Enter') addRate(); }}
            className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
          <button onClick={addRate} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-sm transition-colors">+ Add</button>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Members (ELSAP users)</p>
        <div className="space-y-1.5 mb-2">
          {members.map(m => (
            <div key={m.sapUser} className="flex items-center gap-3 bg-gray-50 rounded px-3 py-1.5">
              <span className="flex-1 text-sm text-gray-700">{m.name}</span>
              <span className="text-xs text-gray-400">{m.sapUser}</span>
              <span className="text-xs bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">{m.role}</span>
              <button onClick={() => removeMember(m.sapUser)} className="text-gray-300 hover:text-red-400 font-bold">×</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <select value={newMemberSap} onChange={e => setNewMemberSap(e.target.value)}
            className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white">
            <option value="">Select ELSAP user…</option>
            {elsapUsers
              .filter(([u]) => !members.find(m => m.sapUser === u))
              .map(([u, n]) => <option key={u} value={u}>{n} ({u})</option>)}
          </select>
          <select value={newMemberRole} onChange={e => setNewMemberRole(e.target.value)}
            className="w-36 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white">
            <option value="">Role…</option>
            {allRoles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={addMember} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-sm transition-colors">+ Add</button>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <button onClick={onCancel} className="px-4 py-1.5 rounded text-sm text-gray-600 hover:bg-gray-100 transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={!name.trim() || saving}
          className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40">
          {saving ? '…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
