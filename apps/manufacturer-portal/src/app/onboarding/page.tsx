interface OnboardingPageProps {
  searchParams: Promise<{ nomination?: string }>;
}

/**
 * Manufacturer onboarding entry. v1 is a placeholder shown when a
 * manufacturer follows the email CTA from the S3.7 outreach template.
 * `?nomination=<id>` carries the originating vendor_nominations.id so
 * the (deferred) full flow can scope the experience.
 *
 * The actual onboarding form — trade terms, lead times, catalog
 * product entry, photo gallery — ships in a dedicated post-Sprint-3
 * session. Until then the page is a holding pattern so the email
 * link doesn't 404.
 */
export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const params = await searchParams;
  const nominationId = params?.nomination ?? null;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <h1
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '1.4rem',
          margin: 0,
        }}
      >
        Onboarding flow coming soon
      </h1>
      <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: '#5C4A3C' }}>
        We&rsquo;re finishing the onboarding experience and will follow up by
        email when it&rsquo;s ready. No action needed from you right now.
      </p>
      {nominationId && (
        <div
          style={{
            padding: '10px 14px',
            border: '1px solid #E5E2DD',
            borderRadius: 4,
            background: '#FFFFFF',
            fontFamily: "'DM Mono', ui-monospace, monospace",
            fontSize: '0.7rem',
            color: '#8B7355',
            letterSpacing: '0.04em',
          }}
        >
          Nomination reference: <strong>{nominationId.slice(0, 8)}…</strong>
        </div>
      )}
      <p style={{ fontSize: '0.78rem', color: '#8B7355' }}>
        Questions in the meantime?{' '}
        <a href="mailto:hello@patina.cloud" style={{ color: '#C4A57B' }}>
          hello@patina.cloud
        </a>
        .
      </p>
    </section>
  );
}
