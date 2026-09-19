import { createAdminClient } from '@patina/supabase/client';

import { LetterShell, type LetterSnapshotView } from '@/components/letter/letter-shell';
import { OpenLetterForm } from '@/components/letter/OpenLetterForm';
import { StaleLetterForm } from '@/components/letter/StaleLetterForm';

import { CapabilityLetterForm } from './CapabilityLetterForm';

const CLIENT_PORTAL_URL =
  process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL ?? 'https://client.patina.cloud';

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

const SNAPSHOT_COLUMNS = [
  'id', 'token', 'email', 'kind', 'recipient_name', 'studio_name',
  'studio_logo_url', 'signature_city', 'designer_full_name',
  'designer_given_name', 'project_name', 'rendered_standing_sentence',
  'personal_message', 'sent_at', 'expires_at', 'accepted_at', 'revoked_at',
  'superseded_by',
].join(', ');

/**
 * ONE READ. Everything the page prints comes from the snapshot frozen at send —
 * no profiles lookup, no projects lookup, no resolve_studio_identity. That is
 * what makes the email and the page say the same words on the same day and a
 * month later, whatever the studio has renamed itself to since.
 */
async function loadSnapshot(token: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from('client_invitations')
    .select(SNAPSHOT_COLUMNS)
    .eq('token', token)
    .maybeSingle();
  return data ?? null;
}

/**
 * P21 — THE SECOND DOOR ONTO THE SAME LETTER. A homeowner reached by text holds
 * no plaintext token: `client_links` stores only a sha256 of hers, so the row
 * cannot be found by looking for the token at all. `resolve_client_link` is the
 * one thing that can answer — it hashes what she holds, refuses a revoked,
 * superseded or lapsed capability, and hands back the invitation id.
 *
 * ONE LETTER, NOT TWO. What comes back is the SAME `client_invitations` row the
 * email token resolves to, read through the same columns, so the words she is
 * shown are the words frozen at send — not a second rendering of them.
 *
 * This resolve stamps `last_used_at` and writes a `client_link_uses` row, and
 * it does so on GET. That is deliberate: a capability is not single-use (there
 * is no session to burn and she may open her letter again tomorrow), and on a
 * consent-sensitive rail the record of every open is worth having.
 */
async function loadByCapability(token: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin.rpc('resolve_client_link', {
    p_token: token,
    p_action: 'open',
    p_source: 'client_portal',
  });
  if (error) return null;
  const invitationId = (data as { invitation_id?: string } | null)?.invitation_id;
  if (!invitationId) return null;

  const { data: row } = await admin
    .from('client_invitations')
    .select(SNAPSHOT_COLUMNS)
    .eq('id', invitationId)
    .maybeSingle();
  return row ?? null;
}

// The clock is read here rather than in the component body: this page renders
// once per request, and `react-hooks/purity` bans a clock read during render.
function hasLapsed(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() < Date.now();
}

function toView(row: Record<string, unknown>): LetterSnapshotView {
  return {
    kind: row.kind === 'notice' ? 'notice' : 'invite',
    recipientName: (row.recipient_name as string | null) ?? null,
    studioName: (row.studio_name as string | null) ?? null,
    studioLogoUrl: (row.studio_logo_url as string | null) ?? null,
    signatureCity: (row.signature_city as string | null) ?? null,
    // NO PLACEHOLDER, and above all no guessed pronoun: a snapshot with no name
    // on it is a letter the studio authored, and LetterShell degrades to that.
    designerFullName: (row.designer_full_name as string | null) ?? null,
    designerGivenName: (row.designer_given_name as string | null) ?? null,
    projectName: (row.project_name as string | null) ?? null,
    standingSentence: (row.rendered_standing_sentence as string | null) ?? '',
    personalMessage: (row.personal_message as string | null) ?? null,
    sentAt: (row.sent_at as string) ?? new Date().toISOString(),
    expiresAt: (row.expires_at as string) ?? new Date().toISOString(),
  };
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  // The mailed token is tried FIRST and unchanged, so every email letter takes
  // exactly the path it takes today and costs exactly one read.
  let row = await loadSnapshot(token);
  let byCapability = false;
  if (!row) {
    row = await loadByCapability(token);
    byCapability = !!row;
  }

  // An unknown, revoked, or superseded token says exactly what a lapsed one
  // says. The page never confirms whether a token was ever real.
  if (!row || row.revoked_at || row.superseded_by) {
    return <StalePage token={token} />;
  }

  const view = toView(row as Record<string, unknown>);
  const label = view.projectName?.trim() ? 'Open the project' : 'Open the page';

  // R13 — a notice has nothing to accept: the button is a plain link home.
  if (view.kind === 'notice') {
    return (
      <LetterShell snapshot={view}>
        <a
          href={`${CLIENT_PORTAL_URL}/`}
          className="inline-flex min-h-11 items-center rounded-[7px] border border-[#8A6A30] bg-[#B08A46] px-8 py-3.5 text-[15px] font-semibold text-[#F5F0E6]"
        >
          {label}
        </a>
      </LetterShell>
    );
  }

  // NOT ON THE CAPABILITY PATH. Opening the email letter mints a session and
  // burns the token, so a second visit can only be told it is spent. A
  // capability mints nothing, lives its own 90 days, and may be opened again -
  // dead-ending her on "already opened" would take her letter away from her
  // for no reason.
  if (!byCapability && row.accepted_at) {
    return (
      <LetterShell snapshot={view}>
        <div>
          <p className="font-heading text-[1.15rem]">This letter has already been opened.</p>
          <a
            href="/auth/signin"
            className="mt-4 inline-flex min-h-11 items-center text-[15px] font-semibold underline underline-offset-4"
          >
            Sign in
          </a>
        </div>
      </LetterShell>
    );
  }

  // Likewise: `expires_at` is the MAILED token's seven days. A capability
  // carries its own life, and `resolve_client_link` already refused it above if
  // that life had run out.
  if (!byCapability && hasLapsed(row.expires_at as string)) {
    return (
      <LetterShell snapshot={view}>
        <StaleLetterForm token={token} />
      </LetterShell>
    );
  }

  return (
    <LetterShell snapshot={view}>
      {byCapability ? (
        <CapabilityLetterForm token={token} />
      ) : (
        <OpenLetterForm token={token} label={label} />
      )}
    </LetterShell>
  );
}

/**
 * A token with no snapshot to print. The letterhead cannot be honest here, so
 * the page is bare — it still never says "Welcome to Patina", and it still
 * offers the one tap.
 */
function StalePage({ token }: { token: string }) {
  return (
    <main className="mx-auto min-h-screen max-w-[46rem] bg-[#F5F0E6] px-6 py-16 text-[#1F1B16]">
      <StaleLetterForm token={token} />
    </main>
  );
}
