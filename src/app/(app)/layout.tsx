import { LogOut } from 'lucide-react';

import { DesktopNav, MobileNav } from '@/components/layout/nav';
import { Badge } from '@/components/ui/primitives';
import { school } from '@/lib/env';
import { formatTerm } from '@/lib/format';
import { getCurrentProfile, getCurrentTerm } from '@/server/queries';
import { signOut } from '@/server/actions/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [profile, term] = await Promise.all([getCurrentProfile(), getCurrentTerm()]);

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <DesktopNav />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6 print:hidden">
          <MobileNav />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{school.name}</p>
            <p className="truncate text-xs text-slate-500">
              {term ? `${formatTerm(term.label)} · in progress` : 'No active term configured'}
            </p>
          </div>

          {profile && (
            <div className="hidden items-center gap-2 sm:flex">
              <span className="text-sm text-slate-600">{profile.full_name}</span>
              <Badge tone="info" className="capitalize">
                {profile.role}
              </Badge>
            </div>
          )}

          <form action={signOut}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        </header>

        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
