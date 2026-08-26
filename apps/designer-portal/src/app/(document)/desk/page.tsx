'use client';

/**
 * The Desk (spec v1.1 §7) — read-only in Slice 1.
 * Date + the ⌘K affordance are the only chrome. One roster of every live job,
 * grouped by stage, carries the whole studio; nothing folds on first paint.
 * No metric tiles, badges, feeds, or dashboard furniture.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  useProfile,
  useOrganizations,
  useOrganizationMembers,
  useProjects,
  useStudioContacts,
} from '@patina/supabase';
import { useDeskEngagements } from '@/hooks/use-desk-engagements';
import { useAuth } from '@/hooks/use-auth';
import { useHydrated } from '@/hooks/use-hydrated';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import {
  openCommandBar,
  captureLeadPending,
  openProjectPending,
} from '@/components/document/command-bar';
import { documentEvents } from '@/lib/analytics/document-events';
import { DeskRoster } from '@/components/document/desk-roster';
import { deriveDeskRoster } from '@/lib/document/desk-roster-derivation';
import { DeskContents } from '@/components/document/desk-contents';
import { MarginNote } from '@/components/document/margin-note';
import { StudioSetupWhisper } from '@/components/document/account/studio-setup-whisper';
import { deriveSetupSteps } from '@/lib/document/studio-setup';
import {
  START_DESK_WALKTHROUGH_EVENT,
  useDeskWalkthroughOffer,
  useSuppressDeskFirstTouch,
} from '@/components/document/help/desk-walkthrough';
import { CaptureLeadSheet } from '@/components/document/overlays/capture-lead-sheet';
import { OpenProjectSheet } from '@/components/document/overlays/open-project-sheet';
import {
  DocumentAction,
  DocumentActionGroup,
} from '@/components/document/document-action';
import { useDocumentSurface } from '@/lib/help-system/use-document-surface';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';
import { STUDIO_VERBS } from '@/lib/document/registry';

// F24 — the two header acts print their registry sub-labels; the registry
// (A3-L3's file) is the one place these strings are stored, so the header
// reads the same words the Desk Contents' Begin column and ⌘K do.
const CAPTURE_LEAD_SUBLABEL = STUDIO_VERBS.find(
  (verb) => verb.key === 'capture-lead',
)?.subLabel;
const OPEN_PROJECT_SUBLABEL = STUDIO_VERBS.find(
  (verb) => verb.key === 'open-project',
)?.subLabel;

export default function DeskPage() {
  useDocumentSurface(DOCUMENT_SURFACE_KEYS.desk); // R89 — scope help to the Desk
  const { data, isLoading, isError, refetch } = useDeskEngagements();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const hydrated = useHydrated();
  const suppressFirstTouch = useSuppressDeskFirstTouch(); // R97 — hold the note during modal/tour
  const showWalkthroughOffer = useDeskWalkthroughOffer(); // R97 — existing-designer tour offer
  const [captureOpen, setCaptureOpen] = useState(false);
  const [openProjectOpen, setOpenProjectOpen] = useState(false);

  // U7 — the setup whisper's inputs. Same design_studio-preferred resolution
  // as account-studio-page.tsx, kept minimal here since this page only needs
  // the owner check + open-step count, not the full studio row.
  const { value: studioWorkspacesEnabled } = useFeatureFlag('studio-workspaces');
  // The rolodex step (row 4) reads real data only behind `call-sheet`, exactly
  // as the Studio page does — without these two inputs the step counted as
  // permanently open here and the whisper's openCount ran one ahead of the
  // checklist the whisper sends you to.
  const { value: callSheetOn } = useFeatureFlag('call-sheet');
  const { data: orgs } = useOrganizations();
  const studio = orgs?.find((o) => o.type === 'design_studio') ?? orgs?.[0] ?? null;
  const { data: studioMembers } = useOrganizationMembers(studio?.id ?? '');
  const { data: studioProjects } = useProjects();
  const { data: studioContacts } = useStudioContacts(
    callSheetOn ? (studio?.id ?? null) : null,
  );
  const { openCount: studioSetupOpenCount } = deriveSetupSteps({
    orgCreatedAt: studio?.created_at ?? null,
    myJobTitle: studioMembers?.find((m) => m.user_id === user?.id)?.job_title ?? null,
    memberCountBeyondSelf: (studioMembers ?? []).filter((m) => m.user_id !== user?.id).length,
    projectsCount: studioProjects?.length ?? 0,
    contactsCount: callSheetOn ? (studioContacts?.length ?? 0) : 0,
    seedSkipped: callSheetOn ? !!studio?.rolodex_seed_skipped_at : false,
  });

  // A9: no mobile primary action is registered here — the header's
  // "Capture a lead" (below) is the one on-screen CTA at every viewport, and
  // the mobile dock falls back to its documented default (the "In hand /
  // Today" glance, mobile-bar.tsx) instead of duplicating it.

  // R21 week-one watch: the Desk's composition on each load (folder/chip
  // counts + need-line kinds) so noise — esp. sent-unacknowledged frequency
  // at the 1d threshold — reads off telemetry, not observation.
  const deskSig = data
    ? `${data.folders.length}:${data.chips.length}:${data.folders
        .map((f) => f.need.kind)
        .sort()
        .join(',')}`
    : null;
  useEffect(() => {
    if (!data) return;
    const need_kinds: Record<string, number> = {};
    for (const f of data.folders)
      need_kinds[f.need.kind] = (need_kinds[f.need.kind] ?? 0) + 1;
    documentEvents.deskRendered({
      folder_count: data.folders.length,
      chip_count: data.chips.length,
      need_kinds,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deskSig]);

  // ⌘K's "Capture a lead" action dispatches this — open the sheet from there
  // too, so the front door is reachable by command as well as by the CTA. When
  // the command was run from another surface, the event fired before this
  // listener existed; the pending flag carries the intent across the route.
  useEffect(() => {
    if (captureLeadPending.value) {
      captureLeadPending.value = false;
      setCaptureOpen(true);
    }
    const onOpen = () => {
      captureLeadPending.value = false;
      setCaptureOpen(true);
    };
    window.addEventListener('document:open-capture-lead', onOpen);
    return () =>
      window.removeEventListener('document:open-capture-lead', onOpen);
  }, []);

  // R79 — same contract for ⌘K's "Open a project".
  useEffect(() => {
    if (openProjectPending.value) {
      openProjectPending.value = false;
      setOpenProjectOpen(true);
    }
    const onOpen = () => {
      openProjectPending.value = false;
      setOpenProjectOpen(true);
    };
    window.addEventListener('document:open-open-project', onOpen);
    return () =>
      window.removeEventListener('document:open-open-project', onOpen);
  }, []);

  // Time-derived greeting + date are client-only — server vs client timezone
  // would otherwise mismatch on hydration. useHydrated keeps SSR and the first
  // client render identical ('Hello' / blank date), then fills in after mount.
  const now = new Date();
  const greetingWord = !hydrated
    ? 'Hello'
    : now.getHours() < 12
      ? 'Good morning'
      : now.getHours() < 18
        ? 'Good afternoon'
        : 'Good evening';
  const dateLabel = hydrated
    ? `${new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(now)} · ${new Intl.DateTimeFormat(
        'en-US',
        { month: 'long', day: 'numeric' },
      ).format(now)}`.toUpperCase()
    : '';
  const name =
    profile?.display_name || profile?.full_name || user?.name || null;
  // The Desk greeting uses the real first name; with none resolved we greet
  // plainly ("Good morning.") rather than the old "Good morning, there".
  const firstName = name?.trim().split(/\s+/)[0] || null;

  // The roster is the Desk's one population — every live job, grouped by
  // stage, in the paper's own section order.
  const roster = useMemo(
    () =>
      deriveDeskRoster(
        {
          folders: data?.folders ?? [],
          chips: data?.chips ?? [],
          live: data?.live ?? [],
        },
        new Date(),
      ),
    [data],
  );

  // A quiet Desk (no live jobs at all) lets the Studio index rise to fill the
  // space — larger, and earlier in the composition — rather than sitting as
  // bottom front matter. Only known once the read resolves.
  const deskEmpty = !!data && roster.liveCount === 0;

  return (
    <main className="mx-auto w-full max-w-[1120px] px-[clamp(1.5rem,5vw,4rem)] pb-28 pt-14">
      <header className="mb-12 flex items-baseline justify-between gap-4">
        <div>
          {/* The signature move: greeting in Playfair, the first name in
              Playfair italic, Aged Oak. Kept modest so the folios lead. */}
          <h1 className="font-heading text-[1.7rem] font-normal text-[var(--text-primary)]">
            {firstName ? (
              <>
                {greetingWord},{' '}
                <span className="italic text-[var(--text-muted)]">
                  {firstName}
                </span>
              </>
            ) : (
              <>{greetingWord}.</>
            )}
          </h1>
          <p className="doc-type-meta mt-1 uppercase tracking-[0.09em]">
            {dateLabel || ' '}
          </p>
        </div>
        <DocumentActionGroup
          surfaceKey="desk"
          regionKey="desk-head"
          aria-label="Desk actions"
        >
          <div className="flex flex-col items-end gap-0.5">
            <DocumentAction
              actionKey="capture-lead"
              variant="primary"
              leading="＋"
              data-tour-anchor="desk-capture-lead"
              onClick={() => setCaptureOpen(true)}
            >
              Capture a lead
            </DocumentAction>
            {CAPTURE_LEAD_SUBLABEL && (
              <span className="doc-type-meta uppercase tracking-[0.08em] text-[var(--text-muted)]">
                {CAPTURE_LEAD_SUBLABEL}
              </span>
            )}
          </div>
          {/* R79 — the quiet secondary act beside capture: a project that
              skips the proposal (a repeat client, handshake work). */}
          <div className="flex flex-col items-end gap-0.5">
            <DocumentAction
              actionKey="open-project"
              variant="secondary"
              leading="＋"
              onClick={() => setOpenProjectOpen(true)}
            >
              Open a project
            </DocumentAction>
            {OPEN_PROJECT_SUBLABEL && (
              <span className="doc-type-meta uppercase tracking-[0.08em] text-[var(--text-muted)]">
                {OPEN_PROJECT_SUBLABEL}
              </span>
            )}
          </div>
          <DocumentAction
            actionKey="find-anything"
            variant="tertiary"
            data-tour-anchor="desk-find-anything"
            onClick={() => openCommandBar()}
            trailing={
              <kbd className="rounded-[3px] border border-[var(--border-default)] px-1 py-px font-mono">
                ⌘K
              </kbd>
            }
          >
            Find anything
          </DocumentAction>
        </DocumentActionGroup>
      </header>

      {isError ? (
        // I64 whole-desk error state: one coherent surface, not a half-desk.
        // A 0-row auth-degraded read now throws (use-desk-engagements.ts), so
        // this branch means a genuine read failure — never mix it with the
        // Needs-your-hand / In-motion / Contents populations below, which
        // would otherwise render past it independently and produce exactly
        // the incoherent half-desk this replaces. Everything past the
        // greeting is replaced, including the first-touch note (it describes
        // desk contents that did not load) and the open-requests/Contents/
        // reconnect/field populations (each fetches its own data and would
        // otherwise float, working, beside a "could not be read" message).
        <div
          role="alert"
          data-testid="desk-error-state"
          className="mt-16 max-w-[440px]"
        >
          <p className="font-heading text-[15px] italic text-[var(--text-muted)]">
            The desk could not be read.
          </p>
          <p className="doc-type-body mt-2">
            Something interrupted the read — often a session that needs
            refreshing. Try again, or reload the page.
          </p>
          <DocumentActionGroup
            surfaceKey="desk"
            regionKey="desk-error"
            className="mt-4"
            aria-label="Desk recovery"
          >
            <DocumentAction
              actionKey="try-again"
              variant="primary"
              onClick={() => void refetch()}
            >
              Try again
            </DocumentAction>
          </DocumentActionGroup>
        </div>
      ) : (
        <>
          {/* R94 — the one first-touch note: what the Desk is, and the ⌘K move.
              Recedes forever on the first ⌘K open or the × (never a tour). R97 —
              held while the walkthrough modal/tour is on screen, and retired on tour
              completion (the tour teaches ⌘K itself). */}
          <MarginNote
            noteKey="desk-first-touch"
            commandBar
            suppressed={suppressFirstTouch}
            className="mb-10"
          >
            This is your Desk. Folders that need you gather here; the rest stays
            quiet.{' '}
            <span className="font-mono text-[12px] not-italic tracking-[0.02em] text-[var(--text-muted)]">
              ⌘K
            </span>{' '}
            finds anything by name — try “invoice”.
          </MarginNote>

          {/* R97 — existing designers (created before the ship date) get a quiet
              one-time offer instead of the auto-modal. The inline link starts the
              walkthrough; the note recedes on that same event (actionEvents) or the
              ×. The Desk Walkthrough gates eligibility; the primitive gates once-only. */}
          {showWalkthroughOffer && (
            <MarginNote
              noteKey="desk-walkthrough-offer"
              actionEvents={[START_DESK_WALKTHROUGH_EVENT]}
              className="mb-10"
            >
              New desk, same studio — your projects are all here as documents
              now.{' '}
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent(START_DESK_WALKTHROUGH_EVENT),
                  )
                }
                className="inline-flex min-h-11 items-center font-heading text-[15px] italic text-[var(--color-aged-oak)] underline decoration-[var(--color-aged-oak)] decoration-1 underline-offset-2 transition-colors hover:text-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none"
              >
                The walkthrough is six quick stops
              </button>{' '}
              if you&apos;d like the lay of it.
            </MarginNote>
          )}

          {/* U7 — the setup whisper, MarginNote's visual idiom (Playfair
              italic, en-dash lead) with a live derivation for visibility
              instead of MarginNote's once-only localStorage contract, so it
              rides the same `studio-workspaces` flag the Account sheet's
              Studio page already gates behind. */}
          {studioWorkspacesEnabled && (
            <StudioSetupWhisper
              isOwner={studio?.membership.role === 'owner'}
              openCount={studioSetupOpenCount}
              className="mb-10"
            />
          )}

          {isLoading && !data ? (
            <div
              className="space-y-3"
              aria-hidden
              data-tour-anchor="desk-needs-your-hand"
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-6 rounded-[3px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                />
              ))}
            </div>
          ) : (
            <DeskRoster roster={roster} />
          )}

          {/* R95 — on a quiet Desk the Studio index rises here, at full weight, to
              fill the space the folders would occupy. */}
          {deskEmpty && <DeskContents prominent />}

          {/* R95 — the Studio Contents page: book-style front matter (Rooms /
              Ledgers / Begin), labels + doorways only. On a working Desk it sits
              here as quiet front matter after the roster; on a quiet Desk it
              has already risen above (deskEmpty), so it renders in exactly one place. */}
          {!deskEmpty && <DeskContents />}
        </>
      )}

      {/* The capture front door (G1 · R62) — an overlay over the Desk, never a
          route; the Desk beneath does not unmount (D1). */}
      <CaptureLeadSheet
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
      />

      {/* R79 — the no-proposal front door: same overlay contract as capture. */}
      <OpenProjectSheet
        open={openProjectOpen}
        onClose={() => setOpenProjectOpen(false)}
      />
    </main>
  );
}
