'use client';

/**
 * Studio setup whisper (U7, Desk) — the MarginNote *visual* idiom (an italic
 * Playfair line, en-dash lead) without MarginNote's once-only localStorage
 * contract. This note's visibility is a live derivation — `owner &&
 * openCount >= 2` — so it comes and goes with the checklist itself rather
 * than being permanently dismissed. Owner-only: a member/guest can't act on
 * the checklist's admin-gated rows (invite, branding) anyway, so whispering
 * at them about the studio's setup would just be noise they can't resolve.
 *
 * It is a Desk line, not a teaching note: it never takes the visit's
 * unsolicited teaching slot. The Desk arbiter's `when` is
 * `useStudioSetupWhisperEligible()`, over the same reads the whisper renders
 * from, so the arbiter never gives the slot to a whisper that renders nothing.
 */

import {
  useOrganizationMembers,
  useOrganizations,
  useProjects,
  useStudioContacts,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { deriveSetupSteps } from '@/lib/document/studio-setup';
import { openAccountPage } from './account-sheet';

/**
 * The owner check and the open-step count. Same design_studio-preferred
 * resolution, and the same active-only / first-document-opened derivation
 * (L3, 00559), as account-studio-page.tsx, so the whisper's openCount never
 * runs ahead or behind the checklist it sends you to.
 */
function useStudioSetup() {
  const { user } = useAuth();
  const { data: orgs, isLoading: orgsLoading } = useOrganizations();
  const studio = orgs?.find((o) => o.type === 'design_studio') ?? orgs?.[0] ?? null;
  const { data: members, isLoading: membersLoading } = useOrganizationMembers(studio?.id ?? '');
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: contacts, isLoading: contactsLoading } = useStudioContacts(studio?.id ?? null);
  const others = (members ?? []).filter((m) => m.user_id !== user?.id && m.status === 'active');
  const { openCount } = deriveSetupSteps({
    orgCreatedAt: studio?.created_at ?? null,
    myJobTitle: members?.find((m) => m.user_id === user?.id)?.job_title ?? null,
    activeMemberCountBeyondSelf: others.length,
    projectsCount: projects?.length ?? 0,
    contactsCount: contacts?.length ?? 0,
    seedSkipped: !!studio?.rolodex_seed_skipped_at,
    hiresWithFirstDocument: others.filter((m) => m.first_document_opened_at != null).length,
  });
  return {
    loading: orgsLoading || membersLoading || projectsLoading || contactsLoading,
    isOwner: studio?.membership.role === 'owner',
    openCount,
  };
}

const shows = (isOwner: boolean, openCount: number) => isOwner && openCount >= 2;

/**
 * Whether the whisper renders: `studio-workspaces` on (the flag the Account
 * sheet's Studio page gates behind), the owner, two or more open steps.
 * `pending` while any of those reads is loading, so the Desk arbiter never
 * settles the visit's line on a half-read studio.
 */
export function useStudioSetupWhisperEligible(): boolean | 'pending' {
  const { value: flagOn, isLoading: flagLoading } = useFeatureFlag('studio-workspaces');
  const { loading, isOwner, openCount } = useStudioSetup();
  if (flagLoading || (flagOn && loading)) return 'pending';
  return !!flagOn && shows(isOwner, openCount);
}

export function StudioSetupWhisper({ className }: { className?: string }) {
  const { isOwner, openCount } = useStudioSetup();
  if (!shows(isOwner, openCount)) return null;

  return (
    <aside role="note" className={`flex max-w-[34ch] items-start gap-2 ${className ?? ''}`}>
      <p className="min-w-0 flex-1">
        <span className="font-heading text-[15px] italic leading-[1.55] text-[var(--text-body)]">
          <span aria-hidden className="mr-1 not-italic text-[var(--text-muted)]">
            –
          </span>
          The studio isn&rsquo;t fully set up.
        </span>{' '}
        <button
          type="button"
          onClick={() => openAccountPage('studio')}
          className="da-score-hover inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-clay-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
        >
          Finish setting up
        </button>
      </p>
    </aside>
  );
}
