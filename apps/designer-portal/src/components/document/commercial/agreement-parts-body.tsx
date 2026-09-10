"use client";

/**
 * The client's copy, rendered from the parts — designer side.
 *
 * One spec, two implementations: this file and
 * `apps/client-portal/src/components/agreement-parts-body.tsx` render the same
 * table (build sheet §4.5 / §5.2) in their own registers. Every sentence the
 * homeowner reads comes from `AGREEMENT_PART_COPY` (@patina/types) so the two
 * surfaces cannot drift by retyping — a drift between them is a drift in the
 * agreement.
 *
 * R27 — the layout rule is the client shell's, too, and it is the whole rule:
 * a leaf that draws NOTHING takes its section with it. An empty clause and an
 * empty list are nothing on the homeowner's page, not a naked heading over
 * blank paper, and this preview must say what her page says. Every leaf that
 * has something to say — an empty rate card, an unset retainer, a part of a
 * kind this build does not open — keeps its heading and says the recorded
 * line, exactly as the client shell does.
 *
 * What this file does NOT render: the header, the signature block, and the
 * closing "Furnishings, freight, tax…" notice. Those are the Core, they live
 * in `service-agreement-preview.tsx`, and they are the same on both paths.
 */

import { Fragment } from "react";
import {
  AGREEMENT_PART_COPY,
  DESIGN_BUILD_PAPER_COPY,
  agreementCadenceText,
  agreementDepositLine,
  agreementRetainerActivation,
  designBuildAllowanceRule,
  designBuildBasisSentence,
  designBuildContractSumLabel,
  designBuildFeeRowLabel,
  designBuildMoney,
  type AgreementPart,
} from "@patina/types";
import {
  readBody,
  readCents,
  readItems,
  readPhases,
  readRoles,
} from "../rooms/drafting/agreement/part-kinds";
import {
  contractSumCents,
  costBasisCents,
  feeCents,
  readAllowances,
  readDraws,
  readPricingBasis,
  scheduleOfValues,
} from "@/lib/document/design-build";

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);

function PartHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 font-heading text-[1.05rem] italic text-[var(--color-charcoal)]">
      {children}
    </h3>
  );
}

function MutedLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] italic text-[var(--text-muted)]">{children}</p>
  );
}

/** The one line every leaf this build does not draw falls back to — the
 *  client shell's sentence, imported rather than retyped. */
function RecordedLine() {
  return <MutedLine>{AGREEMENT_PART_COPY.recorded}</MutedLine>;
}

/**
 * R21 — a written figure is a positive one, and this preview must say what the
 * homeowner's page says. `materialize_standard_parts` seeds the retainer part
 * from `retainer_amount_cents` (NOT NULL DEFAULT 0), so the very first
 * composed agreement carries `{ cents: 0 }`; printing `$0` here while
 * `apps/client-portal/src/components/agreement-parts-body.tsx` prints "Not yet
 * set" is the preview lying about the page.
 */
function isWritten(cents: number | null): cents is number {
  return cents !== null && cents > 0;
}

/** The seven-facet room's own treatment for an unwritten figure
 *  (`service-agreement-preview.tsx` — the same type scale, italic, muted). */
function NotYetSet() {
  return (
    <p className="font-heading text-[1.05rem] italic text-[var(--text-muted)]">
      {AGREEMENT_PART_COPY.notYetSet}
    </p>
  );
}

/* ── THE TURNKEY LEAVES (W3R1-04) ────────────────────────────────────────────
   A design-build agreement prices a whole job, divides it into a schedule of
   values and is paid in draws. Its three money parts fell to
   "Recorded with your agreement." here while the homeowner read a guaranteed
   maximum price, a schedule of values, four draws and three allowances — the
   studio's live preview was not the paper it was sending, which is what R27
   forbids.

   Every sentence and every figure below comes from `@patina/types`, which
   `apps/client-portal/src/components/commercial/design-build-body.tsx` reads
   too; the readings come from `@/lib/document/design-build`, whose arithmetic
   `_agreement_schedule_of_values` mirrors. So the three renderers — this one,
   the homeowner's and the SQL keepsake's — say one thing.

   The DRAWS leaf prints the studio's AUTHORED draws (label and share), which
   is the paper as it is being sent. The homeowner's copy shows the same rows
   until the ledger is materialized at send, and after that it shows the
   ledger's own cents; this preview has no ledger, and inventing figures for
   one it cannot read would be the drift again in the other direction. ──── */

function TurnkeyRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[12px] text-[var(--text-body)]">{label}</span>
        <strong className="font-mono text-[11px] font-medium text-[var(--color-charcoal)]">
          {value}
        </strong>
      </div>
      {note && (
        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
          {note}
        </p>
      )}
    </div>
  );
}

function TurnkeyTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-[var(--doc-ink-border)] border-y border-[var(--doc-ink-border)]">
      {children}
    </div>
  );
}

function PricingBasisLeaf({
  part,
  currency,
}: {
  part: AgreementPart;
  currency: string;
}) {
  const basis = readPricingBasis(part.payload ?? {});
  const sentence = basis.basis ? designBuildBasisSentence(basis.basis) : null;
  const cost = costBasisCents(basis);
  const fee = feeCents(basis);
  const sum = contractSumCents(basis);
  return (
    <>
      {sentence && (
        <p className="text-[12.5px] leading-[1.75] text-[var(--text-body)]">
          {sentence}
        </p>
      )}
      {(cost > 0 || fee > 0) && (
        <TurnkeyTable>
          {cost > 0 && (
            <TurnkeyRow
              label={DESIGN_BUILD_PAPER_COPY.costBasisLabel}
              value={designBuildMoney(cost, currency)}
            />
          )}
          {basis.feeBps !== null && fee > 0 && (
            <TurnkeyRow
              label={designBuildFeeRowLabel(basis.feeBps)}
              value={designBuildMoney(fee, currency)}
            />
          )}
        </TurnkeyTable>
      )}
      {sum === null || sum <= 0 ? (
        <NotYetSet />
      ) : (
        <div className="mt-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {designBuildContractSumLabel(basis.basis ?? "")}
          </p>
          <p className="mt-1 font-heading text-[1.05rem] text-[var(--color-charcoal)]">
            {designBuildMoney(sum, currency)}
          </p>
        </div>
      )}
    </>
  );
}

/** The schedule of values hangs off the pricing basis it comes from, exactly
 *  as it does on the homeowner's page — its own section, not a part. */
function ScheduleOfValuesSection({
  part,
  currency,
}: {
  part: AgreementPart;
  currency: string;
}) {
  const basis = readPricingBasis(part.payload ?? {});
  const lines = scheduleOfValues(basis);
  if (lines.length === 0) return null;
  const total = lines.reduce((sum, line) => sum + line.cents, 0);
  return (
    <section data-schedule-of-values>
      <PartHeading>
        {DESIGN_BUILD_PAPER_COPY.scheduleOfValuesTitle}
      </PartHeading>
      <TurnkeyTable>
        {lines.map((line) => (
          <TurnkeyRow
            key={line.id}
            label={line.label}
            value={designBuildMoney(line.cents, currency)}
          />
        ))}
      </TurnkeyTable>
      <div className="mt-2 flex items-baseline justify-between gap-4 border-b border-current pb-1.5">
        <span className="text-[12px] text-[var(--text-body)]">
          {DESIGN_BUILD_PAPER_COPY.scheduleOfValuesTotalLabel}
        </span>
        <strong className="font-mono text-[11px] font-medium text-[var(--color-charcoal)]">
          {designBuildMoney(total, currency)}
        </strong>
      </div>
    </section>
  );
}

function DrawsLeaf({ part }: { part: AgreementPart }) {
  const { draws } = readDraws(part.payload ?? {});
  const authored = draws.filter((draw) => draw.label.trim());
  if (authored.length === 0) return <RecordedLine />;
  return (
    <TurnkeyTable>
      {authored.map((draw) => (
        <TurnkeyRow
          key={draw.key || draw.label}
          label={draw.label}
          value={`${draw.pct}%`}
        />
      ))}
    </TurnkeyTable>
  );
}

