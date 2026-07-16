'use client';

import { useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Forecast, ForecastProject, ForecastAssignment, GhostMember,
  TeamMember, Role, Profile,
} from '@/lib/types';
import { getMonthsBetween, formatMonth } from '@/lib/utils';
import Modal from '@/components/Modal';
import ForecastCharts from './ForecastCharts';
import {
  renameForecast, deleteForecast,
  createForecastProject, updateForecastProject, deleteForecastProject,
  createGhostMember, updateGhostMember, deleteGhostMember,
  upsertForecastAssignment, bulkUpsertForecastAssignments, deleteForecastAssignment,
} from '@/actions/forecasts';

interface Props {
  forecast: Forecast;
  teamMembers: TeamMember[];
  roles: Role[];
  profiles: Profile[];
}

// ─── FTE helpers ──────────────────────────────────────────────────────────────

const FTE_HOURS_PER_YEAR = 1680;
const FTE_HOURS_PER_MONTH = FTE_HOURS_PER_YEAR / 12; // 140

function fteToHours(fte: number, numMonths: number): number {
  return Math.round(fte * FTE_HOURS_PER_MONTH * numMonths);
}

function hoursToFte(hours: number, numMonths: number): number {
  if (numMonths === 0) return 0;
  return hours / (FTE_HOURS_PER_MONTH * numMonths);
}

function formatFte(fte: number): string {
  if (fte === 0) return '0 FTE';
  const rounded = Math.round(fte * 100) / 100;
  return `${rounded % 1 === 0 ? rounded : rounded.toFixed(2)} FTE`;
}

// ─── Ghost Member Form ────────────────────────────────────────────────────────

