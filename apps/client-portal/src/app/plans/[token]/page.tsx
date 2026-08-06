import type { Metadata } from "next";

import {
  resolvePlanTransmittal,
  type ResolvedPlanTransmittal,
} from "./plan-transmittal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared Drawings · Patina",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const longDate = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatLongDate(value: string): string {
  return longDate.format(new Date(value));
}

function DeadLink() {
  return (
    <main
      className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center"
      data-testid="plans-dead-link"
    >
      <p className="type-meta">Patina · Shared Drawings</p>
      <h1 className="type-page-title mt-3">This link isn’t available</h1>
      <p className="type-body-small mt-3 text-[var(--text-muted)]">
        The share link may have expired or been turned off. Ask the studio for a
        fresh link.
      </p>
    </main>
  );
}

function PlanTransmittalView({
  token,
  transmittal,
}: {
  token: string;
  transmittal: ResolvedPlanTransmittal;
}) {
  const sheetCount = transmittal.sheets.length;
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-10 sm:px-8">
      {!transmittal.isCurrentSet && (
        <div
          className="mb-8 border-l-4 border-[var(--color-amber,#B8860B)] bg-[var(--color-amber-soft,#FBF3E2)] px-4 py-3"
          data-testid="plans-superseded-band"
        >
          {/* isCurrentSet=false also covers a re-filed sheet with NO newer
              issue, so the copy never asserts one; the issued date rides
              along only when the resolver names a superseding issue. */}
          <p className="type-body-small text-[var(--text-primary)]">
            The set has moved since this was sent — you are viewing the set you
            were sent.
            {transmittal.supersededAt
              ? ` A newer issue went out ${formatLongDate(transmittal.supersededAt)}.`
              : ""}
          </p>
        </div>
      )}

      <header className="border-b border-[var(--border-subtle)] pb-7">
        <p className="type-meta">Patina · Shared Drawings</p>
        <h1 className="type-page-title mt-3">
          {transmittal.recipientCompany ?? transmittal.recipientName}
        </h1>
        <p className="type-body mt-4 max-w-xl">
          You were sent{" "}
          <strong>
            {transmittal.issueName} for {transmittal.purpose} on{" "}
            {formatLongDate(transmittal.sentAt)}
          </strong>{" "}
          by {transmittal.studioName}.
        </p>
        <p className="type-body-small mt-3 font-mono text-[var(--text-muted)]">
          {transmittal.projectLabel} · {transmittal.issueName} · {sheetCount}{" "}
          {sheetCount === 1 ? "sheet" : "sheets"}
        </p>
      </header>

      <section className="py-8" aria-labelledby="shared-sheets-heading">
        <h2 id="shared-sheets-heading" className="type-section-title">
          Sheets in this set
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-0">
          {transmittal.sheets.map((sheet) => (
            <div
              key={sheet.printId}
              className="grid grid-cols-[auto_1fr_auto] items-baseline gap-4 border-b border-[var(--border-subtle)] py-4"
            >
              <span
                aria-label={`Revision ${sheet.revLetter}`}
                className="type-body-small inline-flex min-w-8 items-center justify-center border border-[var(--border-strong)] px-1.5 py-0.5 font-mono"
              >
                {sheet.revLetter}
              </span>
              <div className="min-w-0">
                <p className="type-meta font-mono text-[var(--text-muted)]">
                  {sheet.number}
                </p>
                <p className="type-body font-medium">{sheet.title}</p>
                <p className="type-body-small mt-0.5 text-[var(--text-muted)]">
                  Rev {sheet.revLetter} · {formatLongDate(sheet.revDate)}
                </p>
              </div>
              <a
                className="type-body-small inline-flex min-h-11 items-center justify-center border border-[var(--border-strong)] px-4 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                href={`/plans/${token}/print/${sheet.printId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open
              </a>
            </div>
          ))}
        </div>
      </section>

      {transmittal.isCurrentSet && (
        <footer className="border-t border-[var(--border-subtle)] pt-6">
          <p className="type-body-small text-[var(--text-muted)]">
            This set is current as of today.
          </p>
        </footer>
      )}
    </main>
  );
}

export default async function PlanTransmittalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ unavailable?: string }>;
}) {
  const { token } = await params;
  const query: { unavailable?: string } = searchParams
    ? await searchParams
    : {};
  if (query.unavailable === "1") return <DeadLink />;

  const transmittal = await resolvePlanTransmittal(token);
  if (!transmittal) return <DeadLink />;
  return <PlanTransmittalView token={token} transmittal={transmittal} />;
}
