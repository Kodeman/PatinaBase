'use client';

import { useEffect, useRef, useState, type RefObject, type CSSProperties } from 'react';
import { FileSignature } from 'lucide-react';
import { FurnishingsAuthorizationBody } from '@patina/design-system';
import { useRetryProposalSend } from '@patina/supabase';
import { useFurnishingsAuthorizationPreview, useSendFurnishingsAuthorization } from '@/hooks/use-commercial-documents';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { DocSheet } from './doc-sheet';

type Props = {
  projectId: string;
  proposalId: string;
  clientName?: string;
  onClose: () => void;
  onSent?: () => void;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
};

type SendReceipt = {
  sentAt?: string;
  proposalSendDispatchId?: string;
  _emailDispatched?: boolean;
  _emailDeliveryState?: string;
  _emailRetryable?: boolean;
  _emailDispatchDetail?: string;
};

export function PurchasingAuthorizationPreviewSheet(props: Props) {
  return <SavedPreview key={`${props.projectId}:${props.proposalId}`} {...props} />;
}

function SavedPreview({ projectId, proposalId, clientName, onClose, onSent, fallbackFocusRef }: Props) {
  const preview = useFurnishingsAuthorizationPreview(proposalId, projectId);
  const send = useSendFurnishingsAuthorization(projectId);
  const retryDelivery = useRetryProposalSend({ errorSurface: 'inline' });
  const [error, setError] = useState<string | null>(null);
  const [held, setHeld] = useState(false);
  const [receipt, setReceipt] = useState<SendReceipt | null>(null);
  const acting = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  const data = preview.data;
  const ready = !preview.isPending && !preview.isFetching && !preview.isError &&
    data?.proposalId === proposalId && data?.projectId === projectId;
  const busy = send.isPending || retryDelivery.isPending;
  const canSend = ready && data?.state === 'draft' && !held && !receipt && !busy;

  const close = () => {
    if (acting.current) return;
    if (receipt && onSent) onSent();
    else onClose();
  };

  const sendReviewed = async () => {
    if (!canSend || acting.current || !data) return;
    acting.current = true;
    setError(null);
    try {
      const result = await send.mutateAsync({ proposalId: data.proposalId, expectedFingerprint: data.documentFingerprint });
      if (active.current) setReceipt(result as SendReceipt);
    } catch (cause) {
      if (!active.current) return;
      const code = (cause as { code?: string })?.code;
      if (code === 'PT409' || code === '40001' || code === 'serialization_failure') {
        setHeld(true);
        setError('This authorization changed. Reload and review the saved preview before sending.');
      } else if (code === '42501' || code === 'insufficient_privilege') {
        setHeld(true);
        setError('This authorization is sent, voided, or unavailable. Reload to check its state; nothing new will be created.');
      } else {
        setError(cause instanceof Error ? cause.message : 'The authorization could not be sent. Its saved draft is retained.');
      }
    } finally { acting.current = false; }
  };

  const reload = async () => {
    if (acting.current) return;
    acting.current = true;
    try {
      const result = await preview.refetch();
      if (active.current && !result.isError) { setHeld(false); setError(null); }
    } finally { acting.current = false; }
  };

  const retryEmail = async () => {
    if (acting.current || !receipt?._emailRetryable || !receipt.sentAt || !receipt.proposalSendDispatchId) return;
    acting.current = true;
    setError(null);
    try {
      const result = await retryDelivery.mutateAsync({ proposalId, sentAt: receipt.sentAt, dispatchId: receipt.proposalSendDispatchId });
      if (active.current) setReceipt({ ...receipt, ...result });
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : 'Email delivery could not be retried. The authorization is already sent.');
    } finally { acting.current = false; }
  };

  return (
    <DocSheet open onClose={close} title="Purchasing authorization preview" icon={FileSignature} wide fallbackFocusRef={fallbackFocusRef}>
      <div style={{ '--text-muted': 'var(--color-quiet-ink)' } as CSSProperties}>
        <p className="type-meta text-[var(--text-muted)]">{receipt ? 'Authorization sent' : 'Preview · Not sent'}</p>
        {clientName && <p className="mt-2 type-body-small">For {clientName}</p>}
        {preview.isPending || preview.isFetching ? <p role="status">Loading saved preview…</p> : null}
        {preview.isError && <p role="alert">The saved preview could not be loaded. The draft and its reservations are retained.</p>}
        {ready && data && <>
          <h2 className="mt-3 font-heading text-2xl">{data.title}</h2>
          <div className="mt-8"><FurnishingsAuthorizationBody {...data.body} /></div>
          {data.state !== 'draft' && !receipt && <p role="status" className="mt-4">This authorization is {data.state}. Sending is held. Use the existing authorization detail for delivery or Void.</p>}
        </>}
        {receipt && <div role="status" className="mt-4">
          <p>{receipt._emailDispatched ? 'The authorization was sent and its email delivered.' : 'The authorization is sent, but email delivery is not yet confirmed. Retrying email uses this existing send; it does not send another authorization.'}</p>
          {receipt._emailDeliveryState && <p>Email: {receipt._emailDeliveryState}</p>}
          {receipt._emailDispatchDetail && <p>{receipt._emailDispatchDetail}</p>}
        </div>}
        {error && <p role="alert" className="mt-4">{error}</p>}
        <p className="mt-4 type-body-small text-[var(--text-muted)]">These saved lines are frozen. Back leaves the draft and reservations intact. To revise, explicitly Void the authorization with a reason, then prepare a new draft.</p>
        <DocumentActionGroup surfaceKey="project" regionKey="purchasing-preview" aria-label="Preview actions">
          <DocumentAction actionKey="back-from-purchasing-preview" variant="secondary" onClick={close} disabled={busy}>{receipt ? 'Close' : 'Back'}</DocumentAction>
          {!receipt && <DocumentAction actionKey="reload-purchasing-preview" variant="secondary" onClick={reload} disabled={busy || preview.isFetching}>Reload preview</DocumentAction>}
          {!receipt && <DocumentAction actionKey="send-reviewed-purchasing-authorization" variant="terminal" held disabled={!canSend} loading={send.isPending} loadingLabel="Sending…" onClick={sendReviewed}>Send to client</DocumentAction>}
          {receipt?._emailRetryable && <DocumentAction actionKey="retry-purchasing-email" variant="secondary" onClick={retryEmail} disabled={busy || !receipt.sentAt || !receipt.proposalSendDispatchId} loading={retryDelivery.isPending}>Retry email delivery</DocumentAction>}
        </DocumentActionGroup>
      </div>
    </DocSheet>
  );
}
