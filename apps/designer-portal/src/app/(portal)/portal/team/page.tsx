'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useOrganizations, useSession, useAddClient } from '@patina/supabase';
import { useProjects } from '@/hooks/use-projects';
import { Breadcrumb } from '@/components/portal/breadcrumb';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import { PortalButton } from '@/components/portal/button';
// F1.7 — Team migrated to ambient + reactive help-system layers per spec
// §12.4. Studio is Patina vocabulary (multi-user org); StrataInfoIcon
// explains the concept inline. Aliased the local EmptyState helper to
// `LocalEmptyState` to avoid collision with the canonical
// `<EmptyState surfaceKey>` wrapper from @patina/help-system.
import { EmptyState as LocalEmptyState } from '@/components/portal/empty-state';
import {
  EmptyState,
  SectionIntro,
  StrataInfoIcon,
  SurfaceKeys,
  useHelpContent,
} from '@patina/help-system';

// CMS-probe + local fallback for the "no studio yet" zero-state. Matches the
// F1.6 Clients pattern so the first-time designer sees onboarding copy
// before Sanity is populated.
function NoStudioEmpty() {
  const surfaceKey = SurfaceKeys.DesignerPortal.Team.Empty.NoStudio;
  const { data, isLoading } = useHelpContent(surfaceKey, 'emptyState');
  if (isLoading) return null;
  if (data) return <EmptyState surfaceKey={surfaceKey} />;
  return (
    <LocalEmptyState
      title="No studio yet"
      description="Create a studio to add support designers, bookkeepers, and assign roles per project."
    />
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = any;

// SET-01 — Invite member modal. POSTs to the existing /api/clients/invite route
// via the useAddClient hook (clientEmail + optional clientName, invite=true so a
// magic-link email is sent). Mirrors the AddClientDialog pattern but scoped to
// the Team page per the task brief.
function InviteMemberModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const addClient = useAddClient();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    setSuccessMessage(null);
    setErrorMessage(null);

    addClient.mutate(
      {
        clientEmail: trimmedEmail,
        clientName: name.trim() || undefined,
        source: 'direct',
        invite: true,
      },
      {
        onSuccess: (result: AnyData) => {
          const label = name.trim() || trimmedEmail;
          setSuccessMessage(
            result?.alreadyExists
              ? `${label} is already on Patina — linked to their existing account.`
              : result?.invited
                ? `${label} invited — they'll get a magic-link email shortly.`
                : `${label} added.`
          );
          setEmail('');
          setName('');
        },
        onError: (err: Error) => {
          setErrorMessage(err.message ?? 'Something went wrong. Please try again.');
        },
      }
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Invite member"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-md p-6"
        style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="type-item-name mb-2">Invite member</h2>
        <p className="type-body mb-5 text-[0.82rem] text-[var(--text-muted)]">
          Send a magic-link invite. They'll join your roster once they accept.
        </p>

        {successMessage && (
          <div
            role="status"
            className="mb-4 rounded-sm border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
          >
            {successMessage}
          </div>
        )}
        {errorMessage && (
          <div
            role="alert"
            className="mb-4 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="invite-email" className="type-meta-small uppercase tracking-wider">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="member@example.com"
              className="type-body border-0 border-b border-[var(--border-default)] bg-transparent py-2 text-[0.85rem] outline-none focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="invite-name" className="type-meta-small uppercase tracking-wider">
              Name <span className="normal-case text-[var(--text-muted)]">(optional)</span>
            </label>
            <input
              id="invite-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jordan Avery"
              className="type-body border-0 border-b border-[var(--border-default)] bg-transparent py-2 text-[0.85rem] outline-none focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <PortalButton
              variant="primary"
              type="submit"
              disabled={addClient.isPending || !email.trim()}
            >
              {addClient.isPending ? 'Sending...' : 'Send invite'}
            </PortalButton>
            <PortalButton variant="ghost" type="button" onClick={onClose}>
              {successMessage ? 'Done' : 'Cancel'}
            </PortalButton>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const hydrated = useHydrated();
  const { session } = useSession();
  const { data: orgs, isLoading: orgsLoading } = useOrganizations();
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const [inviteOpen, setInviteOpen] = useState(false);

  const orgList = (Array.isArray(orgs) ? orgs : []) as AnyData[];
  const projectList = (Array.isArray(projects) ? projects : []) as AnyData[];

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || orgsLoading || projectsLoading) return <LoadingStrata />;

  const studio = orgList[0];

  return (
    <div className="pt-8">
      <Breadcrumb items={[{ label: 'Team' }]} />

      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="type-section-head" style={{ fontSize: '1.5rem' }}>
            Team
          </h1>
          <SectionIntro
            surfaceKey={SurfaceKeys.DesignerPortal.Team.ListIntro}
            fallback="Members of your studio and their assignments across active projects."
          />
        </div>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="rounded-[3px] bg-[var(--text-primary)] px-3 py-1.5 text-[0.8rem] text-[var(--bg-primary)]"
        >
          + Invite member
        </button>
      </div>

      {inviteOpen && <InviteMemberModal onClose={() => setInviteOpen(false)} />}

      {!studio ? (
        <NoStudioEmpty />
      ) : (
        <>
          <div className="mb-6 rounded-md border p-4" style={{ borderColor: 'var(--border-default)' }}>
            <div className="type-meta-small uppercase tracking-wider mb-1 inline-flex items-center gap-1">
              Studio
              {/* Studio is a Patina-defined entity — the multi-user org that
                  holds designers, bookkeepers, etc. */}
              <StrataInfoIcon
                surfaceKey={SurfaceKeys.DesignerPortal.Team.Concept.Studio}
                size={11}
                ariaLabel="What is a Studio?"
                fallback="A Studio is your multi-user organization on Patina — it holds designers, bookkeepers, and external collaborators and lets you assign roles per project."
              />
            </div>
            <div className="type-section-head" style={{ fontSize: '1.15rem' }}>
              {studio.name}
            </div>
            {session?.user?.email && (
              <p className="mt-1 type-body text-[0.8rem] text-[var(--text-muted)]">
                Signed in as {session.user.email}
              </p>
            )}
          </div>

          <h2 className="type-section-head mb-3" style={{ fontSize: '1.15rem' }}>
            Project assignments
          </h2>
          {projectList.length === 0 ? (
            <p className="type-body italic text-[var(--text-muted)]">No active projects.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {projectList.map((p) => (
                <Link
                  key={p.id}
                  href={`/portal/projects/${p.id}`}
                  className="grid items-center gap-3 border-b py-3 no-underline transition-colors hover:bg-[var(--bg-hover)]"
                  style={{
                    gridTemplateColumns: '2fr 1.5fr 1fr',
                    borderColor: 'rgba(229, 226, 221, 0.6)',
                  }}
                >
                  <span className="type-label">{p.name}</span>
                  <span className="type-body text-[0.82rem] text-[var(--text-muted)]">
                    {p.client?.full_name ?? p.client_name ?? '—'}
                  </span>
                  <span className="type-meta-small uppercase tracking-wider text-right">
                    {p.status}
                  </span>
                </Link>
              ))}
            </div>
          )}

          <p className="mt-6 type-body italic text-[var(--text-muted)] text-[0.82rem]">
            To add support designers, open a project and assign them from its detail page.
          </p>
        </>
      )}
    </div>
  );
}
