'use client';

import { useActionState } from 'react';
import { login } from '@/actions/auth';

export default function LoginPage() {
  const [error, action, isPending] = useActionState(login, null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Ressource Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">Enter your password to continue</p>
        </div>

        <div className="bg-white rounded-xl ring-1 ring-gray-200 shadow-sm p-8">
          <form action={action} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                name="password"
                autoFocus
                autoComplete="current-password"
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                placeholder="••••••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-slate-700 hover:bg-slate-800 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {isPending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
