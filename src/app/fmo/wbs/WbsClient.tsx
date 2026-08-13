'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { FmoWbsEntry, FmoTicket, FmoEntry, WbsSubCategory } from '@/lib/types';
import { useToast } from '@/components/ToastProvider';
import { useConfirm } from '@/components/ConfirmDialogProvider';
import WbsTree from './WbsTree';
import {
  addFmoWbs,
  updateFmoWbs,
  deleteFmoWbs,
  addFmoSubCategory,
  updateFmoSubCategoryLabel,
  deleteFmoSubCategory,
  setWbsSubCategoryOverride,
} from '@/actions/fmo';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE1_COLORS: Record<string, string> = {
  V: 'bg-green-100 text-green-800',
  I: 'bg-slate-100 text-slate-700',
};
// Labels are now resolved via useTranslations in components that render badges
const TYPE2_COLORS: Record<string, string> = {
  admin:     'bg-slate-100 text-slate-700',
  training:  'bg-yellow-100 text-yellow-800',
  presales:  'bg-blue-100 text-blue-800',
  portfolio: 'bg-purple-100 text-purple-800',
  opm:       'bg-orange-100 text-orange-800',
  absence:   'bg-red-100 text-red-800',
};

function Type1Badge({ code }: { code: string }) {
  const t = useTranslations('wbs');
  const prefix = code[0] ?? '?';
  const labels: Record<string, string> = { V: t('billable'), I: t('internal') };
  const label  = labels[prefix] ?? t('unknown');
  const color  = TYPE1_COLORS[prefix] ?? 'bg-rose-100 text-rose-800';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>{label}</span>;
}

function Type2Badge({ entry, subCategories }: { entry: FmoWbsEntry; subCategories: Record<string, WbsSubCategory> }) {
  const t = useTranslations('wbs');
  if (entry.billingClass === 'V') return <span className="text-slate-400">—</span>;
  const slug  = entry.subCategoryOverride ?? entry.subCategory;
  if (!slug)  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-800">{t('unmapped')}</span>;
  const label = subCategories[slug]?.label ?? slug;
  const color = TYPE2_COLORS[slug] ?? 'bg-slate-100 text-slate-700';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>{label}</span>;
}

// ─── WBS table row ────────────────────────────────────────────────────────────

