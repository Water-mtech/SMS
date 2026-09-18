'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  LayoutDashboard,
  Menu,
  PackagePlus,
  Receipt,
  Settings,
  Users,
  Users2,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/stationery', label: 'Stationery', icon: BookOpen },
  { href: '/stationery/items', label: 'Stationery Items', icon: PackagePlus },
  { href: '/students', label: 'Students', icon: Users },
  { href: '/families', label: 'Families', icon: Users2 },
  { href: '/fees', label: 'Fees & Payments', icon: Receipt },
  { href: '/promotions', label: 'Promotions', icon: ArrowUpRight },
  { href: '/fees/structures', label: 'Fee Structures', icon: Settings },
] as const;

/**
 * The sidebar is a solid brand-green panel, so every control inside it is
 * styled for a dark ground: light text, a lighter green for the active link,
 * and a white focus ring that stays visible against the green.
 */
const PANEL_CLASSES = 'bg-brand-700 text-white';

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/fees') return pathname === '/fees' || pathname.startsWith('/fees/receipt');
  if (href === '/stationery') return pathname === '/stationery';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
              active
                ? 'bg-brand-500 text-white shadow-sm'
                : 'text-brand-100 hover:bg-brand-600 hover:text-white',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function DesktopNav() {
  return (
    <div className={cn('hidden w-60 shrink-0 lg:block print:hidden', PANEL_CLASSES)}>
      <div className="sticky top-0 flex h-screen flex-col gap-6 px-4 py-6">
        <BrandMark />
        <NavLinks />
      </div>
    </div>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden print:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            className={cn(
              'relative z-10 flex h-full w-64 flex-col gap-6 px-4 py-6 shadow-xl animate-slide-in',
              PANEL_CLASSES,
            )}
          >
            <div className="flex items-center justify-between">
              <BrandMark />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
                className="rounded-lg p-1.5 text-brand-100 hover:bg-brand-600 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

function BrandMark() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-sm font-bold text-brand-700">
        SM
      </span>
      <span className="text-sm font-semibold leading-tight text-white">
        School
        <br />
        Manager
      </span>
    </Link>
  );
}
