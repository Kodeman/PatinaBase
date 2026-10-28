'use client';

import { useMyStudioServiceCompletion, type MyServiceAcceptanceRequest } from '@patina/supabase';
import { useHydrated } from '@/hooks/use-hydrated';

function CompletionDate({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  })}</time>;
}

export function StudioServiceCompletion({ projectId, requestId, aggregateOutcome }: Pick<MyServiceAcceptanceRequest, 'projectId' | 'requestId' | 'aggregateOutcome'>) {
  const hydrated = useHydrated();
  const accepted = aggregateOutcome === 'accepted' || aggregateOutcome === 'accepted_with_conditions';
  const query = useMyStudioServiceCompletion(accepted ? projectId : null, requestId);
  if (!accepted) return null;
  if (!hydrated || query.isPending) return <p role="status">Loading studio service…</p>;
  if (query.isError) return <section aria-label="Studio service" className="space-y-3 border-y py-6">
    <h2 className="font-serif text-2xl">Studio service</h2>
    <p role="alert">The studio's service status could not be refreshed.</p>
    <button type="button" className="rounded border border-current px-4 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" onClick={() => void query.refetch()}>Retry service status</button>
  </section>;
  if (!query.data) return null;
  const completion = query.data.completion;
  return <section aria-label="Studio service" className="space-y-3 border-y py-6">
    <h2 className="font-serif text-2xl">Studio service</h2>
    {!completion ? <p>The studio will confirm when its service is complete</p> : <>
      <p>{completion.state === 'completed_with_conditions' && !completion.conditionsClosedAt
        ? 'Complete, with conditions still being resolved' : 'The studio’s service is complete'}</p>
      <p>Completed <CompletionDate value={completion.completedAt} /></p>
      {completion.conditionsClosedAt && <p>Conditions resolved <CompletionDate value={completion.conditionsClosedAt} /></p>}
      <dl className="space-y-3">
        <div><dt>Accepted scope · request {completion.requestNumber}</dt><dd className="break-all">{completion.scopeEditionId}</dd></div>
        <div><dt>Accepted scope reference</dt><dd><code className="break-all text-sm">{completion.scopeContentHash}</code></dd></div>
      </dl>
    </>}
    {completion && <p>Care questions are still welcome.</p>}
  </section>;
}
