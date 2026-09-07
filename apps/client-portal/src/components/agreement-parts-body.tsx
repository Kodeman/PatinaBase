import type { CommercialAgreementPart } from '@/lib/commercial-documents';

/* ── THE AGREEMENT, READ AS PARTS ────────────────────────────────────────────
   Wave 1 of "The Agreement, Composed". When the bundle carries parts, the
   client's agreement stops being seven fixed sections and becomes the ordered
   list the studio composed. The render spec is build/waves/w1/build-sheet.md
   §4.5 — one table, implemented twice (here, and in the designer preview's own
   agreement-parts-body.tsx) so the two surfaces read the same paper.

   Three rules the leaves below never break:
   · An unknown kind, an unknown schedule variant, and a malformed payload all
     print one plain line. Never raw JSON, never a thrown render — a part
     written by a later wave has to arrive on an already-signed page intact.
   · `attestation` is never drawn. A studio's licence is between the studio and
     its state; it reaches the client as nothing at all.
   · Prose never carries money (R5). Only the typed `schedule` leaves print a
     figure, and each prints only the figure its own variant holds.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Mirrors `money` in commercial-document-shell.tsx exactly — same locale, same
 * currency style, same whole-dollar rounding. Kept local rather than imported
 * because the shell imports THIS module; the two must be changed together.
 */