function AllowancesLeaf({
  part,
  currency,
}: {
  part: AgreementPart;
  currency: string;
}) {
  const { allowances } = readAllowances(part.payload ?? {});
  const named = allowances.filter((allowance) => allowance.label.trim());
  if (named.length === 0) return null;
  return (
    <TurnkeyTable>
      {named.map((allowance) => (
        <TurnkeyRow
          key={allowance.id}
          label={allowance.label}
          value={
            allowance.amountCents > 0
              ? designBuildMoney(allowance.amountCents, currency)
              : AGREEMENT_PART_COPY.notYetSet
          }
          note={designBuildAllowanceRule(
            allowance.overageRule,
            allowance.underageRule,
          )}
        />
      ))}
    </TurnkeyTable>
  );
}

/**
 * The body under a part's heading, or `null` when the part draws nothing at
 * all — a clause nobody has written yet, an empty list. The caller drops the
 * whole section on `null`, so the two surfaces print the same page.
 */
function renderPartBody(
  part: AgreementPart,
  currency: string,
  turnkey: boolean,
): React.ReactNode | null {
  const payload = part.payload ?? {};

  // W3R1-04 — the three money parts a design-build agreement is priced by.
  // Off the turnkey class they are unreachable (no other document kind
  // carries these variants), so this branch changes nothing for a services
  // agreement or an addendum.
  if (turnkey && part.kind === "schedule") {
    if (part.variant === "pricing_basis") {
      return <PricingBasisLeaf part={part} currency={currency} />;
    }
    if (part.variant === "draws") return <DrawsLeaf part={part} />;
    if (part.variant === "allowances") {
      return AllowancesLeaf({ part, currency });
    }
  }

  if (part.kind === "clause") {
    const body = readBody(payload);
    if (!body.trim()) return null;
    return (
      <p className="whitespace-pre-wrap text-[12.5px] leading-[1.75] text-[var(--text-body)]">
        {body}
      </p>
    );
  }

  if (part.kind === "list") {
    const items = readItems(payload).filter((item) => item.text.trim());
    if (items.length === 0) return null;
    return (
      <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-[var(--text-body)]">
        {items.map((item) => (
          <li key={item.id}>
            <span>
              — {item.text}
              {item.optional ? " (optional)" : ""}
            </span>
            {item.note && (
              <span className="mt-0.5 block text-[11.5px] text-[var(--color-mocha)]">
                {item.note}
              </span>
            )}
          </li>
        ))}
      </ul>
    );
  }

  if (part.kind !== "schedule") {
    // `phases`, and anything a later wave adds. Never raw JSON.
    return <RecordedLine />;
  }

  switch (part.variant) {
    case "rate_card": {
      const roles = readRoles(payload)
        .filter((role) => role.roleName.trim())
        .sort((a, b) => a.sortOrder - b.sortOrder);
      // A rate card is a money part: present at all, it says it is on the
      // paper rather than vanishing — the client shell's own treatment.
      if (roles.length === 0) return <RecordedLine />;
      return (
        <div className="divide-y divide-[var(--doc-ink-border)] border-y border-[var(--doc-ink-border)]">
          {roles.map((role) => (
            <div
              key={`${role.roleName}-${role.sortOrder}`}
              className="flex items-baseline justify-between gap-4 py-2"
            >
              <span className="text-[12px] text-[var(--text-body)]">
                {role.roleName}
              </span>
              <strong className="font-mono text-[11px] font-medium text-[var(--color-charcoal)]">
                {money(role.hourlyRateCents, currency)} / hr
              </strong>
            </div>
          ))}
        </div>
      );
    }

    case "ceiling": {
      const cents = readCents(payload.cents);
      // An unset ceiling under parts is an ABSENT part, so this branch is only
      // reached when the designer kept a Ceiling part and left it open. It
      // says what that means rather than printing "Not yet set" — P0.
      if (cents === null) {
        return (
          <p className="text-[12.5px] leading-relaxed text-[var(--text-body)]">
            {AGREEMENT_PART_COPY.ceilingUncapped}
          </p>
        );
      }
      if (!isWritten(cents)) return <NotYetSet />;
      return (
        <p className="font-heading text-[1.05rem] text-[var(--color-charcoal)]">
          {money(cents, currency)}
        </p>
      );
    }

    case "retainer": {
      const cents = readCents(payload.cents);
      if (cents === null) return <RecordedLine />;
      // The activation clause is withheld with the figure: a sentence about
      // when a retainer is due, under no retainer, promises nothing.
      if (!isWritten(cents)) return <NotYetSet />;
      return (
        <>
          <p className="font-heading text-[1.05rem] text-[var(--color-charcoal)]">
            {money(cents, currency)}
          </p>
          <p className="mt-1 text-[12.5px] text-[var(--color-charcoal)]">
            {agreementRetainerActivation(payload.activationPolicy)}
          </p>
        </>
      );
    }

    case "cadence": {
      const cadence =
        typeof payload.cadence === "string" ? payload.cadence : "";
      return (
        <>
          {cadence && (
            <p className="font-heading text-[1.05rem] capitalize text-[var(--color-charcoal)]">
              {agreementCadenceText(cadence)}
            </p>
          )}
          <p className="mt-1 text-[12.5px] text-[var(--color-charcoal)]">
            {AGREEMENT_PART_COPY.cadenceNote}
          </p>
        </>
      );
    }

    case "procurement": {
      const percent = readCents(payload.depositPercent);
      const extras = (
        [
          ["Markup basis", payload.markupBasis],
          ["Freight and handling", payload.freightHandling],
          ["Terms of sale", payload.termsOfSale],
        ] as const
      ).filter(([, value]) => typeof value === "string" && value.trim());
      // R21 — `0% deposit` is not a deposit term, it is an unwritten one, and
      // a percent has no "Not yet set" twin on today's paper: it draws nothing.
      // R28 (re-gate 2, F2) — and "Recorded with your agreement." under a
      // "Furnishings deposit" heading asserts a term nobody wrote, so the
      // unset part takes its whole section with it on both surfaces.
      if (!isWritten(percent) && extras.length === 0) return null;
      return (
        <div className="space-y-1 text-[12.5px] text-[var(--color-charcoal)]">
          {isWritten(percent) && <p>{agreementDepositLine(percent)}</p>}
          {extras.map(([label, value]) => (
            <p key={label} className="text-[12px] text-[var(--color-mocha)]">
              {label} · {String(value)}
            </p>
          ))}
        </div>
      );
    }

    case "flat": {
      const cents = readCents(payload.cents);
      if (cents === null) return <RecordedLine />;
      if (!isWritten(cents)) return <NotYetSet />;
      return (
        <p className="font-heading text-[1.05rem] text-[var(--color-charcoal)]">
          {money(cents, currency)}
        </p>
      );
    }

    case "per_phase": {
      const phases = readPhases(payload).filter((phase) => phase.label.trim());
      if (phases.length === 0) return <RecordedLine />;
      return (
        <div className="divide-y divide-[var(--doc-ink-border)] border-y border-[var(--doc-ink-border)]">
          {phases.map((phase) => (
            <div
              key={phase.key}
              className="flex items-baseline justify-between gap-4 py-2"
            >
              <span className="text-[12px] text-[var(--text-body)]">
                {phase.label}
              </span>
              <strong className="font-mono text-[11px] font-medium text-[var(--color-charcoal)]">
                {money(phase.cents, currency)}
              </strong>
            </div>
          ))}
        </div>
      );
    }

    default:
      // One of the eight variants Wave 1 does not author. It is part of the
      // instrument, so it is named; it is not opened, so it says only that.
      return <RecordedLine />;
  }
}

