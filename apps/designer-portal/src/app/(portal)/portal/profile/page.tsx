'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useSession } from '@patina/supabase';
import { StrataMark } from '@/components/portal/strata-mark';
import { FieldGroup } from '@/components/portal/field-group';
import { DetailRow } from '@/components/portal/detail-row';
import { PortalButton } from '@/components/portal/button';
import { LoadingStrata } from '@/components/portal/loading-strata';

// SET-10 — shape returned by GET /api/me/sessions (rows from public.user_sessions).
interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  lastActiveAt: string | null;
  createdAt: string | null;
}

function shortUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  // Pull a friendly browser/OS hint out of the UA string.
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser';
  const os =
    /Mac OS X/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /(iPhone|iPad|iOS)/.test(ua) ? 'iOS'
    : /Linux/.test(ua) ? 'Linux'
    : '';
  return os ? `${browser} on ${os}` : browser;
}

function ActiveSessions() {
  const { session } = useSession();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [currentUserAgent, setCurrentUserAgent] = useState<string | null>(null);

  const loadSessions = async () => {
    try {
      const res = await fetch('/api/me/sessions');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message ?? 'Failed to load sessions');
      setSessions(Array.isArray(json?.data) ? json.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setCurrentUserAgent(navigator.userAgent);
    }
    loadSessions();
  }, []);

  const handleSignOutOthers = async () => {
    setSigningOut(true);
    setError(null);
    setSignedOut(false);
    try {
      const res = await fetch('/api/me/sessions', { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message ?? 'Failed to sign out other sessions');
      setSignedOut(true);
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign out other sessions');
    } finally {
      setSigningOut(false);
    }
  };

  // Derive the current session display from the active Supabase session +
  // this browser's user agent — this always shows even when user_sessions is
  // empty (nothing populates it on login yet).
  const currentSince = session?.user?.last_sign_in_at ?? session?.user?.created_at ?? null;

  // Other rows = stored sessions that don't match this device's user agent.
  const otherSessions = sessions.filter(
    (s) => !currentUserAgent || s.userAgent !== currentUserAgent
  );

  return (
    <FieldGroup label="Active Sessions">
      {loading ? (
        <p className="type-body-small text-[var(--text-muted)]">Loading sessions…</p>
      ) : (
        <div className="space-y-3">
          {error && (
            <p className="type-body-small text-[#C45B4A]" role="alert">
              {error}
            </p>
          )}
          {signedOut && (
            <p className="type-body-small text-green-700" role="status">
              Signed out of other sessions.
            </p>
          )}

          {/* Current session — always shown */}
          <div className="rounded-md border border-[var(--border-default)] p-3">
            <div className="flex items-center justify-between">
              <span className="type-label">{shortUserAgent(currentUserAgent)}</span>
              <span className="type-meta-small uppercase tracking-wider text-green-700">
                This device
              </span>
            </div>
            {currentSince && (
              <div className="type-body-small mt-1 text-[var(--text-muted)]">
                Signed in {new Date(currentSince).toLocaleString()}
              </div>
            )}
          </div>

          {/* Other stored sessions */}
          {otherSessions.map((s) => (
            <div
              key={s.id}
              className="rounded-md border border-[var(--border-subtle)] p-3"
            >
              <div className="type-label">{shortUserAgent(s.userAgent)}</div>
              <div className="type-body-small mt-1 text-[var(--text-muted)]">
                {s.ip ? `${s.ip} · ` : ''}
                {s.lastActiveAt
                  ? `Last active ${new Date(s.lastActiveAt).toLocaleString()}`
                  : 'Last active unknown'}
              </div>
            </div>
          ))}

          <PortalButton
            variant="secondary"
            type="button"
            onClick={handleSignOutOthers}
            disabled={signingOut}
          >
            {signingOut ? 'Signing out…' : 'Sign out other sessions'}
          </PortalButton>
        </div>
      )}
    </FieldGroup>
  );
}

export default function ProfilePage() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <LoadingStrata />;

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  return (
    <div className="pt-8">
      {/* Profile Header */}
      <div className="flex items-center gap-6 pb-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-patina-pearl text-2xl font-medium text-patina-mocha">
          {initials}
        </div>
        <div>
          <h1 className="type-page-title">{user?.name || 'Designer'}</h1>
          <p className="type-label-secondary">{user?.email}</p>
        </div>
      </div>

      <StrataMark variant="full" />

      <div className="grid gap-12 md:grid-cols-2">
        <div>
          <FieldGroup label="Account Information">
            <DetailRow label="Name" value={user?.name || 'Not set'} />
            <DetailRow label="Email" value={user?.email || '—'} />
            <DetailRow
              label="Roles"
              value={user?.roles?.join(', ') || 'designer'}
            />
          </FieldGroup>

          <FieldGroup label="Permissions">
            {user?.permissions && user.permissions.length > 0 ? (
              <div className="space-y-1">
                {user.permissions.map((perm: string) => (
                  <p key={perm} className="type-body-small">
                    {perm}
                  </p>
                ))}
              </div>
            ) : (
              <p className="type-body-small text-[var(--text-muted)]">
                Default permissions
              </p>
            )}
          </FieldGroup>
        </div>

        <div>
          <ActiveSessions />
        </div>
      </div>

      <div className="mt-8">
        <PortalButton variant="secondary" asChild>
          <Link href="/portal/settings" className="no-underline text-inherit">
            Edit Settings
          </Link>
        </PortalButton>
      </div>
    </div>
  );
}
