import Link from 'next/link';
import { CheckCircle2, Clock3, ReceiptText } from 'lucide-react';
import type {
  CommercialDocumentBundle,
  CommercialDocumentKind,
} from '@/lib/commercial-documents';

const KIND_LABEL: Record<Exclude<CommercialDocumentKind, 'legacy'>, string> = {
  design_services: 'Design services agreement',
  service_addendum: 'Design services addendum',
  furnishings_authorization: 'Furnishings authorization',
};

const STATE_LABEL = {
  draft: 'Draft',
  sent: 'Awaiting your signature',
  client_signed: 'Awaiting studio countersignature',
  executed: 'Executed',
  declined: 'Declined',
  expired: 'Expired',
  superseded: 'Superseded',
} as const;

function money(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function date(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function CommercialDocumentShell({ bundle }: { bundle: CommercialDocumentBundle }) {
  const { document } = bundle;
  if (document.kind === 'legacy') return null;

  return (
    <article
      className="proposal-print-area mx-auto rounded-lg bg-white"
      style={{ maxWidth: 760, padding: 'clamp(1.5rem, 3vw, 2.5rem)' }}
      data-testid="commercial-document-shell"
    >
      <header className="border-b border-[var(--border-subtle)] pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="type-meta text-[var(--text-muted)]">{KIND_LABEL[document.kind]}</p>
            <h1 className="mt-2 font-heading text-3xl text-[var(--text-primary)]">
              {document.title}
            </h1>
            {document.waveName && (
              <p className="type-body-small mt-1 text-[var(--text-muted)]">{document.waveName}</p>
            )}
          </div>
          <div className="text-right">
            <p className="type-meta text-[var(--accent-primary)]">{STATE_LABEL[document.state]}</p>
            <p className="type-meta-small mt-1 text-[var(--text-muted)]">Version {document.version}</p>
          </div>
        </div>
      </header>

      {document.state === 'client_signed' && (
        <div className="mt-6 border-l-2 border-patina-aged-oak bg-patina-aged-oak/5 px-4 py-3">
          <p className="type-body-small text-[var(--text-primary)]">
            Your signature is recorded. This document is awaiting the studio countersignature and
            is not yet effective.
          </p>
        </div>
      )}

      {document.state === 'executed' && (
        <div className="mt-6 flex items-start gap-2 border-l-2 border-patina-sage bg-patina-sage/5 px-4 py-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-patina-sage" />
          <p className="type-body-small text-[var(--text-primary)]">
            Fully executed{document.executedAt ? ` on ${date(document.executedAt)}` : ''}.
          </p>
        </div>
      )}

      {document.state === 'superseded' && (
        <div className="mt-6 border-l-2 border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3">
          <p className="type-body-small text-[var(--text-primary)]">
            This edition was replaced and can no longer be signed.
            {document.replacementProposalId ? (
              <>
                {' '}<Link className="text-[var(--accent-primary)]" href={`/proposals/${document.replacementProposalId}`}>
                  Open the current edition.
                </Link>
              </>
            ) : (
              ' Ask your studio for the current edition.'
            )}
          </p>
        </div>
      )}

      {(document.kind === 'design_services' || document.kind === 'service_addendum') && (
        <DesignServicesBody bundle={bundle} />
      )}
      {document.kind === 'furnishings_authorization' && (
        <FurnishingsBody bundle={bundle} />
      )}

      <SignatureLedger bundle={bundle} />

      <footer className="mt-10 flex justify-between border-t border-[var(--border-subtle)] pt-5 type-meta-small text-[var(--text-muted)]">
        <span>Patina</span>
        <span>{document.title} · v{document.version}</span>
      </footer>
    </article>
  );
}

function DesignServicesBody({ bundle }: { bundle: CommercialDocumentBundle }) {
  const terms = bundle.serviceTerms;
  if (!terms) return null;

  return (
    <div className="mt-8 space-y-8">
      {terms.scope && (
        <section>
          <h2 className="type-section-head">Services</h2>
          <p className="type-body mt-3 whitespace-pre-wrap">{terms.scope}</p>
        </section>
      )}

      {terms.deliverables.length > 0 && (
        <section>
          <h2 className="type-section-head">Deliverables</h2>
          <ul className="mt-3 space-y-2 type-body-small">
            {terms.deliverables.map((item) => <li key={item}>— {item}</li>)}
          </ul>
        </section>
      )}

      <section>
        <h2 className="type-section-head">Rates &amp; design authorization</h2>
        <p className="type-body-small mt-2">
          Actual professional time is billed at the signed rates below, up to the authorized design amount.
        </p>
        <div className="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
          {bundle.rates.map((rate) => (
            <div key={rate.id} className="flex items-baseline justify-between gap-4 py-3">
              <span className="type-body-small text-[var(--text-primary)]">{rate.roleName}</span>
              <span className="type-label">{money(rate.hourlyRateCents, terms.currency)} / hr</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 py-4">
            <span className="type-body-small font-medium text-[var(--text-primary)]">Design authorization ceiling</span>
            <span className="type-data-large">{money(terms.billingCeilingCents, terms.currency)}</span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="border-b border-[var(--border-default)] pb-4">
          <p className="type-meta">Retainer</p>
          <p className="type-data-large mt-1">{money(terms.retainerAmountCents, terms.currency)}</p>
          <p className="type-body-small mt-1">
            {terms.retainerActivationPolicy === 'retainer_paid'
              ? 'Design work begins after the fully executed agreement and retainer payment.'
              : 'Due under the terms of the fully executed agreement.'}
          </p>
        </div>
        <div className="border-b border-[var(--border-default)] pb-4">
          <p className="type-meta">Billing cadence</p>
          <p className="type-data-large mt-1 capitalize">{terms.billingCadence.replace('_', ' ')}</p>
          <p className="type-body-small mt-1">Additional work requires written authorization before it can be invoiced.</p>
        </div>
      </section>

      {terms.terms && (
        <section>
          <h2 className="type-section-head">Terms</h2>
          <p className="type-body mt-3 whitespace-pre-wrap">{terms.terms}</p>
        </section>
      )}

      {terms.exclusions.length > 0 && (
        <section>
          <h2 className="type-section-head">Not included</h2>
          <ul className="mt-3 space-y-2 type-body-small">
            {terms.exclusions.map((item) => <li key={item}>— {item}</li>)}
          </ul>
        </section>
      )}

      <p className="border-l-2 border-patina-dusty-blue bg-patina-dusty-blue/5 px-4 py-3 type-body-small">
        This agreement authorizes design services only. Furnishings, freight, tax, installation,
        and purchasing require a separate named furnishings authorization.
      </p>
    </div>
  );
}

function FurnishingsBody({ bundle }: { bundle: CommercialDocumentBundle }) {
  const authorization = bundle.furnishings;
  if (!authorization) return null;
  const total = authorization.items.reduce(
    (sum, item) => sum + item.quantity * item.clientUnitPriceCents,
    0,
  );
  const currency = authorization.items[0]?.currency ?? 'USD';
  const outstandingDeposit = Math.max(
    authorization.depositRequiredCents - authorization.depositPaidCents,
    0,
  );

  return (
    <div className="mt-8 space-y-8">
      <section>
        <h2 className="type-section-head">Named furnishing lines</h2>
        <div className="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
          {authorization.items.map((item, index) => (
            <div key={`${item.description}-${index}`} className="grid grid-cols-[1fr_auto] gap-x-4 py-3">
              <div>
                <p className="type-body-small text-[var(--text-primary)]">{item.description}</p>
                <p className="type-meta-small mt-0.5">Quantity {item.quantity}</p>
              </div>
              <p className="type-label text-right">
                {money(item.quantity * item.clientUnitPriceCents, item.currency)}
              </p>
            </div>
          ))}
          <div className="flex items-baseline justify-between py-4">
            <span className="type-body-small font-medium">Authorized furnishings</span>
            <span className="type-data-large">{money(total, currency)}</span>
          </div>
        </div>
        <p className="type-body-small mt-3 text-[var(--text-muted)]">
          This signature covers only the descriptions, quantities, and client prices shown here.
          It does not alter the design-services agreement.
        </p>
      </section>

      {bundle.document.state === 'executed' && authorization.depositRequiredCents > 0 && (
        <section className="border-l-2 border-patina-dusty-blue bg-patina-dusty-blue/5 px-4 py-4">
          <div className="flex items-start gap-3">
            <ReceiptText className="mt-0.5 h-4 w-4 text-patina-dusty-blue" />
            <div className="flex-1">
              <h2 className="type-section-head">Deposit handoff</h2>
              {outstandingDeposit > 0 ? (
                <>
                  <p className="type-body-small mt-2">
                    {money(outstandingDeposit, currency)} remains due before the studio can place the covered orders.
                  </p>
                  {bundle.document.projectId && (
                    <Link
                      href={`/invoices?project=${bundle.document.projectId}`}
                      className="mt-3 inline-flex type-meta text-[var(--accent-primary)]"
                    >
                      Open payments
                    </Link>
                  )}
                </>
              ) : (
                <p className="type-body-small mt-2">Deposit received. The named lines are ready for procurement.</p>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function SignatureLedger({ bundle }: { bundle: CommercialDocumentBundle }) {
  if (bundle.signatures.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="type-section-head">Signatures</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {bundle.signatures.map((signature) => (
          <div key={`${signature.party}-${signature.signedAt}`} className="border-b border-[var(--border-default)] pb-3">
            <p className="type-meta capitalize">{signature.party}</p>
            <p className="font-heading text-lg">{signature.signerName}</p>
            <p className="type-meta-small mt-1">Signed {date(signature.signedAt)}</p>
          </div>
        ))}
        {bundle.document.kind !== 'furnishings_authorization' &&
          !bundle.signatures.some((signature) => signature.party === 'studio') && (
            <div className="border-b border-[var(--border-default)] pb-3">
              <p className="type-meta">Studio</p>
              <p className="mt-1 flex items-center gap-2 type-body-small text-[var(--text-muted)]">
                <Clock3 className="h-4 w-4" /> Awaiting countersignature
              </p>
            </div>
          )}
      </div>
    </section>
  );
}
