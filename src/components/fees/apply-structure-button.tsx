'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { syncClassBills } from '@/server/actions/fees';

/** Re-applies the published fee structure to everyone currently in the class. */
export function ApplyStructureButton({ classId, termId }: { classId: string; termId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function apply() {
    startTransition(async () => {
      const result = await syncClassBills(classId, termId);
      if (!result.ok) {
        toast(result.error, 'error');
        return;
      }
      toast(`Fee structure applied to ${result.data.applied} account(s)`, 'success');
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={apply} loading={pending}>
      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
      Apply fee structure
    </Button>
  );
}
