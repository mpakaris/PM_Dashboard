'use client';

import { useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { TeamMember, Role, Profile, Assignment, Project } from '@/lib/types';
import Modal from '@/components/Modal';
import Badge from '@/components/Badge';
import { createTeamMember, updateTeamMember, deleteTeamMember } from '@/actions/teamMembers';
import { updatePlannedHours } from '@/actions/assignments';
import { getMonthsBetween, formatMonth } from '@/lib/utils';

interface Props {
  members: TeamMember[];
  roles: Role[];
  profiles: Profile[];
  assignments: Assignment[];
  projects: Project[];
}

function MemberForm({
  initial,
  roles,
  profiles,
  onSubmit,
}: {
  initial?: TeamMember;
  roles: Role[];
  profiles: Profile[];
  onSubmit: (fd: FormData) => Promise<void>;
}) {
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>(
    initial?.profileIds ?? []
  );

  const toggleProfile = (id: string) => {
    setSelectedProfiles((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  return (
    <form action={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input
          name="name"
          defaultValue={initial?.name}
          required
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
        <select
          name="roleId"
          defaultValue={initial?.roleId ?? ''}
          required
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        >
          <option value="" disabled>Select a role…</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.type})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Monthly Availability (h)
          <span className="font-normal text-gray-400 ml-1">— avg hours available per month</span>
        </label>
        <input
          type="number"
          name="monthlyAvailability"
          defaultValue={initial?.monthlyAvailability ?? 160}
          min={0}
          required
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Profiles</label>
        {profiles.length === 0 ? (
          <p className="text-sm text-gray-400">No profiles available.</p>
        ) : (
          <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md p-3">
            {profiles.map((p) => (
              <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="profileIds"
                  value={p.id}
                  checked={selectedProfiles.includes(p.id)}
                  onChange={() => toggleProfile(p.id)}
                  className="text-indigo-600 rounded"
                />
                <span className="text-sm text-gray-700">{p.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="pt-2 flex justify-end">
        <button
          type="submit"
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          {initial ? 'Save Changes' : 'Add Member'}
        </button>
      </div>
    </form>
  );
}

// ─── Inline assignment matrix per member ──────────────────────────────────────

function MemberAssignments({
  member,
  memberAssignments,
  projects,
  onSaved,
}: {
  member: TeamMember;
  memberAssignments: Assignment[];
  projects: Project[];
  onSaved: () => void;
}) {
  const allMonths = useMemo(() => {
    const set = new Set<string>();
    for (const a of memberAssignments) {
      const project = projects.find((p) => p.id === a.projectId);
      if (project) {
        for (const m of getMonthsBetween(project.startMonth, project.endMonth)) set.add(m);
      }
    }
    return Array.from(set).sort();
  }, [memberAssignments, projects]);

  const [editedHours, setEditedHours] = useState<Record<string, Record<string, string>>>(() => {
    const init: Record<string, Record<string, string>> = {};
    for (const a of memberAssignments) {
      const project = projects.find((p) => p.id === a.projectId);
      if (!project) continue;
      const months = getMonthsBetween(project.startMonth, project.endMonth);
      init[a.id] = Object.fromEntries(months.map((m) => [m, String(a.plannedHours[m] ?? 0)]));
    }
    return init;
  });
  const editedHoursRef = useRef(editedHours);
  editedHoursRef.current = editedHours;

  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [isDirty, setIsDirty] = useState<Record<string, boolean>>({});

  async function handleSave(assignmentId: string) {
    setSaving((prev) => ({ ...prev, [assignmentId]: true }));
    const fd = new FormData();
    for (const [month, val] of Object.entries(editedHoursRef.current[assignmentId] ?? {})) {
      fd.append(`planned_${month}`, val);
    }
    await updatePlannedHours(assignmentId, fd);
    setSaving((prev) => ({ ...prev, [assignmentId]: false }));
    onSaved();
  }

  function handleChange(assignmentId: string, month: string, value: string) {
    setEditedHours((prev) => ({
      ...prev,
      [assignmentId]: { ...prev[assignmentId], [month]: value },
    }));
    setIsDirty((prev) => ({ ...prev, [assignmentId]: true }));
  }

  function handleBlur(assignmentId: string, e: React.FocusEvent) {
    const related = e.relatedTarget as HTMLElement | null;
    if (related?.dataset?.assignmentId === assignmentId) return;
    if (isDirty[assignmentId]) {
      setIsDirty((prev) => ({ ...prev, [assignmentId]: false }));
      handleSave(assignmentId);
    }
  }

  if (memberAssignments.length === 0) {
    return (
      <div className="px-6 py-4 text-sm text-gray-400 bg-gray-50/60 border-t border-gray-100">
        Not assigned to any project yet. Add assignments from the{' '}
        <a href="/assignments" className="text-indigo-500 hover:underline">Assignments</a> page.
      </div>
    );
  }

  return (
    <div className="border-t border-gray-100 bg-gray-50/40 overflow-x-auto">
      <table className="text-sm min-w-full">
        <thead>
          <tr className="bg-gray-100/80 border-b border-gray-200 text-xs">
            <th className="text-left px-4 py-2 font-medium text-gray-600 sticky left-0 bg-gray-100/80 min-w-[160px]">
              Project
            </th>
            {allMonths.map((m) => (
              <th key={m} className="text-right px-2 py-2 font-medium text-gray-500 min-w-[72px]">
                {formatMonth(m)}
              </th>
            ))}
            <th className="text-right px-3 py-2 font-medium text-gray-600 min-w-[64px]">Total</th>
            <th className="px-3 py-2 min-w-[32px]"></th>
          </tr>
        </thead>
        <tbody>
          {memberAssignments.map((a) => {
            const project = projects.find((p) => p.id === a.projectId);
            if (!project) return null;
            const projectMonths = new Set(getMonthsBetween(project.startMonth, project.endMonth));
            const totalHours = allMonths.reduce((s, m) => {
              if (!projectMonths.has(m)) return s;
              return s + (Number(editedHours[a.id]?.[m]) || 0);
            }, 0);
            return (
              <tr key={a.id} className="border-b border-gray-100 hover:bg-white/60 transition-colors">
                <td className="px-4 py-2 font-medium text-gray-700 sticky left-0 bg-transparent">
                  <div className="flex flex-col gap-1">
                    <span>{project.name}</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="fill all…"
                      data-assignment-id={a.id}
                      className="w-20 border border-dashed border-gray-300 rounded px-1.5 py-0.5 text-xs text-right font-normal focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 placeholder:text-gray-300"
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (!val) return;
                        setEditedHours((prev) => ({
                          ...prev,
                          [a.id]: {
                            ...prev[a.id],
                            ...Object.fromEntries([...projectMonths].map((m) => [m, val])),
                          },
                        }));
                        setIsDirty((prev) => ({ ...prev, [a.id]: false }));
                        (e.target as HTMLInputElement).value = '';
                        handleSave(a.id);
                      }}
                    />
                  </div>
                </td>
                {allMonths.map((m) => (
                  <td key={m} className="px-2 py-2 text-right">
                    {projectMonths.has(m) ? (
                      <input
                        type="number"
                        value={editedHours[a.id]?.[m] ?? ''}
                        data-assignment-id={a.id}
                        onChange={(e) => handleChange(a.id, m, e.target.value)}
                        onBlur={(e) => handleBlur(a.id, e)}
                        min={0}
                        placeholder="0"
                        className="w-16 border border-indigo-200 rounded px-1.5 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                      />
                    ) : (
                      <span className="text-gray-200 text-xs">—</span>
                    )}
                  </td>
                ))}
                <td className="px-3 py-2 text-right text-indigo-600 font-semibold text-xs">
                  {totalHours}h
                </td>
                <td className="px-3 py-2 text-center text-gray-300 text-xs">
                  {saving[a.id] ? '…' : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 bg-gray-100/60 text-xs font-semibold">
            <td className="px-4 py-2 text-gray-600 sticky left-0 bg-gray-100/60">Total committed</td>
            {allMonths.map((m) => {
              const total = memberAssignments.reduce((s, a) => {
                const project = projects.find((p) => p.id === a.projectId);
                if (!project) return s;
                const projectMonths = new Set(getMonthsBetween(project.startMonth, project.endMonth));
                if (!projectMonths.has(m)) return s;
                return s + (Number(editedHours[a.id]?.[m]) || 0);
              }, 0);
              const over = member.monthlyAvailability > 0 && total > member.monthlyAvailability;
              return (
                <td
                  key={m}
                  className={`px-2 py-2 text-right font-semibold ${
                    over ? 'text-red-600' : total > 0 ? 'text-indigo-600' : 'text-gray-300'
                  }`}
                >
                  {total > 0 ? `${total}h` : '—'}
                </td>
              );
            })}
            <td className="px-3 py-2 text-right text-gray-400">
              {memberAssignments.reduce((s, a) => {
                const project = projects.find((p) => p.id === a.projectId);
                if (!project) return s;
                const projectMonths = new Set(getMonthsBetween(project.startMonth, project.endMonth));
                return s + allMonths.reduce((ms, m) => {
                  if (!projectMonths.has(m)) return ms;
                  return ms + (Number(editedHours[a.id]?.[m]) || 0);
                }, 0);
              }, 0)}h
            </td>
            <td></td>
          </tr>
          {member.monthlyAvailability > 0 && (
            <tr className="text-xs text-gray-400">
              <td className="px-4 py-1.5 sticky left-0">Available / month</td>
              {allMonths.map((m) => (
                <td key={m} className="px-2 py-1.5 text-right">
                  {member.monthlyAvailability}h
                </td>
              ))}
              <td colSpan={2}></td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function TeamClient({ members, roles, profiles, assignments, projects }: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const getRoleName = (roleId: string) => roles.find((r) => r.id === roleId)?.name ?? '—';
  const getRoleType = (roleId: string) => roles.find((r) => r.id === roleId)?.type ?? 'intern';
  const getProfileNames = (profileIds: string[]) =>
    profileIds.map((id) => profiles.find((p) => p.id === id)?.name).filter(Boolean).join(', ') || '—';

  const assignmentsByMember = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of assignments) {
      if (!map.has(a.memberId)) map.set(a.memberId, []);
      map.get(a.memberId)!.push(a);
    }
    return map;
  }, [assignments]);

  function toggleExpand(memberId: string) {
    setExpanded((prev) => ({ ...prev, [memberId]: !prev[memberId] }));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Team Members</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Add Member
        </button>
      </div>

      {members.length === 0 ? (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 px-6 py-12 text-center text-gray-400 text-sm">
          No team members yet. Add your first member.
        </div>
      ) : (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="w-8 px-3 py-3"></th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Profiles</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Avail. h/month</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((member, idx) => {
                const memberAssignments = assignmentsByMember.get(member.id) ?? [];
                const isExpanded = !!expanded[member.id];
                const totalPlanned = memberAssignments.reduce(
                  (s, a) => s + Object.values(a.plannedHours).reduce((x, v) => x + v, 0),
                  0
                );
                return (
                  <>
                    <tr
                      key={member.id}
                      className={`border-b border-gray-50 transition-colors ${
                        isExpanded ? 'bg-indigo-50/30' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                      } hover:bg-gray-50/50`}
                    >
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleExpand(member.id)}
                          className="text-gray-400 hover:text-indigo-600 transition-colors"
                          title={isExpanded ? 'Collapse assignments' : 'Expand assignments'}
                        >
                          <span
                            className={`inline-block text-xs transition-transform duration-150 ${
                              isExpanded ? 'rotate-90' : ''
                            }`}
                          >
                            ▶
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        <span>{member.name}</span>
                        {memberAssignments.length > 0 && (
                          <span className="ml-2 text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                            {memberAssignments.length} project{memberAssignments.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{getRoleName(member.roleId)}</td>
                      <td className="px-4 py-3">
                        <Badge
                          label={getRoleType(member.roleId)}
                          color={getRoleType(member.roleId) === 'intern' ? 'blue' : 'orange'}
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {getProfileNames(member.profileIds)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 font-medium">
                        <div className="flex flex-col items-end gap-0.5">
                          <span>{member.monthlyAvailability ? `${member.monthlyAvailability}h` : '—'}</span>
                          {totalPlanned > 0 && (
                            <span className="text-xs text-indigo-500">{totalPlanned}h assigned</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => setEditMember(member)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            Edit
                          </button>
                          <form
                            action={async () => {
                              await deleteTeamMember(member.id);
                            }}
                          >
                            <button
                              type="submit"
                              className="text-xs text-red-500 hover:text-red-700 font-medium"
                              onClick={(e) => {
                                if (!confirm('Delete this team member?')) e.preventDefault();
                              }}
                            >
                              Delete
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${member.id}-expanded`}>
                        <td colSpan={7} className="p-0">
                          <MemberAssignments
                            member={member}
                            memberAssignments={memberAssignments}
                            projects={projects}
                            onSaved={() => router.refresh()}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <Modal title="Add Team Member" onClose={() => setShowCreate(false)}>
          <MemberForm
            roles={roles}
            profiles={profiles}
            onSubmit={async (fd) => {
              await createTeamMember(fd);
              setShowCreate(false);
            }}
          />
        </Modal>
      )}

      {editMember && (
        <Modal title="Edit Team Member" onClose={() => setEditMember(null)}>
          <MemberForm
            initial={editMember}
            roles={roles}
            profiles={profiles}
            onSubmit={async (fd) => {
              await updateTeamMember(editMember.id, fd);
              setEditMember(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