function GhostMemberForm({
  initial, roles, profiles, onSubmit,
}: {
  initial?: GhostMember;
  roles: Role[];
  profiles: Profile[];
  onSubmit: (data: Omit<GhostMember, 'id'>) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [roleId, setRoleId] = useState(initial?.roleId ?? '');
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>(initial?.profileIds ?? []);
  const [availability, setAvailability] = useState(String(initial?.monthlyAvailability ?? 160));
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onSubmit({ name: name.trim(), roleId, profileIds: selectedProfiles, monthlyAvailability: Number(availability) || 160 });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Hire 1 — Frontend Dev"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
        <select value={roleId} onChange={(e) => setRoleId(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
          <option value="">No role</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.type})</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Availability (h)</label>
        <input type="number" value={availability} onChange={(e) => setAvailability(e.target.value)} min={0}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
      </div>
      {profiles.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Profiles</label>
          <div className="space-y-2 max-h-32 overflow-y-auto border border-gray-200 rounded-md p-3">
            {profiles.map((p) => (
              <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={selectedProfiles.includes(p.id)}
                  onChange={() => setSelectedProfiles((prev) => prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id])}
                  className="text-violet-600 rounded" />
                <span className="text-sm text-gray-700">{p.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="pt-2 flex justify-end">
        <button type="submit" disabled={saving || !name.trim()}
          className="bg-violet-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-violet-700 disabled:opacity-40">
          {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Ghost Member'}
        </button>
      </div>
    </form>
  );
}

// ─── Project Form ─────────────────────────────────────────────────────────────

function ProjectForm({
  initial, onSubmit,
}: {
  initial?: ForecastProject;
  onSubmit: (data: Omit<ForecastProject, 'id'>) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [startMonth, setStartMonth] = useState(initial?.startMonth ?? '');
  const [endMonth, setEndMonth] = useState(initial?.endMonth ?? '');
  const [saving, setSaving] = useState(false);

  // Budget can be entered as hours or FTE — always stored as hours
  const [inputMode, setInputMode] = useState<'hours' | 'fte'>('hours');
  const [hoursValue, setHoursValue] = useState(String(initial?.overallHours ?? ''));
  const [fteValue, setFteValue] = useState('');

  const months = startMonth && endMonth ? getMonthsBetween(startMonth, endMonth) : [];
  const numMonths = months.length;

  function switchMode(next: 'hours' | 'fte') {
    if (next === inputMode) return;
    if (next === 'fte') {
      // convert current hours → FTE (needs duration)
      if (hoursValue && numMonths > 0) {
        const fte = hoursToFte(Number(hoursValue), numMonths);
        setFteValue(String(Math.round(fte * 100) / 100));
      }
      setInputMode('fte');
    } else {
      // convert current FTE → hours (needs duration)
      if (fteValue && numMonths > 0) {
        setHoursValue(String(fteToHours(Number(fteValue), numMonths)));
      }
      setInputMode('hours');
    }
  }

  // Derived values for display
  const computedHours = inputMode === 'fte' && fteValue && numMonths > 0
    ? fteToHours(Number(fteValue), numMonths) : null;
  const computedFte = inputMode === 'hours' && hoursValue && numMonths > 0
    ? hoursToFte(Number(hoursValue), numMonths) : null;

  const finalHours = inputMode === 'fte' ? (computedHours ?? 0) : Number(hoursValue);
  const canSubmit = !saving && !!name.trim() && !!startMonth && !!endMonth && finalHours > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    await onSubmit({ name: name.trim(), overallHours: finalHours, startMonth, endMonth });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Digital Transformation"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start Month</label>
          <input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} required
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">End Month</label>
          <input type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} required min={startMonth}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500" />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700">Budget</label>
          <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-md text-xs">
            <button type="button" onClick={() => switchMode('hours')}
              className={`px-2.5 py-1 rounded transition-colors ${inputMode === 'hours' ? 'bg-white shadow-sm text-gray-800 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
              Hours
            </button>
            <button type="button" onClick={() => switchMode('fte')}
              className={`px-2.5 py-1 rounded transition-colors ${inputMode === 'fte' ? 'bg-white shadow-sm text-gray-800 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
              FTE
            </button>
          </div>
        </div>

        {inputMode === 'hours' ? (
          <div>
            <div className="relative">
              <input type="number" value={hoursValue} onChange={(e) => setHoursValue(e.target.value)}
                min={1} required placeholder="e.g. 3360"
                className="w-full border border-gray-300 rounded-md px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">h</span>
            </div>
            {computedFte !== null && (
              <p className="text-xs text-slate-500 mt-1.5 font-medium">
                = {formatFte(computedFte)}
                <span className="text-gray-400 font-normal"> over {numMonths} months</span>
              </p>
            )}
          </div>
        ) : (
          <div>
            <div className="relative">
              <input type="number" value={fteValue} onChange={(e) => setFteValue(e.target.value)}
                min={0.1} step={0.1} required placeholder="e.g. 2.0"
                className="w-full border border-gray-300 rounded-md px-3 py-2 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">FTE</span>
            </div>
            {numMonths === 0 ? (
              <p className="text-xs text-amber-500 mt-1.5">Set start and end months first to calculate hours</p>
            ) : computedHours !== null ? (
              <p className="text-xs text-slate-500 mt-1.5 font-medium">
                = {computedHours.toLocaleString()}h
                <span className="text-gray-400 font-normal">
                  {' '}({Number(fteValue) * FTE_HOURS_PER_YEAR}h/year × {(numMonths / 12).toFixed(numMonths % 12 === 0 ? 0 : 1)} yr · 1 FTE = {FTE_HOURS_PER_YEAR}h/year)
                </span>
              </p>
            ) : null}
          </div>
        )}
      </div>

      {numMonths > 0 && finalHours > 0 && (
        <div className="bg-gray-50 rounded-md px-3 py-2.5 text-xs text-gray-500 space-y-0.5">
          <div className="flex justify-between">
            <span>Duration</span>
            <span className="font-medium text-gray-700">{numMonths} months ({(numMonths / 12).toFixed(numMonths % 12 === 0 ? 0 : 1)} yr)</span>
          </div>
          <div className="flex justify-between">
            <span>Total hours</span>
            <span className="font-medium text-gray-700">{finalHours.toLocaleString()}h</span>
          </div>
          <div className="flex justify-between">
            <span>FTE equivalent</span>
            <span className="font-medium text-slate-600">{formatFte(hoursToFte(finalHours, numMonths))}</span>
          </div>
          <div className="flex justify-between">
            <span>Target rate</span>
            <span className="font-medium text-gray-700">{Math.round(finalHours / numMonths)}h/month</span>
          </div>
        </div>
      )}

      <div className="pt-1 flex justify-end">
        <button type="submit" disabled={!canSubmit}
          className="bg-slate-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-700 disabled:opacity-40">
          {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Project'}
        </button>
      </div>
    </form>
  );
}

// ─── Add Member Modal ─────────────────────────────────────────────────────────

function AddMemberModal({
  project, forecast, teamMembers, roles, onClose, onAdd, onAddAll,
}: {
  project: ForecastProject;
  forecast: Forecast;
  teamMembers: TeamMember[];
  roles: Role[];
  onClose: () => void;
  onAdd: (memberId: string, isGhost: boolean, plannedHours: Record<string, number>) => Promise<void>;
  onAddAll: (items: Array<{ memberId: string; isGhost: boolean; plannedHours: Record<string, number> }>) => Promise<void>;
}) {
  const months = getMonthsBetween(project.startMonth, project.endMonth);
  const assignedIds = new Set(
    forecast.assignments.filter((a) => a.projectId === project.id).map((a) => a.memberId)
  );
  const [adding, setAdding] = useState<string | null>(null);
  const [addingAll, setAddingAll] = useState(false);
  const [addedThisSession, setAddedThisSession] = useState<Set<string>>(new Set());

  async function add(memberId: string, isGhost: boolean, availability: number) {
    setAdding(memberId);
    const plannedHours: Record<string, number> = {};
    for (const m of months) plannedHours[m] = availability;
    await onAdd(memberId, isGhost, plannedHours);
    setAddedThisSession((prev) => new Set(prev).add(memberId));
    setAdding(null);
  }

  async function addAll() {
    setAddingAll(true);
    const items = [
      ...availableReal.map((m) => ({
        memberId: m.id,
        isGhost: false,
        plannedHours: Object.fromEntries(months.map((mo) => [mo, m.monthlyAvailability])),
      })),
      ...availableGhost.map((g) => ({
        memberId: g.id,
        isGhost: true,
        plannedHours: Object.fromEntries(months.map((mo) => [mo, g.monthlyAvailability])),
      })),
    ];
    await onAddAll(items);
    setAddedThisSession((prev) => new Set([...prev, ...items.map((i) => i.memberId)]));
    setAddingAll(false);
  }

  const getRoleName = (roleId: string) => roles.find((r) => r.id === roleId)?.name ?? '—';

  // After router.refresh(), forecast.assignments updates → assignedIds grows → available lists shrink.
  // We also keep addedThisSession as a fallback so buttons feel instant before the refresh lands.
  const availableReal = teamMembers.filter((m) => !assignedIds.has(m.id) && !addedThisSession.has(m.id));
  const availableGhost = forecast.ghostMembers.filter((g) => !assignedIds.has(g.id) && !addedThisSession.has(g.id));
  const totalAdded = addedThisSession.size;
  const allAssigned = availableReal.length === 0 && availableGhost.length === 0;

  return (
    <Modal title={`Add Members — ${project.name}`} onClose={onClose}>
      <div className="space-y-4">
        {allAssigned ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500 mb-1">
              {totalAdded > 0 ? `${totalAdded} member${totalAdded !== 1 ? 's' : ''} added.` : 'All members are already assigned to this project.'}
            </p>
            {totalAdded > 0 && <p className="text-xs text-gray-400">No more members available to add.</p>}
          </div>
        ) : (
          <>
            {/* Add All button */}
            <button
              type="button"
              onClick={addAll}
              disabled={addingAll || !!adding}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-slate-200 bg-slate-50 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors disabled:opacity-40"
            >
              {addingAll ? (
                <>
                  <span className="animate-spin text-base">⟳</span>
                  Adding {availableReal.length + availableGhost.length} members…
                </>
              ) : (
                <>
                  + Add All ({availableReal.length + availableGhost.length})
                </>
              )}
            </button>
            <hr className="border-gray-100" />
            {availableReal.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Team Members</p>
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  {availableReal.map((m) => (
                    <div key={m.id} className="flex items-center justify-between px-3 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{m.name}</p>
                        <p className="text-xs text-gray-400">{getRoleName(m.roleId)} · {m.monthlyAvailability}h/month</p>
                      </div>
                      <button
                        onClick={() => add(m.id, false, m.monthlyAvailability)}
                        disabled={adding === m.id}
                        className="text-xs px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                      >
                        {adding === m.id ? '…' : '+ Add'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {availableGhost.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ghost Members</p>
                <div className="border border-violet-100 rounded-md overflow-hidden">
                  {availableGhost.map((g) => (
                    <div key={g.id} className="flex items-center justify-between px-3 py-2.5 border-b border-violet-50 last:border-0 hover:bg-violet-50/40">
                      <div>
                        <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                          <span className="text-violet-500 text-xs">👻</span>
                          {g.name}
                        </p>
                        <p className="text-xs text-gray-400">{getRoleName(g.roleId)} · {g.monthlyAvailability}h/month</p>
                      </div>
                      <button
                        onClick={() => add(g.id, true, g.monthlyAvailability)}
                        disabled={adding === g.id}
                        className="text-xs px-2.5 py-1 rounded border border-violet-200 text-violet-600 hover:bg-violet-50 disabled:opacity-40"
                      >
                        {adding === g.id ? '…' : '+ Add'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-gray-100">
          <span className="text-xs text-gray-400">
            {totalAdded > 0 ? `${totalAdded} member${totalAdded !== 1 ? 's' : ''} added` : 'Select members to add'}
          </span>
          <button
            onClick={onClose}
            className="bg-slate-600 text-white px-4 py-1.5 rounded-md text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Assignment Matrix ────────────────────────────────────────────────────────

function AssignmentMatrix({
  project, forecast, teamMembers, roles, forecastId, onRefresh,
}: {
  project: ForecastProject;
  forecast: Forecast;
  teamMembers: TeamMember[];
  roles: Role[];
  forecastId: string;
  onRefresh: () => void;
}) {
  const months = getMonthsBetween(project.startMonth, project.endMonth);
  const projectAssignments = forecast.assignments.filter((a) => a.projectId === project.id);

  const [editedHours, setEditedHours] = useState<Record<string, Record<string, string>>>(() => {
    const init: Record<string, Record<string, string>> = {};
    for (const a of projectAssignments) {
      init[a.id] = Object.fromEntries(months.map((m) => [m, String(a.plannedHours[m] ?? 0)]));
    }
    return init;
  });
  const editedHoursRef = useRef(editedHours);
  editedHoursRef.current = editedHours;

  const [isDirty, setIsDirty] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [removing, setRemoving] = useState<Record<string, boolean>>({});

  async function handleSave(a: ForecastAssignment) {
    setSaving((prev) => ({ ...prev, [a.id]: true }));
    const plannedHours: Record<string, number> = {};
    for (const [m, v] of Object.entries(editedHoursRef.current[a.id] ?? {})) {
      plannedHours[m] = Number(v) || 0;
    }
    await upsertForecastAssignment(forecastId, a.projectId, a.memberId, a.isGhost, plannedHours);
    setIsDirty((prev) => ({ ...prev, [a.id]: false }));
    setSaving((prev) => ({ ...prev, [a.id]: false }));
    setSaved((prev) => ({ ...prev, [a.id]: true }));
    setTimeout(() => setSaved((prev) => ({ ...prev, [a.id]: false })), 1500);
    onRefresh();
  }

  function handleBlur(a: ForecastAssignment, e: React.FocusEvent) {
    const related = e.relatedTarget as HTMLElement | null;
    if (related?.dataset?.assignmentId === a.id) return;
    if (isDirty[a.id]) handleSave(a);
  }

  async function handleRemove(a: ForecastAssignment) {
    setRemoving((prev) => ({ ...prev, [a.id]: true }));
    await deleteForecastAssignment(forecastId, a.id);
    onRefresh();
  }

  function getMemberName(a: ForecastAssignment): string {
    if (a.isGhost) return forecast.ghostMembers.find((g) => g.id === a.memberId)?.name ?? 'Unknown';
    return teamMembers.find((m) => m.id === a.memberId)?.name ?? 'Unknown';
  }

  function getMemberAvailability(a: ForecastAssignment): number {
    if (a.isGhost) return forecast.ghostMembers.find((g) => g.id === a.memberId)?.monthlyAvailability ?? 0;
    return teamMembers.find((m) => m.id === a.memberId)?.monthlyAvailability ?? 0;
  }

  const budgetPerMonth = months.length > 0 ? Math.round(project.overallHours / months.length) : 0;

  if (projectAssignments.length === 0) {
    return (
      <div className="px-5 py-4 text-sm text-gray-400 bg-gray-50/60 border-t border-gray-100">
        No members assigned yet — click "+ Add Member" below.
      </div>
    );
  }

  return (
    <div className="border-t border-gray-100 overflow-x-auto">
      <table className="text-sm min-w-full">
        <thead>
          <tr className="bg-gray-50/80 border-b border-gray-200 text-xs">
            <th className="text-left px-4 py-2 font-medium text-gray-600 sticky left-0 bg-gray-50/80 min-w-[160px]">Member</th>
            {months.map((m) => (
              <th key={m} className="text-right px-2 py-2 font-medium text-gray-500 min-w-[72px]">{formatMonth(m)}</th>
            ))}
            <th className="text-right px-3 py-2 font-medium text-gray-600 min-w-[60px]">Total</th>
            <th className="px-3 py-2 min-w-[90px]"></th>
          </tr>
        </thead>
        <tbody>
          {projectAssignments.map((a) => {
            const total = months.reduce((s, m) => s + (Number(editedHours[a.id]?.[m]) || 0), 0);
            const avail = getMemberAvailability(a);
            return (
              <tr key={a.id} className={`border-b border-gray-50 hover:bg-white/60 transition-colors ${a.isGhost ? 'bg-violet-50/30' : 'bg-white'}`}>
                <td className="px-4 py-2 font-medium text-gray-700 sticky left-0 bg-transparent">
                  <span className="flex items-center gap-1.5">
                    {a.isGhost && <span className="text-violet-400 text-xs">👻</span>}
                    {getMemberName(a)}
                    {avail > 0 && <span className="text-xs text-gray-300 font-normal">{avail}h</span>}
                  </span>
                </td>
                {months.map((m) => {
                  const val = Number(editedHours[a.id]?.[m]) || 0;
                  const over = avail > 0 && val > avail;
                  return (
                    <td key={m} className="px-2 py-2 text-right">
                      <input
                        type="number"
                        value={editedHours[a.id]?.[m] ?? ''}
                        data-assignment-id={a.id}
                        onChange={(e) => {
                          setEditedHours((prev) => ({
                            ...prev, [a.id]: { ...prev[a.id], [m]: e.target.value },
                          }));
                          setIsDirty((prev) => ({ ...prev, [a.id]: true }));
                        }}
                        onBlur={(e) => handleBlur(a, e)}
                        min={0}
                        placeholder="0"
                        className={`w-16 border rounded px-1.5 py-1 text-sm text-right focus:outline-none focus:ring-1 ${a.isGhost ? 'border-violet-200 focus:ring-violet-400' : 'border-slate-200 focus:ring-slate-400'} ${over ? 'bg-red-50 border-red-300' : 'bg-white'}`}
                      />
                    </td>
                  );
                })}
                <td className={`px-3 py-2 text-right font-semibold text-xs ${a.isGhost ? 'text-violet-600' : 'text-slate-600'}`}>
                  {total}h
                </td>
                <td className="px-3 py-2 text-right w-8">
                  <div className="flex items-center justify-end gap-1.5">
                    {saving[a.id] ? (
                      <span className="text-xs text-gray-400 animate-pulse">…</span>
                    ) : saved[a.id] ? (
                      <span className="text-xs text-emerald-500">✓</span>
                    ) : isDirty[a.id] ? (
                      <span className="text-xs text-amber-400" title="Unsaved changes">●</span>
                    ) : null}
                    <button onClick={() => handleRemove(a)} disabled={removing[a.id]}
                      className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40">
                      {removing[a.id] ? '…' : '✕'}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 bg-gray-50 text-xs font-semibold">
            <td className="px-4 py-2 text-gray-600 sticky left-0 bg-gray-50">Total assigned</td>
            {months.map((m) => {
              const total = projectAssignments.reduce((s, a) => s + (Number(editedHours[a.id]?.[m]) || 0), 0);
              const over = budgetPerMonth > 0 && total > budgetPerMonth;
              return (
                <td key={m} className={`px-2 py-2 text-right ${over ? 'text-red-600' : total > 0 ? 'text-slate-600' : 'text-gray-300'}`}>
                  {total > 0 ? `${total}h` : '—'}
                </td>
              );
            })}
            <td className="px-3 py-2 text-right text-slate-600">
              {projectAssignments.reduce((s, a) => s + months.reduce((ms, m) => ms + (Number(editedHours[a.id]?.[m]) || 0), 0), 0)}h
            </td>
            <td></td>
          </tr>
          {budgetPerMonth > 0 && (
            <tr className="text-xs text-amber-600 bg-amber-50/50">
              <td className="px-4 py-1.5 sticky left-0 bg-amber-50/50">Budget/month target</td>
              {months.map((m) => (
                <td key={m} className="px-2 py-1.5 text-right">{budgetPerMonth}h</td>
              ))}
              <td className="px-3 py-1.5 text-right font-semibold">{project.overallHours}h</td>
              <td></td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({
  project, forecast, teamMembers, roles, forecastId, onEdit, onDelete, onRefresh,
}: {
  project: ForecastProject;
  forecast: Forecast;
  teamMembers: TeamMember[];
  roles: Role[];
  forecastId: string;
  onEdit: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  const months = getMonthsBetween(project.startMonth, project.endMonth);
  const projectAssignments = forecast.assignments.filter((a) => a.projectId === project.id);
  const realAllocated = projectAssignments
    .filter((a) => !a.isGhost)
    .reduce((s, a) => s + Object.values(a.plannedHours).reduce((x, v) => x + v, 0), 0);
  const ghostAllocated = projectAssignments
    .filter((a) => a.isGhost)
    .reduce((s, a) => s + Object.values(a.plannedHours).reduce((x, v) => x + v, 0), 0);
  const totalAllocated = realAllocated + ghostAllocated;
  const gap = Math.max(0, project.overallHours - totalAllocated);
  const pct = project.overallHours > 0 ? Math.round((totalAllocated / project.overallHours) * 100) : 0;
  const over = totalAllocated > project.overallHours;
  const budgetFte = hoursToFte(project.overallHours, months.length);
  const ghostNeededFte = hoursToFte(gap, months.length);

  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
      {/* Header — split into two non-nested zones to avoid button-in-button */}
      <div className="flex items-center px-5 py-3.5 hover:bg-gray-50 transition-colors">
        {/* Left: expand toggle */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsOpen((v) => !v)}
          onKeyDown={(e) => e.key === 'Enter' && setIsOpen((v) => !v)}
          className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
        >
          <span className={`text-gray-400 transition-transform duration-200 text-xs shrink-0 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
          <div className="min-w-0">
            <span className="font-semibold text-gray-800 truncate block">{project.name}</span>
            <span className="text-xs text-gray-400">
              {formatMonth(project.startMonth)} – {formatMonth(project.endMonth)} · {months.length} months
            </span>
          </div>
        </div>

        {/* Right: stats + actions */}
        <div className="flex items-center gap-4 text-xs shrink-0 ml-4">
          <div className="text-right space-y-0.5">
            {/* Progress bar */}
            <div className="flex items-baseline gap-1 justify-end">
              <span className={`font-semibold ${over ? 'text-red-600' : 'text-slate-600'}`}>{totalAllocated}h</span>
              <span className="text-gray-300">/</span>
              <span className="font-medium text-gray-500">{project.overallHours}h</span>
              <span className="text-gray-400">({formatFte(budgetFte)})</span>
            </div>
            <div className="w-36 h-1.5 bg-gray-100 rounded-full">
              <div
                className={`h-1.5 rounded-full transition-all ${over ? 'bg-red-400' : pct >= 80 ? 'bg-emerald-400' : 'bg-slate-400'}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            {/* Real / Ghost breakdown */}
            <div className="flex items-center gap-2 justify-end pt-0.5">
              {realAllocated > 0 && (
                <span className="flex items-center gap-1 text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block" />
                  {formatFte(hoursToFte(realAllocated, months.length))} real
                </span>
              )}
              {ghostAllocated > 0 && (
                <span className="flex items-center gap-1 text-violet-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
                  {formatFte(hoursToFte(ghostAllocated, months.length))} ghost
                </span>
              )}
              {gap > 0 ? (
                <span className="flex items-center gap-1 text-red-500 font-semibold">
                  👻 needs {formatFte(ghostNeededFte)}
                </span>
              ) : totalAllocated > 0 ? (
                <span className="text-emerald-600 font-medium">✓ covered</span>
              ) : null}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onEdit} className="text-slate-500 hover:text-slate-700 font-medium">Edit</button>
            <button type="button" onClick={onDelete} className="text-red-400 hover:text-red-600 font-medium">Delete</button>
          </div>
        </div>
      </div>

      {isOpen && (
        <>
          <AssignmentMatrix
            project={project}
            forecast={forecast}
            teamMembers={teamMembers}
            roles={roles}
            forecastId={forecastId}
            onRefresh={onRefresh}
          />
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/40">
            <button
              onClick={() => setShowAddMember(true)}
              className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors font-medium"
            >
              + Add Member
            </button>
          </div>
        </>
      )}

      {showAddMember && (
        <AddMemberModal
          project={project}
          forecast={forecast}
          teamMembers={teamMembers}
          roles={roles}
          onClose={() => setShowAddMember(false)}
          onAdd={async (memberId, isGhost, plannedHours) => {
            await upsertForecastAssignment(forecastId, project.id, memberId, isGhost, plannedHours);
            onRefresh();
          }}
          onAddAll={async (items) => {
            await bulkUpsertForecastAssignments(forecastId, items.map((item) => ({ projectId: project.id, ...item })));
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

// ─── Plan Summary ─────────────────────────────────────────────────────────────

function StatCard({ label, hours, fte, sub, accent }: {
  label: string;
  hours: number;
  fte: number;
  sub?: string;
  accent: 'gray' | 'slate' | 'violet' | 'red' | 'emerald';
}) {
  const colors = {
    gray:    { h: 'text-gray-800',   f: 'text-gray-500',   sub: 'text-gray-400' },
    slate:  { h: 'text-slate-700', f: 'text-slate-500', sub: 'text-slate-400' },
    violet:  { h: 'text-violet-700', f: 'text-violet-500', sub: 'text-violet-400' },
    red:     { h: 'text-red-700',    f: 'text-red-500',    sub: 'text-red-400' },
    emerald: { h: 'text-emerald-700',f: 'text-emerald-500',sub: 'text-emerald-400' },
  }[accent];
  return (
    <div className="px-5 py-4">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors.h}`}>{hours.toLocaleString()}h</p>
      <p className={`text-sm font-medium ${colors.f} mt-0.5`}>{formatFte(fte)}</p>
      {sub && <p className={`text-xs mt-1 ${colors.sub}`}>{sub}</p>}
    </div>
  );
}

function PlanSummary({ forecast, teamMembers, roles }: {
  forecast: Forecast;
  teamMembers: TeamMember[];
  roles: Role[];
}) {
  if (forecast.projects.length === 0) return null;

  const getRoleName = (roleId: string) => roles.find((r) => r.id === roleId)?.name ?? '—';

  // FTE for a given assignment = hours / (140 * project duration months)
  function assignmentFte(assignmentId: string, hours: number): number {
    const a = forecast.assignments.find((x) => x.id === assignmentId);
    if (!a) return 0;
    const project = forecast.projects.find((p) => p.id === a.projectId);
    if (!project) return 0;
    const numMonths = getMonthsBetween(project.startMonth, project.endMonth).length || 1;
    return hours / (FTE_HOURS_PER_MONTH * numMonths);
  }

  // Aggregate per-member across all projects
  type MemberStat = {
    isGhost: boolean;
    totalHours: number;
    totalFte: number;
    projectNames: string[];
  };
  const memberStats = new Map<string, MemberStat>();

  for (const a of forecast.assignments) {
    const hours = Object.values(a.plannedHours).reduce((s, v) => s + v, 0);
    const fte = assignmentFte(a.id, hours);
    const projectName = forecast.projects.find((p) => p.id === a.projectId)?.name ?? '?';
    if (!memberStats.has(a.memberId)) {
      memberStats.set(a.memberId, { isGhost: a.isGhost, totalHours: 0, totalFte: 0, projectNames: [] });
    }
    const stat = memberStats.get(a.memberId)!;
    stat.totalHours += hours;
    stat.totalFte += fte;
    if (!stat.projectNames.includes(projectName)) stat.projectNames.push(projectName);
  }

  const realStats = [...memberStats.entries()].filter(([, s]) => !s.isGhost)
    .sort((a, b) => b[1].totalHours - a[1].totalHours);
  const ghostStats = [...memberStats.entries()].filter(([, s]) => s.isGhost)
    .sort((a, b) => b[1].totalHours - a[1].totalHours);

  const totalBudget     = forecast.projects.reduce((s, p) => s + p.overallHours, 0);
  const totalRealHours  = realStats.reduce((s, [, v]) => s + v.totalHours, 0);
  const totalGhostHours = ghostStats.reduce((s, [, v]) => s + v.totalHours, 0);
  const totalRealFte    = realStats.reduce((s, [, v]) => s + v.totalFte, 0);
  const totalGhostFte   = ghostStats.reduce((s, [, v]) => s + v.totalFte, 0);
  const totalAllocated  = totalRealHours + totalGhostHours;
  const gap             = Math.max(0, totalBudget - totalAllocated);
  const avgMonths       = forecast.projects.reduce(
    (s, p) => s + getMonthsBetween(p.startMonth, p.endMonth).length, 0
  ) / forecast.projects.length;
  const totalBudgetFte  = totalBudget / (FTE_HOURS_PER_MONTH * avgMonths);
  const gapFte          = gap / (FTE_HOURS_PER_MONTH * avgMonths);
  const pctReal         = totalBudget > 0 ? Math.round((totalRealHours / totalBudget) * 100) : 0;
  const pctGhost        = totalBudget > 0 ? Math.round((totalGhostHours / totalBudget) * 100) : 0;
  const pctGap          = totalBudget > 0 ? Math.round((gap / totalBudget) * 100) : 0;

  const MemberRow = ({ memberId, stat, ghost }: { memberId: string; stat: MemberStat; ghost: boolean }) => {
    const member = ghost
      ? forecast.ghostMembers.find((g) => g.id === memberId)
      : teamMembers.find((m) => m.id === memberId);
    const name  = member?.name ?? 'Unknown';
    const role  = getRoleName(member?.roleId ?? '');
    return (
      <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40 transition-colors">
        <td className="px-4 py-2.5 font-medium text-gray-800 text-sm">
          <span className="flex items-center gap-1.5">
            {ghost && <span className="text-violet-400 text-xs">👻</span>}
            {name}
          </span>
        </td>
        <td className="px-4 py-2.5 text-xs text-gray-500">{role}</td>
        <td className="px-4 py-2.5 text-xs text-gray-400">
          {stat.projectNames.length <= 2
            ? stat.projectNames.join(', ')
            : `${stat.projectNames.slice(0, 2).join(', ')} +${stat.projectNames.length - 2}`}
        </td>
        <td className={`px-4 py-2.5 text-right font-semibold text-sm ${ghost ? 'text-violet-600' : 'text-slate-600'}`}>
          {stat.totalHours.toLocaleString()}h
        </td>
        <td className={`px-4 py-2.5 text-right text-xs font-medium ${ghost ? 'text-violet-500' : 'text-slate-500'}`}>
          {formatFte(stat.totalFte)}
        </td>
      </tr>
    );
  };

  return (
    <div className="mt-6 bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Summary — All Projects</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {forecast.projects.length} project{forecast.projects.length !== 1 ? 's' : ''} ·{' '}
            {realStats.length} team member{realStats.length !== 1 ? 's' : ''} ·{' '}
            {ghostStats.length} ghost hire{ghostStats.length !== 1 ? 's' : ''}
          </p>
        </div>
        {gap === 0 && totalAllocated > 0 && (
          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            ✓ Fully covered
          </span>
        )}
        {gap > 0 && (
          <span className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
            👻 {formatFte(gapFte)} still needed
          </span>
        )}
      </div>

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-gray-100 border-b border-gray-100">
        <StatCard label="Total Budget" hours={totalBudget} fte={totalBudgetFte} accent="gray" />
        <StatCard
          label="Real Team"
          hours={totalRealHours}
          fte={totalRealFte}
          sub={totalBudget > 0 ? `${pctReal}% of budget` : undefined}
          accent="slate"
        />
        <StatCard
          label="Ghost / Hires"
          hours={totalGhostHours}
          fte={totalGhostFte}
          sub={totalBudget > 0 ? `${pctGhost}% of budget` : undefined}
          accent="violet"
        />
        <StatCard
          label={gap > 0 ? 'Still Needed' : 'Gap'}
          hours={gap}
          fte={gapFte}
          sub={gap > 0 ? `${pctGap}% uncovered` : 'Fully covered'}
          accent={gap > 0 ? 'red' : 'emerald'}
        />
      </div>

      {/* Progress bar */}
      {totalBudget > 0 && (
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1.5">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-500 inline-block" /> Real</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-violet-400 inline-block" /> Ghost</span>
            {gap > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-200 inline-block" /> Needed</span>}
          </div>
          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
            <div className="h-full bg-slate-500 transition-all" style={{ width: `${pctReal}%` }} />
            <div className="h-full bg-violet-400 transition-all" style={{ width: `${pctGhost}%` }} />
          </div>
        </div>
      )}

      {/* Ghost members table */}
      {ghostStats.length > 0 && (
        <div>
          <div className="px-5 py-2.5 border-b border-gray-100 bg-violet-50/40">
            <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">
              👻 Ghost Members / Planned Hires ({ghostStats.length})
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/40 text-xs">
                <th className="text-left px-4 py-2 font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500">Role</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500">Projects</th>
                <th className="text-right px-4 py-2 font-medium text-gray-500">Total Hours</th>
                <th className="text-right px-4 py-2 font-medium text-gray-500">FTE equiv.</th>
              </tr>
            </thead>
            <tbody>
              {ghostStats.map(([id, stat]) => (
                <MemberRow key={id} memberId={id} stat={stat} ghost />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-sm">
                <td colSpan={3} className="px-4 py-2 text-gray-600">Total ghost</td>
                <td className="px-4 py-2 text-right text-violet-600">{totalGhostHours.toLocaleString()}h</td>
                <td className="px-4 py-2 text-right text-violet-500">{formatFte(totalGhostFte)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Real team table */}
      {realStats.length > 0 && (
        <div className={ghostStats.length > 0 ? 'border-t border-gray-100' : ''}>
          <div className="px-5 py-2.5 border-b border-gray-100 bg-slate-50/30">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Team Members ({realStats.length})
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/40 text-xs">
                <th className="text-left px-4 py-2 font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500">Role</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500">Projects</th>
                <th className="text-right px-4 py-2 font-medium text-gray-500">Total Hours</th>
                <th className="text-right px-4 py-2 font-medium text-gray-500">FTE equiv.</th>
              </tr>
            </thead>
            <tbody>
              {realStats.map(([id, stat]) => (
                <MemberRow key={id} memberId={id} stat={stat} ghost={false} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-sm">
                <td colSpan={3} className="px-4 py-2 text-gray-600">Total real team</td>
                <td className="px-4 py-2 text-right text-slate-600">{totalRealHours.toLocaleString()}h</td>
                <td className="px-4 py-2 text-right text-slate-500">{formatFte(totalRealFte)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Empty state */}
      {realStats.length === 0 && ghostStats.length === 0 && (
        <div className="px-5 py-8 text-center text-sm text-gray-400">
          No members assigned to any project yet.
        </div>
      )}
    </div>
  );
}

// ─── Member-centric forecast view ────────────────────────────────────────────

function MemberForecastMatrix({
  memberId, isGhost, assignments, forecast, forecastId, monthlyAvailability, onRefresh,
}: {
  memberId: string;
  isGhost: boolean;
  assignments: ForecastAssignment[];
  forecast: Forecast;
  forecastId: string;
  monthlyAvailability: number;
  onRefresh: () => void;
}) {
  const allMonths = useMemo(() => {
    const set = new Set<string>();
    for (const a of assignments) {
      const p = forecast.projects.find((p) => p.id === a.projectId);
      if (p) for (const m of getMonthsBetween(p.startMonth, p.endMonth)) set.add(m);
    }
    return Array.from(set).sort();
  }, [assignments, forecast]);

  const [editedHours, setEditedHours] = useState<Record<string, Record<string, string>>>(() => {
    const init: Record<string, Record<string, string>> = {};
    for (const a of assignments) {
      const p = forecast.projects.find((proj) => proj.id === a.projectId);
      if (!p) continue;
      const months = getMonthsBetween(p.startMonth, p.endMonth);
      init[a.id] = Object.fromEntries(months.map((m) => [m, String(a.plannedHours[m] ?? 0)]));
    }
    return init;
  });

  // Use ref so async save always reads latest values, never stale closure
  const editedHoursRef = { current: editedHours };
  editedHoursRef.current = editedHours;

  const [isDirty,  setIsDirty]  = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId,  setSavedId]  = useState<string | null>(null);

  async function save(a: ForecastAssignment) {
    if (savingId === a.id) return;
    setSavingId(a.id);
    const plannedHours: Record<string, number> = {};
    for (const [m, v] of Object.entries(editedHoursRef.current[a.id] ?? {}))
      plannedHours[m] = Number(v) || 0;
    await upsertForecastAssignment(forecastId, a.projectId, memberId, isGhost, plannedHours);
    setIsDirty((prev) => ({ ...prev, [a.id]: false }));
    setSavingId(null);
    setSavedId(a.id);
    setTimeout(() => setSavedId((prev) => (prev === a.id ? null : prev)), 2000);
    onRefresh();
  }

  function handleChange(assignmentId: string, month: string, value: string) {
    setEditedHours((prev) => ({ ...prev, [assignmentId]: { ...prev[assignmentId], [month]: value } }));
    setIsDirty((prev) => ({ ...prev, [assignmentId]: true }));
  }

  // Save when focus leaves the row entirely.
  // Each editable element in the row carries data-assignment-id so we can tell
  // whether the newly-focused element is still in the same row.
  function handleBlur(a: ForecastAssignment, e: React.FocusEvent) {
    const related = e.relatedTarget as HTMLElement | null;
    if (related?.dataset?.assignmentId === a.id) return; // focus stayed in this row
    if (isDirty[a.id]) save(a);
  }

  // Fill all editable cells in a project row with one value and save immediately.
  async function fillRow(a: ForecastAssignment, value: number, pMonths: Set<string>) {
    const current   = editedHoursRef.current[a.id] ?? {};
    const newHours  = { ...current, ...Object.fromEntries([...pMonths].map((m) => [m, String(value)])) };
    setEditedHours((prev) => ({ ...prev, [a.id]: newHours }));
    setIsDirty((prev) => ({ ...prev, [a.id]: false }));
    setSavingId(a.id);
    const plannedHours: Record<string, number> = {};
    for (const [m, v] of Object.entries(newHours)) plannedHours[m] = Number(v) || 0;
    await upsertForecastAssignment(forecastId, a.projectId, memberId, isGhost, plannedHours);
    setSavingId(null);
    setSavedId(a.id);
    setTimeout(() => setSavedId((prev) => (prev === a.id ? null : prev)), 2000);
    onRefresh();
  }

  if (assignments.length === 0) {
    return (
      <div className="px-5 py-4 text-sm text-gray-400 bg-gray-50/60 border-t border-gray-100">
        Not assigned to any forecast project yet.
      </div>
    );
  }

  const accentBorder = isGhost ? 'border-violet-200 focus:ring-violet-400' : 'border-slate-200 focus:ring-slate-400';
  const accentText   = isGhost ? 'text-violet-600' : 'text-slate-600';

  return (
    <div className="border-t border-gray-100 overflow-x-auto">
      <table className="text-sm min-w-full">
        <thead>
          <tr className="bg-gray-50/80 border-b border-gray-200 text-xs">
            <th className="text-left px-4 py-2 font-medium text-gray-600 sticky left-0 bg-gray-50/80 min-w-[220px]">
              Project <span className="font-normal text-gray-300 ml-1">— type h/mo + Enter to fill all</span>
            </th>
            {allMonths.map((m) => (
              <th key={m} className="text-right px-2 py-2 font-medium text-gray-500 min-w-[72px]">{formatMonth(m)}</th>
            ))}
            <th className="text-right px-3 py-2 font-medium text-gray-600 min-w-[60px]">Total</th>
            <th className="px-2 py-2 min-w-[36px]"></th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((a) => {
            const project = forecast.projects.find((p) => p.id === a.projectId);
            if (!project) return null;
            const pMonths = new Set(getMonthsBetween(project.startMonth, project.endMonth));
            const total   = allMonths.reduce(
              (s, m) => s + (pMonths.has(m) ? (Number(editedHours[a.id]?.[m]) || 0) : 0), 0
            );
            const isSaving = savingId === a.id;
            const isSaved  = savedId  === a.id;

            return (
              <tr key={a.id} className={`border-b border-gray-50 ${isGhost ? 'bg-violet-50/20' : 'bg-white'}`}>
                {/* Project name + fill-all input */}
                <td className="px-4 py-2 sticky left-0 bg-white">
                  <div className="flex flex-col gap-1.5">
                    <span className="font-medium text-gray-700 leading-tight">{project.name}</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        placeholder="fill all…"
                        data-assignment-id={a.id}
                        className="w-20 border border-dashed border-gray-300 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 placeholder:text-gray-300"
                        onBlur={(e) => handleBlur(a, e)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = Number((e.target as HTMLInputElement).value);
                            if (!isNaN(val) && val >= 0) {
                              fillRow(a, val, pMonths);
                              (e.target as HTMLInputElement).value = '';
                              (e.target as HTMLInputElement).blur();
                            }
                          }
                        }}
                      />
                      <span className="text-xs text-gray-300">h/mo</span>
                    </div>
                  </div>
                </td>

                {/* Month cells */}
                {allMonths.map((m) => (
                  <td key={m} className="px-2 py-2 text-right">
                    {pMonths.has(m) ? (
                      <input
                        type="number"
                        value={editedHours[a.id]?.[m] ?? ''}
                        min={0}
                        placeholder="0"
                        data-assignment-id={a.id}
                        onChange={(e) => handleChange(a.id, m, e.target.value)}
                        onBlur={(e) => handleBlur(a, e)}
                        className={`w-16 border rounded px-1.5 py-1 text-sm text-right focus:outline-none focus:ring-1 bg-white ${accentBorder}`}
                      />
                    ) : (
                      <span className="text-gray-200 text-xs">—</span>
                    )}
                  </td>
                ))}

                {/* Total */}
                <td className={`px-3 py-2 text-right font-semibold text-xs ${accentText}`}>{total}h</td>

                {/* Status indicator — replaces the Save button */}
                <td className="px-2 py-2 text-center w-8">
                  {isSaving ? (
                    <span className="text-xs text-gray-400 animate-pulse">…</span>
                  ) : isSaved ? (
                    <span className="text-xs text-emerald-500">✓</span>
                  ) : isDirty[a.id] ? (
                    <span className="text-xs text-amber-400" title="Unsaved changes">●</span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 bg-gray-50 text-xs font-semibold">
            <td className="px-4 py-2 text-gray-600 sticky left-0 bg-gray-50">Total committed</td>
            {allMonths.map((m) => {
              const total = assignments.reduce((s, a) => {
                const p   = forecast.projects.find((proj) => proj.id === a.projectId);
                if (!p) return s;
                const pMs = new Set(getMonthsBetween(p.startMonth, p.endMonth));
                return pMs.has(m) ? s + (Number(editedHours[a.id]?.[m]) || 0) : s;
              }, 0);
              const over = monthlyAvailability > 0 && total > monthlyAvailability;
              return (
                <td key={m} className={`px-2 py-2 text-right font-semibold ${over ? 'text-red-600' : total > 0 ? accentText : 'text-gray-300'}`}>
                  {total > 0 ? `${total}h` : '—'}
                </td>
              );
            })}
            <td className={`px-3 py-2 text-right ${accentText}`}>
              {assignments.reduce((s, a) => {
                const p   = forecast.projects.find((proj) => proj.id === a.projectId);
                if (!p) return s;
                const pMs = new Set(getMonthsBetween(p.startMonth, p.endMonth));
                return s + allMonths.reduce((ms, m) => ms + (pMs.has(m) ? (Number(editedHours[a.id]?.[m]) || 0) : 0), 0);
              }, 0)}h
            </td>
            <td></td>
          </tr>
          {monthlyAvailability > 0 && (
            <tr className="text-xs text-gray-400 bg-gray-50/40">
              <td className="px-4 py-1.5 sticky left-0">Available / month</td>
              {allMonths.map((m) => (
                <td key={m} className="px-2 py-1.5 text-right">{monthlyAvailability}h</td>
              ))}
              <td colSpan={2}></td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}

function MemberCentricPlanView({
  forecast, teamMembers, roles, forecastId, onRefresh,
}: {
  forecast: Forecast;
  teamMembers: TeamMember[];
  roles: Role[];
  forecastId: string;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const byMember = useMemo(() => {
    const map = new Map<string, { isGhost: boolean; assignments: ForecastAssignment[] }>();
    for (const a of forecast.assignments) {
      if (!map.has(a.memberId)) map.set(a.memberId, { isGhost: a.isGhost, assignments: [] });
      map.get(a.memberId)!.assignments.push(a);
    }
    return map;
  }, [forecast.assignments]);

  const realMembers  = teamMembers.filter((m) => byMember.has(m.id));
  const ghostMembers = forecast.ghostMembers.filter((g) => byMember.has(g.id));

  const getRoleName = (roleId: string) => roles.find((r) => r.id === roleId)?.name ?? '—';

  function toggle(id: string) { setExpanded((prev) => ({ ...prev, [id]: !prev[id] })); }

  function MemberRow({ id, name, roleId, monthlyAvailability, isGhost }: {
    id: string; name: string; roleId: string; monthlyAvailability: number; isGhost: boolean;
  }) {
    const { assignments } = byMember.get(id)!;
    const isOpen = !!expanded[id];

    const totalHours = assignments.reduce(
      (s, a) => s + Object.values(a.plannedHours).reduce((x, v) => x + v, 0), 0
    );
    const totalFte = assignments.reduce((s, a) => {
      const p = forecast.projects.find((proj) => proj.id === a.projectId);
      if (!p) return s;
      const nm = getMonthsBetween(p.startMonth, p.endMonth).length || 1;
      return s + Object.values(a.plannedHours).reduce((x, v) => x + v, 0) / (FTE_HOURS_PER_MONTH * nm);
    }, 0);

    return (
      <div className={`bg-white rounded-lg overflow-hidden transition-shadow ${isOpen ? 'ring-2 ring-slate-200' : 'ring-1 ring-gray-200'}`}>
        <div
          role="button" tabIndex={0}
          onClick={() => toggle(id)}
          onKeyDown={(e) => e.key === 'Enter' && toggle(id)}
          className="flex items-center px-5 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <span className={`text-gray-400 text-xs transition-transform duration-150 mr-3 shrink-0 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {isGhost && <span className="text-violet-400">👻</span>}
              <span className="font-semibold text-gray-800">{name}</span>
              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                {assignments.length} project{assignments.length !== 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{getRoleName(roleId)}</p>
          </div>
          <div className="text-right text-xs shrink-0 ml-4 space-y-0.5">
            <p className={`font-semibold text-sm ${isGhost ? 'text-violet-600' : 'text-slate-600'}`}>{totalHours}h</p>
            <p className="text-gray-400">{formatFte(totalFte)}</p>
            {monthlyAvailability > 0 && <p className="text-gray-300">{monthlyAvailability}h/mo cap</p>}
          </div>
        </div>
        {isOpen && (
          <MemberForecastMatrix
            memberId={id} isGhost={isGhost} assignments={assignments}
            forecast={forecast} forecastId={forecastId}
            monthlyAvailability={monthlyAvailability} onRefresh={onRefresh}
          />
        )}
      </div>
    );
  }

  if (realMembers.length === 0 && ghostMembers.length === 0) {
    return (
      <div className="bg-white rounded-lg ring-1 ring-gray-200 px-6 py-12 text-center text-gray-400 text-sm">
        No members assigned yet — add members to projects using the <strong>By Project</strong> view first.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {realMembers.length > 0 && (
        <>
          {ghostMembers.length > 0 && (
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Team Members</p>
          )}
          {realMembers.map((m) => (
            <MemberRow key={m.id} id={m.id} name={m.name} roleId={m.roleId} monthlyAvailability={m.monthlyAvailability} isGhost={false} />
          ))}
        </>
      )}
      {ghostMembers.length > 0 && (
        <>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 pt-1">Ghost Members</p>
          {ghostMembers.map((g) => (
            <MemberRow key={g.id} id={g.id} name={g.name} roleId={g.roleId} monthlyAvailability={g.monthlyAvailability} isGhost={true} />
          ))}
        </>
      )}
    </div>
  );
}

// ─── Ghost Members Panel ──────────────────────────────────────────────────────

function GhostMembersPanel({
  forecast, roles, profiles, forecastId, onRefresh,
}: {
  forecast: Forecast;
  roles: Role[];
  profiles: Profile[];
  forecastId: string;
  onRefresh: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<GhostMember | null>(null);
  const getRoleName = (roleId: string) => roles.find((r) => r.id === roleId)?.name ?? '—';

  return (
    <div className="bg-violet-50/60 rounded-lg ring-1 ring-violet-200 p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-violet-900">Ghost Members</h3>
          <p className="text-xs text-violet-500 mt-0.5">Hypothetical hires — model future capacity without affecting real data</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="text-xs px-2.5 py-1 rounded border border-violet-300 text-violet-700 hover:bg-violet-100 transition-colors font-medium">
          + Add Ghost
        </button>
      </div>

      {forecast.ghostMembers.length === 0 ? (
        <p className="text-xs text-violet-400 italic">No ghost members yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {forecast.ghostMembers.map((g) => (
            <div key={g.id} className="flex items-center gap-2 bg-white rounded-md px-3 py-2 ring-1 ring-violet-200 text-xs">
              <span className="text-violet-400">👻</span>
              <div>
                <span className="font-medium text-gray-800">{g.name}</span>
                <span className="text-gray-400 ml-1">· {getRoleName(g.roleId)} · {g.monthlyAvailability}h/mo</span>
              </div>
              <div className="flex gap-1.5 ml-1">
                <button onClick={() => setEditing(g)} className="text-violet-500 hover:text-violet-700">Edit</button>
                <button onClick={async () => {
                  if (!confirm(`Remove ghost member "${g.name}"?`)) return;
                  await deleteGhostMember(forecastId, g.id);
                  onRefresh();
                }} className="text-red-400 hover:text-red-600">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <Modal title="Add Ghost Member" onClose={() => setShowAdd(false)}>
          <GhostMemberForm roles={roles} profiles={profiles}
            onSubmit={async (data) => {
              await createGhostMember(forecastId, data);
              setShowAdd(false);
              onRefresh();
            }} />
        </Modal>
      )}

      {editing && (
        <Modal title="Edit Ghost Member" onClose={() => setEditing(null)}>
          <GhostMemberForm initial={editing} roles={roles} profiles={profiles}
            onSubmit={async (data) => {
              await updateGhostMember(forecastId, editing.id, data);
              setEditing(null);
              onRefresh();
            }} />
        </Modal>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ForecastClient({ forecast, teamMembers, roles, profiles }: Props) {
  const router = useRouter();
  const [tab, setTab]           = useState<'plan' | 'charts'>('plan');
  const [planView, setPlanView] = useState<'project' | 'member'>('project');
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(forecast.name);
  const [showAddProject, setShowAddProject] = useState(false);
  const [editingProject, setEditingProject] = useState<ForecastProject | null>(null);

  function refresh() { router.refresh(); }

  async function handleRename() {
    if (!newName.trim() || newName.trim() === forecast.name) { setRenaming(false); return; }
    await renameForecast(forecast.id, newName.trim());
    setRenaming(false);
    refresh();
  }

  async function handleDeleteForecast() {
    if (!confirm(`Delete forecast "${forecast.name}"? This cannot be undone.`)) return;
    await deleteForecast(forecast.id);
    router.push('/planning');
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <a href="/planning" className="text-xs text-gray-400 hover:text-gray-600">Planning</a>
            <span className="text-gray-300 text-xs">/</span>
            {renaming ? (
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false); }}
                className="text-2xl font-bold text-gray-900 border-b border-slate-400 outline-none bg-transparent"
              />
            ) : (
              <h1
                className="text-2xl font-bold text-gray-900 cursor-pointer hover:text-slate-700 transition-colors"
                onClick={() => setRenaming(true)}
                title="Click to rename"
              >
                {forecast.name}
              </h1>
            )}
            {!renaming && (
              <button onClick={() => setRenaming(true)} className="text-xs text-gray-400 hover:text-slate-500 transition-colors">
                ✎
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400">
            Forecast · {forecast.projects.length} project{forecast.projects.length !== 1 ? 's' : ''} · {forecast.ghostMembers.length} ghost member{forecast.ghostMembers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={handleDeleteForecast} className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors">
          Delete Forecast
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-lg w-fit">
        {(['plan', 'charts'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'plan' ? 'Plan' : 'Charts'}
          </button>
        ))}
      </div>

      {/* Plan Tab */}
      {tab === 'plan' && (
        <div>
          <GhostMembersPanel
            forecast={forecast}
            roles={roles}
            profiles={profiles}
            forecastId={forecast.id}
            onRefresh={refresh}
          />

          {/* View toggle + action */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-md text-xs">
              <button type="button" onClick={() => setPlanView('project')}
                className={`px-3 py-1.5 rounded transition-colors font-medium ${planView === 'project' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                By Project
              </button>
              <button type="button" onClick={() => setPlanView('member')}
                className={`px-3 py-1.5 rounded transition-colors font-medium ${planView === 'member' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                By Member
              </button>
            </div>
            {planView === 'project' && (
              <button onClick={() => setShowAddProject(true)}
                className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors font-medium bg-white">
                + Add Project
              </button>
            )}
          </div>

          {/* By Project view */}
          {planView === 'project' && (
            forecast.projects.length === 0 ? (
              <div className="bg-white rounded-lg ring-1 ring-gray-200 px-6 py-12 text-center text-gray-400 text-sm">
                No projects yet. Add your first forecast project.
              </div>
            ) : (
              <div className="space-y-3">
                {forecast.projects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    forecast={forecast}
                    teamMembers={teamMembers}
                    roles={roles}
                    forecastId={forecast.id}
                    onEdit={() => setEditingProject(p)}
                    onDelete={async () => {
                      if (!confirm(`Delete project "${p.name}"?`)) return;
                      await deleteForecastProject(forecast.id, p.id);
                      refresh();
                    }}
                    onRefresh={refresh}
                  />
                ))}
              </div>
            )
          )}

          {/* By Member view */}
          {planView === 'member' && (
            <MemberCentricPlanView
              forecast={forecast}
              teamMembers={teamMembers}
              roles={roles}
              forecastId={forecast.id}
              onRefresh={refresh}
            />
          )}

          <PlanSummary forecast={forecast} teamMembers={teamMembers} roles={roles} />
        </div>
      )}

      {/* Charts Tab */}
      {tab === 'charts' && (
        <ForecastCharts forecast={forecast} teamMembers={teamMembers} />
      )}

      {/* Modals */}
      {showAddProject && (
        <Modal title="Add Project" onClose={() => setShowAddProject(false)}>
          <ProjectForm
            onSubmit={async (data) => {
              await createForecastProject(forecast.id, data);
              setShowAddProject(false);
              refresh();
            }}
          />
        </Modal>
      )}

      {editingProject && (
        <Modal title="Edit Project" onClose={() => setEditingProject(null)}>
          <ProjectForm
            initial={editingProject}
            onSubmit={async (data) => {
              await updateForecastProject(forecast.id, editingProject.id, data);
              setEditingProject(null);
              refresh();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
