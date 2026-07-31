import type { Metadata } from "next";

import {
  resolveSpecBookShare,
  type SpecBookAudience,
  type SpecBookShare,
} from "./spec-book-share";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared Spec Book · Patina",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const AUDIENCE_LABELS: Record<SpecBookAudience, string> = {
  client: "Client edition",
  vendor: "Vendor edition",
  installer: "Installer edition",
  internal: "Internal edition",
  care: "Care edition",
};

function formatBytes(value: number | null): string {
  if (value === null) return "PDF";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function DeadLink() {
  return (
    <main
      className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center"
      data-testid="spec-book-dead-link"
    >
      <p className="type-meta">Patina · Spec Book</p>
      <h1 className="type-page-title mt-3">This link isn’t available</h1>
      <p className="type-body-small mt-3 text-[var(--text-muted)]">
        The share link may have expired or been turned off. Ask the studio for a
        fresh link.
      </p>
    </main>
  );
}

function SpecBookShareView({
  token,
  share,
}: {
  token: string;
  share: SpecBookShare;
}) {
  const baseDownloadPath = `/field/spec-book/${token}/download`;
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-10 sm:px-8">
      <header className="border-b border-[var(--border-subtle)] pb-7">
        <p className="type-meta">Patina · Shared Spec Book</p>
        <h1 className="type-page-title mt-3">{share.title}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="type-body-small rounded-full bg-[var(--color-pearl)] px-3 py-1">
            {AUDIENCE_LABELS[share.audience]}
          </span>
          <span className="type-body-small text-[var(--text-muted)]">
            Issued{" "}
            {new Intl.DateTimeFormat("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(share.issuedAt))}
          </span>
        </div>
      </header>

      <section className="py-8" aria-labelledby="shared-document-heading">
        <h2 id="shared-document-heading" className="type-section-title">
          View-only document
        </h2>
        <p className="type-body mt-2 max-w-xl text-[var(--text-muted)]">
          This immutable PDF is the issued{" "}
          {AUDIENCE_LABELS[share.audience].toLowerCase()}. Updates require a
          newly issued revision from the studio.
        </p>

        <div className="mt-6 border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="type-body font-medium">{share.title}</p>
              <p className="type-body-small mt-1 text-[var(--text-muted)]">
                PDF · {formatBytes(share.sizeBytes)}
              </p>
              {share.label && (
                <p className="type-body-small mt-1 text-[var(--text-muted)]">
                  {share.label}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                className="type-body-small inline-flex min-h-11 items-center justify-center border border-[var(--border-strong)] px-4 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                href={baseDownloadPath}
                target="_blank"
                rel="noopener noreferrer"
              >
                View PDF
              </a>
              <a
                className="type-body-small inline-flex min-h-11 items-center justify-center bg-[var(--text-primary)] px-4 py-2 text-[var(--bg-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                href={`${baseDownloadPath}?download=1`}
              >
                Download PDF
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default async function SpecBookSharePage({
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

  const share = await resolveSpecBookShare(token);
  if (!share) return <DeadLink />;
  return <SpecBookShareView token={token} share={share} />;
}
