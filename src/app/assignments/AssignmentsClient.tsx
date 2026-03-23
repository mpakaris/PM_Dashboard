'use client';

import { useState, useMemo } from 'react';
import { Assignment, Project, TeamMember, Role } from '@/lib/types';
import Modal from '@/components/Modal';
import {
  createBulkAssignments,
  updateAssignment,
  deleteAssignment,
} from '@/actions/assignments';
import { getMonthsBetween, formatMonth } from '@/lib/utils';

interface Props {
  assignments: Assignment[];
  projects: Project[];
  members: TeamMember[];
  roles: Role[];
}

// ─── Bulk Add Form ────────────────────────────────────────────────────────────

function BulkAssignmentForm({
  projects,
  members,
  roles,
  allAssignments,
  onSubmit,
}: {
  projects: Project[];
  members: TeamMember[];
  roles: Role[];
  allAssignments: Assignment[];
  onSubmit: (fd: FormData) => Promise<void>;
}) {
  const [projectId, setProjectId] = useState('');
  // memberId -> hours input value
  const [hours, setHours] = useState<Record<string, string>>({});
  // memberId -> checked
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const selectedProject = projects.find((p) => p.id === projectId);
  const months = useMemo(
    () => (selectedProject ? getMonthsBetween(selectedProject.startMonth, selectedProject.endMonth) : []),
    [selectedProject]
  );

  // Members already assigned to the selected project
  const alreadyAssignedIds = useMemo(
    () => new Set(allAssignments.filter((a) => a.projectId === projectId).map((a) => a.memberId)),
    [allAssignments, projectId]
  );

  // Committed hours per member per month (from other projects)
  const committedPerMemberPerMonth = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    for (const a of allAssignments) {
      if (a.projectId === projectId) continue; // exclude this project
      const proj = projects.find((p) => p.id === a.projectId);
      if (!proj) continue;
      const projMonths = getMonthsBetween(proj.startMonth, proj.endMonth);
      if (!result[a.memberId]) result[a.memberId] = {};
      for (const m of projMonths) {
        result[a.memberId][m] = (result[a.memberId][m] || 0) + a.hoursPerMonth;
      }
    }
    return result;
  }, [allAssignments, projectId, projects]);

  function toggleCheck(memberId: string) {
    setChecked((prev) => ({ ...prev, [memberId]: !prev[memberId] }));
  }

  function selectAll() {
    const next: Record<string, boolean> = {};
    for (const m of members) {
      if (!alreadyAssignedIds.has(m.id)) next[m.id] = true;
    }
    setChecked(next);
  }

  function clearAll() {
    setChecked({});
  }

  const checkedCount = Object.values(checked).filter(Boolean).length;

  return (
    <form action={onSubmit} className="space-y-4">
      {/* Project picker */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
        <select
          name="projectId"
          value={projectId}
          onChange={(e) => { setProjectId(e.target.value); setChecked({}); setHours({}); }}
          required
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        >
          <option value="" disabled>Select a project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({formatMonth(p.startMonth)} – {formatMonth(p.endMonth)})
            </option>
          ))}
        </select>
        {selectedProject && (
          <p className="text-xs text-gray-400 mt-1">{months.length} months duration</p>
        )}
      </div>

      {/* Member table */}
      {projectId && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Team Members</label>
            <div className="flex gap-3 text-xs">
              <button type="button" onClick={selectAll} className="text-indigo-600 hover:text-indigo-800">
                Select all
              </button>
              <button type="button" onClick={clearAll} className="text-gray-400 hover:text-gray-600">
                Clear
              </button>
            </div>
          </div>

          <div className="border border-gray-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs">
                  <th className="w-8 px-3 py-2"></th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Member</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Role</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">
                    Other commitments
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">
                    h / month
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((member, idx) => {
                  const role = roles.find((r) => r.id === member.roleId);
                  const alreadyAssigned = alreadyAssignedIds.has(member.id);
                  const isChecked = !alreadyAssigned && !!checked[member.id];
                  const hVal = Number(hours[member.id] || 0);

                  // Max committed hours for this member in any month of the project
                  const maxOtherCommitted = months.length > 0
                    ? Math.max(...months.map((m) => committedPerMemberPerMonth[member.id]?.[m] ?? 0))
                    : 0;

                  return (
                    <tr
                      key={member.id}
                      className={`border-b border-gray-50 ${
                        alreadyAssigned
                          ? 'bg-gray-50/80 opacity-50'
                          : isChecked
                          ? 'bg-indigo-50/40'
                          : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/20'
                      }`}
                    >
                      <td className="px-3 py-2 text-center">
                        {alreadyAssigned ? (
                          <span className="text-xs text-gray-400">✓</span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCheck(member.id)}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-800">{member.name}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{role?.name ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-xs text-gray-400">
                        {maxOtherCommitted > 0 ? `${maxOtherCommitted}h` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {alreadyAssigned ? (
                          <span className="text-xs text-gray-400">already assigned</span>
                        ) : (
                          <>
                            <input
                              type="number"
                              name={isChecked ? `hours_${member.id}` : undefined}
                              value={hours[member.id] ?? ''}
                              onChange={(e) =>
                                setHours((prev) => ({ ...prev, [member.id]: e.target.value }))
                              }
                              disabled={!isChecked}
                              min={0}
                              placeholder="0"
                              className={`w-20 border rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                                isChecked
                                  ? 'border-indigo-300 bg-white'
                                  : 'border-gray-200 bg-gray-50 text-gray-300'
                              }`}
                            />
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-gray-500">
                        {isChecked && hVal > 0 && months.length > 0
                          ? `${hVal * months.length}h`
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {checkedCount > 0 && (
                <tfoot>
                  <tr className="border-t border-gray-200 bg-indigo-50/60 text-xs font-medium">
                    <td colSpan={4} className="px-3 py-2 text-gray-600">
                      {checkedCount} member{checkedCount > 1 ? 's' : ''} selected
                    </td>
                    <td className="px-3 py-2 text-right text-indigo-700">
                      {Object.entries(hours)
                        .filter(([id]) => checked[id])
                        .reduce((s, [, v]) => s + Number(v || 0), 0)}h/month
                    </td>
                    <td className="px-3 py-2 text-right text-indigo-700">
                      {Object.entries(hours)
                        .filter(([id]) => checked[id])
                        .reduce((s, [, v]) => s + Number(v || 0) * months.length, 0)}h total
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      <div className="pt-2 flex justify-end">
        <button
          type="submit"
          disabled={checkedCount === 0}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {checkedCount > 0
            ? `Assign ${checkedCount} Member${checkedCount > 1 ? 's' : ''}`
            : 'Select members to assign'}
        </button>
      </div>
    </form>
  );
}

// ─── Single Edit Form ─────────────────────────────────────────────────────────

function EditAssignmentForm({
  initial,
  projects,
  members,
  onSubmit,
}: {
  initial: Assignment;
  projects: Project[];
  members: TeamMember[];
  onSubmit: (fd: FormData) => Promise<void>;
}) {
  const [hoursPerMonth, setHoursPerMonth] = useState(initial.hoursPerMonth);
  const project = projects.find((p) => p.id === initial.projectId);
  const member = members.find((m) => m.id === initial.memberId);
  const months = project ? getMonthsBetween(project.startMonth, project.endMonth) : [];

  return (
    <form action={onSubmit} className="space-y-4">
      <input type="hidden" name="projectId" value={initial.projectId} />
      <input type="hidden" name="memberId" value={initial.memberId} />

      <div className="bg-gray-50 rounded-md px-4 py-3 text-sm text-gray-600">
        <p><span className="font-medium text-gray-800">{member?.name}</span> on <span className="font-medium text-gray-800">{project?.name}</span></p>
        {project && (
          <p className="text-xs text-gray-400 mt-0.5">
            {formatMonth(project.startMonth)} – {formatMonth(project.endMonth)} · {months.length} months
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Hours per Month</label>
        <input
          type="number"
          name="hoursPerMonth"
          value={hoursPerMonth}
          onChange={(e) => setHoursPerMonth(Number(e.target.value))}
          min={0}
          required
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        />
        {hoursPerMonth > 0 && months.length > 0 && (
          <p className="text-xs text-gray-400 mt-1">
            {hoursPerMonth}h × {months.length} months = <strong>{hoursPerMonth * months.length}h total</strong>
          </p>
        )}
      </div>

      <div className="pt-2 flex justify-end">
        <button
          type="submit"
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Save Changes
        </button>
      </div>
    </form>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AssignmentsClient({ assignments, projects, members, roles }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [editAssignment, setEditAssignment] = useState<Assignment | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const getMemberName = (id: string) => members.find((m) => m.id === id)?.name ?? 'Unknown';
  const getProjectName = (id: string) => projects.find((p) => p.id === id)?.name ?? 'Unknown';

  const grouped = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of assignments) {
      if (!map.has(a.projectId)) map.set(a.projectId, []);
      map.get(a.projectId)!.push(a);
    }
    return map;
  }, [assignments]);

  function toggleCollapse(projectId: string) {
    setCollapsed((prev) => ({ ...prev, [projectId]: !prev[projectId] }));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Assignments</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Add Assignments
        </button>
      </div>

      {assignments.length === 0 ? (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 px-6 py-12 text-center text-gray-400 text-sm">
          No assignments yet. Add your first assignment.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                const next: Record<string, boolean> = {};
                for (const id of grouped.keys()) next[id] = true;
                setCollapsed(next);
              }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Collapse all
            </button>
          </div>
          {Array.from(grouped.entries()).map(([projectId, projectAssignments]) => {
            const project = projects.find((p) => p.id === projectId);
            const months = project ? getMonthsBetween(project.startMonth, project.endMonth) : [];
            const isOpen = !collapsed[projectId];

            return (
              <div key={projectId} className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
                {/* Accordion header */}
                <button
                  type="button"
                  onClick={() => toggleCollapse(projectId)}
                  className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                    >
                      ▶
                    </span>
                    <span className="font-semibold text-gray-800">{getProjectName(projectId)}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {projectAssignments.length} member{projectAssignments.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    {project && (
                      <span>{formatMonth(project.startMonth)} – {formatMonth(project.endMonth)} · {months.length} months</span>
                    )}
                    <span className="font-medium text-gray-600">
                      {projectAssignments.reduce((s, a) => s + a.hoursPerMonth * months.length, 0)}h total
                    </span>
                  </div>
                </button>

                {/* Accordion body */}
                {isOpen && (
                  <div className="border-t border-gray-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/60">
                          <th className="text-left px-4 py-2.5 font-medium text-gray-600">Member</th>
                          <th className="text-right px-4 py-2.5 font-medium text-gray-600">h / month</th>
                          <th className="text-right px-4 py-2.5 font-medium text-gray-600">Total Hours</th>
                          <th className="px-4 py-2.5"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectAssignments.map((a, idx) => {
                          const total = a.hoursPerMonth * months.length;
                          return (
                            <tr
                              key={a.id}
                              className={`border-b border-gray-50 hover:bg-gray-50/50 ${
                                idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                              }`}
                            >
                              <td className="px-4 py-2.5 font-medium text-gray-800">
                                {getMemberName(a.memberId)}
                              </td>
                              <td className="px-4 py-2.5 text-right text-indigo-600 font-semibold">
                                {a.hoursPerMonth}h
                              </td>
                              <td className="px-4 py-2.5 text-right text-gray-600 font-medium">
                                {total}h
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2 justify-end">
                                  <button
                                    onClick={() => setEditAssignment(a)}
                                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                                  >
                                    Edit
                                  </button>
                                  <form action={async () => { await deleteAssignment(a.id); }}>
                                    <button
                                      type="submit"
                                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                                      onClick={(e) => {
                                        if (!confirm('Delete this assignment?')) e.preventDefault();
                                      }}
                                    >
                                      Delete
                                    </button>
                                  </form>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-gray-200 bg-gray-50 font-medium text-sm">
                          <td className="px-4 py-2 text-gray-600">Total assigned</td>
                          <td className="px-4 py-2 text-right text-gray-500">
                            {projectAssignments.reduce((s, a) => s + a.hoursPerMonth, 0)}h/month
                          </td>
                          <td className="px-4 py-2 text-right text-gray-700">
                            {projectAssignments.reduce((s, a) => s + a.hoursPerMonth * months.length, 0)}h
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <Modal title="Add Assignments" onClose={() => setShowCreate(false)}>
          <BulkAssignmentForm
            projects={projects}
            members={members}
            roles={roles}
            allAssignments={assignments}
            onSubmit={async (fd) => {
              await createBulkAssignments(fd);
              setShowCreate(false);
            }}
          />
        </Modal>
      )}

      {editAssignment && (
        <Modal title="Edit Assignment" onClose={() => setEditAssignment(null)}>
          <EditAssignmentForm
            initial={editAssignment}
            projects={projects}
            members={members}
            onSubmit={async (fd) => {
              await updateAssignment(editAssignment.id, fd);
              setEditAssignment(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
