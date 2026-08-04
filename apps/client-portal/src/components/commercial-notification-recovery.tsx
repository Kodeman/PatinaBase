'use client';

import { useEffect, useState } from 'react';
import type { CommercialDocumentSummary } from '@/lib/commercial-documents';

type RecoveryMessage = {
  tone: 'status' | 'error';
  text: string;
};

export function CommercialNotificationRecovery({
  document,
}: {
  document: CommercialDocumentSummary;
}) {
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<RecoveryMessage | null>(null);
  const isServicesReceipt =
    (document.kind === 'design_services' ||
      document.kind === 'service_addendum') &&
    (document.state === 'client_signed' || document.state === 'executed');
  const isFurnishingsReceipt =
    document.kind === 'furnishings_authorization' &&
    document.state === 'executed';

  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get('delivery') ===
      'pending_retry'
    ) {
      setMessage({
        tone: 'status',
        text: 'Your signature remains recorded, but confirmation delivery is still pending. You can retry safely.',
      });
    }
  }, []);

  if (!isServicesReceipt && !isFurnishingsReceipt) return null;

  const retry = async () => {
    if (checking) return;
    setChecking(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/proposals/${encodeURIComponent(document.id)}/notifications/replay`,
        { method: 'POST' },
      );
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        notificationDelivery?: { state?: string };
      };
      if (!response.ok) {
        throw new Error(body.error || 'Confirmation delivery could not be checked.');
      }
      setMessage(
        body.notificationDelivery?.state === 'delivered'
          ? {
              tone: 'status',
              text: 'Confirmation delivery is confirmed.',
            }
          : {
              tone: 'status',
              text: 'Your signature remains recorded, but confirmation delivery is still pending. You can retry safely.',
            },
      );
      if (body.notificationDelivery?.state === 'delivered') {
        const url = new URL(window.location.href);
        url.searchParams.delete('delivery');
        window.history.replaceState({}, '', url);
      }
    } catch (error) {
      setMessage({
        tone: 'error',
        text: `${
          error instanceof Error
            ? error.message
            : 'Confirmation delivery could not be checked.'
        } Your signature remains recorded.`,
      });
    } finally {
      setChecking(false);
    }
  };

  return (
    <aside className="proposal-print-hide mx-auto mt-4 max-w-[760px] border-l-2 border-patina-aged-oak bg-patina-aged-oak/5 px-4 py-3">
      <p className="type-body-small text-[var(--text-primary)]">
        {isFurnishingsReceipt
          ? 'Your furnishings authorization is recorded. If its confirmation or deposit notice did not arrive, resend the existing notices.'
          : 'Your signature is recorded. If its confirmation did not arrive, resend the existing notice.'}
      </p>
      <button
        type="button"
        disabled={checking}
        onClick={() => void retry()}
        className="mt-2 inline-flex items-center rounded-[3px] border border-[var(--border-default)] px-3 py-2 type-meta text-[var(--accent-primary)] disabled:opacity-60"
      >
        {checking ? 'Checking delivery…' : 'Resend confirmation notice'}
      </button>
      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`mt-2 type-body-small ${
            message.tone === 'error'
              ? 'text-patina-terracotta'
              : 'text-[var(--text-body)]'
          }`}
        >
          {message.text}
        </p>
      )}
    </aside>
  );
}