function money(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

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

/** A figure is a figure only when it is a real, finite number. */
function payloadCents(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** ATTACHMENT A, ATTACHMENT B … and plain numbers past Z rather than nothing. */
function attachmentLetter(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

const SECTION_HEAD = 'type-section-head';

function PartHeading({ title }: { title: string }) {
  return <h2 className={SECTION_HEAD}>{title}</h2>;
}

/** The one line every leaf this build does not draw falls back to. */
function RecordedLine() {
  return (
    <p className="type-body-small mt-2 text-[var(--text-muted)]">
      Recorded with your agreement.
    </p>
  );
}

function ClauseLeaf({ part }: { part: CommercialAgreementPart }) {
  const body = payloadText(part.payload.body);
  return (
    <>
      <PartHeading title={part.title} />
      {body ? <p className="type-body mt-3 whitespace-pre-wrap">{body}</p> : null}
    </>
  );
}

function ListLeaf({ part }: { part: CommercialAgreementPart }) {
  const items = payloadRows(part.payload.items)
    .map((item, index) => ({
      key: payloadText(item.id) || `${part.id}-${index}`,
      text: payloadText(item.text),
      note: payloadText(item.note),
      optional: item.optional === true,
    }))
    .filter((item) => item.text.length > 0);

  return (
    <>
      <PartHeading title={part.title} />
      {items.length > 0 ? (
        <ul className="mt-3 space-y-2 type-body-small">
          {items.map((item) => (
            <li key={item.key}>
              — {item.text}{item.optional ? ' (optional)' : ''}
              {item.note ? (
                <span className="block type-body-small text-[var(--text-muted)]">{item.note}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function RateCardLeaf({ part, currency }: { part: CommercialAgreementPart; currency: string }) {
  const roles = payloadRows(part.payload.roles)
    .map((role, index) => ({
      key: `${part.id}-${index}`,
      roleName: payloadText(role.roleName),
      hourlyRateCents: payloadCents(role.hourlyRateCents) ?? 0,
      sortOrder: payloadCents(role.sortOrder) ?? index,
    }))
    .filter((role) => role.roleName.length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <PartHeading title={part.title} />
      {roles.length > 0 ? (
        <div className="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
          {roles.map((role) => (
            <div key={role.key} className="flex items-baseline justify-between gap-4 py-3">
              <span className="type-body-small text-[var(--text-primary)]">{role.roleName}</span>
              <span className="type-label">{money(role.hourlyRateCents, currency)} / hr</span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

/**
 * A ceiling part with no figure is not an unwritten ceiling — it is a stated
 * absence of one, and it says so in words. That is the whole reason the column
 * became nullable (00575 / F-2): NULL means uncapped, never `$0`.
 */
function CeilingLeaf({ part, currency }: { part: CommercialAgreementPart; currency: string }) {
  const cents = payloadCents(part.payload.cents);
  return (
    <>
      <PartHeading title={part.title} />
      {cents === null ? (
        <p className="type-body-small mt-2">
          No ceiling — professional time is billed as it is worked.
        </p>
      ) : (
        <p className="type-data-large mt-2">{money(cents, currency)}</p>
      )}
    </>
  );
}

function RetainerLeaf({ part, currency }: { part: CommercialAgreementPart; currency: string }) {
  const cents = payloadCents(part.payload.cents);
  const activationPolicy = payloadText(part.payload.activationPolicy);
  return (
    <>
      <PartHeading title={part.title} />
      {cents === null ? <RecordedLine /> : (
        <>
          <p className="type-data-large mt-2">{money(cents, currency)}</p>
          <p className="type-body-small mt-1">
            {activationPolicy === 'retainer_paid'
              ? 'Design work begins after the fully executed agreement and retainer payment.'
              : 'Due under the terms of the fully executed agreement.'}
          </p>
        </>
      )}
    </>
  );
}

function CadenceLeaf({ part }: { part: CommercialAgreementPart }) {
  const cadence = payloadText(part.payload.cadence);
  return (
    <>
      <PartHeading title={part.title} />
      {cadence ? (
        <p className="type-data-large mt-2 capitalize">{cadence.replace('_', ' ')}</p>
      ) : null}
      <p className="type-body-small mt-1">
        Additional work requires written authorization before it can be invoiced.
      </p>
    </>
  );
}

function ProcurementLeaf({ part }: { part: CommercialAgreementPart }) {
  const depositPercent = payloadCents(part.payload.depositPercent);
  const notes = [
    { label: 'Markup basis', value: payloadText(part.payload.markupBasis) },
    { label: 'Freight and handling', value: payloadText(part.payload.freightHandling) },
    { label: 'Terms of sale', value: payloadText(part.payload.termsOfSale) },
  ].filter((note) => note.value.length > 0);

  return (
    <>
      <PartHeading title={part.title} />
      {depositPercent === null ? null : (
        <p className="type-data-large mt-2">{depositPercent}% deposit</p>
      )}
      {notes.length > 0 ? (
        <dl className="mt-3 space-y-1">
          {notes.map((note) => (
            <div key={note.label} className="flex flex-wrap gap-x-2">
              <dt className="type-meta text-[var(--text-muted)]">{note.label}</dt>
              <dd className="type-body-small">{note.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {depositPercent === null && notes.length === 0 ? <RecordedLine /> : null}
    </>
  );
}

function FlatLeaf({ part, currency }: { part: CommercialAgreementPart; currency: string }) {
  const cents = payloadCents(part.payload.cents);
  return (
    <>
      <PartHeading title={part.title} />
      {cents === null ? <RecordedLine /> : (
        <p className="type-data-large mt-2">{money(cents, currency)}</p>
      )}
    </>
  );
}

function PerPhaseLeaf({ part, currency }: { part: CommercialAgreementPart; currency: string }) {
  const phases = payloadRows(part.payload.phases)
    .map((phase, index) => ({
      key: payloadText(phase.key) || `${part.id}-${index}`,
      label: payloadText(phase.label),
      cents: payloadCents(phase.cents),
    }))
    .filter((phase) => phase.label.length > 0);

  return (
    <>
      <PartHeading title={part.title} />
      {phases.length > 0 ? (
        <div className="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
          {phases.map((phase) => (
            <div key={phase.key} className="flex items-baseline justify-between gap-4 py-3">
              <span className="type-body-small text-[var(--text-primary)]">{phase.label}</span>
              <span className="type-label">
                {phase.cents === null ? '—' : money(phase.cents, currency)}
              </span>
            </div>
          ))}
        </div>
      ) : <RecordedLine />}
    </>
  );
}

function ScheduleLeaf({ part, currency }: { part: CommercialAgreementPart; currency: string }) {
  switch (part.variant) {
    case 'rate_card':
      return <RateCardLeaf part={part} currency={currency} />;
    case 'ceiling':
      return <CeilingLeaf part={part} currency={currency} />;
    case 'retainer':
      return <RetainerLeaf part={part} currency={currency} />;
    case 'cadence':
      return <CadenceLeaf part={part} />;
    case 'procurement':
      return <ProcurementLeaf part={part} />;
    case 'flat':
      return <FlatLeaf part={part} currency={currency} />;
    case 'per_phase':
      return <PerPhaseLeaf part={part} currency={currency} />;
    default:
      // The eight record-only variants, and any variant a later wave adds.
      return (
        <>
          <PartHeading title={part.title} />
          <RecordedLine />
        </>
      );
  }
}

function PartSection({ part, currency }: { part: CommercialAgreementPart; currency: string }) {
  return (
    <section
      data-testid="agreement-part"
      data-part-key={part.partKey}
      data-position={part.position}
      data-kind={part.kind}
    >
      {part.kind === 'clause' ? <ClauseLeaf part={part} /> : null}
      {part.kind === 'list' ? <ListLeaf part={part} /> : null}
      {part.kind === 'schedule' ? <ScheduleLeaf part={part} currency={currency} /> : null}
      {part.kind !== 'clause' && part.kind !== 'list' && part.kind !== 'schedule' ? (
        // `phases`, and any kind a later wave writes onto an agreement this
        // build already shipped. Its title, and one sentence.
        <>
          <PartHeading title={part.title} />
          <RecordedLine />
        </>
      ) : null}
    </section>
  );
}

/**
 * An attachment is a rule across the page, not another section of it: a
 * lettered leaf that sits after everything the agreement itself says.
 * `acknowledgeRequired` prints one line in Wave 1 — it is not a control, it
 * sends nothing, and nothing is recorded from it. Wave 2 makes it real.
 */
function AttachmentLeaf({ part, letter }: { part: CommercialAgreementPart; letter: string }) {
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
        <p className="type-body-small mt-3">I received this</p>
      ) : null}
    </section>
  );
}

export function AgreementPartsBody({
  parts,
  currency,
}: {
  parts: CommercialAgreementPart[];
  currency: string;
}) {
  const ordered = [...parts].sort((a, b) => a.position - b.position);
  const sections = ordered.filter(
    (part) => part.kind !== 'attachment' && part.kind !== 'attestation',
  );
  const attachments = ordered.filter((part) => part.kind === 'attachment');

  return (
    <div className="mt-8 space-y-8" data-testid="agreement-parts-body">
      {sections.map((part) => (
        <PartSection key={part.id} part={part} currency={currency} />
      ))}
      {attachments.map((part, index) => (
        <AttachmentLeaf key={part.id} part={part} letter={attachmentLetter(index)} />
      ))}

      {/* The same closing boundary today's body carries, so the sentence
          appears exactly once on either path. */}
      <p className="border-l-2 border-patina-dusty-blue bg-patina-dusty-blue/5 px-4 py-3 type-body-small">
        This agreement authorizes design services only. Furnishings, freight, tax, installation,
        and purchasing require a separate named furnishings authorization.
      </p>
    </div>
  );
}
