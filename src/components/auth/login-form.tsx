'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { TextInput } from '@/components/ui/field';
import { Alert } from '@/components/ui/primitives';
import { signIn } from '@/server/actions/auth';

/** `redirectTo` is validated on the server; here it is just a same-origin path. */
export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await signIn(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace(redirectTo);
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      {error && <Alert>{error}</Alert>}

      <TextInput
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="bursar@school.edu.ng"
      />
      <TextInput
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />

      <Button type="submit" className="w-full" loading={pending}>
        Sign in
      </Button>
    </form>
  );
}