function WbsRow({
  entry,
  subCategories,
}: {
  entry: FmoWbsEntry;
  subCategories: Record<string, WbsSubCategory>;
}) {
  const t = useTranslations('common');
  const tWbs = useTranslations('wbs');
  const confirm = useConfirm();
  const toast   = useToast();
  const [editing, setEditing]   = useState(false);
  const [label, setLabel]       = useState(entry.label);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  async function save() {
    setSaving(true);
    const r = await updateFmoWbs(entry.code, label);
    setSaving(false);
    if (r.ok) setEditing(false);
    else setError(r.error ?? t('error'));
  }

  async function remove() {
    if (!await confirm(`Delete WBS ${entry.code}?`, { destructive: true, confirmLabel: 'Delete' })) return;
    await deleteFmoWbs(entry.code);
    toast.success(`WBS ${entry.code} deleted`);
  }

  async function changeOverride(override: string) {
    await setWbsSubCategoryOverride(entry.code, override === '' ? null : override);
  }

  const isInternal = entry.billingClass === 'I';

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 font-mono text-xs text-slate-800">{entry.code}</td>
      <td className="px-4 py-3">
        {editing ? (
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1 text-sm w-full"
            autoFocus
          />
        ) : (
          <span className="text-slate-700">{entry.label || <span className="italic text-slate-400">—</span>}</span>
        )}
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </td>
      <td className="px-4 py-3"><Type1Badge code={entry.code} /></td>
      <td className="px-4 py-3">
        {editing && isInternal ? (
          <select
            defaultValue={entry.subCategoryOverride ?? ''}
            onChange={(e) => changeOverride(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1 text-sm"
          >
            <option value="">{tWbs('autoOverride')}</option>
            {Object.values(subCategories).map((sc) => (
              <option key={sc.id} value={sc.id}>{sc.label}</option>
            ))}
          </select>
        ) : (
          <Type2Badge entry={entry} subCategories={subCategories} />
        )}
      </td>
      <td className="px-4 py-3 text-xs text-slate-400">{entry.syncSource}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={save}
                disabled={saving}
                className="text-xs px-2 py-1 bg-slate-800 text-white rounded hover:bg-slate-700 disabled:opacity-50"
              >
                {saving ? t('saving') : t('save')}
              </button>
              <button onClick={() => { setEditing(false); setLabel(entry.label); setError(''); }} className="text-xs text-slate-500 hover:text-slate-700">
                {t('cancel')}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="text-xs text-slate-500 hover:text-slate-800">Edit</button>
              <button onClick={remove} className="text-xs text-red-500 hover:text-red-700">Delete</button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Add WBS form ─────────────────────────────────────────────────────────────

function AddWbsForm({ onClose }: { onClose: () => void }) {
  const t = useTranslations('common');
  const tWbs = useTranslations('wbs');
  const [code, setCode]   = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const r = await addFmoWbs(code.trim(), label.trim());
    setSaving(false);
    if (r.ok) onClose();
    else setError(r.error ?? t('error'));
  }

  return (
    <tr className="bg-slate-50 border-b border-slate-200">
      <td className="px-4 py-3">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="V.05921700.81.01"
          className="border border-slate-300 rounded px-2 py-1 text-sm font-mono w-full"
          autoFocus
        />
      </td>
      <td className="px-4 py-3">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={tWbs('label')}
          className="border border-slate-300 rounded px-2 py-1 text-sm w-full"
        />
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </td>
      <td className="px-4 py-3 text-xs text-slate-400">{t('autoDerived')}</td>
      <td className="px-4 py-3 text-xs text-slate-400">{t('autoDerived')}</td>
      <td className="px-4 py-3 text-xs text-slate-400">{t('manual')}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={submit}
            disabled={saving}
            className="text-xs px-2 py-1 bg-slate-800 text-white rounded hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? t('adding') : t('add')}
          </button>
          <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700">{t('cancel')}</button>
        </div>
      </td>
    </tr>
  );
}

// ─── Sub-category panel ───────────────────────────────────────────────────────

function SubCategoryPanel({
  subCategories,
  wbsEntries,
}: {
  subCategories: Record<string, WbsSubCategory>;
  wbsEntries: FmoWbsEntry[];
}) {
  const t = useTranslations('common');
  const tWbs = useTranslations('wbs');
  const toast = useToast();
  const [open, setOpen]       = useState(false);
  const [newSlug, setNewSlug] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  function refCount(slug: string) {
    return wbsEntries.filter((w) => w.subCategory === slug || w.subCategoryOverride === slug).length;
  }

  function slugify(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  async function addSub(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const r = await addFmoSubCategory(newSlug, newLabel);
    setSaving(false);
    if (r.ok) { setNewSlug(''); setNewLabel(''); setError(''); }
    else setError(r.error ?? t('error'));
  }

  async function removeSub(slug: string) {
    const r = await deleteFmoSubCategory(slug);
    if (!r.ok) toast.error(r.error ?? 'Failed to delete sub-category');
    else toast.success('Sub-category deleted');
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
      >
        <span className="font-semibold text-slate-700 text-sm">{tWbs('subCategories')}</span>
        <span className="text-slate-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100">
          <table className="w-full text-sm mt-3">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-100">
                <th className="py-2 text-left font-medium">Slug</th>
                <th className="py-2 text-left font-medium">{tWbs('label')}</th>
                <th className="py-2 text-left font-medium">{tWbs('usedByHeader')}</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {Object.values(subCategories).map((sc) => (
                <SubCategoryRow
                  key={sc.id}
                  sc={sc}
                  refCount={refCount(sc.id)}
                  onDelete={() => removeSub(sc.id)}
                />
              ))}
            </tbody>
          </table>

          <form onSubmit={addSub} className="flex items-end gap-2 pt-2 border-t border-slate-100">
            <div>
              <label className="text-xs text-slate-500">{tWbs('label')}</label>
              <input
                value={newLabel}
                onChange={(e) => { setNewLabel(e.target.value); setNewSlug(slugify(e.target.value)); }}
                placeholder="e.g. Training"
                className="mt-0.5 block border border-slate-300 rounded px-2 py-1 text-sm w-36"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">{tWbs('slugLabel')}</label>
              <input
                value={newSlug}
                onChange={(e) => setNewSlug(slugify(e.target.value))}
                placeholder="e.g. training"
                className="mt-0.5 block border border-slate-300 rounded px-2 py-1 text-sm w-32 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 bg-slate-800 text-white text-xs rounded hover:bg-slate-700 disabled:opacity-50"
            >
              {saving ? t('adding') : t('add')}
            </button>
          </form>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

function SubCategoryRow({
  sc,
  refCount,
  onDelete,
}: {
  sc: WbsSubCategory;
  refCount: number;
  onDelete: () => void;
}) {
  const t = useTranslations('common');
  const [editing, setEditing] = useState(false);
  const [label, setLabel]     = useState(sc.label);
  const [saving, setSaving]   = useState(false);

  async function save() {
    setSaving(true);
    await updateFmoSubCategoryLabel(sc.id, label);
    setSaving(false);
    setEditing(false);
  }

  return (
    <tr>
      <td className="py-2 pr-4 font-mono text-xs text-slate-600">{sc.id}</td>
      <td className="py-2 pr-4">
        {editing ? (
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="border border-slate-300 rounded px-2 py-0.5 text-sm w-36"
            autoFocus
          />
        ) : (
          <span className="text-sm text-slate-700">{sc.label}</span>
        )}
      </td>
      <td className="py-2 pr-4 text-xs text-slate-500">{refCount} WBS</td>
      <td className="py-2">
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={save} disabled={saving} className="text-xs px-2 py-0.5 bg-slate-800 text-white rounded">{saving ? '…' : t('save')}</button>
              <button onClick={() => { setEditing(false); setLabel(sc.label); }} className="text-xs text-slate-400">{t('cancel')}</button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="text-xs text-slate-500 hover:text-slate-800">{t('edit')}</button>
              <button
                onClick={onDelete}
                disabled={refCount > 0}
                className="text-xs text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
                title={refCount > 0 ? `Used by ${refCount} WBS entries` : undefined}
              >
                {t('delete')}
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

const LS_KEY = 'fmo-wbs-view';

export default function WbsClient({
  wbsEntries,
  subCategories,
  tickets = [],
  entries = [],
}: {
  wbsEntries: FmoWbsEntry[];
  subCategories: Record<string, WbsSubCategory>;
  tickets?: FmoTicket[];
  entries?: FmoEntry[];
}) {
  const t = useTranslations('common');
  const tWbs = useTranslations('wbs');
  const sorted  = [...wbsEntries].sort((a, b) => a.code.localeCompare(b.code));
  const [adding, setAdding] = useState(false);
  const [view, setView]     = useState<'tree' | 'flat'>('tree');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const v = localStorage.getItem(LS_KEY);
    if (v === 'flat') setView('flat');
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{tWbs('title')}</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{tWbs('entries', { count: sorted.length })}</span>
          <div className="flex items-center gap-1 border border-slate-200 rounded-md overflow-hidden text-xs">
            <button
              onClick={() => { setView('tree'); localStorage.setItem(LS_KEY, 'tree'); }}
              className={`px-3 py-1.5 transition-colors ${view === 'tree' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              {t('treeView')}
            </button>
            <button
              onClick={() => { setView('flat'); localStorage.setItem(LS_KEY, 'flat'); }}
              className={`px-3 py-1.5 transition-colors ${view === 'flat' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              {t('flatView')}
            </button>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="px-3 py-1.5 bg-slate-800 text-white text-sm rounded hover:bg-slate-700"
          >
            {tWbs('addWbs')}
          </button>
        </div>
      </div>

      {view === 'tree' && (
        <>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tWbs('searchPlaceholder')}
            className="border border-slate-300 rounded px-3 py-1.5 text-sm w-72"
          />
          <WbsTree
            wbsEntries={wbsEntries}
            subCategories={subCategories}
            tickets={tickets}
            entries={entries}
            search={search}
          />
        </>
      )}

      {view === 'flat' && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">{tWbs('code')}</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">{tWbs('label')}</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">{tWbs('type1')}</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">{tWbs('type2')}</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">{tWbs('source')}</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">{tWbs('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {adding && <AddWbsForm onClose={() => setAdding(false)} />}
              {sorted.map((entry) => (
                <WbsRow key={entry.code} entry={entry} subCategories={subCategories} />
              ))}
              {sorted.length === 0 && !adding && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">{tWbs('noEntries')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <SubCategoryPanel subCategories={subCategories} wbsEntries={wbsEntries} />
    </div>
  );
}