function AttachmentLeaf({
  part,
  letter,
}: {
  part: AgreementPart;
  letter: string;
}) {
  const payload = part.payload ?? {};
  const body = readBody(payload);
  return (
    <section className="pt-2">
      <hr className="mb-4 border-t border-[var(--doc-ink-border)]" />
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-clay-ink)]">
        Attachment {letter} · {part.title}
      </p>
      {body.trim() && (
        <p className="mt-2 whitespace-pre-wrap text-[12px] leading-[1.75] text-[var(--text-body)]">
          {body}
        </p>
      )}
      {payload.acknowledgeRequired === true && (
        // Display only in W1 — nothing is recorded. W2/P6 makes it an
        // acknowledgment stored in the signature's metadata.
        <p className="mt-2 text-[12px] text-[var(--color-charcoal)]">
          {AGREEMENT_PART_COPY.attachmentAcknowledgment}
        </p>
      )}
    </section>
  );
}

/** W3R1-04 — the pricing basis drags the derived schedule of values along, so
 *  it keeps its place even when the basis itself draws nothing. */
function ridesWithScheduleOfValues(part: AgreementPart, turnkey: boolean) {
  return (
    turnkey && part.kind === "schedule" && part.variant === "pricing_basis"
  );
}

/**
 * True when this part puts NOTHING on the paper — R27's rule, asked as a
 * question so a caller can lay out around the gap rather than discover it in
 * the returned tree. An attachment always draws; a pricing basis always draws,
 * because the schedule of values hangs off it.
 */
