'use client';

/**
 * ProposalWatch — the "With the client" view (R71). Once a proposal is out the
 * door, the document is parked: nothing the designer does advances it, only the
 * client can (sign / decline / let it expire). So the Proposal section BECOMES
 * a watch view — front and center, in paper grammar — surfacing the engagement
 * we already collect (opens, count, reading time, most-read section) that until
 * now only lived on the legacy /tracking page.
 *
 * Renders for every non-draft proposal:
 *   · awaiting (sent / viewed / revised) — the full watch (figures · the client's
 *     copy as sent · the record · acts).
 *   · terminal (expired / declined) — the same watch. Legacy retirement: Revise
 *     is gone (no new legacy sending) — guidance copy explains a changed mind
 *     now travels as a design services agreement, not a cloned revision.
 *   · settled (accepted) — collapses to a one-line SIGNED seal. The seal READS
 *     whether a project actually exists (F10, walk 2026-07): if it does, "the
 *     project is open" is a doorway into it; if not (a sign that didn't
 *     auto-activate), the seal carries the act itself — Open the project →
 *     via activate_proposal_as_project, the R44 two-step safety net (I7).
 *
 * All state lives in the figures strip + the record (the engagement log). Flat:
 * left-accent + hairlines, zero shadows (D4); no motion (the breath stays on the
 * spine). Overlays (Preview / Resend) are local state over the still-mounted
 * document (D1).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useActivateProposal } from '@patina/supabase';
import { familyLabel } from '@/lib/document/family-label';
import { useProposalWatch } from '@/hooks/use-proposal-watch';
import { useProposalProject } from '@/hooks/use-proposal-project';
import { useProposal } from '@/hooks/use-proposals';
import type { ProposalWatchModel } from '@/lib/document/proposal-watch-derivation';
import { Stamp } from './stamp';
import {
  DocumentAction,
  DocumentActionGroup,
  DocumentActionRow,
} from './document-action';
import { ProposalVersionHistory } from './proposal-version-history';
import { ProposalShareInstrument } from './proposal-share-instrument';
import { ProposalPreview } from './proposal-preview';
import { ProposalPreviewRail } from './drafting/proposal-mirror';
import { SendSheet } from './overlays/send-sheet';
import { MarkSignedSheet } from './overlays/mark-signed-sheet';
import { useMobilePrimaryAction } from './mobile/mobile-shell';
import {
  MOBILE_ACTION_PRIORITY,
  signedProposalMobileAction,
} from './mobile/lifecycle-mobile-action';

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(iso),
  );

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
    .format(new Date(iso))
    .replace(/\s/g, '')
    .toLowerCase();

const fmtMinutes = (seconds: number) => {
  if (!seconds) return '—';
  const m = Math.round(seconds / 60);
  return m < 1 ? '<1 min' : `${m} min`;
};

/** The human read of where the proposal stands (under the figures). */
function statusLine(w: ProposalWatchModel): string {
  switch (w.status) {
    case 'sent':
      return w.isAwaitingAged
        ? `Sent${w.sentAt ? ` ${fmtDay(w.sentAt)}` : ''} · ${w.awaitingDays}d sitting, not yet opened`
        : `Sent${w.sentAt ? ` ${fmtDay(w.sentAt)}` : ''} · not yet opened`;
    case 'viewed':
      return w.isAwaitingAged
        ? `Awaiting signature · ${w.awaitingDays} days`
        : `Opened${w.lastOpenedAt ? ` ${fmtDay(w.lastOpenedAt)}` : ''} · awaiting signature`;
    case 'revised':
      return 'Superseded by a newer version';
    case 'expired':
      return `Expired${w.sentAt ? ` · sent ${fmtDay(w.sentAt)}` : ''}`;
    case 'declined':
      return 'Declined by the client';
    default:
      return '';
  }
}

function Figure({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex-1 px-4 first:pl-0">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
        {label}
      </p>
      <p className="mt-1 truncate font-heading text-[1.05rem] leading-none text-[var(--color-charcoal)]">
        {value}
      </p>
      {sub && (
        <p className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {sub}
        </p>
      )}
    </div>
  );
}

