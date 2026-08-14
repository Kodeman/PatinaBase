import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, Clock3, FileText, ReceiptText } from 'lucide-react';
import { createBrowserClient } from '@patina/supabase';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@patina/design-system';
import { useDeclineCommercialDocument } from '@/hooks/use-commercial-client';
import { formatCalendarDate } from '@/lib/utils/format';
import type {
  CommercialDocumentBundle,
  CommercialDocumentKind,
  FurnishingsAuthorizationItem,
} from '@/lib/commercial-documents';

const SIGNED_ON_PAPER_NOTE = 'Signed on paper · recorded by the studio.';

const KIND_LABEL: Record<Exclude<CommercialDocumentKind, 'legacy'>, string> = {
  design_services: 'Design services agreement',
  service_addendum: 'Design services addendum',
  furnishings_authorization: 'Furnishings authorization',
  trade_scope: 'Trade scope',
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

/**
 * A calendar date the client wrote on a page — the day they signed, the day
 * they accepted. Not a moment, so `date()` above (which reads the viewer's
 * timezone) would render it a day early anywhere west of UTC.
 */
function calendarDate(value: string): string {
  return formatCalendarDate(value) ?? date(value);
}

export function CommercialDocumentShell({ bundle }: { bundle: CommercialDocumentBundle }) {
  const { document } = bundle;
  if (document.kind === 'legacy') return null;

  const clientSignedOnPaper = bundle.signatures.some(
    (signature) => signature.party === 'client' && signature.signedOnPaper,
  );
  const anySignedOnPaper = bundle.signatures.some((signature) => signature.signedOnPaper);

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
            {clientSignedOnPaper
              ? 'Your studio recorded your signed paper original. This document is awaiting the studio countersignature and is not yet effective.'
              : 'Your signature is recorded. This document is awaiting the studio countersignature and is not yet effective.'}
          </p>
        </div>
      )}

      {document.state === 'executed' && (
        <div className="mt-6 flex items-start gap-2 border-l-2 border-patina-sage bg-patina-sage/5 px-4 py-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-patina-sage" />
          <p className="type-body-small text-[var(--text-primary)]">
            Fully executed{document.executedAt ? ` on ${date(document.executedAt)}` : ''}.
            {anySignedOnPaper ? ` ${SIGNED_ON_PAPER_NOTE}` : ''}
          </p>
        </div>
      )}

      {document.state === 'declined' && (
        <div className="mt-6 border-l-2 border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3">
          <p className="type-body-small text-[var(--text-primary)]">
            This document was withdrawn and no longer asks anything of you.
          </p>
        </div>
      )}

      {document.state === 'superseded' && (
        <div className="mt-6 border-l-2 border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3">
          <p className="type-body-small text-[var(--text-primary)]">
            This document was withdrawn and no longer asks anything of you.
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
      {document.kind === 'trade_scope' && (
        <TradeScopeBody bundle={bundle} />
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

  // A brand-new agreement defaults both of these to 0 and nothing blocks a
  // send, so an untouched figure would reach the client as a real authorized
  // amount. An amount nobody wrote is named as unwritten — the same gate the
  // studio-side preview applies (service-agreement-preview.tsx).
  const ceilingIsSet =
    Number.isFinite(terms.billingCeilingCents) && terms.billingCeilingCents > 0;
  const retainerIsSet =
    Number.isFinite(terms.retainerAmountCents) && terms.retainerAmountCents > 0;

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
            <span className={ceilingIsSet ? 'type-data-large' : 'type-data-large italic text-[var(--text-muted)]'}>
              {ceilingIsSet ? money(terms.billingCeilingCents, terms.currency) : 'Not yet set'}
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="border-b border-[var(--border-default)] pb-4">
          <p className="type-meta">Retainer</p>
          <p className={retainerIsSet ? 'type-data-large mt-1' : 'type-data-large mt-1 italic text-[var(--text-muted)]'}>
            {retainerIsSet ? money(terms.retainerAmountCents, terms.currency) : 'Not yet set'}
          </p>
          {retainerIsSet && (
            <p className="type-body-small mt-1">
              {terms.retainerActivationPolicy === 'retainer_paid'
                ? 'Design work begins after the fully executed agreement and retainer payment.'
                : 'Due under the terms of the fully executed agreement.'}
            </p>
          )}
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

/**
 * Files the named lines by room, preserving the order the RPC sent them in
 * (sort_order, id) both between rooms and inside one. A furnishings
 * authorization is read alongside the rooms it furnishes; a flat list of
 * fifteen pieces asks the client to work out for themselves which ones are the
 * living room. Mirrors groupByRoom in components/commercial/client-selections.
 */
function groupItemsByRoom(
  items: FurnishingsAuthorizationItem[],
): Array<[string, FurnishingsAuthorizationItem[]]> {
  const groups = new Map<string, FurnishingsAuthorizationItem[]>();
  for (const item of items) {
    const key = item.roomName || 'General';
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }
  return Array.from(groups.entries());
}

/** 30 → "30", 12.5 → "12.5". A deposit term is numeric in the DB. */
function percent(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function FurnishingsBody({ bundle }: { bundle: CommercialDocumentBundle }) {
  const authorization = bundle.furnishings;
  if (!authorization) return null;
  // clientLineTotalCents, never quantity × unit: an allowance is snapshotted at
  // its ceiling and its unit price is that ceiling divided by quantity with
  // integer truncation, so the product understates what the client signed for.
  // Summing the line totals is what reconciles to the document's own total.
  const total = authorization.items.reduce((sum, item) => sum + item.clientLineTotalCents, 0);
  const currency = authorization.items[0]?.currency ?? 'USD';
  const outstandingDeposit = Math.max(
    authorization.depositRequiredCents - authorization.depositPaidCents,
    0,
  );
  const rooms = groupItemsByRoom(authorization.items);
  const statedTotal = bundle.document.totalAmountCents > 0
    ? bundle.document.totalAmountCents
    : total;

  return (
    <div className="mt-8 space-y-8">
      <section>
        <h2 className="type-section-head">Named furnishing lines</h2>
        <div className="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
          {rooms.map(([roomName, items]) => (
            <div key={roomName} data-testid="authorization-room-group">
              <p
                className="type-meta pt-4 text-[var(--accent-primary)]"
                data-testid="authorization-room-heading"
              >
                {roomName}
              </p>
              <div className="divide-y divide-[var(--border-subtle)]">
                {items.map((item, index) => (
                  <div
                    key={`${roomName}-${item.description}-${index}`}
                    className="grid grid-cols-[1fr_auto] gap-x-4 py-3"
                  >
                    <div>
                      <p className="type-body-small text-[var(--text-primary)]">{item.description}</p>
                      <p className="type-meta-small mt-0.5">Quantity {item.quantity}</p>
                    </div>
                    <p className="type-label text-right">
                      {money(item.clientLineTotalCents, item.currency)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-baseline justify-between py-4">
            <span className="type-body-small font-medium">Authorized furnishings</span>
            <span className="type-data-large">{money(total, currency)}</span>
          </div>
        </div>
        {authorization.depositRequiredCents > 0 && (
          <p
            className="type-body-small mt-3 text-[var(--text-primary)]"
            data-testid="authorization-terms-strip"
          >
            {`Total ${money(statedTotal, currency)} · Deposit ${money(
              authorization.depositRequiredCents,
              currency,
            )} (${percent(bundle.document.depositPercent)}%) on signature`}
          </p>
        )}
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

/**
 * A trade scope's client-facing body. Deliberately excludes the bid ledger —
 * a client signs the sub's finished scope and price, never the field of
 * quotes it was chosen from. Sections render the exact scope-of-work prose
 * the sub priced, room by room; the draw schedule is the whole payment plan,
 * never collapsed to a single number the way a furnishings deposit is.
 */
function TradeScopeBody({ bundle }: { bundle: CommercialDocumentBundle }) {
  const scope = bundle.tradeScope;
  if (!scope) return null;
  const currency = scope.currency;
  const draws = scope.draws;
  const depositDraw = draws[0] ?? null;
  const finalDraw = draws.length > 0 ? draws[draws.length - 1] : null;

  return (
    <div className="mt-8 space-y-8">
      <section>
        <p className="type-body-small text-[var(--text-primary)]" data-testid="trade-scope-party">
          {`Performed by ${scope.party.displayName}${scope.party.trade ? `, ${scope.party.trade}` : ''}`}
          {scope.party.company ? ` · ${scope.party.company}` : ''}
        </p>
      </section>

      <section>
        <h2 className="type-section-head">Scope of work</h2>
        <div className="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
          {scope.sections.map((section, index) => (
            <div key={`${section.roomName}-${index}`} className="py-4" data-testid="trade-scope-section">
              <p
                className="type-meta text-[var(--accent-primary)]"
                data-testid="trade-scope-section-heading"
              >
                {section.roomName}
              </p>
              <p className="type-body mt-2 whitespace-pre-wrap">{section.prose}</p>
              {section.allocationCents !== null && (
                <p className="type-meta-small mt-2 text-[var(--text-muted)]">
                  {money(section.allocationCents, currency)}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3" data-testid="trade-scope-figures">
        <div className="border-b border-[var(--border-default)] pb-4">
          <p className="type-meta">Scope total</p>
          <p className="type-data-large mt-1">{money(scope.clientPriceCents, currency)}</p>
        </div>
        {depositDraw && (
          <div className="border-b border-[var(--border-default)] pb-4">
            <p className="type-meta">Deposit</p>
            <p className="type-data-large mt-1">{money(depositDraw.amountCents, currency)}</p>
            <p className="type-body-small mt-1">{depositDraw.label}</p>
          </div>
        )}
        {finalDraw && (
          <div className="border-b border-[var(--border-default)] pb-4">
            <p className="type-meta">On acceptance</p>
            <p className="type-data-large mt-1">{money(finalDraw.amountCents, currency)}</p>
            <p className="type-body-small mt-1">{finalDraw.label}</p>
          </div>
        )}
      </section>

      <section>
        <h2 className="type-section-head">Draw schedule</h2>
        <div className="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
          {draws.map((draw) => (
            <div key={draw.id} className="flex items-baseline justify-between gap-4 py-3">
              <div>
                <p className="type-body-small text-[var(--text-primary)]">{draw.label}</p>
                {draw.gatesOnAcceptance && (
                  <p className="type-meta-small mt-0.5 text-[var(--text-muted)]">Due on acceptance</p>
                )}
              </div>
              <span className="type-label">{money(draw.amountCents, currency)}</span>
            </div>
          ))}
        </div>
      </section>

      {scope.progress.acceptedAt && (
        <section
          className="border-l-2 border-patina-sage bg-patina-sage/5 px-4 py-3"
          data-testid="trade-scope-acceptance"
        >
          <h2 className="type-section-head">Acceptance</h2>
          <p className="type-body-small mt-2 text-[var(--text-primary)]">
            {/* Two different things share this column. A portal acceptance
                stamps `now()` — a real moment, which belongs in the reader's own
                timezone. A PAPER acceptance stamps `p_paper_signed_on::timestamptz`
                (00425) — midnight UTC standing for a day someone wrote on a
                page, which a timezone-aware formatter renders a day early
                everywhere west of UTC. So the paper case is read as a day. */}
            {`Accepted by ${scope.progress.acceptedSignedName || 'you'} on ${
              scope.progress.acceptedOnPaper
                ? calendarDate(scope.progress.acceptedAt)
                : date(scope.progress.acceptedAt)
            }.`}
            {scope.progress.acceptedOnPaper
              ? ' Recorded by your studio from a signed paper original.'
              : ''}
          </p>
          {scope.progress.acceptedOnPaper && scope.progress.acceptanceScanDocumentId && (
            <PaperScanLink
              proposalId={bundle.document.id}
              documentId={scope.progress.acceptanceScanDocumentId}
            />
          )}
        </section>
      )}

      <p className="border-l-2 border-patina-dusty-blue bg-patina-dusty-blue/5 px-4 py-3 type-body-small">
        Signing authorizes this trade to begin the work described above, at the price shown. The
        deposit draw is due on signature; each remaining draw is billed as the work reaches that
        stage. Accepting the finished work later releases the final draw.
      </p>
    </div>
  );
}

/**
 * "View the signed original" — a client_visible paper scan is Folio storage
 * (project-documents/{proposalId}/…, 00252), and that bucket is private, so
 * the file is only reachable via a time-boxed signed URL, never a public
 * one. Mirrors the mechanics of documentSignedUrl
 * (apps/client-portal/src/hooks/use-documents-client.ts) but looks the row
 * up by id + proposal_id rather than by project_id — a commercial paper
 * scan is proposal-anchored (project_documents.proposal_id), the same leg
 * "Clients view flagged proposal folio" / "Clients read flagged proposal
 * folio objects" (00252) already opens for the client on their own
 * client_visible files. Fetched on demand rather than eagerly, so a
 * document with no scan attached never pays for a lookup that would 404.
 */
function PaperScanLink({
  proposalId,
  documentId,
}: {
  proposalId: string;
  documentId: string;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  async function open() {
    if (state === 'loading') return;
    setState('loading');
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createBrowserClient() as any;
      const { data: row, error } = await supabase
        .from('project_documents')
        .select('storage_path')
        .eq('id', documentId)
        .eq('proposal_id', proposalId)
        .eq('client_visible', true)
        .maybeSingle();
      if (error || !row?.storage_path) {
        setState('error');
        return;
      }
      const { data: signed, error: signError } = await supabase.storage
        .from('project-documents')
        .createSignedUrl(row.storage_path, 3600);
      if (signError || !signed?.signedUrl) {
        setState('error');
        return;
      }
      setState('idle');
      window.open(signed.signedUrl, '_blank', 'noopener,noreferrer');
    } catch {
      setState('error');
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={state === 'loading'}
      className="type-meta-small mt-1.5 inline-flex items-center gap-1 text-[var(--accent-primary)] underline underline-offset-2 disabled:opacity-60"
    >
      <FileText className="h-3 w-3" />
      {state === 'loading' ? 'Opening the scan…' : 'View the signed original'}
      {state === 'error' && (
        <span className="text-patina-terracotta">· unavailable right now</span>
      )}
    </button>
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
            {/* The signing date the client reads is the date they signed. On
                the paper rail that is `paperSignedOn` — the day written on the
                page — and `signedAt` is only the day the studio typed it up,
                so it is demoted to the line below rather than printed as the
                signature date. A portal signature has one date and says so. */}
            <p className="type-meta-small mt-1">
              Signed{' '}
              {signature.paperSignedOn
                ? calendarDate(signature.paperSignedOn)
                : date(signature.signedAt)}
              {signature.signedOnPaper && ' · on paper'}
            </p>
            {signature.signedOnPaper && signature.paperSignedOn && (
              <p className="type-meta-small text-[var(--text-muted)]">
                recorded {date(signature.signedAt)}
              </p>
            )}
            {signature.signedOnPaper && signature.paperScanDocumentId && (
              <PaperScanLink
                proposalId={bundle.document.id}
                documentId={signature.paperScanDocumentId}
              />
            )}
          </div>
        ))}
        {bundle.document.kind !== 'furnishings_authorization' &&
          bundle.document.kind !== 'trade_scope' &&
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

const DECLINE_REASON_MAX = 1000;

/**
 * R1 decline-whole for a commercial document — the counterpart to the
 * legacy ProposalDeclineDialog, wired to the dedicated decline route instead
 * of calling decline_proposal directly. Rendered by the proposal detail page
 * in place of ProposalDeclineDialog whenever the document isn't legacy.
 */
export function CommercialDeclineDialog({
  proposalId,
  projectId,
  open,
  onOpenChange,
  onDeclined,
}: {
  proposalId: string;
  projectId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeclined?: () => void;
}) {
  const decline = useDeclineCommercialDocument(proposalId, projectId);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setError(null);
    try {
      await decline.mutateAsync(reason.trim() || undefined);
      setReason('');
      onOpenChange(false);
      onDeclined?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline this document.');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setReason('');
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline this document?</DialogTitle>
          <DialogDescription>
            Your studio will be notified. You can share a reason to help them respond — this is
            optional.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <label htmlFor="commercial-decline-reason" className="block">
            <span className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Reason (optional)
            </span>
            <textarea
              id="commercial-decline-reason"
              data-testid="commercial-decline-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, DECLINE_REASON_MAX))}
              rows={4}
              maxLength={DECLINE_REASON_MAX}
              placeholder="What&rsquo;s holding you back?"
              className="w-full resize-none rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
            />
          </label>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {reason.length} / {DECLINE_REASON_MAX}
          </p>
          {error && (
            <p className="mt-2 text-sm text-patina-terracotta" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={decline.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={decline.isPending}
            data-testid="commercial-decline-confirm"
          >
            {decline.isPending ? 'Declining…' : 'Decline document'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
