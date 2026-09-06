"use client";

/**
 * The client's copy, rendered from the parts — designer side.
 *
 * One spec, two implementations: this file and
 * `apps/client-portal/src/components/agreement-parts-body.tsx` render the same
 * table (build sheet §4.5 / §5.2) in their own registers. If you change a
 * sentence here, change it there — the two surfaces are the same instrument
 * seen from two chairs, and a drift between them is a drift in the agreement.
 *
 * What this file does NOT render: the header, the signature block, and the
 * closing "Furnishings, freight, tax…" notice. Those are the Core, they live
 * in `service-agreement-preview.tsx`, and they are the same on both paths.
 */

import type { AgreementPart } from "@patina/types";
import {
  partKindLabel,
  readBody,
  readCents,
  readItems,
  readPhases,
  readRoles,
} from "../rooms/drafting/agreement/part-kinds";

const CADENCE_LABELS: Record<string, string> = {
  monthly: "Monthly",
  biweekly: "Every two weeks",
  milestone: "At named milestones",
  per_draw: "At each draw",
};

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

/**
 * A plain function, not a component, on purpose: the caller needs to know
 * whether there IS a body before it prints the heading, and a JSX element is
 * truthy even when the component inside returns null. A part with nothing
 * written in it renders nothing at all — never a bare heading.
 */
function renderPartBody(
  part: AgreementPart,
  currency: string,
): React.ReactNode | null {
  const payload = part.payload ?? {};

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
    return <MutedLine>Recorded with this agreement.</MutedLine>;
  }

  switch (part.variant) {
    case "rate_card": {
      const roles = readRoles(payload)
        .filter((role) => role.roleName.trim())
        .sort((a, b) => a.sortOrder - b.sortOrder);
      if (roles.length === 0) return null;
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
            No ceiling — professional time is billed as it is worked.
          </p>
        );
      }
      return (
        <p className="font-heading text-[1.05rem] text-[var(--color-charcoal)]">
          {money(cents, currency)}
        </p>
      );
    }

    case "retainer": {
      const cents = readCents(payload.cents);
      if (cents === null) return null;
      return (
        <p className="text-[12.5px] text-[var(--color-charcoal)]">
          {money(cents, currency)}
          {payload.activationPolicy === "retainer_paid"
            ? " · work begins when paid"
            : " · agreement activates immediately"}
        </p>
      );
    }

    case "cadence": {
      const cadence =
        typeof payload.cadence === "string" ? payload.cadence : "";
      if (!cadence) return null;
      return (
        <p className="text-[12.5px] text-[var(--color-charcoal)]">
          {CADENCE_LABELS[cadence] ?? cadence}. Additional work requires written
          authorization before it can be invoiced.
        </p>
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
      if (percent === null && extras.length === 0) return null;
      return (
        <div className="space-y-1 text-[12.5px] text-[var(--color-charcoal)]">
          {percent !== null && (
            <p>{percent}% deposit on each furnishings authorization</p>
          )}
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
      if (cents === null) return null;
      return (
        <p className="font-heading text-[1.05rem] text-[var(--color-charcoal)]">
          {money(cents, currency)}
        </p>
      );
    }

    case "per_phase": {
      const phases = readPhases(payload).filter((phase) => phase.label.trim());
      if (phases.length === 0) return null;
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
      return (
        <MutedLine>
          Recorded with this agreement ·{" "}
          {partKindLabel(part.kind, part.variant)}
        </MutedLine>
      );
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
          I received this
        </p>
      )}
    </section>
  );
}

export function AgreementPartsBody({
  parts,
  currency,
}: {
  parts: AgreementPart[];
  currency: string;
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
      {sections.map((part) => {
        const body = renderPartBody(part, currency);
        if (body === null) return null;
        return (
          <section key={part.id}>
            <PartHeading>{part.title}</PartHeading>
            {body}
          </section>
        );
      })}
      {attachments.map((part, index) => (
        <AttachmentLeaf
          key={part.id}
          part={part}
          letter={String.fromCharCode(65 + index)}
        />
      ))}
    </>
  );
}