export function ProposalWatch({
  proposalId,
  clientName,
}: {
  proposalId: string;
  clientName: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { watch: w } = useProposalWatch(proposalId);
  // The proposal's client-visibility tier seeds the share-link matrix (cached —
  // the same read the letterhead instruments already hold).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: proposal } = useProposal(proposalId) as { data: any };

  const [previewOpen, setPreviewOpen] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [markSignedOpen, setMarkSignedOpen] = useState(false);

  const family = familyLabel(clientName);
  const signable =
    w?.status === 'sent' || w?.status === 'viewed' || w?.status === 'expired';

  useMobilePrimaryAction(
    w && !w.settled && signable
      ? {
          actionKey: 'mark-proposal-signed',
          surfaceKey: 'open-document',
          regionKey: 'proposal-watch-actions',
          label: 'Mark signed',
          target: { kind: 'press', onPress: () => setMarkSignedOpen(true) },
        }
      : null,
    { priority: MOBILE_ACTION_PRIORITY.lifecycle },
  );

  // Draft (handled by the work band) or still loading — nothing to watch.
  if (!w || (!w.awaitingClient && !w.terminal && !w.settled)) return null;

  // Settled (accepted) — collapse to a quiet seal that reads whether the
  // project actually exists (F10) and carries the doorway or the act.
  if (w.settled) {
    return <SignedSeal proposalId={proposalId} acceptedAt={w.acceptedAt} />;
  }

  return (
    <div
      className="mt-1 border-l-[2.5px] py-1 pl-4"
      style={{ borderLeftColor: w.stamp.color }}
      data-testid="proposal-watch"
      data-watch-status={w.status}
    >
      {/* Eyebrow + the state stamp */}
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
          With the client
        </p>
        <Stamp label={w.stamp.label} color={w.stamp.color} ink={w.stamp.ink} />
      </div>

      {/* The figures strip — front and center: sent · opened · reading · most-read */}
      <div className="flex items-stretch divide-x divide-[var(--doc-ink-border)] border-y border-[var(--doc-ink-border)] py-3">
        <Figure label="Sent" value={w.sentAt ? fmtDay(w.sentAt) : '—'} />
        <Figure
          label="Opened"
          value={w.openedCount > 0 ? `${w.openedCount}×` : 'not yet'}
          sub={
            w.openedCount > 0 && w.lastOpenedAt
              ? `last ${fmtDay(w.lastOpenedAt)}`
              : undefined
          }
        />
        <Figure label="Reading" value={fmtMinutes(w.readingSeconds)} />
        <Figure label="Most read" value={w.mostReadSectionLabel ?? '—'} />
      </div>

      {/* The client's copy, as sent — a quiet peek; Preview opens it full-screen */}
      <div className="mt-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
            The client&rsquo;s copy · as sent
          </span>
          <DocumentAction
            actionKey="preview-proposal-as-client"
            surfaceKey="open-document"
            regionKey="proposal-preview"
            variant="secondary"
            onClick={() => setPreviewOpen(true)}
          >
            Preview as {family}
          </DocumentAction>
        </div>
        <div className="relative max-h-[260px] overflow-hidden rounded-[8px] border border-[var(--doc-ink-border)] bg-white px-5 py-5">
          <ProposalPreviewRail
            proposalId={proposalId}
            clientName={clientName}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent"
          />
        </div>
      </div>

      {/* The aging line + the record (the per-open log) */}
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <p className="text-[12px] text-[var(--color-aged-oak)]">
          {statusLine(w)}
        </p>
        {w.record.length > 0 && (
          <button
            type="button"
            onClick={() => setRecordOpen((o) => !o)}
            aria-expanded={recordOpen}
            className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)] hover:text-[var(--color-clay)]"
          >
            the record {recordOpen ? '↑' : '↓'}
          </button>
        )}
      </div>

      {recordOpen && (
        <ol className="mt-2 rounded-[5px] border border-[var(--color-pearl)] bg-[rgba(252,250,246,0.7)] px-4 py-2.5">
          {w.record.map((r, i) => (
            <li
              key={`${r.at}-${i}`}
              className="flex items-baseline gap-3 border-b border-dashed border-[var(--color-pearl)] py-1.5 last:border-b-0"
            >
              <span className="w-[46px] shrink-0 font-mono text-[10px] text-[var(--color-charcoal)]">
                {fmtDay(r.at)}
              </span>
              <span className="w-[52px] shrink-0 font-mono text-[9px] text-[var(--text-muted)]">
                {fmtTime(r.at)}
              </span>
              <span className="text-[11.5px] text-[var(--color-charcoal)]">
                {r.kind === 'dispatched' ? 'Dispatched' : 'Opened'}
                {r.minutes ? ` · ${r.minutes} min` : ''}
                {r.sectionLabel ? ` · lingered on ${r.sectionLabel}` : ''}
              </span>
            </li>
          ))}
        </ol>
      )}

      <DocumentActionGroup
        surfaceKey="open-document"
        regionKey="proposal-watch-actions"
        className="mt-4"
        aria-label="Proposal actions"
      >
        {w.terminal ? (
          <DocumentAction
            actionKey="resend-proposal"
            variant="secondary"
            onClick={() => setResendOpen(true)}
          >
            Email delivery status
          </DocumentAction>
        ) : (
          /* SP3: the nudge (and its cooled-down "nudged {date}" state) moved to
             the send-wall state line above, so the word prints once per wall. */
          <DocumentAction
            actionKey="proposal-email-delivery"
            variant="secondary"
            onClick={() => setResendOpen(true)}
          >
            Email delivery
          </DocumentAction>
        )}
        {/* Mark signed — the designer records a paper signature (R92). Only for a
            proposal that's out and still signable (not revised/declined). */}
        {signable && (
          <DocumentAction
            actionKey="mark-proposal-signed"
            variant="primary"
            trailing="→"
            onClick={() => setMarkSignedOpen(true)}
          >
            Mark signed
          </DocumentAction>
        )}
        <ProposalShareInstrument
          proposalId={proposalId}
          tier={proposal?.client_visibility_tier}
        />
        <ProposalVersionHistory proposalId={proposalId} />
      </DocumentActionGroup>

      {/* Legacy retirement: Revise is gone — a changed mind travels as a new
          design services agreement, not a cloned revision of this one. */}
      <p className="mt-2 border-l-2 border-[var(--color-aged-oak)] pl-3 text-[12px] text-[var(--text-muted)]">
        Changes now travel as a design services agreement.
      </p>

      {/* Overlays — local state over the still-mounted document (D1). */}
      <SendSheet
        proposalId={proposalId}
        open={resendOpen}
        onClose={() => setResendOpen(false)}
      />
      <MarkSignedSheet
        proposalId={proposalId}
        clientName={clientName}
        open={markSignedOpen}
        onClose={() => setMarkSignedOpen(false)}
        onSigned={(projectId) => {
          // One act, many surfaces: the signed proposal folder re-derives away
          // (shape B → A) and we walk into the new document.
          void qc.invalidateQueries({ queryKey: ['document-state'] });
          router.push(`/doc/${projectId}`);
        }}
      />
      {previewOpen && (
        <ProposalPreview
          proposalId={proposalId}
          clientName={clientName}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * SignedSeal — the settled (accepted) band (F10, walk 2026-07). The old seal
 * statically claimed "the project is open"; a sign that did not auto-activate
 * (sign_proposal with p_auto_activate=false, or the legacy route) has no
 * project, so the Desk's "Signed — open the project" need (I7) dead-ended here.
 *
 * Now the seal reads the truth (useProposalProject, whole chain):
 *   · project exists — "the project is open →" is a doorway into `/doc/{id}`.
 *   · no project — the seal carries the act: one solid quiet button calling
 *     activate_proposal_as_project (the SAME activation sign_proposal delegates
 *     to — the R44 two-step safety net). One act, many surfaces: on success the
 *     Desk grain is invalidated (the proposal_signed folder derives away, the
 *     engagement becomes shape A) and we walk into the new document.
 *   · failure — a quiet inline terracotta line at the act site (R83, no toast);
 *     the button stays as the retry.
 */
function SignedSeal({
  proposalId,
  acceptedAt,
}: {
  proposalId: string;
  acceptedAt: string | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: link, isLoading } = useProposalProject(proposalId);
  const activate = useActivateProposal();
  const [activateError, setActivateError] = useState<string | null>(null);

  const projectId = link?.projectId ?? null;
  const signedLine = `Signed${acceptedAt ? ` ${fmtDay(acceptedAt)}` : ''}`;

  const onOpenProject = async () => {
    setActivateError(null);
    try {
      const newProjectId = await activate.mutateAsync({ proposalId });
      // The Desk reads document_state under its own keys — clear the grain so
      // the signed folder re-derives away, then walk into the new document.
      void qc.invalidateQueries({ queryKey: ['document-state'] });
      void qc.invalidateQueries({ queryKey: ['proposal-project', proposalId] });
      router.push(`/doc/${newProjectId}`);
    } catch (e) {
      setActivateError(
        e instanceof Error ? e.message : 'the activation did not go through',
      );
    }
  };

  useMobilePrimaryAction(
    signedProposalMobileAction({
      projectId,
      isLoading,
      isPending: activate.isPending,
      onActivate: () => void onOpenProject(),
    }),
    { priority: MOBILE_ACTION_PRIORITY.lifecycle },
  );

  return (
    <DocumentActionGroup
      surfaceKey="open-document"
      regionKey="signed-proposal"
      className="mt-1 !block rounded-[5px] border border-[var(--color-pearl)] bg-[rgba(168,181,160,0.12)] px-4 py-3"
      aria-label="Signed proposal"
    >
      <div className="flex items-center gap-3">
        <Stamp label="SIGNED" color="var(--color-sage)" />
        <p className="text-[12.5px] text-[var(--color-charcoal)]">
          {projectId ? (
            <>{signedLine} — the project is open.</>
          ) : isLoading ? (
            signedLine
          ) : (
            `${signedLine} — waiting on your hand to open the project.`
          )}
        </p>
        <DocumentActionRow
          surfaceKey="open-document"
          regionKey="signed-proposal"
          className="ml-auto shrink-0"
          aria-label="Signed proposal actions"
        >
          {projectId && (
            <DocumentAction
              actionKey="open-project"
              variant="primary"
              trailing="→"
              href={`/doc/${projectId}`}
            >
              Open the project
            </DocumentAction>
          )}
          {!isLoading && !projectId && (
            <DocumentAction
              actionKey="open-project"
              variant="primary"
              loading={activate.isPending}
              loadingLabel="Opening…"
              trailing="→"
              onClick={() => void onOpenProject()}
            >
              Open the project
            </DocumentAction>
          )}
          <ProposalVersionHistory proposalId={proposalId} />
        </DocumentActionRow>
      </div>
      {activateError && (
        <p role="alert" className="mt-2 text-[11.5px] text-[#C77B6E]">
          Could not open the project — {activateError}. Try again.
        </p>
      )}
    </DocumentActionGroup>
  );
}
