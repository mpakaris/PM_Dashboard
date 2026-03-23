'use client';

import { useState } from 'react';
import { TeamMember, Role, Profile } from '@/lib/types';
import Modal from '@/components/Modal';
import Badge from '@/components/Badge';
import { createTeamMember, updateTeamMember, deleteTeamMember } from '@/actions/teamMembers';

interface Props {
  members: TeamMember[];
  roles: Role[];
  profiles: Profile[];
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

export default function TeamClient({ members, roles, profiles }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);

  const getRoleName = (roleId: string) => roles.find((r) => r.id === roleId)?.name ?? '—';
  const getRoleType = (roleId: string) => roles.find((r) => r.id === roleId)?.type ?? 'intern';
  const getProfileNames = (profileIds: string[]) =>
    profileIds.map((id) => profiles.find((p) => p.id === id)?.name).filter(Boolean).join(', ') || '—';

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
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Profiles</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Avail. h/month</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((member, idx) => (
                <tr
                  key={member.id}
                  className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-gray-800">{member.name}</td>
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
                    {member.monthlyAvailability ? `${member.monthlyAvailability}h` : '—'}
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
              ))}
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
