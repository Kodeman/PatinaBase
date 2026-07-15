'use client';

/**
 * The open document — full bleed (D12): the paper IS the screen. No
 * surround, no border, no stacked edge; spine and margin are sticky rails;
 * main scrolls between them, padded clear of the drawer. Read-only Slice 2:
 * §4 sections via document_state, letterhead, settled bars with the
 * canonical Proposal unfold (real seal data), FF&E with R2 stamps, D6
 * presence. Esc puts down (sheet-first priority, §3).
 */

import { use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useProjectV2, useProjectPhases, useProposalFeedback } from '@patina/supabase';
import { rollupVerdicts, formatVerdictRollup } from '@patina/utils';
import { useDocumentEngagement } from '@/hooks/use-document-state';
import { useHoldDocument } from '@/hooks/document-time-provider';
import { useMobileActiveDoc } from '@/components/document/mobile/mobile-shell';
import { MobileMarginChips } from '@/components/document/mobile/mobile-margin-chips';
import { rememberDocumentInHand } from '@/lib/analytics/document-events';
import { useDocumentPresence } from '@/hooks/use-document-presence';
import { useProposal } from '@/hooks/use-proposals';
import { deriveSections, type SectionLineage } from '@/lib/document/section-derivation';
import type { DocumentStateRow, SectionKey } from '@/lib/document/desk-derivation';
import { sectionAnchorId } from '@/lib/document/section-anchor';
import { fmtDay, fmtMonthYear, fmtUsd } from '@/lib/document/format';
import { DocSpine } from '@/components/document/doc-spine';
import { DocLetterhead } from '@/components/document/doc-letterhead';
import { SettledBar } from '@/components/document/settled-bar';
import { ProposalBlocksReadOnly } from '@/components/document/proposal-blocks-readonly';
import { FFESection } from '@/components/document/ffe-section';
import { CoordinationBand } from '@/components/document/coordination/coordination-band';
import { ScheduleSpine } from '@/components/document/schedule/schedule-spine';
import { BriefSection } from '@/components/document/brief-section';
import { BriefRecap } from '@/components/document/brief-recap';
import { CareBand } from '@/components/document/care-band';
import { CareSection } from '@/components/document/quiet-sections';
import { DiscoverySection } from '@/components/document/discovery/discovery-section';
import { DiscoveryRecap } from '@/components/document/discovery/discovery-recap';
import { DiscoveryMargin } from '@/components/document/discovery/discovery-margin';
import { MarginRail } from '@/components/document/margin-rail';
import { useDocumentSurface } from '@/lib/help-system/use-document-surface';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';
import { AccountBand } from '@/components/document/account-band';
import { PhaseTimeline } from '@/components/document/phase-timeline';
import { LetterheadInstruments } from '@/components/document/letterhead-instruments';
import { HouseholdChip } from '@/components/document/household-chip';
import { ProposalInstruments } from '@/components/document/proposal-instruments';
import { FolioLetterhead, ProposalFolioStrip } from '@/components/document/folio-strip';
import { DocColophon } from '@/components/document/doc-colophon';
import { useDocumentRooms } from '@/hooks/use-document-rooms';
import { gateState, useSectionGates } from '@/hooks/use-section-work';
import { deriveFillState } from '@/lib/document/fill-state';
import { useFeatureFlag } from '@/hooks/use-feature-flag';

const prettyPhase = (phase: string | null) =>
  phase
    ? phase
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : null;

type AnyRecord = any;

