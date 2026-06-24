'use client';

/**
 * ProposalWatch — the "With the client" view (R71). Once a proposal is out the
 * door, the document is parked: nothing the designer does advances it, only the
 * client can (sign / decline / let it expire), short of cloning a revision. So
 * the Proposal section BECOMES a watch view — front and center, in paper grammar
 * — surfacing the engagement we already collect (opens, count, reading time,
 * most-read section) that until now only lived on the legacy /tracking page.
 *
 * Renders for every non-draft proposal:
 *   · awaiting (sent / viewed / revised) — the full watch (figures · the client's
 *     copy as sent · the record · acts).
 *   · terminal (expired / declined) — the same watch, acts lead with Revise.
 *   · settled (accepted) — collapses to a one-line SIGNED seal (the project is
 *     open; the document has advanced).
 *
 * All state lives in the figures strip + the record (the engagement log). Flat:
 * left-accent + hairlines, zero shadows (D4); no motion (the breath stays on the
 * spine). Overlays (Preview / Revise / Resend) are local state over the still-
 * mounted document (D1).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { familyLabel } from '@/lib/document/family-label';
import { useProposalWatch } from '@/hooks/use-proposal-watch';
import { useNudgeProposal } from '@/hooks/use-proposals';
import { useToast } from '@/components/portal/toast-provider';
import type { ProposalWatchModel } from '@/lib/document/proposal-watch-derivation';
import { Stamp } from './stamp';
import { Instrument, InstrumentRow } from './instrument';
import { ProposalVersionHistory } from './proposal-version-history';
import { ProposalPreview } from './proposal-preview';
import { ProposalPreviewRail } from './drafting/proposal-mirror';
import { SendSheet } from './overlays/send-sheet';
import { ReviseSheet } from './overlays/revise-sheet';

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));

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

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
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
  const { watch: w } = useProposalWatch(proposalId);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);

  const nudge = useNudgeProposal();
  const { toast } = useToast();
  const family = familyLabel(clientName);

  // Send the client a gentle reminder. The RPC stamps + cools down; the email is
  // best-effort (surfaced via _emailDispatched), so we toast the real outcome.
  const onNudge = async () => {
    try {
      const res = await nudge.mutateAsync({ proposalId });
      toast(
        res._emailDispatched
          ? `Reminder sent to ${family}.`
          : `Nudge recorded, but the email couldn’t be sent — follow up directly.`,
        res._emailDispatched ? 'success' : 'warning',
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not send the reminder.', 'error');
    }
  };

  // Draft (handled by the work band) or still loading — nothing to watch.
  if (!w || (!w.awaitingClient && !w.terminal && !w.settled)) return null;

  // Settled (accepted) — the document advanced; collapse to a quiet seal.
  if (w.settled) {
    return (
      <div className="mt-1 flex items-center gap-3 rounded-[5px] border border-[var(--color-pearl)] bg-[rgba(168,181,160,0.12)] px-4 py-3">
        <Stamp label="SIGNED" color="var(--color-sage)" />
        <p className="text-[12.5px] text-[var(--color-charcoal)]">
          Signed{w.acceptedAt ? ` ${fmtDay(w.acceptedAt)}` : ''} — the project is open.
        </p>
        <span className="ml-auto">
          <ProposalVersionHistory proposalId={proposalId} />
        </span>
      </div>
    );
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
          sub={w.openedCount > 0 && w.lastOpenedAt ? `last ${fmtDay(w.lastOpenedAt)}` : undefined}
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
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--color-clay)] hover:opacity-80"
          >
            Preview as {family} →
          </button>
        </div>
        <div className="relative max-h-[260px] overflow-hidden rounded-[8px] border border-[var(--doc-ink-border)] bg-white px-5 py-5">
          <ProposalPreviewRail proposalId={proposalId} clientName={clientName} />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent"
          />
        </div>
      </div>

      {/* The aging line + the record (the per-open log) */}
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <p className="text-[12px] text-[var(--color-aged-oak)]">{statusLine(w)}</p>
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

      {/* Acts — terminal leads with Revise; the chain reads itself. */}
      <InstrumentRow className="mt-4">
        {w.terminal ? (
          <>
            <Instrument variant="primary" trailing="→" onClick={() => setReviseOpen(true)}>
              Revise
            </Instrument>
            <Instrument variant="secondary" onClick={() => setResendOpen(true)}>
              Resend · new expiry
            </Instrument>
          </>
        ) : (
          <>
            <Instrument variant="secondary" onClick={() => setReviseOpen(true)}>
              Request a change · Revise
            </Instrument>
            {/* Nudge — a gentle reminder while it's in their hands. After a nudge
                it rests for the cooldown, reading "Nudged {date}" so the designer
                sees it's already been done (and can't pester). */}
            {w.canNudge ? (
              <Instrument variant="secondary" disabled={nudge.isPending} onClick={onNudge}>
                {nudge.isPending ? 'Nudging…' : `Nudge ${family}`}
              </Instrument>
            ) : (
              w.lastNudgedAt && (
                <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  Nudged {fmtDay(w.lastNudgedAt)}
                </span>
              )
            )}
          </>
        )}
        <ProposalVersionHistory proposalId={proposalId} />
      </InstrumentRow>

      {/* Overlays — local state over the still-mounted document (D1). */}
      <ReviseSheet
        proposalId={proposalId}
        open={reviseOpen}
        onClose={() => setReviseOpen(false)}
        onOpened={(newProposalId) => router.push(`/doc/${newProposalId}`)}
      />
      <SendSheet proposalId={proposalId} open={resendOpen} onClose={() => setResendOpen(false)} />
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
