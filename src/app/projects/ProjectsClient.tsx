'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Project, TeamMember, Role, Assignment } from '@/lib/types';
import Modal from '@/components/Modal';
import { createProject, updateProject, deleteProject } from '@/actions/projects';
import { getMonthsBetween, formatMonth, formatNumber } from '@/lib/utils';

const FTE_HOURS = 1680;

interface Props {
  projects: Project[];
  members: TeamMember[];
  roles: Role[];
  assignments: Assignment[];
}

// Generate month options from 2025-01 to 2027-12
function generateMonthOptions() {
  return getMonthsBetween('2025-01', '2027-12');
}

function ProjectForm({
  initial,
  members,
  roles,
  onSubmit,
}: {
  initial?: Project;
  members: TeamMember[];
  roles: Role[];
  onSubmit: (fd: FormData) => Promise<void>;
}) {
  const monthOptions = generateMonthOptions();
  const [startMonth, setStartMonth] = useState(initial?.startMonth ?? '2026-01');
  const [endMonth, setEndMonth] = useState(initial?.endMonth ?? '2026-12');
  const [orderAmount, setOrderAmount] = useState(initial?.orderAmountHours ?? 0);
  const [fte, setFte] = useState(
    initial?.orderAmountHours ? Math.round((initial.orderAmountHours / FTE_HOURS) * 100) / 100 : 0
  );
  const [distribution, setDistribution] = useState<Record<string, number>>(
    initial?.monthlyDistribution ?? {}
  );
  const isFirstMount = useRef(true);

  const months = useMemo(() => {
    if (!startMonth || !endMonth || startMonth > endMonth) return [];
    return getMonthsBetween(startMonth, endMonth);
  }, [startMonth, endMonth]);

  // PM members: role name contains "projektmanager" or "projectmanager"
  const pmMembers = useMemo(() => {
    const pms = members.filter((m) => {
      const role = roles.find((r) => r.id === m.roleId);
      const name = (role?.name ?? '').toLowerCase();
      return name.includes('projektmanager') || name.includes('projectmanager') || name.includes('project manager');
    });
    return pms.length > 0 ? pms : members; // fallback to all if none tagged
  }, [members, roles]);

  const hasPmFilter = useMemo(() => {
    return members.some((m) => {
      const role = roles.find((r) => r.id === m.roleId);
      const name = (role?.name ?? '').toLowerCase();
      return name.includes('projektmanager') || name.includes('projectmanager') || name.includes('project manager');
    });
  }, [members, roles]);

  const totalDistributed = useMemo(
    () => Object.values(distribution).reduce((s, v) => s + (v || 0), 0),
    [distribution]
  );

  function distributeEvenly(total: number, ms: string[]) {
    if (total <= 0 || ms.length === 0) return;
    const perMonth = Math.floor(total / ms.length);
    const remainder = total - perMonth * ms.length;
    const dist: Record<string, number> = {};
    for (let i = 0; i < ms.length; i++) {
      dist[ms[i]] = perMonth + (i === 0 ? remainder : 0);
    }
    setDistribution(dist);
  }

  function handleOrderAmountChange(value: string) {
    const num = Math.round(Number(value)) || 0;
    setOrderAmount(num);
    setFte(num > 0 ? Math.round((num / FTE_HOURS) * 100) / 100 : 0);
    distributeEvenly(num, months);
  }

  function handleFteChange(value: string) {
    const f = Number(value) || 0;
    const hours = Math.round(f * FTE_HOURS);
    setFte(f);
    setOrderAmount(hours);
    distributeEvenly(hours, months);
  }

  // Re-distribute when month range changes (skip initial mount to preserve edit values)
  const monthsKey = months.join(',');
  useEffect(() => {
    if (isFirstMount.current) { isFirstMount.current = false; return; }
    if (orderAmount > 0) distributeEvenly(orderAmount, months);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthsKey]);

  return (
    <form action={onSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
          <input
            name="name"
            defaultValue={initial?.name}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Project Manager
            {!hasPmFilter && <span className="ml-1 text-xs text-gray-400 font-normal">(assign a "Projektmanager" role to filter)</span>}
          </label>
          <select
            name="managerId"
            defaultValue={initial?.managerId ?? ''}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          >
            <option value="">— none —</option>
            {pmMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Order No.</label>
          <input
            name="orderNo"
            defaultValue={initial?.orderNo}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
        </div>

        <div className="col-span-2 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Order Amount (h)</label>
            <input
              type="number"
              name="orderAmountHours"
              value={orderAmount || ''}
              onChange={(e) => handleOrderAmountChange(e.target.value)}
              min={0}
              placeholder="e.g. 2000"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              FTE
              <span className="ml-1 text-xs text-gray-400 font-normal">1 FTE = {FTE_HOURS}h</span>
            </label>
            <input
              type="number"
              value={fte || ''}
              onChange={(e) => handleFteChange(e.target.value)}
              min={0}
              step="any"
              placeholder="e.g. 1.5"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start Month</label>
          <select
            name="startMonth"
            value={startMonth}
            onChange={(e) => setStartMonth(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>{formatMonth(m)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">End Month</label>
          <select
            name="endMonth"
            value={endMonth}
            onChange={(e) => setEndMonth(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>{formatMonth(m)}</option>
            ))}
          </select>
        </div>
      </div>

      {months.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Hours Distribution</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => distributeEvenly(orderAmount, months)}
                disabled={orderAmount <= 0}
                className="text-xs px-2.5 py-1 rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-30"
              >
                Distribute evenly
              </button>
              <span className="text-xs text-gray-500">
                {totalDistributed} / {orderAmount}h
                {orderAmount > 0 && (
                  <span className={`ml-1 font-medium ${totalDistributed > orderAmount ? 'text-red-600' : totalDistributed === orderAmount ? 'text-green-600' : 'text-gray-500'}`}>
                    ({orderAmount - totalDistributed >= 0 ? `${orderAmount - totalDistributed}h left` : `${totalDistributed - orderAmount}h over`})
                  </span>
                )}
              </span>
            </div>
          </div>
          <div className="border border-gray-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Month</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Hours</th>
                </tr>
              </thead>
              <tbody>
                {months.map((month, idx) => (
                  <tr key={month} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}>
                    <td className="px-3 py-2 text-gray-700">{formatMonth(month)}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        name={`dist_${month}`}
                        value={distribution[month] ?? 0}
                        onChange={(e) => setDistribution((prev) => ({ ...prev, [month]: Number(e.target.value) }))}
                        min={0}
                        className="w-24 ml-auto block border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200 font-medium">
                  <td className="px-3 py-2 text-gray-700">Total</td>
                  <td className="px-3 py-2 text-right text-gray-800">{totalDistributed}h</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="pt-2 flex justify-end">
        <button
          type="submit"
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          {initial ? 'Save Changes' : 'Create Project'}
        </button>
      </div>
    </form>
  );
}

export default function ProjectsClient({ projects, members, roles, assignments }: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);

  const getManagerName = (managerId: string) =>
    members.find((m) => m.id === managerId)?.name ?? '—';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Add Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 px-6 py-12 text-center text-gray-400 text-sm">
          No projects yet. Create your first project.
        </div>
      ) : (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Manager</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Order No.</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Ordered h</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Duration</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Planned h</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Billed h</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Remaining h</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project, idx) => {
                const projectAssignments = assignments.filter((a) => a.projectId === project.id);
                const planned = projectAssignments.reduce(
                  (s, a) => s + Object.values(a.plannedHours).reduce((x, v) => x + v, 0), 0
                );
                const billed = projectAssignments.reduce(
                  (s, a) => s + Object.values(a.billedHours).reduce((x, v) => x + v, 0), 0
                );
                const remaining = project.orderAmountHours - billed;
                return (
                  <tr
                    key={project.id}
                    className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-800">{project.name}</td>
                    <td className="px-4 py-3 text-gray-600 text-sm">{getManagerName(project.managerId)}</td>
                    <td className="px-4 py-3 text-gray-500">{project.orderNo || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatNumber(project.orderAmountHours)}h
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {formatMonth(project.startMonth)} – {formatMonth(project.endMonth)}
                    </td>
                    <td className="px-4 py-3 text-right text-indigo-600 font-medium">{formatNumber(planned)}h</td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-medium">{formatNumber(billed)}h</td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${
                        remaining < 0
                          ? 'text-red-600'
                          : remaining === 0
                          ? 'text-green-600'
                          : 'text-gray-600'
                      }`}
                    >
                      {formatNumber(remaining)}h
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setEditProject(project)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          Edit
                        </button>
                        <form
                          action={async () => {
                            await deleteProject(project.id);
                          }}
                        >
                          <button
                            type="submit"
                            className="text-xs text-red-500 hover:text-red-700 font-medium"
                            onClick={(e) => {
                              if (!confirm('Delete this project? All assignments will also be deleted.'))
                                e.preventDefault();
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
          </table>
        </div>
      )}

      {showCreate && (
        <Modal title="Create Project" onClose={() => setShowCreate(false)}>
          <ProjectForm
            members={members}
            roles={roles}
            onSubmit={async (fd) => {
              await createProject(fd);
              setShowCreate(false);
              router.refresh();
            }}
          />
        </Modal>
      )}

      {editProject && (
        <Modal title="Edit Project" onClose={() => setEditProject(null)}>
          <ProjectForm
            initial={editProject}
            members={members}
            roles={roles}
            onSubmit={async (fd) => {
              await updateProject(editProject.id, fd);
              setEditProject(null);
              router.refresh();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
