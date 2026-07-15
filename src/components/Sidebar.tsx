'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-slate-800 text-slate-100 flex flex-col z-40">
      <div className="px-6 py-5 border-b border-slate-700">
        <h1 className="text-lg font-bold text-white leading-tight">Resource Dashboard</h1>
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
    </aside>
  );
}
