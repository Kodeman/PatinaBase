'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  useMyServiceAcceptanceRequests, useRespondServiceAcceptance,
  type MyServiceAcceptanceRequest, type MyServiceAcceptanceResponse,
  type RespondServiceAcceptanceInput, type ServiceAcceptanceAnswer,
} from '@patina/supabase';
import { useHydrated } from '@/hooks/use-hydrated';

const actions: Record<ServiceAcceptanceAnswer, string> = {
  accept: 'Accept', accept_with_conditions: 'Accept with conditions', return: 'Return',
};
const methods = {
  portal_authenticated: 'Authenticated portal response',
  ios_authenticated: 'Authenticated iOS response',
  paper_intake: 'Reviewed paper response',
};
const control = 'rounded border border-current px-4 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-50';
const changedCopy = 'This request changed — reload to see the current version';
const pausedCopy = "Responses are paused for now. Nothing you've seen is lost.";

export function acceptanceRefusal(error: unknown): string {
  const row = error as { code?: string; message?: string } | null;
  const message = row?.message ?? '';
  if (row?.code === '42501' || /permission denied|scope_composition_disabled|insufficient_privilege/.test(message)) return pausedCopy;
  if (/stale_scope|stale_signer_policy/.test(message)) return changedCopy;
  if (/already_responded/.test(message)) return 'Your response is already recorded. Reload to see it.';
  if (/request_not_open/.test(message)) return 'This request is no longer open. Reload to see its final state.';
  if (/signer_not_active/.test(message)) return 'You are no longer asked to respond. Reload to see the current request.';
  return 'Your response could not be confirmed. Your words are kept here; try again.';
}

export function ServiceAcceptanceEvidence({ request, evidence }: {
  request: MyServiceAcceptanceRequest;
  evidence?: ReactNode;
}) {
  return <section aria-label="Agreed scope and evidence" className="space-y-4 border-y py-6">
    <h2 className="font-serif text-2xl">What you’re accepting</h2>
    <p>You confirm the studio delivered the service described in this agreed scope.</p>
    <dl className="space-y-3">
      <div><dt>Request</dt><dd>{request.requestNumber}</dd></div>
      <div><dt>Agreed scope edition</dt><dd className="break-all">{request.scopeEditionId}</dd></div>
      <div><dt>Scope reference · {request.scopeContentHash.slice(0, 12)}</dt><dd><code className="break-all text-sm">{request.scopeContentHash}</code></dd></div>
      <div><dt>Evidence reference · {request.evidenceManifestHash.slice(0, 12)}</dt><dd><code className="break-all text-sm">{request.evidenceManifestHash}</code></dd></div>
    </dl>
    {evidence ?? <p>These references identify the agreed scope and evidence. Their contents are not available on this page yet.</p>}
  </section>;
}

function ResponseReading({ response }: { response: MyServiceAcceptanceResponse }) {
  return <div className="space-y-2">
    <p>{actions[response.response]} · {methods[response.method]}</p>
    {response.conditions.map((c) => <p key={c.conditionId}>{c.text}</p>)}
    {response.returnReason && <p>{response.returnReason}</p>}
  </div>;
}

