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

import { useRef, useState } from 'react';
import {
  useProfile,
  useProjectRoster,
  useReissuePlanTransmittalLink,
  useRevokePlanTransmittalLink,
  type PlanRoomBundle,
  type PlanPrint,
  type Database,
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
import { EmptyState } from '../empty-state';
import { PlanPrintViewer } from './plan-print-viewer';

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

export function PlanPrintProvenance({ print, projectId }: { print: PlanPrint; projectId: string }) {
  const roster = useProjectRoster(projectId);
  const profile = useProfile();
  const rosterName = roster.data?.find((person) => person.profile_id === print.created_by)?.display_name?.trim();
  const ownName = profile.data?.id === print.created_by
    ? profile.data?.display_name?.trim() || profile.data?.full_name?.trim()
    : undefined;
  const filer = rosterName || ownName;
  return (
    <span className="t-meta block break-words" data-print-filer={print.created_by ?? undefined}>
      Source: {print.source || 'not recorded'}
      {print.source_filename ? ` · ${print.source_filename}` : ''}
      {' · '}{print.created_by ? `Filed by ${filer || 'a person whose name is unavailable'}` : 'Filer not recorded'}
    </span>
  );
}

/** Present composition by IDs; these live links are not an issued manifest. */
export function PlanSheetComposition({
  bundle,
  sheetId,
  rooms = [],
}: {
  bundle: PlanRoomBundle;
  sheetId: string;
  rooms?: Pick<Database['public']['Tables']['project_rooms']['Row'], 'id' | 'name'>[];
}) {
  const roomLinks = (bundle.sheetRooms ?? []).filter((row) => row.sheet_id === sheetId);
  const packageLinks = (bundle.sheetPackages ?? []).filter((row) => row.sheet_id === sheetId);
  return (
    <span className="t-meta block break-words" data-sheet-composition={sheetId}>
      <span className="block">
        {roomLinks.length === 0 ? 'No room link · whole-job drawing' : 'Rooms: '}
        {roomLinks.map((link, index) => (
          <span key={link.project_room_id} data-room-id={link.project_room_id}>
            {index > 0 ? ' · ' : ''}
            {rooms.find((room) => room.id === link.project_room_id)?.name ?? 'Room no longer on this job'}
          </span>
        ))}
      </span>
      {packageLinks.length === 0 && <span className="block">No package link</span>}
      {packageLinks.map((link) => {
        const pack = bundle.packages?.find((row) => row.id === link.package_id);
        return (
          <span className="block" key={link.package_id} data-package-id={link.package_id}>
            {pack
              ? `${pack.code} · ${pack.title}${pack.archived_at ? ' · Archived' : ''} · ${pack.package_key ?? 'Composition only · no agreed-scope key'}`
              : 'Linked package unavailable'}
          </span>
        );
      })}
      <span className="block">Current composition · not an issued package or authority to fabricate</span>
    </span>
  );
}

export interface PlanRoomSetProps {
  projectId: string;
  bundle: PlanRoomBundle;
  rooms?: Pick<Database['public']['Tables']['project_rooms']['Row'], 'id' | 'name'>[];
  onOpenSheet: (sheetId: string) => void;
  onIssue: () => void;
  onChooseFile: () => void;
}

export function PlanRoomSet({
  projectId,
  bundle,
  rooms,
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

  if (set.length === 0 && bundle.issues.length === 0) {
    return (
      <section aria-label="The light table" className="max-w-[42rem] px-4 py-12 md:px-8">
        {/* The one empty state (US-28 S1; chrome-p5), never a dashed box. */}
        <EmptyState
          eyebrow="Plans"
          act={
            <DocumentAction
              actionKey="choose-plan-pdf-empty"
              surfaceKey="plan-room"
              regionKey="plans-empty"
              variant="secondary"
              onClick={onChooseFile}
            >
              Bring in a drawing set
            </DocumentAction>
          }
        >
          No plans yet. Bring in a drawing set to begin.
        </EmptyState>
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
            aria-label="Update drawing recipients"
          >
            <DocumentAction
              actionKey="issue-current-set-band"
              variant="primary"
              onClick={onIssue}
            >
              Issue current set
            </DocumentAction>
          </DocumentActionRow>
        </div>
      )}

      <SectionEyebrow count={set.length}>Current set</SectionEyebrow>
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
              className="flex min-h-[44px] flex-col items-start gap-1.5 border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] p-3 text-left hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
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
              <PlanSheetComposition bundle={bundle} sheetId={row.sheetId} rooms={rooms} />
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

      <PlanIssueHistory bundle={bundle} projectId={projectId} />

      <SectionEyebrow count={log.length}>Drawing register</SectionEyebrow>
      {/* The header sits OUTSIDE the list: a column heading is not a list item,
          and a screen reader counting it as one miscounts the log. */}
      <div
        aria-hidden
        className="grid grid-cols-[5.5rem_7rem_minmax(0,1fr)] gap-3 border-b border-[var(--color-pearl)] pb-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)] sm:grid-cols-[6rem_7rem_minmax(0,1fr)_12rem]"
      >
        <span>Date</span>
        <span>Event</span>
        <span>Drawing or change</span>
        <span className="hidden sm:block">Person</span>
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
            <span>Purpose</span>
            <span>Sent</span>
            <span className="hidden sm:block">Opened</span>
            <span className="hidden sm:block">Access link</span>
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
                      Reissue access link
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
                        Revoke access
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

/** Issue rows are frozen snapshots, never reconstructed from the current set. */
export function PlanIssueHistory({ bundle, projectId }: { bundle: PlanRoomBundle; projectId: string }) {
  const [openIssuePrintId, setOpenIssuePrintId] = useState<string | null>(null);
  const issuePrintOpener = useRef<HTMLElement | null>(null);
  const snapshot = bundle.issuePrints.find(
    (print) => print.id === openIssuePrintId,
  );
  const openPrint = bundle.prints.find((print) => print.id === snapshot?.print_id);
  const openSheet = bundle.sheets.find(
    (sheet) => sheet.id === openPrint?.sheet_id,
  );
  return (
    <section aria-label="Issued print history" className="my-6 min-w-0">
      <SectionEyebrow count={bundle.issues.length}>
        Issued print history
      </SectionEyebrow>
      <p className="t-meta my-2">
        Issues freeze exact prints. Sharing follows current; sending an issue
        does not advance a recipient’s held edition. Link opened is not
        confirmation of receipt or acceptance.
      </p>
      {bundle.issues.length === 0 && (
        <p className="t-body-sm">No drawing issues recorded.</p>
      )}
      {[...bundle.issues]
        .sort((a, b) => b.issue_number - a.issue_number)
        .map((issue) => (
          <details
            key={issue.id}
            className="border-b border-[var(--border-default)] py-3"
          >
            <summary className="t-body-sm min-h-11 cursor-pointer py-2">
              Issue {issue.issue_number} · {issue.name} ·{' '}
              {fmtDay(issue.issued_at)}
            </summary>
            <p className="t-meta break-all">
              Frozen set checksum: {issue.set_checksum}
            </p>
            <ul className="my-3">
              {bundle.issuePrints
                .filter((print) => print.issue_id === issue.id)
                .map((print) => {
                  const sheet = bundle.sheets.find(
                    (row) => row.id === print.sheet_id,
                  );
                  const source = bundle.prints.find(
                    (row) => row.id === print.print_id,
                  );
                  const available = Boolean(source);
                  return (
                    <li
                      key={print.id}
                      className="border-t border-[var(--border-default)] py-3"
                      data-issued-print-id={print.print_id}
                    >
                      <p className="t-body-sm">
                        {print.sheet_number} · {print.sheet_title} · Rev{' '}
                        {print.rev_letter}
                      </p>
                      <p className="t-meta">
                        Issued ·{' '}
                        {sheet?.current_print_id === print.print_id
                          ? 'also current'
                          : 'not current / superseded'}
                      </p>
                      <p className="t-meta break-all">
                        SHA-256 {print.sha256}
                      </p>
                      {source && <PlanPrintProvenance print={source} projectId={projectId} />}
                      <DocumentActionRow
                        surfaceKey="plan-room"
                        regionKey={print.id}
                      >
                        <DocumentAction
                          actionKey="open-issued-print"
                          variant="tertiary"
                          disabled={!available}
                          onClick={(event) => {
                            issuePrintOpener.current = event.currentTarget;
                            setOpenIssuePrintId(print.id);
                          }}
                        >
                          Open issued print
                        </DocumentAction>
                      </DocumentActionRow>
                      {!available && (
                        <p className="t-meta">
                          Print unavailable to you. The frozen record is
                          retained.
                        </p>
                      )}
                    </li>
                  );
                })}
            </ul>
            <ul aria-label="Recipients of this issue">
              {bundle.transmittals
                .filter((row) => row.issue_id === issue.id)
                .map((row) => {
                  const opened = bundle.tokens.find(
                    (token) =>
                      token.transmittal_id === row.id && token.first_opened_at,
                  )?.first_opened_at;
                  return (
                    <li key={row.id} className="t-meta py-1">
                      {row.party_display_name} · sent {fmtDay(row.sent_at)} ·{' '}
                      {opened
                        ? 'link opened ' + fmtDay(opened)
                        : 'link not recorded as opened'}{' '}
                      · receipt not confirmed
                    </li>
                  );
                })}
            </ul>
          </details>
        ))}
      {openPrint && snapshot && (
        <PlanPrintViewer
          key={snapshot.id}
          returnFocusTo={issuePrintOpener.current}
          sheetNumber={snapshot.sheet_number}
          sheetTitle={snapshot.sheet_title}
          revLetter={snapshot.rev_letter}
          filedAt={openPrint.created_at}
          projectDocumentId={openPrint.project_document_id}
          isCurrent={openSheet?.current_print_id === openPrint.id}
          supersededBy={
            bundle.prints.find(
              (print) => print.id === openSheet?.current_print_id,
            )?.rev_letter ?? null
          }
          onClose={() => setOpenIssuePrintId(null)}
        />
      )}
    </section>
  );
}