function vitalsFor(row: DocumentStateRow, project: AnyRecord, proposal: AnyRecord): string {
  // Project + proposal carry the client as a first-class subtitle (the
  // HouseholdChip in the title block), so the vitals drop the client name to
  // avoid showing it twice — they state the phase/target/money only.
  if (row.engagement_kind === 'project') {
    return [
      prettyPhase(row.current_phase),
      project?.target_completion ? `Target ${fmtMonthYear(project.target_completion)}` : null,
      project?.total_amount_cents != null ? fmtUsd(project.total_amount_cents) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  if (row.engagement_kind === 'proposal') {
    return [proposal?.total_amount != null ? `${fmtUsd(proposal.total_amount)} proposed` : null]
      .filter(Boolean)
      .join(' · ');
  }
  if (row.engagement_kind === 'lead') {
    return [row.client_name, 'New inquiry'].filter(Boolean).join(' · ');
  }
  return [row.client_name, 'In discovery'].filter(Boolean).join(' · ');
}

export default function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  useDocumentSurface(DOCUMENT_SURFACE_KEYS.doc); // R89 — scope help to the open document
  const { id } = use(params);
  const router = useRouter();

  const { data: resolution, isLoading } = useDocumentEngagement(id);
  const row = resolution?.kind === 'engagement' ? resolution.row : null;
  const projectId = row?.project_id ?? '';
  const proposalId = row?.proposal_id ?? '';

  const { data: project } = useProjectV2(projectId) as { data: AnyRecord };
  const { data: phases } = useProjectPhases(projectId) as { data: AnyRecord[] | undefined };
  const { data: liveProposal } = useProposal(proposalId) as { data: any };
  const others = useDocumentPresence(row?.engagement_id ?? null);

  // C3 — the proposal's per-line client verdicts, rolled up for a quiet
  // letterhead summary on the open proposal ("4 of 12 approved · 1 flagged").
  // The denominator is the client-visible line count; empty when nothing has
  // happened yet → no line renders.
  const { data: proposalFeedback = [] } = useProposalFeedback(proposalId);
  const verdictSummary = useMemo(() => {
    const totalLines = liveProposal?.items?.length ?? 0;
    return formatVerdictRollup(
      rollupVerdicts(
        totalLines,
        proposalFeedback.map((f) => ({
          lineId: f.proposal_item_id ?? '',
          verdict: f.verdict,
          createdAt: f.created_at,
          resolvedAt: f.resolved_at,
        })),
      ),
    );
  }, [proposalFeedback, liveProposal?.items?.length]);

  // D11 (ratified R19): picking up the document starts the timer (chaining out any running
  // one); putting down releases it through the log strip. Projects only —
  // time attaches to project rows (00177 FK).
  useHoldDocument(
    row?.project_id
      ? {
          projectId: row.project_id,
          projectName: row.title,
          phaseKey: row.current_phase ?? null,
        }
      : null,
  );

  // Which settled phase is unfolded (R66 review) — generalizes the old
  // proposal-only unfold so ANY completed phase can be clicked open.
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);
  const [highlightLineId, setHighlightLineId] = useState<string | null>(null);
  const [pendingNoteAnchor, setPendingNoteAnchor] = useState<string | null>(null);
  // R24: drags anywhere on the active section land in the folio.
  const [sectionDrag, setSectionDrag] = useState(false);
  const [folioDrop, setFolioDrop] = useState<File[] | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  // Click a spine marker (or a settled bar): unfold that phase and scroll to it.
  // The active phase has no settled bar — the scroll just lands on its section.
  const jumpToSection = useCallback((key: SectionKey) => {
    setOpenSection(key);
    requestAnimationFrame(() => {
      document
        .getElementById(sectionAnchorId(key))
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }, []);

  // D13: the mobile spine sheet lives outside this React tree — it asks for a
  // section jump via a CustomEvent (mirrors the account sheet's open-account).
  useEffect(() => {
    const onOpenSection = (e: Event) => {
      const key = (e as CustomEvent).detail as SectionKey | undefined;
      if (key) jumpToSection(key);
    };
    window.addEventListener('document:open-section', onOpenSection);
    return () => window.removeEventListener('document:open-section', onOpenSection);
  }, [jumpToSection]);

  // R25 rooms (spine-sheet jump rows + headings) · R23 gates (settled stamps).
  const { data: docRooms } = useDocumentRooms(row?.project_id ?? null);
  const { data: sectionGates } = useSectionGates(row?.project_id ?? null);

  // R6: an activated proposal's id redirects to its project document —
  // pre-signing links survive the signing moment. replace(), not push.
  useEffect(() => {
    if (resolution?.kind === 'redirect') router.replace(`/doc/${resolution.projectId}`);
  }, [resolution, router]);

  // Esc puts down (D1) — unless an overlay owns it (ledger sheet first, §3).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"]')) return;
      router.push('/desk');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [router]);

  // Open lands at the active section (§4): settled bars compress above it.
  const landedRef = useRef(false);
  useEffect(() => {
    if (!row || landedRef.current) return;
    landedRef.current = true;
    const el = mainRef.current?.querySelector('[data-active-section]');
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) {
      el.scrollIntoView({ block: 'start' });
    }
  }, [row]);

  // Lineage (R1): activating proposal for signed work; live proposal pre-signing.
  const lineage: SectionLineage | null = useMemo(() => {
    const src = row?.engagement_kind === 'project' ? project?.proposal : liveProposal;
    if (!src) return null;
    return {
      createdAt: src.created_at ?? null,
      sentAt: src.sent_at ?? null,
      signedAt: src.signed_at ?? null,
      status: src.status ?? null,
      version: src.version ?? null,
    };
  }, [row?.engagement_kind, project?.proposal, liveProposal]);

  // Sections are derived above the early returns so the mobile shell hook
  // (D13) can publish them unconditionally (rules of hooks). Guarded for the
  // pre-resolution null row.
  const installPhase = (phases ?? []).find((p) => p.phase_key === 'installation');
  const sections = row
    ? deriveSections(
        {
          row,
          lineage,
          projectStartDate: project?.start_date ?? null,
          installStartDate: installPhase?.start_date ?? null,
        },
        new Date(),
      )
    : [];

  // D13: publish the held document to the mobile shell (bar + spine sheet).
  useMobileActiveDoc(
    row
      ? {
          projectId: row.project_id,
          proposalId: row.proposal_id,
          clientName: row.client_name,
          title: row.title,
          sections,
          rooms: (docRooms ?? []).map((r) => ({ id: r.id, name: r.name })),
        }
      : null,
  );

  // R21 flight telemetry: remember the last document in hand so a later
  // old-zone visit can name where the designer left from. Title + client
  // name ride along so the command bar's recent-documents MRU can name it too.
  const heldEngagementId = row?.engagement_id ?? null;
  const heldTitle = row?.title ?? null;
  const heldSubtitle = row?.client_name ?? null;
  useEffect(() => {
    rememberDocumentInHand(heldEngagementId, { title: heldTitle, subtitle: heldSubtitle });
  }, [heldEngagementId, heldTitle, heldSubtitle]);

  // C7 — the Schedule Spine flip gate. Rules of hooks: called unconditionally
  // above the early returns below, alongside the page's other hooks.
  const spineGate = useFeatureFlag('schedule-spine');

  if (isLoading || resolution?.kind === 'redirect') {
    return (
      <div className="min-h-screen bg-[var(--doc-paper)]" aria-busy>
        <p className="px-10 py-12 font-heading text-[14px] italic text-[var(--text-muted)]">
          Picking up…
        </p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="min-h-screen bg-[var(--doc-paper)] px-10 py-12">
        <p className="mb-3 font-heading text-[16px] text-[var(--color-charcoal)]">
          No document answers to this name.
        </p>
        <Link
          href="/desk"
          className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-clay)]"
        >
          ← Back to the desk
        </Link>
      </div>
    );
  }

  const settled = sections.filter((s) => s.state === 'settled');
  const unfoldProposalId =
    row.engagement_kind === 'project' ? (project?.proposal?.id ?? null) : (row.proposal_id ?? null);
  const seal = lineage?.signedAt
    ? {
        date: fmtDay(lineage.signedAt),
        by:
          (row.engagement_kind === 'project'
            ? project?.proposal?.signed_by_name
            : liveProposal?.signed_by_name) ?? null,
      }
    : null;

  return (
    <div className="relative grid min-h-screen grid-cols-1 bg-[var(--doc-paper)] [grid-template-rows:auto_1fr] min-[980px]:grid-cols-[200px_minmax(0,1fr)_232px] min-[980px]:[grid-template-rows:none] motion-safe:animate-[doc-raise_270ms_ease-out] motion-reduce:animate-[doc-fade_200ms_ease-out]">
      {/* Paper grain at the threshold of perception */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(139,115,85,0.01) 3px, rgba(139,115,85,0.01) 4px)',
        }}
      />

      <DocSpine sections={sections} others={others} onJump={jumpToSection} />

      {/* No z-index here: a stacking context on main would trap the fixed
          procurement panels (inspection drawer, Order Assistant) mounted in
          line unfolds beneath the aside rail and the drawer strip. The z-0
          grain painting over content is imperceptible at 1% alpha. */}
      <main ref={mainRef} className="max-w-[1040px] px-7 pb-32 pt-8 min-[980px]:px-12">
        {/* The household — who this document is for — is a first-class subtitle
            in the title block (R68.2): a prominent clickable line directly under
            the title, not a tiny line tucked below the divider. View / set /
            change / edit through the household sheet. */}
        <DocLetterhead
          title={row.title}
          vitals={vitalsFor(row, project, liveProposal)}
          // R80: project vitals self-save at the letterhead (blur-save law).
          projectId={row.engagement_kind === 'project' ? row.project_id : null}
          fill={deriveFillState(sections)}
          client={
            row.engagement_kind === 'project' || row.engagement_kind === 'proposal' ? (
              <HouseholdChip
                engagementKind={row.engagement_kind}
                projectId={row.project_id}
                proposalId={row.proposal_id}
                clientProfileId={row.client_profile_id}
                clientName={row.client_name}
                proposalStatus={liveProposal?.status ?? null}
              />
            ) : undefined
          }
        />

        {/* R27 / R63: the letterhead instruments — one quiet DM-mono row under
            the subtitle, now STAGE-CONSISTENT. Send-a-note (and, where there's
            something to mirror, View-as) ride the letterhead across stages,
            not project-only:
              · project      — full client mirror + project group thread + folio
              · proposal      — direct-thread follow-up at the letterhead; the
                                proposal-grain mirror stays in the Proposal
                                section's ProposalInstruments (no duplicate
                                "view as them" under one letterhead)
              · relationship  — direct-thread follow-up (no artifact to mirror)
              · brief (lead)  — only when the captured lead has an in-app profile
            A profile-less captured lead has no counterpart, so the component
            hides both affordances itself (no empty row). The folio unfold is a
            project artifact and stays project-only. */}
        {row.engagement_kind === 'project' && row.project_id && (
          <>
            <LetterheadInstruments
              projectId={row.project_id}
              clientProfileId={row.client_profile_id}
              clientName={row.client_name}
            />
            <FolioLetterhead projectId={row.project_id} />
          </>
        )}
        {row.engagement_kind !== 'project' && row.client_profile_id && (
          <LetterheadInstruments
            clientProfileId={row.client_profile_id}
            clientName={row.client_name}
          />
        )}

        {/* D13: letterhead-anchored margin items (Pulse, section items) as
            chips beneath the title — the desktop margin rail hides on mobile. */}
        <MobileMarginChips
          projectId={row.project_id}
          proposalId={row.proposal_id}
          anchorKind="letterhead"
        />

        {/* Settled bars — letterhead bar + stamp; every phase with a read-only
            body unfolds in place so completed work stays reviewable (R66).
            Clicked from the spine marker (jumpToSection) or the bar itself. */}
        {settled.map((s) => {
          const isOpen = openSection === s.key;
          const toggle = () => setOpenSection((prev) => (prev === s.key ? null : s.key));

          // R23: a gate-settled section wears the client's grant; the Proposal
          // wears its signing seal.
          const approvedGate = (sectionGates ?? []).find(
            (g) => g.section_key === s.key && gateState(g) === 'approved',
          );
          const stamp =
            s.key === 'proposal' && seal
              ? { label: `Signed · ${seal.date}`, color: 'var(--color-sage)', ink: '#85947C' }
              : approvedGate
                ? {
                    label: `Approved${approvedGate.responded_at ? ` · ${fmtDay(approvedGate.responded_at)}` : ''}`,
                    color: 'var(--color-sage)',
                    ink: '#85947C',
                  }
                : undefined;

          // The read-only review body — what the designer reviews on unfold.
          // Brief → the lead record (triage auto-hides once accepted); Discovery
          // → the captured facts recap; Direction/Proposal → the proposal blocks.
          let body: ReactNode = null;
          if (s.key === 'brief') {
            body = <BriefRecap clientProfileId={row.client_profile_id} leadId={row.lead_id} />;
          } else if (s.key === 'discovery') {
            body = <DiscoveryRecap clientProfileId={row.client_profile_id} />;
          } else if ((s.key === 'direction' || s.key === 'proposal') && unfoldProposalId) {
            body = (
              <>
                <ProposalBlocksReadOnly proposalId={unfoldProposalId} />
                {s.key === 'proposal' && seal && (
                  <p className="mt-4 border-t border-[var(--color-pearl)] pt-3 text-[10.5px] text-[var(--text-muted)]">
                    {seal.by ? `Signed by ${seal.by} · ${seal.date}` : `Signed · ${seal.date}`}
                  </p>
                )}
              </>
            );
          }

          return (
            <SettledBar
              key={s.key}
              anchorId={sectionAnchorId(s.key)}
              name={
                s.key === 'proposal' && lineage?.version ? `Proposal · v${lineage.version}` : s.label
              }
              hint={s.key === 'proposal' ? undefined : s.sub}
              stamp={stamp}
              open={isOpen}
              onToggle={body ? toggle : undefined}
            >
              {body}
            </SettledBar>
          );
        })}

        {/* R26: the Account Page — engagement money at the top of the
            Project section. Studio eyes only; never mirrored. */}
        {row.engagement_kind === 'project' && row.project_id && (
          <AccountBand projectId={row.project_id} clientName={row.client_name} />
        )}

        {/* Field Coordination (light-PM slice): the phase schedule as a
            horizontal band — status-tinted segments, a today line, popover date
            editing. Project-wide (shows across project/install/care stages),
            mounted with the AccountBand at the top of the project document so it
            reads as a project overview above the section work. */}
        {row.engagement_kind === 'project' && row.project_id && (
          <PhaseTimeline projectId={row.project_id} />
        )}

        {/* The active section — exactly one (§4). */}
        <div
          id={sectionAnchorId(row.active_section)}
          data-active-section
          className="scroll-mt-24"
          onDragOver={(e) => {
            if (!row.project_id || !e.dataTransfer?.types?.includes('Files')) return;
            e.preventDefault();
            setSectionDrag(true);
          }}
          onDragLeave={() => setSectionDrag(false)}
          onDrop={(e) => {
            if (!row.project_id) return;
            e.preventDefault();
            setSectionDrag(false);
            const files = Array.from(e.dataTransfer.files ?? []);
            if (files.length) setFolioDrop(files);
          }}
        >
          {row.active_section === 'brief' && row.lead_id && <BriefSection leadId={row.lead_id} />}
          {row.active_section === 'discovery' && row.engagement_id && row.designer_id && (
            <DiscoverySection
              engagementId={row.engagement_id}
              designerId={row.designer_id}
              clientProfileId={row.client_profile_id}
              clientName={row.client_name}
            />
          )}
          {(row.active_section === 'direction' || row.active_section === 'proposal') &&
            row.proposal_id && (
              <section>
                <div className="mb-1.5 mt-5 flex items-baseline justify-between">
                  <h2 className="font-heading text-[16px] font-medium text-[var(--color-charcoal)]">
                    {row.active_section === 'direction' ? 'Direction' : 'Proposal'}
                    {liveProposal?.version ? ` · v${liveProposal.version}` : ''}
                  </h2>
                  <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                    {sections.find((s) => s.key === row.active_section)?.sub}
                  </span>
                </div>
                {/* C3 — a quiet letterhead read of where the client's verdicts
                    stand ("4 of 12 approved · 1 flagged"). Nothing when the
                    client hasn't weighed in yet. */}
                {row.engagement_kind === 'proposal' && verdictSummary && (
                  <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                    {verdictSummary}
                  </p>
                )}
                {/* The proposal instruments (gated to engagement_kind
                    ==='proposal'): the Drafting Room doorway for a draft, the
                    Send/Preview/Revise overlay row once it's in the client's
                    hands, and the version-history strip. Local-state overlays
                    never unmount the document beneath (D1). */}
                {row.engagement_kind === 'proposal' && (
                  <ProposalInstruments
                    proposalId={row.proposal_id}
                    clientName={row.client_name}
                  />
                )}
                {/* S18: name the model — what's below is a read-only preview of
                    the proposal; the editing happens in the Drafting Room. */}
                {row.engagement_kind === 'proposal' && liveProposal?.status === 'draft' && (
                  <p className="mb-2 mt-3 font-mono text-[8.5px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
                    Read-only preview · edit in the Drafting Room
                  </p>
                )}
                {/* R85 — the Folio mounts on proposal-stage documents (space
                    plans/drawings clip here pre-project; flagged files reach the
                    client's proposal copy via 00252's client read leg). */}
                {row.engagement_kind === 'proposal' && (
                  <ProposalFolioStrip proposalId={row.proposal_id} />
                )}
                <ProposalBlocksReadOnly proposalId={row.proposal_id} />
              </section>
            )}
          {row.active_section === 'project' && row.project_id && (
            <>
              {/* Track 5 — the coordination band (ball-in-court + dependency web).
                  The band resolves designerClientId itself from clientUserId
                  (work-block.tsx pattern); the page passes clientUserId, never a
                  raw uid. Mounts ABOVE the FF&E section in the project home (D1:
                  its sheets are band-local overlays, never a route).
                  C7 — the schedule-spine flip gate: while the flag is loading
                  (or resolves off), the old band renders — fail-closed default
                  IS the accepted current page, so this is zero flash/layout
                  shift for the non-pilot cohort (PostHog persists flags, so
                  pilots see at most one first-visit swap). */}
              {!spineGate.isLoading && spineGate.value ? (
                <ScheduleSpine
                  projectId={row.project_id}
                  clientUserId={row.client_profile_id}
                  clientName={row.client_name}
                />
              ) : (
                <CoordinationBand
                  projectId={row.project_id}
                  clientUserId={row.client_profile_id}
                  clientName={row.client_name}
                />
              )}
              <FFESection
                projectId={row.project_id}
                projectName={row.title}
                mode="project"
                highlightId={highlightLineId}
                onAddNote={setPendingNoteAnchor}
                sectionKey="project"
                clientUserId={row.client_profile_id}
                clientName={row.client_name}
                folioDrop={folioDrop}
                onFolioDropConsumed={() => setFolioDrop(null)}
                sectionDragOver={sectionDrag}
              />
              {/* R80: the Care band — closure stays reachable from an active
                  project (a quiet folded line until install nears). */}
              <CareBand projectId={row.project_id} />
            </>
          )}
          {row.active_section === 'install' && row.project_id && (
            <>
              <FFESection
                projectId={row.project_id}
                projectName={row.title}
                mode="install"
                highlightId={highlightLineId}
                onAddNote={setPendingNoteAnchor}
                sectionKey="install"
                clientUserId={row.client_profile_id}
                clientName={row.client_name}
                folioDrop={folioDrop}
                onFolioDropConsumed={() => setFolioDrop(null)}
                sectionDragOver={sectionDrag}
              />
              {/* R80: at install the band opens unfolded — closing out IS the
                  work of this stage. */}
              <CareBand projectId={row.project_id} />
            </>
          )}
          {row.active_section === 'care' && (
            <>
              <CareSection
                completedLabel={
                  project?.target_completion ? fmtMonthYear(project.target_completion) : null
                }
                projectId={row.project_id}
              />
              {row.project_id && (
                <FFESection
                  projectId={row.project_id}
                  mode="install"
                  highlightId={highlightLineId}
                  sectionKey="care"
                  clientUserId={row.client_profile_id}
                  clientName={row.client_name}
                  folioDrop={folioDrop}
                  onFolioDropConsumed={() => setFolioDrop(null)}
                  sectionDragOver={sectionDrag}
                />
              )}
            </>
          )}
        </div>

        {/* R29: the colophon — the paper's last line states its own facts. */}
        {row.engagement_kind === 'project' && row.project_id && (
          <DocColophon
            projectId={row.project_id}
            designerId={row.designer_id}
            isPaused={row.is_paused}
            handsOnTheWork={others}
          />
        )}
      </main>

      {/* Margin rail (D12; D2: the margin IS the notification model).
          D13: below 980px the margin lives as anchored chips + the spine
          sheet's summary, so the rail hides. */}
      <aside
        aria-label="Margin"
        className="z-[1] hidden border-t border-dashed border-[var(--color-pearl)] bg-[rgba(250,247,242,0.55)] px-4 pb-24 pt-6 min-[980px]:sticky min-[980px]:top-0 min-[980px]:block min-[980px]:h-screen min-[980px]:overflow-y-auto min-[980px]:border-l min-[980px]:border-t-0"
      >
        {row.active_section === 'discovery' ? (
          // R66: at Discovery (Shape D) there is no project/proposal — the
          // margin is notes-only, keyed on the relationship.
          <DiscoveryMargin designerClientId={row.engagement_id ?? ''} />
        ) : (
          <MarginRail
            projectId={row.project_id}
            proposalId={row.proposal_id}
            clientName={row.client_name}
            clientUserId={row.client_profile_id}
            onHoverLine={setHighlightLineId}
            pendingNoteAnchor={pendingNoteAnchor}
            onNoteAnchorConsumed={() => setPendingNoteAnchor(null)}
          />
        )}
      </aside>
    </div>
  );
}