function ResponseForm({ request, reload }: { request: MyServiceAcceptanceRequest; reload: () => Promise<unknown> }) {
  const mutation = useRespondServiceAcceptance();
  const [answer, setAnswer] = useState<ServiceAcceptanceAnswer | null>(null);
  const [presented, setPresented] = useState(request);
  const [conditions, setConditions] = useState([{ conditionId: '', text: '' }]);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [recorded, setRecorded] = useState<MyServiceAcceptanceResponse | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const valid = answer === 'accept' || (answer === 'accept_with_conditions' && conditions.every((c) => !!c.text.trim())) || (answer === 'return' && !!reason.trim());
  const stale = answer !== null && (presented.scopeContentHash !== request.scopeContentHash || presented.evidenceManifestHash !== request.evidenceManifestHash || presented.signerPolicyRevision !== request.signerPolicyRevision);
  const errorCopy = failure ? acceptanceRefusal(failure) : null;
  const needsReload = errorCopy != null && errorCopy !== pausedCopy && errorCopy !== 'Your response could not be confirmed. Your words are kept here; try again.';

  async function submit() {
    if (!answer || !valid || stale || mutation.isPending || needsReload) return;
    const input: RespondServiceAcceptanceInput = {
      request: presented, response: answer,
      conditions: answer === 'accept_with_conditions' ? conditions.map((c) => ({ ...c, text: c.text.trim() })) : [],
      returnReason: answer === 'return' ? reason.trim() : '',
    };
    try {
      const receipt = await mutation.mutateAsync(input);
      setRecorded({ response: answer, conditions: input.conditions, returnReason: input.returnReason || null,
        method: 'portal_authenticated', respondedAt: '' });
      setPending(receipt.pendingRequiredSigners);
      setFailure(null);
    } catch (error) {
      setFailure(error);
    }
  }

  if (recorded) return <section aria-label="Your recorded response" role="status"><h2>Your response is recorded</h2><ResponseReading response={recorded} /><p>Waiting for {pending} required responses</p></section>;
  return <section aria-label="Your response" className="space-y-4">
    <h2 className="font-serif text-2xl">Your response</h2>
    <fieldset disabled={mutation.isPending || needsReload || stale} className="space-y-4">
      <legend>How would you like to respond?</legend>
      <div className="flex flex-wrap gap-3">{(Object.keys(actions) as ServiceAcceptanceAnswer[]).map((value) =>
        <button className={control} type="button" aria-pressed={answer === value} key={value} onClick={() => {
          setAnswer(value); setPresented(request); setConfirming(false); setFailure(null);
        }}>{actions[value]}</button>)}</div>
      {answer === 'accept_with_conditions' && <div className="space-y-3">
        {conditions.map((c, index) => <label className="block" key={index}>Condition {index + 1}
          <textarea className="block w-full border p-2" value={c.text} onChange={(e) => {
            const text = e.target.value;
            setConditions((rows) => rows.map((row, i) => i === index ? { conditionId: row.conditionId || crypto.randomUUID(), text } : row));
            setConfirming(false);
          }} />
        </label>)}
        <button className={control} type="button" onClick={() => { setConditions((rows) => [...rows, { conditionId: '', text: '' }]); setConfirming(false); }}>Add condition</button>
      </div>}
      {answer === 'return' && <label className="block">Reason for returning
        <textarea className="block w-full border p-2" value={reason} onChange={(e) => { setReason(e.target.value); setConfirming(false); }} />
      </label>}
      {answer && !confirming && <button type="button" className={control} disabled={!valid} onClick={() => setConfirming(true)}>Review response</button>}
      {answer && confirming && <div className="space-y-3">
        <h3>Confirm: {actions[answer]}</h3>
        {answer !== 'return' && <p>You confirm the studio delivered the service described in this agreed scope.</p>}
        {answer === 'accept_with_conditions' && conditions.map((c) => <p key={c.conditionId}>{c.text.trim()}</p>)}
        {answer === 'return' && <p>You are returning this request to the studio, not accepting delivery. {reason.trim()}</p>}
        <p>This records an authenticated response.</p>
        <button type="button" className={control} disabled={!valid} onClick={() => void submit()}>{mutation.isPending ? 'Recording response…' : 'Confirm response'}</button>
        <button type="button" className={control} onClick={() => setConfirming(false)}>Edit response</button>
      </div>}
    </fieldset>
    {stale && <p role="alert">{changedCopy}</p>}
    {errorCopy && <p role="alert">{errorCopy}</p>}
    {(needsReload || stale) && <button type="button" className={control} onClick={() => void reload().then(() => {
      setFailure(null); setAnswer(null); setConfirming(false);
    }).catch(() => {})}>Reload request</button>}
  </section>;
}

export function ServiceAcceptanceReading({ request, reload, evidence }: {
  request: MyServiceAcceptanceRequest; reload: () => Promise<unknown>; evidence?: ReactNode;
}) {
  const own = request.signers.find((s) => s.signerId === request.viewerSignerId)?.response;
  const pending = request.signers.filter((s) => s.required && !s.response).length;
  return <article className="mx-auto max-w-2xl space-y-8 px-4 py-10">
    <Link href={`/projects/${encodeURIComponent(request.projectId)}`}>Return to your house</Link>
    <header><h1 className="font-serif text-3xl">Service acceptance</h1><p>Request {request.requestNumber} · {request.lifecycle} · {request.aggregateOutcome.replaceAll('_', ' ')}</p></header>
    <ServiceAcceptanceEvidence request={request} evidence={evidence} />
    <p>Waiting for {pending} required responses</p>
    {own && <section aria-label="Your recorded response"><h2>Your response</h2><ResponseReading response={own} /></section>}
    {request.viewerRole === 'signer_required' && request.lifecycle === 'sent' && !own && <ResponseForm request={request} reload={reload} />}
    <section aria-label="Responses"><h2>Responses</h2><ul className="space-y-4">{request.signers.map((s) => <li key={s.signerId}>
      <h3>{s.slot}{s.signerId === request.viewerSignerId ? ' · You' : ''} · {s.required ? 'Required' : 'Optional'}</h3>
      {s.response ? <ResponseReading response={s.response} /> : <p>Waiting for response</p>}
    </li>)}</ul></section>
  </article>;
}

export function ServiceAcceptancePage({ requestId }: { requestId: string }) {
  const hydrated = useHydrated();
  const query = useMyServiceAcceptanceRequests();
  if (!hydrated || query.isPending) return <main className="p-6" role="status">Loading service acceptance…</main>;
  const request = query.data?.find((row) => row.requestId === requestId);
  if (query.isError && !request) return <main className="p-6"><p role="alert">This request could not be refreshed. No response has been sent.</p><button className={control} onClick={() => void query.refetch()}>Try again</button></main>;
  if (!request) return <main className="p-6"><h1>Request unavailable</h1><p>This request is not available to this account.</p><Link href="/">Return to your house</Link></main>;
  return <main>{query.isError && <p role="alert">This request could not be refreshed. Your words are kept here.</p>}<ServiceAcceptanceReading key={request.requestId} request={request} reload={async () => { await query.refetch({ throwOnError: true }); }} /></main>;
}
