"use client";

import {
  buildServiceAgreementPreview,
  commercialStatusView,
  type CommercialDocument,
  type CommercialSignature,
  type ServiceAgreementTerms,
  type ServiceRate,
} from "@/lib/document/commercial-documents";

const cadenceLabel = {
  monthly: "Monthly",
  biweekly: "Every two weeks",
  milestone: "At named milestones",
};

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);

function AgreementHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 font-heading text-[1.05rem] italic text-[var(--color-charcoal)]">
      {children}
    </h3>
  );
}

export function ServiceAgreementPreview({
  document,
  terms,
  rates,
  signatures,
  clientName,
  compact = false,
}: {
  document: CommercialDocument;
  terms: ServiceAgreementTerms;
  rates: ServiceRate[];
  signatures: CommercialSignature[];
  clientName?: string;
  compact?: boolean;
}) {
  const preview = buildServiceAgreementPreview({
    document,
    terms,
    rates,
    signatures,
  });
  const status = commercialStatusView(preview.state);

  return (
    <article
      aria-label="Design services agreement client copy"
      className={compact ? "space-y-5" : "mx-auto max-w-[720px] space-y-7"}
    >
      <header className="border-b border-[var(--doc-ink-border)] pb-4">
        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--color-clay)]">
          Design services agreement · v{preview.version}
        </p>
        <h2 className="mt-1 font-heading text-[1.65rem] leading-tight text-[var(--color-charcoal)]">
          {preview.title}
        </h2>
        {clientName && (
          <p className="mt-1 text-[12px] text-[var(--color-mocha)]">
            Prepared for {clientName}
          </p>
        )}
        <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          {status.label}
        </p>
      </header>

      <section>
        <AgreementHeading>Services</AgreementHeading>
        <p className="whitespace-pre-wrap text-[12.5px] leading-[1.75] text-[var(--text-body)]">
          {preview.scope || "Services have not been written yet."}
        </p>
      </section>

      {preview.deliverables.length > 0 && (
        <section>
          <AgreementHeading>What you will receive</AgreementHeading>
          <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-[var(--text-body)]">
            {preview.deliverables.map((item) => (
              <li
                key={item}
                className="border-l-2 border-[var(--color-sage)] pl-3"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {preview.exclusions.length > 0 && (
        <section className="border-l-2 border-[var(--color-aged-oak)] pl-4">
          <AgreementHeading>Not included</AgreementHeading>
          <ul className="space-y-1 text-[12px] text-[var(--color-mocha)]">
            {preview.exclusions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <AgreementHeading>How design time is billed</AgreementHeading>
        <div className="divide-y divide-[var(--doc-ink-border)] border-y border-[var(--doc-ink-border)]">
          {preview.rates.map((rate) => (
            <div
              key={rate.roleName}
              className="flex items-baseline justify-between gap-4 py-2"
            >
              <span className="text-[12px] text-[var(--text-body)]">
                {rate.roleName}
              </span>
              <strong className="font-mono text-[11px] font-medium text-[var(--color-charcoal)]">
                {money(rate.hourlyRateCents, preview.currency)} / hr
              </strong>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-4 rounded-[4px] bg-[rgba(229,221,208,0.45)] px-3 py-2.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Design authorization ceiling
          </span>
          <strong className="font-heading text-[1.05rem] text-[var(--color-charcoal)]">
            {money(preview.billingCeilingCents, preview.currency)}
          </strong>
        </div>
      </section>

      <section className="grid gap-3 border-y border-[var(--doc-ink-border)] py-4 sm:grid-cols-2">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Retainer
          </p>
          <p className="mt-1 text-[12.5px] text-[var(--color-charcoal)]">
            {money(preview.retainerAmountCents, preview.currency)}
            {preview.retainerActivationPolicy === "retainer_paid"
              ? " · work begins when paid"
              : " · agreement activates immediately"}
          </p>
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Billing cadence
          </p>
          <p className="mt-1 text-[12.5px] text-[var(--color-charcoal)]">
            {cadenceLabel[preview.billingCadence]}
          </p>
        </div>
      </section>

      <section>
        <AgreementHeading>Agreement terms</AgreementHeading>
        <p className="whitespace-pre-wrap text-[11.5px] leading-[1.75] text-[var(--color-mocha)]">
          {preview.terms || "Terms have not been written yet."}
        </p>
      </section>

      <section
        aria-label="Agreement signatures"
        className="grid gap-3 pt-2 sm:grid-cols-2"
      >
        {(["client", "studio"] as const).map((party) => {
          const signature = preview.signatures.find(
            (item) => item.party === party,
          );
          return (
            <div
              key={party}
              className="border-t border-[var(--doc-ink-border)] pt-2"
            >
              <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                {party === "client" ? "Client" : "Studio"} signature
              </p>
              <p className="mt-1 text-[12px] text-[var(--color-charcoal)]">
                {signature?.signerName || "Awaiting"}
              </p>
            </div>
          );
        })}
      </section>

      <p className="border-t border-[var(--doc-ink-border)] pt-3 text-[10.5px] italic leading-relaxed text-[var(--text-muted)]">
        Furnishings, freight, tax, installation, and permission to purchase are
        outside this design services agreement.
      </p>
    </article>
  );
}
