import Link from 'next/link';

export default function ManufacturerHome() {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '1.6rem',
          margin: 0,
        }}
      >
        Welcome to Patina.
      </h1>
      <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: '#5C4A3C' }}>
        A designer nominated your studio to the Patina Catalog. We&rsquo;ll walk
        you through the short onboarding flow — your trade terms, your lead
        times, and the photos you&rsquo;d like represented — so designers
        across the platform can specify your work without you chasing each
        one.
      </p>
      <Link
        href="/onboarding"
        style={{
          alignSelf: 'flex-start',
          padding: '10px 18px',
          borderRadius: 4,
          background: '#C4A57B',
          color: '#FFFFFF',
          textDecoration: 'none',
          fontFamily: "'DM Mono', ui-monospace, monospace",
          fontSize: '0.72rem',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        Start onboarding
      </Link>
      <p
        style={{
          fontSize: '0.78rem',
          color: '#8B7355',
          marginTop: 24,
          paddingTop: 12,
          borderTop: '1px solid #E5E2DD',
        }}
      >
        Questions? Reach out at{' '}
        <a href="mailto:hello@patina.cloud" style={{ color: '#C4A57B' }}>
          hello@patina.cloud
        </a>
        .
      </p>
    </section>
  );
}
