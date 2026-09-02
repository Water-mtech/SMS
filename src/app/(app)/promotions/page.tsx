import type { Metadata } from 'next';

import { PromotePanel } from '@/components/promotions/promote-panel';
import { Alert, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives';
import { formatDateTime, formatNaira, formatTerm } from '@/lib/format';
import { getClasses, getCurrentTerm, getPromotionHistory, getTerms } from '@/server/queries';

export const metadata: Metadata = { title: 'Promotions' };

export default async function PromotionsPage() {
  const [classes, terms, currentTerm, history] = await Promise.all([
    getClasses(),
    getTerms(),
    getCurrentTerm(),
    getPromotionHistory(),
  ]);

  if (terms.length < 2) {
    return (
      <>
        <PageHeader title="Class promotions" />
        <Alert tone="warning">
          At least two terms must exist before a class can be promoted into the next one.
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Class promotions"
        description="Move a whole class up one level and carry every uncleared balance into the next term as arrears."
      />

      <Card className="overflow-hidden">
        <CardHeader
          title="Promote a class"
          description="Destination is resolved from the promotion order; the final class graduates instead of moving."
        />
        <PromotePanel
          classes={classes.map((item) => ({
            id: item.id,
            name: item.name,
            sectionName: item.section.name,
            promotionOrder: item.promotion_order,
            isTerminal: item.is_terminal,
          }))}
          terms={terms
            .slice()
            .sort((a, b) => a.sequence - b.sequence)
            .map((item) => ({
              id: item.id,
              label: `${formatTerm(item.label)} · ${item.session.name}`,
              sequence: item.sequence,
            }))}
          defaultFromTermId={currentTerm?.id ?? terms[0]?.id ?? ''}
        />
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Promotion history" description="Every batch that has been run, most recent first." />
        {history.length === 0 ? (
          <EmptyState title="No promotions yet" description="Completed promotions will be listed here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Previously executed class promotions.</caption>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th scope="col" className="px-4 py-3 font-semibold text-slate-700">Movement</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">Promoted</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">Graduated</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">Rolled over</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-slate-700">Run at</th>
                </tr>
              </thead>
              <tbody>
                {history.map((batch) => (
                  <tr key={batch.id} className="border-b border-slate-100 last:border-0">
                    <th scope="row" className="px-4 py-3 text-left font-medium text-slate-900">
                      {batch.from_class?.name ?? '—'} → {batch.to_class?.name ?? 'Graduated'}
                    </th>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {batch.student_count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {batch.graduated_count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {formatNaira(batch.rolled_over_total)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDateTime(batch.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
