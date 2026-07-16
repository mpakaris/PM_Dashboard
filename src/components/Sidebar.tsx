'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { pushDevToProd } from '@/actions/devTools';

const sections = [
  {
    label: 'Current Projects',
    items: [
      { label: 'Dashboard',    href: '/' },
      { label: 'Team Members', href: '/team' },
      { label: 'Roles',        href: '/roles' },
      { label: 'Profiles',     href: '/profiles' },
      { label: 'Projects',     href: '/projects' },
      { label: 'Assignments',  href: '/assignments' },
      { label: 'Overview',     href: '/overview' },
    ],
  },
  {
    label: 'Forecast',
    items: [
      { label: 'Planning', href: '/planning' },
      { label: 'Timesheets', href: '/timesheets' },
    ],
  },
  {
    label: 'SAP Import',
    items: [
      { label: 'ELSAP', href: '/elsap' },
    ],
  },
];

export default function Sidebar({ open = true, onToggle }: { open?: boolean; onToggle?: () => void }) {
  const pathname = usePathname();

  return (
    <aside className={`fixed left-0 top-0 h-full w-60 bg-slate-800 text-slate-100 flex flex-col z-40 transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="px-6 py-5 border-b border-slate-700 flex items-center justify-between">
        <h1 className="text-lg font-bold text-white leading-tight">Resource Dashboard</h1>
        <button
          onClick={onToggle}
          title="Hide sidebar"
          className="text-slate-400 hover:text-white transition-colors p-1 rounded hover:bg-slate-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {process.env.NODE_ENV === 'development' && <DevToolsPanel />}
    </aside>
  );
}

function DevToolsPanel() {
  const [state, setState] = useState<'idle' | 'pushing' | 'done' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  async function handlePush() {
    if (!confirm('Push DEV → PROD?\n\nThis will overwrite the production database with your local dev data. This cannot be undone.')) return;
    setState('pushing');
    try {
      const result = await pushDevToProd();
      if (result.ok) {
        setState('done');
        setTimeout(() => setState('idle'), 3000);
      } else {
        setErrMsg(result.error ?? 'Unknown error');
        setState('error');
        setTimeout(() => setState('idle'), 5000);
      }
    } catch (e) {
      setErrMsg(String(e));
      setState('error');
      setTimeout(() => setState('idle'), 5000);
    }
  }

  return (
    <div className="px-3 pb-4 pt-3 border-t border-slate-700">
      <p className="px-3 mb-2 text-xs font-semibold text-amber-500 uppercase tracking-wider">Dev Tools</p>
      <button
        type="button"
        onClick={handlePush}
        disabled={state === 'pushing'}
        className="w-full px-3 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 bg-amber-600 hover:bg-amber-500 text-white"
      >
        {state === 'pushing' && 'Pushing…'}
        {state === 'done'    && '✓ Pushed to PROD'}
        {state === 'error'   && `Error: ${errMsg}`}
        {state === 'idle'    && 'Push DEV → PROD'}
      </button>
    </div>
  );
}
