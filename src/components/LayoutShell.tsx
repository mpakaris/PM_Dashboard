'use client';

import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('sidebar-open');
    if (stored === 'false') setOpen(false);
  }, []);

  function toggle() {
    setOpen(prev => {
      localStorage.setItem('sidebar-open', String(!prev));
      return !prev;
    });
  }

  return (
    <>
      <Sidebar open={open} onToggle={toggle} />

      {/* Re-open tab shown when sidebar is hidden */}
      {!open && (
        <button
          onClick={toggle}
          title="Show sidebar"
          className="fixed left-0 top-1/2 -translate-y-1/2 z-50 bg-slate-800 hover:bg-slate-700 text-white w-5 h-14 rounded-r-md flex items-center justify-center transition-colors shadow-md"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      <main className={`min-h-screen p-8 transition-[margin-left] duration-200 ${open ? 'ml-60' : 'ml-0'}`}>
        {children}
      </main>
    </>
  );
}
