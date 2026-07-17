'use client';

import { use } from 'react';
import { PageHeader, EmptyState } from '@/components/portal';
import { useFulfillmentComposer } from '@/hooks/use-fulfillment-composer';
import { useFulfillmentRealtime } from '@/hooks/use-fulfillment-realtime';
import { useBreadcrumbLastLabel } from '@/contexts/breadcrumb-context';
import { PoPaper } from '@/components/fulfillment/composer/po-paper';
import { TransmitPanel } from '@/components/fulfillment/composer/transmit-panel';
import { AckCaptureForm } from '@/components/fulfillment/composer/ack-capture-form';
import { TransmissionLog } from '@/components/fulfillment/composer/transmission-log';

// The PO Composer & Transmission Log (S3, spec §5.3). The PO rendered as real
// paper on the left; on the right the transmit panel (branching on the vendor's
// protocol), then — once sent — ack capture, and always the append-only
// transmission log. Realtime keeps it live: a transmit/ack fired here (or a
// change on this order fired elsewhere) re-figures the screen via
// fulfillmentKeys.all. Reached from the Workbench's PO cards.

export default function FulfillmentComposerPage({
  params,
}: {
  params: Promise<{ poId: string }>;
}) {
  const { poId } = use(params);
  const { data: dto, isLoading, error } = useFulfillmentComposer(poId);
  useFulfillmentRealtime();

  const po = dto?.po;
  useBreadcrumbLastLabel(po ? `${po.poNumber ?? 'PO'} · ${po.clientName}` : null);

  const status = po?.status;
  const beforeSent = status === 'draft';
  const awaitingAck = status === 'sent';

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title={po ? po.poNumber ?? 'Purchase Order' : 'Purchase Order'}
        accent="Composer"
        description={
          po
            ? `Order #${po.orderNo} · ${po.clientName} · ${po.vendorName ?? 'vendor'}`
            : 'Loading the purchase order…'
        }
        meta={
          po ? (
            <span data-testid="composer-status" className="type-meta">
              {po.sideMark ? `${po.sideMark} · ` : ''}
              {status}
            </span>
          ) : undefined
        }
      />

      {isLoading && (
        <div className="space-y-4 py-6" data-testid="composer-loading">
          <div className="h-64 animate-pulse rounded bg-[var(--bg-hover)]" />
        </div>
      )}

      {error && (
        <div className="py-10 text-center type-body text-[var(--color-error)]">
          Failed to load the PO: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && !dto && (
        <EmptyState label="PO Composer" message="This purchase order could not be found." />
      )}

      {dto && po && (
        <div
          data-testid="composer-root"
          className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"
        >
          {/* Left — the paper */}
          <div>
            <PoPaper poId={po.id} />
          </div>

          {/* Right — transmit / ack / log */}
          <div className="flex flex-col gap-8">
            {beforeSent && <TransmitPanel dto={dto} />}

            {awaitingAck && <AckCaptureForm poId={po.id} />}

            {!beforeSent && !awaitingAck && (
              <section data-testid="composer-acked">
                <div
                  className="mb-2 text-[0.55rem] uppercase tracking-[0.13em] text-[var(--text-muted)]"
                  style={{ fontFamily: 'var(--font-meta)' }}
                >
                  Acknowledged
                </div>
                <div className="text-[0.8rem] text-[var(--text-primary)]">
                  {po.committedShip
                    ? `Committed ship ${po.committedShip}`
                    : 'Acknowledged by the vendor.'}
                </div>
              </section>
            )}

            <TransmissionLog events={dto.events} />
          </div>
        </div>
      )}
    </div>
  );
}
