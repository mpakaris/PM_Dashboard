'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { label: 'Dashboard', href: '/' },
  { label: 'Team Members', href: '/team' },
  { label: 'Roles', href: '/roles' },
  { label: 'Profiles', href: '/profiles' },
  { label: 'Projects', href: '/projects' },
  { label: 'Assignments', href: '/assignments' },
  { label: 'Overview', href: '/overview' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-slate-800 text-slate-100 flex flex-col z-40">
      <div className="px-6 py-5 border-b border-slate-700">
        <h1 className="text-lg font-bold text-white leading-tight">Resource Dashboard</h1>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
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
      </nav>
    </aside>
  );
}
