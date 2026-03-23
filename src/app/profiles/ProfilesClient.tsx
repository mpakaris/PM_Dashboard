'use client';

import { useState } from 'react';
import { Profile } from '@/lib/types';
import Modal from '@/components/Modal';
import { createProfile, updateProfile, deleteProfile } from '@/actions/profiles';

interface Props {
  profiles: Profile[];
}

function ProfileForm({
  initial,
  onSubmit,
}: {
  initial?: Profile;
  onSubmit: (fd: FormData) => Promise<void>;
}) {
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
        <label className="block text-sm font-medium text-gray-700 mb-1">Definition</label>
        <textarea
          name="definition"
          defaultValue={initial?.definition}
          rows={4}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        />
      </div>
      <div className="pt-2 flex justify-end">
        <button
          type="submit"
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          {initial ? 'Save Changes' : 'Create Profile'}
        </button>
      </div>
    </form>
  );
}

export default function ProfilesClient({ profiles }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [editProfile, setEditProfile] = useState<Profile | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Profiles</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Add Profile
        </button>
      </div>

      {profiles.length === 0 ? (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 px-6 py-12 text-center text-gray-400 text-sm">
          No profiles defined yet. Create your first profile.
        </div>
      ) : (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Definition</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile, idx) => (
                <tr
                  key={profile.id}
                  className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-gray-800">{profile.name}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-sm truncate">
                    {profile.definition || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => setEditProfile(profile)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Edit
                      </button>
                      <form
                        action={async () => {
                          await deleteProfile(profile.id);
                        }}
                      >
                        <button
                          type="submit"
                          className="text-xs text-red-500 hover:text-red-700 font-medium"
                          onClick={(e) => {
                            if (!confirm('Delete this profile?')) e.preventDefault();
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
        <Modal title="Create Profile" onClose={() => setShowCreate(false)}>
          <ProfileForm
            onSubmit={async (fd) => {
              await createProfile(fd);
              setShowCreate(false);
            }}
          />
        </Modal>
      )}

      {editProfile && (
        <Modal title="Edit Profile" onClose={() => setEditProfile(null)}>
          <ProfileForm
            initial={editProfile}
            onSubmit={async (fd) => {
              await updateProfile(editProfile.id, fd);
              setEditProfile(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
