'use client';

import { useState } from 'react';
import { Role } from '@/lib/types';
import Modal from '@/components/Modal';
import Badge from '@/components/Badge';
import { createRole, updateRole, deleteRole } from '@/actions/roles';

interface Props {
  roles: Role[];
}

function RoleForm({
  initial,
  onSubmit,
}: {
  initial?: Role;
  onSubmit: (fd: FormData) => Promise<void>;
}) {
  const [type, setType] = useState<'intern' | 'extern'>(initial?.type ?? 'intern');

  return (
    <form action={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input
          name="name"
          defaultValue={initial?.name}
          required
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-500 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Definition</label>
        <textarea
          name="definition"
          defaultValue={initial?.definition}
          rows={3}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-500 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
        <div className="flex gap-4">
          {(['intern', 'extern'] as const).map((t) => (
            <label key={t} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="type"
                value={t}
                checked={type === t}
                onChange={() => setType(t)}
                className="text-slate-600"
              />
              <span className="text-sm capitalize">{t}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <button
          type="submit"
          className="bg-slate-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-700 transition-colors"
        >
          {initial ? 'Save Changes' : 'Create Role'}
        </button>
      </div>
    </form>
  );
}

export default function RolesClient({ roles }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Roles</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-slate-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-700 transition-colors"
        >
          Add Role
        </button>
      </div>

      {roles.length === 0 ? (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 px-6 py-12 text-center text-gray-400 text-sm">
          No roles defined yet. Create your first role.
        </div>
      ) : (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Definition</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>

                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role, idx) => (
                <tr
                  key={role.id}
                  className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-gray-800">{role.name}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                    {role.definition || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      label={role.type}
                      color={role.type === 'intern' ? 'blue' : 'orange'}
                    />
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => setEditRole(role)}
                        className="text-xs text-slate-600 hover:text-slate-800 font-medium"
                      >
                        Edit
                      </button>
                      <form
                        action={async () => {
                          await deleteRole(role.id);
                        }}
                      >
                        <button
                          type="submit"
                          className="text-xs text-red-500 hover:text-red-700 font-medium"
                          onClick={(e) => {
                            if (!confirm('Delete this role?')) e.preventDefault();
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
        <Modal title="Create Role" onClose={() => setShowCreate(false)}>
          <RoleForm
            onSubmit={async (fd) => {
              await createRole(fd);
              setShowCreate(false);
            }}
          />
        </Modal>
      )}

      {editRole && (
        <Modal title="Edit Role" onClose={() => setEditRole(null)}>
          <RoleForm
            initial={editRole}
            onSubmit={async (fd) => {
              await updateRole(editRole.id, fd);
              setEditRole(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
