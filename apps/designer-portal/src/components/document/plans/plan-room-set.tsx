'use client';

/**
 * The current set, the drawing log, and the transmittals — the room's resting
 * face.
 *
 * Every holder line here is read off transmittals by `deriveHolders`, the one
 * derivation the band and the ceremony read too. When anyone is behind, one
 * golden-hour band across the page says so and offers the single act that fixes
 * it — issue the current set.
 *
 * The transmittals ledger is where a link's life is managed after it is sent.
 * Reissue mints a fresh token (the old one dies with it) and shows it once;
 * Revoke ends the link without erasing the record, because a transmittal is a
 * statement about the past and the past does not un-happen.
 *
 * The ledgers are CSS grids, never <table>: the Document's ledgers are ruled
 * paper, not tabular data (D4 · zero shadows throughout).
 */

import { useState } from 'react';
import {
  useReissuePlanTransmittalLink,
  useRevokePlanTransmittalLink,
  type PlanRoomBundle,
} from '@patina/supabase';
import {
  deriveCurrentSet,
  deriveDrawingLog,
  deriveHolders,
  holderSentence,
  type DrawingLogEvent,
} from '@/lib/plans/model';
import { fmtDay } from '@/lib/document/format';
import { resolveClientPortalOrigin } from '@/lib/client-portal-url';
import { planRoomEvents } from '@/lib/analytics/plan-room-events';
import { DocumentAction, DocumentActionRow } from '../document-action';
import { SectionEyebrow } from '../section-eyebrow';
import { StatusChip } from '../status-chip';
import { PlanLinkOnce } from './plan-link-once';
import { GuidedEmptyState } from '../guided-empty-state';

const STATE_WORD: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'var(--color-aged-oak)' },
  shared: { label: 'Shared', color: '#85947C' },
};

const EVENT_COLOR: Record<DrawingLogEvent, string> = {
  filed: 'var(--color-aged-oak)',
  flipped: 'var(--color-golden-hour)',
  issued: '#85947C',
  transmitted: 'var(--color-clay)',
};

/** The rev letter as a drawing wears it: a small ruled box, not a pill. */
function RevLetterBadge({ letter }: { letter: string | null }) {
  return (
    <span className="inline-flex min-h-[22px] min-w-[22px] items-center justify-center border border-[var(--color-aged-oak)] px-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-charcoal)]">
      {letter ?? '—'}
    </span>
  );
}

export interface PlanRoomSetProps {
  projectId: string;
  bundle: PlanRoomBundle;
  onOpenSheet: (sheetId: string) => void;
  onIssue: () => void;
  onChooseFile: () => void;
}

