'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/primitives';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-lg p-6">
      <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-1 text-sm text-slate-500">
        The page could not be loaded. This is usually a connection or permission problem.
      </p>
      <div className="mt-4 space-y-4">
        <Alert>{error.message}</Alert>
        <Button onClick={reset}>Try again</Button>
      </div>
    </Card>
  );
}