export function partDrawsNothing(
  part: AgreementPart,
  currency: string,
  turnkey: boolean,
): boolean {
  if (part.kind === "attachment") return false;
  if (ridesWithScheduleOfValues(part, turnkey)) return false;
  return renderPartBody(part, currency, turnkey) === null;
}

/**
 * ONE part, printed exactly as it prints inside the whole body (FS-5).
 *
 * The galley lays the parts out itself and prints each one through this; the
 * whole-paper overlay prints `AgreementPartsBody`, which is a map over this.
 * One code path, two framings — a third renderer would be the drift R27 and
 * N-1 exist to forbid.
 *
 * `attachmentLetter` is the caller's, derived from the part's position among
 * the VISIBLE attachments, so lettering never restarts at "A" when a part is
 * printed on its own. `headless` is for a caller whose own head already
 * carries the title (FS-7) — the section then prints no heading of its own.
 */
export function AgreementPartSection({
  part,
  currency,
  turnkey = false,
  attachmentLetter,
  headless = false,
}: {
  part: AgreementPart;
  currency: string;
  turnkey?: boolean;
  attachmentLetter?: string;
  headless?: boolean;
}): React.ReactNode | null {
  if (part.kind === "attachment") {
    return <AttachmentLeaf part={part} letter={attachmentLetter ?? "A"} />;
  }
  const body = renderPartBody(part, currency, turnkey);
  const isBasis = ridesWithScheduleOfValues(part, turnkey);
  if (body === null && !isBasis) return null;
  return (
    <>
      {body !== null && (
        <section data-part-key={part.partKey}>
          {!headless && <PartHeading>{part.title}</PartHeading>}
          {body}
        </section>
      )}
      {isBasis && <ScheduleOfValuesSection part={part} currency={currency} />}
    </>
  );
}

export function AgreementPartsBody({
  parts,
  currency,
  turnkey = false,
}: {
  parts: AgreementPart[];
  currency: string;
  /** W3R1-04 — the document is a `design_build` prime, so its three money
   *  parts draw the paper the homeowner reads rather than one recorded line
   *  apiece, and the schedule of values hangs off the pricing basis. */
  turnkey?: boolean;
}) {
  const visible = parts
    .filter((part) => part.clientVisible !== false)
    // R10 — an attestation is the studio's credential, never the client's
    // reading. Skipped defensively; W1 writes none.
    .filter((part) => part.kind !== "attestation")
    .slice()
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

  const sections = visible.filter((part) => part.kind !== "attachment");
  const attachments = visible.filter((part) => part.kind === "attachment");

  return (
    <>
      {sections.map((part) => (
        <Fragment key={part.id}>
          <AgreementPartSection
            part={part}
            currency={currency}
            turnkey={turnkey}
          />
        </Fragment>
      ))}
      {attachments.map((part, index) => (
        <AgreementPartSection
          key={part.id}
          part={part}
          currency={currency}
          turnkey={turnkey}
          attachmentLetter={String.fromCharCode(65 + index)}
        />
      ))}
    </>
  );
}
