import type { InvoiceLinkSettling, InvoiceLinkWithdrawn } from "./invoice-link";

/* ── THE SHEETS WITH NO ACT ──────────────────────────────────────────────────
   Three terminal answers, one family.

   THE DEAD LINK has no letterhead. No studio name, no amount, no invoice
   number — nothing that tells a stranger holding a guessed token whether it was
   void, revoked, or never existed. One sheet, one sentence (S2).

   THE SETTLING SHEET (M10) is the exception that earns its keep: a guest who
   was charged real money seconds before the studio voided the invoice would
   otherwise be told "this link is no longer good," with no receipt and no
   address to write to. Letterhead, invoice number, one sentence, the studio's
   contact. No amounts, no chooser, no act.

   THE WITHDRAWN SHEET (K5) is the same shape for a closed link with nothing in
   flight: the invoice was withdrawn, and the sheet says so in the studio's own
   name rather than pretending the address never existed. ────────────────── */

export function DeadLink() {
  return (
    <div className="flex justify-center px-5 pb-[120px] pt-10">
      <section
        className="w-full max-w-[560px] border border-[var(--border-subtle)] px-8 py-14 text-center"
        aria-labelledby="pay-dead-head"
        data-testid="pay-dead-link"
      >
        <h1 id="pay-dead-head" className="sr-only">
          This link is no longer good
        </h1>
        <p className="text-[17px] leading-[1.7] text-[var(--text-body)]">
          This link is no longer good. If you were sent an invoice, ask the
          studio for a fresh link.
        </p>
      </section>
    </div>
  );
}

function Letterhead({
  studioName,
  designerName,
  website,
}: {
  studioName: string;
  designerName: string | null;
  website: string | null;
}) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5 border-b border-[var(--border-default)] pb-[18px]">
      <div className="min-w-0">
        <div className="font-heading text-[25px] font-medium leading-[1.15] text-[var(--text-primary)]">
          {studioName}
        </div>
        {designerName && (
          <div className="font-mono text-[12px] leading-[1.5] text-[var(--text-muted)]">
            prepared by {designerName}
          </div>
        )}
      </div>
      {website && (
        <div className="font-mono text-[12px] text-[var(--color-quiet-ink)]">
          {website}
        </div>
      )}
    </header>
  );
}

function TerminalSheet({
  studioName,
  designerName,
  website,
  heading,
  sentence,
  quiet,
  testId,
}: {
  studioName: string;
  designerName: string | null;
  website: string | null;
  heading: string;
  sentence: string;
  quiet: string;
  testId: string;
}) {
  return (
    <div className="flex justify-center px-5 pb-[120px] pt-10">
      <main
        className="flex w-full max-w-[1060px] flex-col gap-7 border border-[var(--border-subtle)] px-8 pb-9 pt-10 min-[920px]:px-11"
        data-testid={testId}
      >
        <Letterhead
          studioName={studioName}
          designerName={designerName}
          website={website}
        />

        <section className="flex max-w-[52ch] flex-col gap-3.5">
          <h1 className="type-section-head">{heading}</h1>
          <p className="text-[16.5px] leading-[1.65] text-[var(--text-body)]">
            {sentence}
          </p>
          {quiet && (
            <p className="text-[13px] leading-[1.55] text-[var(--color-quiet-ink)]">
              {quiet}
            </p>
          )}
        </section>

        <footer className="border-t border-[var(--border-default)] pt-[18px] font-mono text-[11.5px] tracking-[0.03em] text-[var(--color-quiet-ink)]">
          Prepared by {studioName} · Sent through Patina
        </footer>
      </main>
    </div>
  );
}

function quietContact(
  parts: Array<string | null | undefined>,
  tail: string,
): string {
  return [...parts.filter((part): part is string => !!part?.trim()), tail].join(
    " · ",
  );
}

export function SettlingSheet({ payload }: { payload: InvoiceLinkSettling }) {
  const studioName = payload.studio.name?.trim() || "the studio";
  const designerName = payload.designer_display_name?.trim() || null;
  const heading = payload.invoice.number
    ? `Invoice No. ${payload.invoice.number}`
    : "Invoice";
  return (
    <TerminalSheet
      studioName={studioName}
      designerName={designerName}
      website={payload.studio.website}
      heading={heading}
      sentence={`A payment on this invoice is being sorted out by ${studioName}.`}
      quiet={quietContact(
        [designerName, payload.studio.website],
        "There is nothing to pay here in the meantime.",
      )}
      testId="pay-settling-sheet"
    />
  );
}

export function WithdrawnSheet({ payload }: { payload: InvoiceLinkWithdrawn }) {
  const studioName = payload.studio.name?.trim() || "the studio";
  const designerName =
    payload.designer_display_name?.trim() ||
    payload.contact?.name?.trim() ||
    null;
  const website = payload.studio.website ?? payload.contact?.website ?? null;
  const heading = payload.invoice.number
    ? `Invoice No. ${payload.invoice.number}`
    : "Invoice";
  return (
    <TerminalSheet
      studioName={studioName}
      designerName={designerName}
      website={website}
      heading={heading}
      sentence={`${heading} was withdrawn by ${studioName}.`}
      quiet={quietContact(
        [designerName, website],
        "There is nothing to pay here.",
      )}
      testId="pay-withdrawn-sheet"
    />
  );
}
