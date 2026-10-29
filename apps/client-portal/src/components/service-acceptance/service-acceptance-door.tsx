'use client';

import Link from 'next/link';
import { useMyServiceAcceptanceRequests } from '@patina/supabase';
import { useHydrated } from '@/hooks/use-hydrated';

export function ServiceAcceptanceDoor({ projectId }: { projectId: string }) {
  const hydrated = useHydrated();
  const query = useMyServiceAcceptanceRequests();
  if (!hydrated) return null;
  const actionable = query.data?.filter((r) => r.projectId === projectId && r.lifecycle === 'sent'
    && r.viewerRole === 'signer_required' && r.signers.some((s) => s.signerId === r.viewerSignerId && !s.response));
  if (query.isError && !actionable?.length) return <aside aria-label="Service acceptance" className="mx-auto max-w-2xl px-4 py-4">
    <p role="alert">Couldn’t load acceptance requests.</p>
    <button type="button" className="underline" onClick={() => void query.refetch()}>Try again</button>
  </aside>;
  if (!actionable?.length) return null;
  return <aside aria-label="Service acceptance" className="mx-auto max-w-2xl px-4 py-4">
    {query.isError && <><p role="status">Acceptance requests could not be refreshed.</p><button type="button" className="underline" onClick={() => void query.refetch()}>Try again</button></>}
    {actionable.map((r) => <p key={r.requestId}><Link className="underline" href={`/acceptance/${encodeURIComponent(r.requestId)}`}>Waiting for your acceptance · Request {r.requestNumber}</Link></p>)}
  </aside>;
}