export function PlanRoomSet({
  projectId,
  bundle,
  onOpenSheet,
  onIssue,
  onChooseFile,
}: PlanRoomSetProps) {
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Record<string, string>>({});
  const [reissued, setReissued] = useState<Record<string, string>>({});
  const revokeLink = useRevokePlanTransmittalLink(projectId);
  const reissueLink = useReissuePlanTransmittalLink(projectId);

  const set = deriveCurrentSet(bundle);
  const holders = deriveHolders(bundle);
  const log = deriveDrawingLog(bundle);
  const behind = holders.filter((holder) => holder.behindCount > 0);

  const transmittals = [...bundle.transmittals].sort((a, b) =>
    a.sent_at === b.sent_at
      ? a.id < b.id
        ? 1
        : -1
      : a.sent_at < b.sent_at
        ? 1
        : -1,
  );

  const tokenFor = (transmittalId: string) =>
    bundle.tokens
      .filter((token) => token.transmittal_id === transmittalId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ?? null;

  const revoke = async (transmittalId: string) => {
    setOutcome((prev) => ({ ...prev, [transmittalId]: '' }));
    try {
      await revokeLink.mutateAsync(transmittalId);
      setOutcome((prev) => ({ ...prev, [transmittalId]: 'Link revoked.' }));
      planRoomEvents.transmittalRevoked({
        project_id: projectId,
        transmittal_id: transmittalId,
      });
    } catch (error) {
      setOutcome((prev) => ({
        ...prev,
        [transmittalId]:
          error instanceof Error ? error.message : 'It could not be revoked.',
      }));
    }
    setConfirmRevoke(null);
  };

  const reissue = async (transmittalId: string) => {
    setOutcome((prev) => ({ ...prev, [transmittalId]: '' }));
    try {
      const result = await reissueLink.mutateAsync(transmittalId);
      const origin = resolveClientPortalOrigin(
        typeof window === 'undefined' ? undefined : window.location.origin,
      );
      // The raw token, held only for this render. Never cached, never stored.
      setReissued((prev) => ({
        ...prev,
        [transmittalId]: `${origin}/plans/${result.token}`,
      }));
    } catch (error) {
      setOutcome((prev) => ({
        ...prev,
        [transmittalId]:
          error instanceof Error ? error.message : 'A new link could not be minted.',
      }));
    }
  };

  if (set.length === 0) {
    return (
      <section aria-label="The light table" className="mx-auto max-w-[42rem] px-4 py-12 md:px-8">
        <GuidedEmptyState
          title="Start the current drawing set"
          description="Choose a PDF set; the light table splits it and proposes where each page belongs before anything becomes current."
          inputs={['PDF drawing set', 'Sheet titles and numbers', 'Current revision']}
          action={{ key: 'choose-plan-pdf-empty', label: 'Choose a PDF', onClick: onChooseFile }}
        />
      </section>
    );
  }

  return (
    <section aria-label="The current set" className="px-4 py-6 md:px-8">
      {behind.length > 0 && (
        <div
          data-plan-holder-band
          className="mb-6 flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2 border-l-2 border-[var(--color-golden-hour)] bg-white/40 px-3 py-2.5"
        >
          <div className="min-w-0">
            {behind.map((holder) => (
              <p
                key={holder.partyKey}
                className="text-[0.82rem] text-[var(--color-charcoal)]"
              >
                {holderSentence(holder, fmtDay(holder.sentAt))}
              </p>
            ))}
          </div>
          <DocumentActionRow
            surfaceKey="plan-room"
            regionKey="holders-behind"
            aria-label="Bring the holders current"
          >
            <DocumentAction
              actionKey="issue-current-set-band"
              variant="primary"
              onClick={onIssue}
            >
              Issue the current set
            </DocumentAction>
          </DocumentActionRow>
        </div>
      )}

      <SectionEyebrow count={set.length}>The current set</SectionEyebrow>
      <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {set.map((row) => {
          const held = holders
            .flatMap((holder) =>
              holder.holds
                .filter((sheet) => sheet.sheetId === row.sheetId)
                .map((sheet) => ({ holder, sheet })),
            )
            .sort((a, b) =>
              a.holder.partyDisplayName < b.holder.partyDisplayName ? -1 : 1,
            );
          const word = STATE_WORD[row.state] ?? {
            label: row.state,
            color: 'var(--color-aged-oak)',
          };
          return (
            <button
              key={row.sheetId}
              type="button"
              onClick={() => onOpenSheet(row.sheetId)}
              className="flex min-h-[44px] flex-col items-start gap-1.5 border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] p-3 text-left hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <RevLetterBadge letter={row.revLetter} />
                  <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-charcoal)]">
                    {row.sheetNumber}
                  </span>
                </span>
                <StatusChip label={word.label} color={word.color} />
              </span>
              <span className="line-clamp-2 text-[0.82rem] text-[var(--color-charcoal)]">
                {row.title}
              </span>
              {held.length > 0 && (
                <span className="mt-0.5 flex flex-col gap-0.5">
                  {held.map(({ holder, sheet }) => (
                    <span
                      key={holder.partyKey}
                      className={`font-mono text-[11px] uppercase tracking-[0.1em] ${
                        sheet.behind
                          ? 'text-[var(--color-golden-hour)]'
                          : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {holder.partyDisplayName} holds Rev {sheet.heldRev}
                    </span>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <SectionEyebrow count={log.length}>The drawing log</SectionEyebrow>
      {/* The header sits OUTSIDE the list: a column heading is not a list item,
          and a screen reader counting it as one miscounts the log. */}
      <div
        aria-hidden
        className="grid grid-cols-[5.5rem_7rem_minmax(0,1fr)] gap-3 border-b border-[var(--color-pearl)] pb-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)] sm:grid-cols-[6rem_7rem_minmax(0,1fr)_12rem]"
      >
        <span>When</span>
        <span>Event</span>
        <span>What</span>
        <span className="hidden sm:block">Who</span>
      </div>
      <div role="list" aria-label="Drawing log" className="mb-10 grid">
        {log.map((row) => (
          <div
            key={row.key}
            role="listitem"
            className="grid grid-cols-[5.5rem_7rem_minmax(0,1fr)] gap-3 border-b border-[var(--color-pearl)] py-2 sm:grid-cols-[6rem_7rem_minmax(0,1fr)_12rem]"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
              {fmtDay(row.at)}
            </span>
            <span>
              <StatusChip label={row.event} color={EVENT_COLOR[row.event]} />
            </span>
            <span className="text-[0.8rem] text-[var(--color-charcoal)]">
              {row.what}
            </span>
            <span className="col-span-3 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)] sm:col-span-1">
              {row.who ?? ''}
            </span>
          </div>
        ))}
      </div>

      {transmittals.length > 0 && (
        <>
          <SectionEyebrow count={transmittals.length}>Transmittals</SectionEyebrow>
          <div
            aria-hidden
            className="grid grid-cols-[minmax(0,1fr)_6rem_5.5rem] gap-3 border-b border-[var(--color-pearl)] pb-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)] sm:grid-cols-[minmax(0,1fr)_6rem_5.5rem_8rem_minmax(0,14rem)]"
          >
            <span>Recipient</span>
            <span>For</span>
            <span>Sent</span>
            <span className="hidden sm:block">Opened</span>
            <span className="hidden sm:block">Link</span>
          </div>
          <div role="list" aria-label="Transmittals" className="grid">
            {transmittals.map((transmittal) => {
              const token = tokenFor(transmittal.id);
              const expired =
                token != null &&
                token.status === 'active' &&
                token.expires_at < new Date().toISOString();
              const linkWord = !token
                ? 'no link'
                : token.status === 'revoked'
                  ? 'revoked'
                  : expired
                    ? 'expired'
                    : 'live';
              const link = reissued[transmittal.id];
              return (
                <div
                  key={transmittal.id}
                  role="listitem"
                  data-plan-transmittal-row
                  className="border-b border-[var(--color-pearl)] py-2.5"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_6rem_5.5rem] items-baseline gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_5.5rem_8rem_minmax(0,14rem)]">
                    <span className="min-w-0 text-[0.82rem] text-[var(--color-charcoal)]">
                      {transmittal.party_display_name}
                      {transmittal.party_company &&
                      transmittal.party_company !== transmittal.party_display_name
                        ? ` · ${transmittal.party_company}`
                        : ''}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      {transmittal.purpose}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      {fmtDay(transmittal.sent_at)}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      {token?.first_opened_at
                        ? fmtDay(token.first_opened_at)
                        : 'not opened'}
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusChip
                        label={linkWord}
                        color={
                          linkWord === 'live'
                            ? '#85947C'
                            : linkWord === 'revoked'
                              ? 'var(--color-terracotta)'
                              : 'var(--color-aged-oak)'
                        }
                      />
                    </span>
                  </div>

                  <DocumentActionRow
                    surfaceKey="plan-room"
                    regionKey={`transmittal-${transmittal.id}`}
                    aria-label={`Link for ${transmittal.party_display_name}`}
                  >
                    <DocumentAction
                      actionKey="reissue-plan-link"
                      variant="secondary"
                      loading={reissueLink.isPending}
                      loadingLabel="Minting…"
                      onClick={() => reissue(transmittal.id)}
                    >
                      Reissue the link
                    </DocumentAction>
                    {confirmRevoke === transmittal.id ? (
                      <DocumentAction
                        actionKey="confirm-revoke-plan-link"
                        variant="danger"
                        onClick={() => revoke(transmittal.id)}
                      >
                        Revoke it — they lose this link
                      </DocumentAction>
                    ) : (
                      <DocumentAction
                        actionKey="revoke-plan-link"
                        variant="tertiary"
                        disabled={!token || token.status === 'revoked'}
                        onClick={() => setConfirmRevoke(transmittal.id)}
                      >
                        Revoke
                      </DocumentAction>
                    )}
                  </DocumentActionRow>

                  {link && (
                    <PlanLinkOnce url={link} regionKey={`reissued-${transmittal.id}`} />
                  )}
                  {outcome[transmittal.id] && (
                    <p
                      role="status"
                      className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-terracotta-ink)]"
                    >
                      {outcome[transmittal.id]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
