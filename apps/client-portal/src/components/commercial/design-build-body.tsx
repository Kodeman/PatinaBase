import { AGREEMENT_PART_COPY } from '@patina/types';

import type {
  CommercialAgreementPart,
  CommercialDocumentBundle,
  DesignBuildDrawEntry,
  DesignBuildSubIdentity,
} from '@/lib/commercial-documents';

/* ── THE TURNKEY PAPER, AS THE HOMEOWNER READS IT (Wave 3, P9) ───────────────
   A design-build agreement is not a services agreement with extra sections. It
   prices the whole of a job — the trades, the general conditions, the
   allowances — and it is paid in draws against that price, with a slice of
   each draw withheld until the work is finished. So the body is its own, and
   `AgreementPartsBody`'s closing sentence ("This agreement authorizes design
   services only…") is exactly the sentence that must NOT appear here.

   Three rules it never breaks.

   · R13 — SHE MEETS THE TRADES, NOT THE BIDDING. Sub identities always;
     a sub's awarded price only when the sub-disclosure clause reads
     `open_book`; the bid ledger never, in either mode, at any state. The DTO
     carries no bid, and this file withholds a price a `closed_book` paper's
     DTO carried anyway — belt and braces, because the number that must never
     appear is a LOSING bid: the one a competitor's quote is read off.

     WHAT CLOSED BOOK IS (RC-4, ruled R43). It is not a presentation of the
     cost lines at all. A pro-rated schedule is a UNIFORM multiple of the
     costs, and the allowance parts state their amounts AT COST on this same
     page — because a change-order threshold she is not shown is not a
     threshold — so one (cost, line) pair would hand any reader the multiplier
     and the multiplier every trade's price. So under a closed book the studio
     AUTHORS the client's lines: its own division of the work, summing to the
     contract sum, printed here exactly as the bundle projected them. Under an
     open book the trades stand at cost and the fee is its own line, which is
     what that clause elects. The absolute rule in both modes is the bid
     ledger's absence.

   · R5 / R21 — PROSE NEVER CARRIES MONEY, AND A FIGURE NOBODY WROTE IS SAID
     TO BE UNWRITTEN. Only the typed money leaves print figures, and an unset
     one prints today's "Not yet set" rather than `$0`.

   · RC-12 — NO FLOATS. Every figure on this page is an integer number of
     cents, divided only at the moment it is FORMATTED. The one derivation
     this file still performs — the open-book schedule of values, for a payload
     that carries no projection — is exact integer arithmetic, and its last row
     takes the remainder so the column always sums to the contract price to the
     cent.
   ────────────────────────────────────────────────────────────────────────── */

type UnknownRecord = Record<string, unknown>;

function payloadRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function payloadText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function payloadRows(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(payloadRecord) : [];
}

