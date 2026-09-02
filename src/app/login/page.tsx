import type { Metadata } from 'next';

import { LoginForm } from '@/components/auth/login-form';
import { school } from '@/lib/env';

export const metadata: Metadata = { title: 'Sign in' };

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { next } = await searchParams;

  // Only same-origin paths are honoured, so a crafted `next` cannot turn a
  // successful sign-in into an open redirect.
  const redirectTo = next?.startsWith('/') && !next.startsWith('//') ? next : '/';

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white">
            SM
          </span>
          <h1 className="mt-4 text-lg font-semibold text-slate-900">{school.name}</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to manage stationery, rosters and fees.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <LoginForm redirectTo={redirectTo} />
        </div>

        <p className="text-center text-xs text-slate-400">
          Access is limited to school staff accounts.
        </p>
      </div>
    </div>
  );
}
