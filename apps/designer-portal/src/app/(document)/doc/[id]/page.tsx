'use client';

/**
 * The open document — full bleed (D12): the paper IS the screen. No
 * surround, no border, no stacked edge; spine and margin are sticky rails;
 * main scrolls between them, padded clear of the drawer. Read-only Slice 2:
 * §4 sections via document_state, letterhead, settled bars with the
 * canonical Proposal unfold (real seal data), FF&E with R2 stamps, D6
 * presence. Esc puts down (sheet-first priority, §3).
 */

import { use, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useProjectV2, useProjectPhases } from '@patina/supabase';
import { useDocumentEngagement } from '@/hooks/use-document-state';
import { useHoldDocument } from '@/hooks/document-time-provider';
import { useMobileActiveDoc } from '@/components/document/mobile/mobile-shell';
import { MobileMarginChips } from '@/components/document/mobile/mobile-margin-chips';
import { rememberDocumentInHand } from '@/lib/analytics/document-events';
import { useDocumentPresence } from '@/hooks/use-document-presence';
import { useProposal } from '@/hooks/use-proposals';
import { deriveSections, type SectionLineage } from '@/lib/document/section-derivation';
import type { DocumentStateRow } from '@/lib/document/desk-derivation';
import { fmtDay, fmtMonthYear, fmtUsd } from '@/lib/document/format';
import { DocSpine } from '@/components/document/doc-spine';
import { DocLetterhead } from '@/components/document/doc-letterhead';
import { SettledBar } from '@/components/document/settled-bar';
import { ProposalBlocksReadOnly } from '@/components/document/proposal-blocks-readonly';
import { FFESection } from '@/components/document/ffe-section';
import { CoordinationBand } from '@/components/document/coordination/coordination-band';
import { BriefSection } from '@/components/document/brief-section';
import { DiscoverySection, CareSection } from '@/components/document/quiet-sections';
import { MarginRail } from '@/components/document/margin-rail';
import { AccountBand } from '@/components/document/account-band';
import { LetterheadInstruments } from '@/components/document/letterhead-instruments';
import { ProposalInstruments } from '@/components/document/proposal-instruments';
import { FolioLetterhead } from '@/components/document/folio-strip';
import { DocColophon } from '@/components/document/doc-colophon';
import { useDocumentRooms } from '@/hooks/use-document-rooms';
import { gateState, useSectionGates } from '@/hooks/use-section-work';
import { deriveFillState } from '@/lib/document/fill-state';

const prettyPhase = (phase: string | null) =>
  phase
    ? phase
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : null;

type AnyRecord = any;

