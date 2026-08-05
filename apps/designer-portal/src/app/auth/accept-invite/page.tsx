'use client';

/**
 * Workspace invite acceptance landing page. NOT flag-gated — invite emails
 * must always work regardless of the studio-workspaces pilot flag, since a
 * teammate can be invited weeks before the inviting studio opts into any UI
 * rollout wrinkle.
 *
 * The invite edge function (workspace-member-invite, 00296) sends a mint/
 * magic link whose redirectTo points at
 * `/auth/callback?next=/auth/accept-invite?token=…` — the callback page
 * exchanges the code for a session and redirects here, so by the time this
 * page mounts a session USUALLY already exists. We still poll briefly
 * (mirrors auth/callback/page.tsx's fragment-flow poll) to absorb any race
 * between the redirect landing and supabase-js finishing its client-side
 * session hydration.
 *
 * Deliberately the passwordless invite model, not the client-portal
 * password-setup model — GoTrue's invite link already signs the browser in;
 * asking for a password here would trip prod's email-confirm requirement
 * for a user who never set one.
 */

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient, useAcceptInvitation } from '@patina/supabase';
import { PortalAuthSuccess } from '@patina/design-system';
import { StrataSweep } from '@/components/ui/strata-sweep';
import { studioEvents } from '@/lib/analytics/studio-events';
import { DesignerAuthShell } from '../auth-shell';

type Status = 'polling' | 'accepting' | 'success' | 'error';

const SESSION_POLL_INTERVAL_MS = 300;
const SESSION_POLL_TIMEOUT_MS = 5000;

/** Map the RPC's exception codes to copy a teammate can act on. The RPC
 *  (accept_workspace_invitation, 00295) deliberately collapses "not found",
 *  "expired", and "not yours" into one `invitation_invalid_or_expired` code
 *  so an attacker probing tokens can't distinguish those cases. */
function friendlyInviteError(error: unknown): string {
  const message = error instanceof Error ? error.message : undefined;
  switch (message) {
    case 'invitation_invalid_or_expired':
      return 'This invite link is invalid or has expired. Ask your studio admin to resend it.';
    case 'not_authenticated':
      return "We couldn't verify your sign-in. Try opening the invite link again.";
    case 'invalid_token':
      return 'This invite link is missing its token. Ask your studio admin to resend it.';
    default:
      return 'This invitation could not be accepted. Ask your studio admin to resend it, or contact Patina support.';
  }
}

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const started = useRef(false);

  const [status, setStatus] = useState<Status>('polling');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [studioName, setStudioName] = useState<string | null>(null);

  const acceptInvitation = useAcceptInvitation();

  useEffect(() => {
    if (status !== 'success') return;
    const timer = window.setTimeout(() => window.location.replace('/desk'), 350);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (started.current) return;

    if (!token) {
      setStatus('error');
      setErrorMessage('This invite link is missing its token. Ask your studio admin to resend it.');
      return;
    }

    started.current = true;
    let cancelled = false;
    const supabase = createBrowserClient();

    const run = async () => {
      // Session poll — absorbs the race between landing here (post
      // callback-page redirect) and supabase-js finishing session hydration.
      const start = Date.now();
      let session = (await supabase.auth.getSession()).data.session;
      while (!cancelled && !session && Date.now() - start < SESSION_POLL_TIMEOUT_MS) {
        await new Promise((resolve) => setTimeout(resolve, SESSION_POLL_INTERVAL_MS));
        session = (await supabase.auth.getSession()).data.session;
      }
      if (cancelled) return;

      if (!session) {
        setStatus('error');
        setErrorMessage("We couldn't verify your sign-in. Try opening the invite link again.");
        return;
      }

      setStatus('accepting');
      acceptInvitation.mutate(token, {
        onSuccess: (result) => {
          if (cancelled) return;
          studioEvents.invitationAccepted();
          setStudioName(result.organization_name);
          setStatus('success');
        },
        onError: (error) => {
          if (cancelled) return;
          setStatus('error');
          setErrorMessage(friendlyInviteError(error));
        },
      });
    };

    run();

    return () => {
      cancelled = true;
      // Strict Mode replays effects in development. Let the replay own a new
      // run after this one observes `cancelled` and exits before the RPC.
      started.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (status === 'error') {
    return (
      <DesignerAuthShell>
        <div className="max-w-sm space-y-4 text-center">
          <h1 className="font-heading text-xl text-[var(--color-charcoal)]">
            Invite not accepted
          </h1>
          <p className="text-sm text-muted-foreground">
            {errorMessage ?? 'This invitation link is invalid or has expired.'}
          </p>
          <a
            href="/auth/signin"
            className="inline-block font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-clay)] hover:text-[var(--color-charcoal)]"
          >
            Sign in
          </a>
        </div>
      </DesignerAuthShell>
    );
  }

  if (status === 'success') {
    return (
      <DesignerAuthShell>
        <PortalAuthSuccess
          title={studioName ? `Welcome to ${studioName}.` : 'Your studio is ready.'}
          description="Your invitation is accepted. We’re taking you to your desk now."
          destinationLabel="Continue to your desk"
          destinationHref="/desk"
          onContinue={() => window.location.replace('/desk')}
        />
      </DesignerAuthShell>
    );
  }

  return (
    <DesignerAuthShell>
      <div className="space-y-4 text-center">
        <div className="mx-auto mb-1 flex justify-center">
          <StrataSweep size="sm" label="Joining your studio" />
        </div>
        <p className="text-sm text-muted-foreground">
          Joining your studio…
        </p>
      </div>
    </DesignerAuthShell>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <DesignerAuthShell>
          <div className="space-y-4 text-center">
            <div className="mx-auto mb-1 flex justify-center">
              <StrataSweep size="sm" label="Loading" />
            </div>
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        </DesignerAuthShell>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}