function payloadCents(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Money to the cent, formatted from the INTEGER rather than from a float.
 * `commercial-document-shell.tsx`'s `money()` rounds to whole dollars, which
 * is right for a furnishings line and wrong for a draw: the Halvorsen deposit
 * is $8,413.40 and the rough-in draw nets $23,978.19, and a homeowner
 * reconciling an invoice against the paper needs both cents.
 *
 * The dollars are formatted by `Intl`; the cents are appended as the digits
 * they already are. Nothing is divided, so nothing can round. A whole-dollar
 * figure keeps the whole-dollar treatment the walk's own table shows
 * (`$71,300`, not `$71,300.00`).
 */
export function moneyToTheCent(cents: number, currency = 'USD'): string {
  const whole = Math.trunc(cents);
  const negative = whole < 0;
  const abs = Math.abs(whole);
  const dollars = Math.trunc(abs / 100);
  const rest = abs % 100;
  const head = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(dollars);
  const said = rest === 0 ? head : `${head}.${String(rest).padStart(2, '0')}`;
  return negative ? `−${said}` : said;
}

/** 1800 basis points, said the way a studio says it: 18%. */
function percentFromBps(bps: number): string {
  return bps % 100 === 0 ? `${bps / 100}%` : `${(bps / 100).toFixed(2)}%`;
}

const BASIS_SENTENCE: Record<string, string> = {
  fixed: 'A fixed price for the whole of the work.',
  cost_plus: 'The cost of the work, plus the studio’s fee on it.',
  cost_plus_gmp:
    'The cost of the work, plus the studio’s fee on it, and the total will not exceed the guaranteed maximum price below.',
  tm_nte:
    'Time and materials as the work is done, and the total will not exceed the amount below.',
};

const BASIS_CEILING_LABEL: Record<string, string> = {
  cost_plus_gmp: 'Guaranteed maximum price',
  tm_nte: 'Not to exceed',
  fixed: 'Contract price',
};

/** One line of the schedule of values the homeowner reads. */
export interface ScheduleOfValuesLine {
  id: string;
  label: string;
  cents: number;
}

/** The pricing basis, read out of its part's payload. */
export interface PricingBasisReading {
  basis: string;
  feeBps: number | null;
  costLines: { id: string; label: string; category: string; basisCents: number }[];
  costBasisCents: number;
  /** Null when the studio has written no price yet (R21). */
  contractSumCents: number | null;
  feeCents: number | null;
  /**
   * R41 — the schedule of values the BUNDLE projected, in the disclosure the
   * clause elected. Null only for a payload that carried no projection at all;
   * every payload `get_client_commercial_document_bundle` sends carries one.
   */
  scheduleOfValues: ScheduleOfValuesLine[] | null;
  subDisclosure: string;
}

/**
 * R41 — THE DOOR READS THE PROJECTION.
 *
 * `get_client_commercial_document_bundle` runs a turnkey pricing basis through
 * `_agreement_redact_client_payload` before it crosses to the homeowner. Under
 * anything but open book — which is the shipping default and the fail-closed
 * mode — the cost lines, the fee, the sub markup and the cost basis stay
 * behind, and `contractSumCents` and `scheduleOfValues` are projected in their
 * place. A reader that derived from `costLines` therefore read an empty array
 * on every production closed-book paper: the schedule of values vanished from
 * the page and a plain cost-plus prime printed "Not yet set" over a contract
 * sum the database had stated.
 *
 * So the projected keys are read FIRST, in both modes, and the local
 * derivation survives only for a payload that carries no projection (a
 * fixture, or a studio-side preview reading the authored row). The keepsake
 * (`_render_agreement_snapshot_html`) prints the same projected array, so the
 * door and the record cannot say different things about one paper.
 */
export function readPricingBasis(part: CommercialAgreementPart): PricingBasisReading {
  const payload = part.payload;
  const basis = payloadText(payload.basis);
  const feeBps = payloadCents(payload.feeBps);
  const costLines = payloadRows(payload.costLines)
    .map((line, index) => ({
      id: payloadText(line.id) || `${part.id}-${index}`,
      label: payloadText(line.label),
      category: payloadText(line.category),
      basisCents: payloadCents(line.basisCents) ?? 0,
    }))
    .filter((line) => line.label.length > 0);
  const costBasisCents = costLines.reduce((sum, line) => sum + line.basisCents, 0);

  // The stated ceiling wins where the basis states one; a plain cost-plus
  // agreement has no ceiling at all, and its contract sum is the cost basis
  // plus the fee on it — integer arithmetic, rounded once.
  const stated =
    payloadCents(payload.gmpCents) ??
    payloadCents(payload.nteCents) ??
    payloadCents(payload.fixedCents);
  const derived =
    feeBps !== null && costBasisCents > 0
      ? Math.round((costBasisCents * (10000 + feeBps)) / 10000)
      : null;
  const projectedSum = payloadCents(payload.contractSumCents);
  const contractSumCents =
    projectedSum !== null && projectedSum > 0
      ? projectedSum
      : stated !== null && stated > 0
        ? stated
        : derived;

  const projectedLines = Array.isArray(payload.scheduleOfValues)
    ? payloadRows(payload.scheduleOfValues)
        .map((line, index) => ({
          id: payloadText(line.id) || `${part.id}-sov-${index}`,
          label: payloadText(line.label),
          cents: payloadCents(line.cents) ?? 0,
        }))
        .filter((line) => line.label.length > 0)
    : null;

  return {
    basis,
    feeBps,
    costLines,
    costBasisCents,
    contractSumCents,
    feeCents:
      contractSumCents !== null && costBasisCents > 0 ? contractSumCents - costBasisCents : null,
    scheduleOfValues: projectedLines,
    subDisclosure: payloadText(payload.subDisclosure) || 'closed_book',
  };
}

/**
 * THE SCHEDULE OF VALUES, AS THE BUNDLE PROJECTED IT.
 *
 * `closed_book` — the studio's OWN authored lines (R43). Nothing here is
 * derived from the cost lines, which is the point: a derived table is
 * invertible and an authored one is not.
 *
 * `open_book` — the trades at cost and the fee as its own line, so the two
 * together sum to the contract price. That is the disclosure the clause
 * elected, and the only mode in which a per-trade number appears anywhere on
 * this page.
 *
 * Both arrive already resolved in `payload.scheduleOfValues`. The derivation
 * below runs only for a payload that carries no projection — a fixture, or a
 * studio-side read of the authored row — and it is the open-book arithmetic,
 * integer throughout, with the last line taking the remainder.
 */
export function scheduleOfValues(reading: PricingBasisReading): ScheduleOfValuesLine[] {
  // R41 — the projected array wins in BOTH disclosures: it is what the bundle
  // sent, what the keepsake prints and what the consent sentence names.
  if (reading.scheduleOfValues !== null) return reading.scheduleOfValues;

  const { costLines, costBasisCents, contractSumCents } = reading;
  if (costLines.length === 0 || costBasisCents <= 0 || contractSumCents === null) return [];

  if (reading.subDisclosure === 'open_book') {
    const fee = contractSumCents - costBasisCents;
    return [
      ...costLines.map((line) => ({ id: line.id, label: line.label, cents: line.basisCents })),
      ...(fee !== 0
        ? [{ id: '__fee', label: 'Design and construction fee', cents: fee }]
        : []),
    ];
  }

  const lines: ScheduleOfValuesLine[] = [];
  let allocated = 0;
  costLines.forEach((line, index) => {
    const last = index === costLines.length - 1;
    const cents = last
      ? contractSumCents - allocated
      : Math.round((line.basisCents * contractSumCents) / costBasisCents);
    allocated += cents;
    lines.push({ id: line.id, label: line.label, cents });
  });
  return lines;
}

/** ATTACHMENT A, ATTACHMENT B … and plain numbers past Z rather than nothing. */
function attachmentLetter(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

function Heading({ title }: { title: string }) {
  return <h2 className="type-section-head">{title}</h2>;
}

function Recorded() {
  return (
    <p className="type-body-small mt-2 text-[var(--text-muted)]">
      {AGREEMENT_PART_COPY.recorded}
    </p>
  );
}

function NotYetSet() {
  return (
    <p className="type-data-large mt-2 italic text-[var(--text-muted)]">
      {AGREEMENT_PART_COPY.notYetSet}
    </p>
  );
}

function PricingBasisLeaf({
  part,
  reading,
  currency,
}: {
  part: CommercialAgreementPart;
  reading: PricingBasisReading;
  currency: string;
}) {
  const sentence = BASIS_SENTENCE[reading.basis];
  const ceilingLabel = BASIS_CEILING_LABEL[reading.basis] ?? 'Contract price';
  const rows: { label: string; value: string }[] = [
    ...(reading.costBasisCents > 0
      ? [{ label: 'Cost basis', value: moneyToTheCent(reading.costBasisCents, currency) }]
      : []),
    ...(reading.feeBps !== null && reading.feeCents !== null && reading.feeCents > 0
      ? [
          {
            label: `Fee ${percentFromBps(reading.feeBps)}`,
            value: moneyToTheCent(reading.feeCents, currency),
          },
        ]
      : []),
  ];

  return (
    <>
      <Heading title={part.title} />
      {sentence ? <p className="type-body mt-3">{sentence}</p> : null}
      {rows.length > 0 && (
        <dl className="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4 py-3">
              <dt className="type-body-small text-[var(--text-primary)]">{row.label}</dt>
              <dd className="type-label">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {reading.contractSumCents === null ? (
        <NotYetSet />
      ) : (
        <div className="mt-4" data-testid="design-build-contract-sum">
          <p className="type-meta text-[var(--text-muted)]">{ceilingLabel}</p>
          <p className="type-data-large mt-1">
            {moneyToTheCent(reading.contractSumCents, currency)}
          </p>
        </div>
      )}
    </>
  );
}

function ScheduleOfValuesLeaf({
  reading,
  currency,
}: {
  reading: PricingBasisReading;
  currency: string;
}) {
  const lines = scheduleOfValues(reading);
  if (lines.length === 0) return null;
  const total = lines.reduce((sum, line) => sum + line.cents, 0);

  return (
    <section data-testid="design-build-sov" data-disclosure={reading.subDisclosure}>
      <Heading title="Schedule of values" />
      <div className="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
        {lines.map((line) => (
          <div
            key={line.id}
            data-testid="design-build-sov-line"
            className="flex items-baseline justify-between gap-4 py-3"
          >
            <span className="type-body-small text-[var(--text-primary)]">{line.label}</span>
            <span className="type-label">{moneyToTheCent(line.cents, currency)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-4 border-b border-current pb-2">
        <span className="type-body-small text-[var(--text-primary)]">The whole of it</span>
        <span className="type-label" data-testid="design-build-sov-total">
          {moneyToTheCent(total, currency)}
        </span>
      </div>
    </section>
  );
}

const DRAW_STATE_LABEL: Record<string, string> = {
  draft: 'Not yet billed',
  sent: 'Sent',
  partially_paid: 'Part paid',
  paid: 'Paid',
  void: 'Withdrawn',
};

/**
 * The draw schedule, read off the ledger the database keeps. Nothing is
 * recomputed here: gross, retainage and net are integers the send transaction
 * wrote, and a second implementation in the browser is exactly how two
 * surfaces come to disagree about what is owed.
 *
 * Before there is a ledger — a paper this build can read whose database has
 * not materialized one — the authored draws are shown by label and share
 * alone. No figure is invented for them.
 */
function DrawsLeaf({
  part,
  draws,
  currency,
}: {
  part: CommercialAgreementPart;
  draws: DesignBuildDrawEntry[];
  currency: string;
}) {
  if (draws.length === 0) {
    const authored = payloadRows(part.payload.draws)
      .map((row, index) => ({
        key: payloadText(row.key) || `${part.id}-${index}`,
        label: payloadText(row.label),
        pct: payloadCents(row.pct),
      }))
      .filter((row) => row.label.length > 0);
    return (
      <>
        <Heading title={part.title} />
        {authored.length === 0 ? (
          <Recorded />
        ) : (
          <div className="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
            {authored.map((row) => (
              <div
                key={row.key}
                data-testid="design-build-draw"
                className="flex items-baseline justify-between gap-4 py-3"
              >
                <span className="type-body-small text-[var(--text-primary)]">{row.label}</span>
                <span className="type-label">{row.pct === null ? '—' : `${row.pct}%`}</span>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  const retainageHeld = draws.reduce((sum, draw) => sum + draw.retainageCents, 0);

  return (
    <>
      <Heading title={part.title} />
      <div className="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
        {draws.map((draw) => (
          <div key={draw.drawKey} data-testid="design-build-draw" className="py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="type-body-small text-[var(--text-primary)]">{draw.label}</span>
              <span className="type-label" data-testid="design-build-draw-net">
                {moneyToTheCent(draw.netCents, currency)}
              </span>
            </div>
            <p className="type-meta-small mt-1 text-[var(--text-muted)]">
              {[
                draw.isRetainageRelease
                  ? null
                  : `${moneyToTheCent(draw.grossCents, currency)} of the price`,
                draw.retainageCents > 0
                  ? `${moneyToTheCent(draw.retainageCents, currency)} held back`
                  : null,
                DRAW_STATE_LABEL[draw.invoiceStatus ?? ''] ??
                  (draw.invoiceStatus ? null : 'Not yet billed'),
                draw.lienWaiver
                  ? 'Lien waiver received'
                  : null,
              ]
                .filter((piece): piece is string => !!piece)
                .join(' · ')}
            </p>
          </div>
        ))}
      </div>
      {retainageHeld > 0 && (
        <p className="type-body-small mt-3" data-testid="design-build-retainage-held">
          {`${moneyToTheCent(retainageHeld, currency)} is held back across the draws and released when the work is finished.`}
        </p>
      )}
    </>
  );
}

function AllowancesLeaf({
  part,
  currency,
}: {
  part: CommercialAgreementPart;
  currency: string;
}) {
  const allowances = payloadRows(part.payload.allowances)
    .map((row, index) => ({
      id: payloadText(row.id) || `${part.id}-${index}`,
      label: payloadText(row.label),
      amountCents: payloadCents(row.amountCents),
      overageRule: payloadText(row.overageRule),
      underageRule: payloadText(row.underageRule),
    }))
    .filter((row) => row.label.length > 0);

  if (allowances.length === 0) return null;

  return (
    <>
      <Heading title={part.title} />
      <div className="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
        {allowances.map((row) => (
          <div key={row.id} data-testid="design-build-allowance" className="py-3">
            <div className="flex items-baseline justify-between gap-4">
              <span className="type-body-small text-[var(--text-primary)]">{row.label}</span>
              <span className="type-label">
                {row.amountCents === null || row.amountCents <= 0
                  ? AGREEMENT_PART_COPY.notYetSet
                  : moneyToTheCent(row.amountCents, currency)}
              </span>
            </div>
            <p className="type-meta-small mt-1 text-[var(--text-muted)]">
              {row.overageRule === 'client_credit'
                ? 'Anything over this amount is added to your account.'
                : 'Anything over this amount needs a change order first.'}
              {row.underageRule === 'retain'
                ? ' Anything under it stays with the studio.'
                : ' Anything under it comes back to you.'}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * WHO IS DOING THE WORK (R13). Identities always; a price only under
 * `open_book`, and even then only the AWARDED price — the bid ledger reaches
 * no client surface in any mode. The `closed_book` guard here is a second
 * lock on the RPC's own: a price the clause did not elect to disclose is not
 * printed beside a name, whatever the DTO carried.
 */
function SubsLeaf({
  subs,
  disclosure,
  currency,
}: {
  subs: DesignBuildSubIdentity[];
  disclosure: string;
  currency: string;
}) {
  if (subs.length === 0) return null;
  const openBook = disclosure === 'open_book';

  return (
    <section data-testid="design-build-subs" data-disclosure={disclosure}>
      <Heading title="Who is doing the work" />
      <div className="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
        {subs.map((sub) => (
          <div
            key={`${sub.displayName}-${sub.trade ?? ''}`}
            data-testid="design-build-sub"
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
          >
            <span className="type-body-small text-[var(--text-primary)]">
              {[sub.displayName, sub.trade, sub.companyName]
                .filter((piece): piece is string => !!piece)
                .join(' · ')}
            </span>
            {openBook && sub.awardedPriceCents !== null && (
              <span className="type-label" data-testid="design-build-sub-price">
                {moneyToTheCent(sub.awardedPriceCents, currency)}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ClauseLeaf({ part }: { part: CommercialAgreementPart }) {
  const body = payloadText(part.payload.body);
  if (!body) return null;
  return (
    <>
      <Heading title={part.title} />
      <p className="type-body mt-3 whitespace-pre-wrap">{body}</p>
    </>
  );
}

function ListLeaf({ part }: { part: CommercialAgreementPart }) {
  const items = payloadRows(part.payload.items)
    .map((item, index) => ({
      key: payloadText(item.id) || `${part.id}-${index}`,
      text: payloadText(item.text),
    }))
    .filter((item) => item.text.length > 0);
  if (items.length === 0) return null;
  return (
    <>
      <Heading title={part.title} />
      <ul className="mt-3 space-y-2 type-body-small">
        {items.map((item) => (
          <li key={item.key}>— {item.text}</li>
        ))}
      </ul>
    </>
  );
}

function AttachmentLeaf({
  part,
  letter,
}: {
  part: CommercialAgreementPart;
  letter: string;
}) {
  const body = payloadText(part.payload.body);
  return (
    <section
      data-testid="agreement-part"
      data-part-key={part.partKey}
      data-position={part.position}
      data-kind="attachment"
    >
      <hr className="border-t border-[var(--border-default)]" />
      <p className="type-meta mt-6 font-mono text-[var(--text-muted)]">
        ATTACHMENT {letter} · {part.title}
      </p>
      {body ? <p className="type-body mt-3 whitespace-pre-wrap">{body}</p> : null}
      {part.payload.acknowledgeRequired === true ? (
        <p className="type-body-small mt-3">{AGREEMENT_PART_COPY.attachmentAcknowledgment}</p>
      ) : null}
    </section>
  );
}

/**
 * The turnkey body. Parts render in the DESIGNER'S order — the order she
 * composed them in is the order the paper reads — with two derived sections
 * hung off the parts they belong to: the schedule of values under the pricing
 * basis it is derived from, and the trades under the sub-disclosure clause
 * that decides how much of them is shown.
 */
export function DesignBuildBody({ bundle }: { bundle: CommercialDocumentBundle }) {
  const currency = bundle.serviceTerms?.currency ?? 'USD';
  const ordered = [...bundle.parts].sort((a, b) => a.position - b.position);
  const sections = ordered.filter(
    (part) => part.kind !== 'attachment' && part.kind !== 'attestation',
  );
  const attachments = ordered.filter((part) => part.kind === 'attachment');

  const basisPart = sections.find(
    (part) => part.kind === 'schedule' && part.variant === 'pricing_basis',
  );
  const reading = basisPart ? readPricingBasis(basisPart) : null;
  const disclosure = reading?.subDisclosure ?? 'closed_book';
  const subs = bundle.designBuild?.subs ?? [];
  const draws = bundle.designBuild?.draws ?? [];

  // The trades belong under the clause that elected how much of them to show.
  // When a hand-composed set carries no such clause they sit on their own,
  // after everything the agreement says and before the attachments — never
  // nowhere.
  const disclosureClause = sections.find(
    (part) => part.kind === 'clause' && part.partKey.endsWith('sub_disclosure'),
  );

  function leafFor(part: CommercialAgreementPart) {
    if (part.kind === 'schedule') {
      if (part.variant === 'pricing_basis' && reading) {
        return <PricingBasisLeaf part={part} reading={reading} currency={currency} />;
      }
      if (part.variant === 'draws') {
        return <DrawsLeaf part={part} draws={draws} currency={currency} />;
      }
      if (part.variant === 'allowances') {
        return AllowancesLeaf({ part, currency });
      }
      return (
        <>
          <Heading title={part.title} />
          <Recorded />
        </>
      );
    }
    if (part.kind === 'clause') return ClauseLeaf({ part });
    if (part.kind === 'list') return ListLeaf({ part });
    return (
      <>
        <Heading title={part.title} />
        <Recorded />
      </>
    );
  }

  return (
    <>
      <div className="mt-8 space-y-8" data-testid="design-build-body">
        {sections.map((part) => {
          const leaf = leafFor(part);
          const isBasis = part.kind === 'schedule' && part.variant === 'pricing_basis';
          const isDisclosure = disclosureClause?.id === part.id;
          if (leaf === null && !isBasis && !isDisclosure) return null;
          return (
            <div key={part.id} className="space-y-8">
              {leaf === null ? null : (
                <section
                  data-testid="agreement-part"
                  data-part-key={part.partKey}
                  data-position={part.position}
                  data-kind={part.kind}
                  data-variant={part.variant ?? undefined}
                >
                  {leaf}
                </section>
              )}
              {isBasis && reading ? (
                <ScheduleOfValuesLeaf reading={reading} currency={currency} />
              ) : null}
              {isDisclosure ? (
                <SubsLeaf subs={subs} disclosure={disclosure} currency={currency} />
              ) : null}
            </div>
          );
        })}

        {!disclosureClause ? (
          <SubsLeaf subs={subs} disclosure={disclosure} currency={currency} />
        ) : null}

        {/* The turnkey boundary. A design-build agreement covers the work it
            names and nothing beyond it — the sentence a services agreement
            closes with ("design services only") would be false here. */}
        <p className="border-l-2 border-patina-dusty-blue bg-patina-dusty-blue/5 px-4 py-3 type-body-small">
          This agreement covers the work described above, at the price shown. Anything added to
          it is a separate written change order before the work is done.
        </p>
      </div>

      {attachments.length > 0 && (
        <div className="mt-8 space-y-8" data-testid="agreement-attachments">
          {attachments.map((part, index) => (
            <AttachmentLeaf key={part.id} part={part} letter={attachmentLetter(index)} />
          ))}
        </div>
      )}
    </>
  );
}
