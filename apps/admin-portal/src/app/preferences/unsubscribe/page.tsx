import Link from 'next/link';
import { applyUnsubscribeToken, type UnsubscribeOutcome } from '@patina/notifications';
import { getServiceClient } from '@/lib/admin-api';

interface PageProps {
  searchParams: Promise<{ token?: string; status?: string; type?: string }>;
}

export const dynamic = 'force-dynamic';

export default async function UnsubscribePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = params.token ?? '';

  // If we arrived directly (no status query), apply the token now.
  let outcome: UnsubscribeOutcome;
  if (params.status && (params.status === 'applied' || params.status === 'expired' || params.status === 'invalid' || params.status === 'malformed')) {
    outcome = {
      ok: params.status === 'applied',
      status: params.status as UnsubscribeOutcome['status'],
      type: params.type as UnsubscribeOutcome['type'],
    };
  } else if (!token) {
    outcome = { ok: false, status: 'malformed' };
  } else {
    const supabase = getServiceClient();
    outcome = await applyUnsubscribeToken(supabase, token);
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.brandHeader}>
          <span style={styles.brandMark}>PATINA</span>
        </div>
        <div style={styles.body}>
          {outcome.ok ? (
            <>
              <h1 style={styles.heading}>You&rsquo;ve been unsubscribed</h1>
              <p style={styles.text}>
                {outcome.type === 'all_marketing'
                  ? "We've turned off all marketing emails to your address. You'll still receive essential account notifications (receipts, security alerts)."
                  : `We've unsubscribed you from ${humanizeType(outcome.type)} emails.`}
              </p>
              <p style={styles.text}>
                Change your mind? Manage all preferences in your account.
              </p>
              <Link href="/" style={styles.button}>
                Manage Preferences
              </Link>
            </>
          ) : (
            <>
              <h1 style={styles.heading}>We couldn&rsquo;t complete that</h1>
              <p style={styles.text}>{errorCopy(outcome.status)}</p>
              <p style={styles.text}>
                You can always log in and update your preferences directly.
              </p>
              <Link href="/" style={styles.button}>
                Sign in to manage preferences
              </Link>
            </>
          )}
        </div>
        <div style={styles.footer}>
          <p style={styles.footerText}>Patina — hello@patina.cloud</p>
        </div>
      </div>
    </main>
  );
}

function humanizeType(type: string | undefined): string {
  if (!type) return 'these';
  return type
    .replace(/_/g, ' ')
    .replace(/\bcampaign\b/gi, '')
    .trim();
}

function errorCopy(status: string): string {
  switch (status) {
    case 'expired':
      return 'This unsubscribe link has expired. They stay valid for 72 hours after sending.';
    case 'invalid':
      return 'This link is invalid or was tampered with. Please try the link in your most recent email.';
    case 'malformed':
      return 'The link is missing required information.';
    case 'error':
      return 'Something went wrong on our side. Please try again in a few minutes.';
    default:
      return 'Something unexpected happened.';
  }
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#F5F1ED',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    maxWidth: '600px',
    width: '100%',
    background: '#FFFFFF',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  brandHeader: {
    background: '#3C3226',
    padding: '28px 40px',
    textAlign: 'center' as const,
  },
  brandMark: {
    fontFamily: '"Playfair Display", Georgia, serif',
    fontSize: '22px',
    fontWeight: 600,
    color: '#FAF7F2',
    letterSpacing: '1.5px',
  },
  body: {
    padding: '40px',
  },
  heading: {
    color: '#2C2926',
    fontFamily: '"Playfair Display", Georgia, serif',
    fontSize: '26px',
    fontWeight: 600,
    margin: '0 0 16px',
  },
  text: {
    color: '#4A453F',
    fontSize: '15px',
    lineHeight: '24px',
    margin: '0 0 16px',
  },
  button: {
    display: 'inline-block',
    background: '#A3927C',
    color: '#FFFFFF',
    padding: '14px 36px',
    borderRadius: '100px',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '0.5px',
    marginTop: '8px',
  },
  footer: {
    background: '#2C2926',
    padding: '24px 40px',
    textAlign: 'center' as const,
  },
  footerText: {
    color: '#A09890',
    fontSize: '13px',
    margin: 0,
  },
};