function vitalsFor(row: DocumentStateRow, project: AnyRecord, proposal: AnyRecord): string {
  if (row.engagement_kind === 'project') {
    return [
      row.client_name,
      prettyPhase(row.current_phase),
      project?.target_completion ? `Target ${fmtMonthYear(project.target_completion)}` : null,
      project?.total_amount_cents != null ? fmtUsd(project.total_amount_cents) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  if (row.engagement_kind === 'proposal') {
    return [
      row.client_name,
      proposal?.total_amount != null ? `${fmtUsd(proposal.total_amount)} proposed` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  if (row.engagement_kind === 'lead') {
    return [row.client_name, 'New inquiry'].filter(Boolean).join(' · ');
  }
  return [row.client_name, 'In discovery'].filter(Boolean).join(' · ');
}

export default function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
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

  const [proposalOpen, setProposalOpen] = useState(false);
  const [highlightLineId, setHighlightLineId] = useState<string | null>(null);
  const [pendingNoteAnchor, setPendingNoteAnchor] = useState<string | null>(null);
  // R24: drags anywhere on the active section land in the folio.
  const [sectionDrag, setSectionDrag] = useState(false);
  const [folioDrop, setFolioDrop] = useState<File[] | null>(null);
  const mainRef = useRef<HTMLElement>(null);

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
  // old-zone visit can name where the designer left from.
  const heldEngagementId = row?.engagement_id ?? null;
  useEffect(() => {
    rememberDocumentInHand(heldEngagementId);
  }, [heldEngagementId]);

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

      <DocSpine sections={sections} others={others} />

      {/* No z-index here: a stacking context on main would trap the fixed
          procurement panels (inspection drawer, Order Assistant) mounted in
          line unfolds beneath the aside rail and the drawer strip. The z-0
          grain painting over content is imperceptible at 1% alpha. */}
      <main ref={mainRef} className="max-w-[1040px] px-7 pb-32 pt-8 min-[980px]:px-12">
        <DocLetterhead
          title={row.title}
          vitals={vitalsFor(row, project, liveProposal)}
          fill={deriveFillState(sections)}
        />

        {/* R27: the letterhead instruments — one quiet DM-mono row under the
            subtitle. R24: the folio's letterhead unfold beneath it. */}
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

        {/* D13: letterhead-anchored margin items (Pulse, section items) as
            chips beneath the title — the desktop margin rail hides on mobile. */}
        <MobileMarginChips
          projectId={row.project_id}
          proposalId={row.proposal_id}
          anchorKind="letterhead"
        />

        {/* Settled bars — letterhead bar + stamp; Proposal unfolds in place. */}
        {settled.map((s) =>
          s.key === 'proposal' && unfoldProposalId ? (
            <SettledBar
              key={s.key}
              name={`Proposal${lineage?.version ? ` · v${lineage.version}` : ''}`}
              stamp={
                seal
                  ? { label: `Signed · ${seal.date}`, color: 'var(--color-sage)', ink: '#85947C' }
                  : undefined
              }
              open={proposalOpen}
              onToggle={() => setProposalOpen((v) => !v)}
            >
              <ProposalBlocksReadOnly proposalId={unfoldProposalId} />
              {seal && (
                <p className="mt-4 border-t border-[var(--color-pearl)] pt-3 text-[10.5px] text-[var(--text-muted)]">
                  {seal.by ? `Signed by ${seal.by} · ${seal.date}` : `Signed · ${seal.date}`}
                </p>
              )}
            </SettledBar>
          ) : (
            (() => {
              // R23: a gate-settled section wears the client's grant.
              const approvedGate = (sectionGates ?? []).find(
                (g) => g.section_key === s.key && gateState(g) === 'approved',
              );
              return (
                <SettledBar
                  key={s.key}
                  name={s.label}
                  hint={s.sub}
                  stamp={
                    approvedGate
                      ? {
                          label: `Approved${approvedGate.responded_at ? ` · ${fmtDay(approvedGate.responded_at)}` : ''}`,
                          color: 'var(--color-sage)',
                          ink: '#85947C',
                        }
                      : undefined
                  }
                />
              );
            })()
          ),
        )}

        {/* R26: the Account Page — engagement money at the top of the
            Project section. Studio eyes only; never mirrored. */}
        {row.engagement_kind === 'project' && row.project_id && (
          <AccountBand projectId={row.project_id} />
        )}

        {/* The active section — exactly one (§4). */}
        <div
          data-active-section
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
          {row.active_section === 'discovery' && <DiscoverySection clientName={row.client_name} />}
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
                <ProposalBlocksReadOnly proposalId={row.proposal_id} />
              </section>
            )}
          {row.active_section === 'project' && row.project_id && (
            <>
              {/* Track 5 — the coordination band (ball-in-court + dependency web).
                  The band resolves designerClientId itself from clientUserId
                  (work-block.tsx pattern); the page passes clientUserId, never a
                  raw uid. Mounts ABOVE the FF&E section in the project home (D1:
                  its sheets are band-local overlays, never a route). */}
              <CoordinationBand
                projectId={row.project_id}
                clientUserId={row.client_profile_id}
                clientName={row.client_name}
              />
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
            </>
          )}
          {row.active_section === 'install' && row.project_id && (
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
          )}
          {row.active_section === 'care' && (
            <>
              <CareSection
                completedLabel={
                  project?.target_completion ? fmtMonthYear(project.target_completion) : null
                }
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
        <MarginRail
          projectId={row.project_id}
          proposalId={row.proposal_id}
          clientName={row.client_name}
          onHoverLine={setHighlightLineId}
          pendingNoteAnchor={pendingNoteAnchor}
          onNoteAnchorConsumed={() => setPendingNoteAnchor(null)}
        />
      </aside>
    </div>
  );
}
