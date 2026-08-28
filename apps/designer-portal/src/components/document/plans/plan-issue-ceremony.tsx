'use client';

/**
 * The issue ceremony — naming a set, choosing who holds it, and minting the
 * links that record the handing over.
 *
 * The contents grid is the whole current set on purpose. A recipient must hold
 * a WHOLE SET, not a diff: the sheets that changed are marked in golden hour so
 * the designer can see what moved, and every other sheet still goes along.
 * What "changed" MEANS is the database's answer, not a second opinion computed
 * here — `preview_plan_issue` compares print identity against the prior issue's
 * snapshot, and its `drift` is what these marks render.
 *
 * THE FAN-OUT IS SEQUENTIAL AND RESUMABLE. Each recipient is sent one at a
 * time and recorded the instant their token lands, so a failure on the third of
 * five cannot take the first two's links down with it — those tokens exist
 * server-side and will never be shown again. On a failure the ceremony stops,
 * names who it stopped on, keeps every minted link on screen, and the retry
 * sends ONLY to whoever is still unsent. No duplicate transmittals, no lost
 * tokens.
 *
 * The raw token exists exactly once, in the mutation's result. It is rendered
 * by PlanLinkOnce and never written to the cache, to state that outlives the
 * ceremony, or to telemetry.
 */

import { useMemo, useState } from 'react';
import {
  useCreatePlanIssue,
  useCreatePlanTransmittal,
  usePlanIssuePreview,
  useProjectRoster,
  type PlanRoomBundle,
} from '@patina/supabase';
import { Input } from '@/components/ui/controls';
import { fmtDay } from '@/lib/document/format';
import { resolveClientPortalOrigin } from '@/lib/client-portal-url';
import { deriveCurrentSet, deriveHolders, holderSentence } from '@/lib/plans/model';
import { planRoomEvents } from '@/lib/analytics/plan-room-events';
import { DocumentAction, DocumentActionGroup, DocumentActionRow } from '../document-action';
import { SectionEyebrow } from '../section-eyebrow';
import { Stamp } from '../stamp';
import { StatusChip } from '../status-chip';
import { PlanLinkOnce } from './plan-link-once';

const PURPOSES = ['pricing', 'production', 'information', 'record'] as const;
type Purpose = (typeof PURPOSES)[number];

const CHIP_CLASS =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]';

interface Recipient {
  /** party_id when off the roster, else the folded name — the same key the
   *  holdings derivation groups on, so a row never keys on a display name. */
  key: string;
  name: string;
  company: string | null;
  partyId: string | null;
}

interface MintedLink {
  recipientKey: string;
  transmittalId: string;
  /** The raw token URL, held only for the life of this component. */
  url: string;
}

function defaultIssueName(purpose: Purpose): string {
  const word = purpose.charAt(0).toUpperCase() + purpose.slice(1);
  const today = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date());
  return `${word} Set — ${today}`;
}

const foldName = (name: string) => name.trim().toLowerCase();

export interface PlanIssueCeremonyProps {
  projectId: string;
  bundle: PlanRoomBundle;
  onBack: () => void;
}

export function PlanIssueCeremony({
  projectId,
  bundle,
  onBack,
}: PlanIssueCeremonyProps) {
  const [purpose, setPurpose] = useState<Purpose>('production');
  const [name, setName] = useState(() => defaultIssueName('production'));
  const [nameTouched, setNameTouched] = useState(false);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [freeName, setFreeName] = useState('');
  const [freeCompany, setFreeCompany] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [issueId, setIssueId] = useState<string | null>(null);
  const [minted, setMinted] = useState<MintedLink[]>([]);
  const [sending, setSending] = useState(false);
  const [startedAt] = useState(() => Date.now());

  const set = useMemo(() => deriveCurrentSet(bundle), [bundle]);
  // One derivation for holders, everywhere. The holdings RPC is deliberately
  // not called here: it and the bundle settle at different moments, and a
  // recipient hint that disagreed with the band beside it is worse than none.
  const holders = useMemo(() => deriveHolders(bundle), [bundle]);
  const roster = useProjectRoster(projectId);
  const createIssue = useCreatePlanIssue(projectId);
  const createTransmittal = useCreatePlanTransmittal(projectId);

  const selectedIds = useMemo(
    () =>
      (selected ? set.filter((row) => selected.has(row.sheetId)) : set).map(
        (row) => row.sheetId,
      ),
    [selected, set],
  );
  // The RPC treats null as "the whole current set". Sending an explicit list
  // that happens to be the whole set is a different request hash for the same
  // act, so a full set always speaks as null.
  const isFullSet = selectedIds.length === set.length;
  const sheetIdsArgument = isFullSet ? null : selectedIds;

  const preview = usePlanIssuePreview(projectId, sheetIdsArgument);
  const drift = preview.data?.drift;
  const priorIssue = preview.data?.priorIssue ?? null;
  const changed = useMemo(
    () => new Set([...(drift?.changed ?? []), ...(drift?.added ?? [])]),
    [drift],
  );
  const changedCount = drift?.changed.length ?? 0;

  /**
   * The issue's idempotency key. A key is a promise that two calls describing
   * the SAME act collapse into one — so it must rotate the moment the act
   * changes (a renamed set, a toggled sheet) and hold absolutely still across a
   * pure retry. Reusing it after a change earns 'idempotency key was reused
   * with a different request'; rotating it on retry mints a second issue.
   * Adjusting state during render is React's own answer to derived state.
   */
  const signature = JSON.stringify([name.trim(), [...selectedIds].sort()]);
  const [issueKey, setIssueKey] = useState(() => ({
    signature,
    key: crypto.randomUUID(),
  }));
  if (issueKey.signature !== signature) {
    setIssueKey({ signature, key: crypto.randomUUID() });
  }

  const mintedFor = (recipientKey: string) =>
    minted.find((entry) => entry.recipientKey === recipientKey) ?? null;
  const unsent = recipients.filter((recipient) => !mintedFor(recipient.key));

  const toggleSheet = (sheetId: string) => {
    setSelected((prev) => {
      const next = new Set(prev ?? set.map((row) => row.sheetId));
      if (next.has(sheetId)) next.delete(sheetId);
      else next.add(sheetId);
      return next;
    });
  };

  const holdingFor = (recipient: Recipient) => {
    const holder = holders.find((entry) => entry.partyKey === recipient.key);
    if (!holder) return null;
    return holderSentence(holder, fmtDay(holder.sentAt));
  };

  const addRecipient = (recipient: Recipient) => {
    setRecipients((prev) =>
      prev.some((entry) => entry.key === recipient.key) ? prev : [...prev, recipient],
    );
  };

  const issueAndSend = async () => {
    if (unsent.length === 0 || selectedIds.length === 0) return;
    setFailure(null);
    setSending(true);
    try {
      let currentIssueId = issueId;
      if (!currentIssueId) {
        planRoomEvents.issueStarted({
          project_id: projectId,
          sheet_count: selectedIds.length,
        });
        const issue = await createIssue.mutateAsync({
          name: name.trim() || defaultIssueName(purpose),
          idempotencyKey: issueKey.key,
          sheetIds: sheetIdsArgument,
        });
        currentIssueId = issue.issue.id;
        setIssueId(currentIssueId);
      }

      const origin = resolveClientPortalOrigin(
        typeof window === 'undefined' ? undefined : window.location.origin,
      );

      // One at a time, recorded as each lands. A token that has been minted
      // exists whether or not the next call succeeds, and it will never be
      // shown again — so it goes on screen before the next attempt is made.
      for (const recipient of unsent) {
        try {
          const result = await createTransmittal.mutateAsync({
            issueId: currentIssueId,
            purpose,
            partyId: recipient.partyId,
            recipientName: recipient.partyId ? null : recipient.name,
            recipientCompany: recipient.partyId ? null : recipient.company,
          });
          const transmittalId = String(
            (result.transmittal as { id?: string }).id ?? '',
          );
          setMinted((prev) => [
            ...prev,
            {
              recipientKey: recipient.key,
              transmittalId,
              url: `${origin}/plans/${result.token}`,
            },
          ]);
          planRoomEvents.transmittalCreated({
            project_id: projectId,
            issue_id: currentIssueId,
            purpose,
          });
        } catch (error) {
          setFailure(
            `${recipient.name} could not be sent — ${
              error instanceof Error ? error.message : 'the send failed'
            }. Everyone above holds their link; try again to send the rest.`,
          );
          setSending(false);
          return;
        }
      }

      planRoomEvents.issueFinalized({
        project_id: projectId,
        issue_id: currentIssueId,
        sheet_count: selectedIds.length,
        recipient_count: recipients.length,
        duration_ms: Date.now() - startedAt,
      });
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : 'The set could not be issued.',
      );
    } finally {
      setSending(false);
    }
  };

  const finalized = issueId != null && unsent.length === 0 && recipients.length > 0;
  const primaryLabel =
    minted.length > 0 && unsent.length > 0
      ? `Send the ${unsent.length} still unsent`
      : 'Issue & send';

  return (
    <section aria-label="Issue the current set" className="px-4 py-6 md:px-8">
      <div className="mx-auto grid max-w-[1200px] gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <SectionEyebrow>The issue</SectionEyebrow>

          <div className="grid gap-3">
            <Input
              aria-label="Issue name"
              value={name}
              className="min-h-11"
              onChange={(event) => {
                setName(event.target.value);
                setNameTouched(true);
              }}
            />
            <div
              role="group"
              aria-label="What this set is for"
              className="flex flex-wrap gap-1.5"
            >
              {PURPOSES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={purpose === value}
                  onClick={() => {
                    setPurpose(value);
                    if (!nameTouched) setName(defaultIssueName(value));
                  }}
                  className={`${CHIP_CLASS} ${
                    purpose === value
                      ? 'border-[var(--color-clay)] text-[var(--color-charcoal)]'
                      : 'border-[var(--doc-ink-border)] text-[var(--text-muted)]'
                  }`}
                >
                  for {value}
                </button>
              ))}
            </div>
          </div>

          {/* Contents — the whole current set, with what moved marked */}
          <div className="mt-8">
            <SectionEyebrow count={selectedIds.length}>Contents</SectionEyebrow>
            {priorIssue && (
              <p className="mb-3 max-w-xl text-[0.82rem] text-[var(--text-muted)]">
                {changedCount} of {selectedIds.length} changed since{' '}
                {priorIssue.name}. The rest go along so the recipient holds a
                whole set, not a diff.
              </p>
            )}
            <div className="grid">
              {set.map((row) => {
                const checked = selected ? selected.has(row.sheetId) : true;
                const moved = changed.has(row.sheetId);
                return (
                  <label
                    key={row.sheetId}
                    className="grid min-h-[44px] grid-cols-[1.5rem_5.5rem_minmax(0,1fr)_5rem] items-center gap-3 border-b border-[var(--color-pearl)] py-2"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSheet(row.sheetId)}
                      className="h-4 w-4 accent-[var(--color-clay)]"
                      aria-label={`Include ${row.sheetNumber}`}
                    />
                    <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-charcoal)]">
                      {row.sheetNumber}
                    </span>
                    <span className="truncate text-[0.82rem] text-[var(--color-charcoal)]">
                      {row.title}
                    </span>
                    <span
                      className={`font-mono text-[11px] uppercase tracking-[0.08em] ${
                        moved
                          ? 'text-[var(--color-golden-hour)]'
                          : 'text-[var(--text-muted)]'
                      }`}
                    >
                      Rev {row.revLetter ?? '—'}
                      {moved ? ' · changed' : ''}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Recipients */}
          <div className="mt-8">
            <SectionEyebrow count={recipients.length}>Recipients</SectionEyebrow>
            {(roster.data ?? []).length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {(roster.data ?? [])
                  // Team rows are the studio's own people; a transmittal is a
                  // record of handing drawings OUT.
                  .filter((row) => row.display_name && row.source !== 'team')
                  .map((row) => {
                    const key =
                      row.source === 'party' && row.roster_id
                        ? row.roster_id
                        : foldName(row.display_name!);
                    const chosen = recipients.some((entry) => entry.key === key);
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={chosen}
                        onClick={() =>
                          addRecipient({
                            key,
                            name: row.display_name!,
                            company: row.company_name,
                            partyId: row.source === 'party' ? row.roster_id : null,
                          })
                        }
                        className={`${CHIP_CLASS} ${
                          chosen
                            ? 'border-[var(--color-clay)] text-[var(--color-charcoal)]'
                            : 'border-[var(--doc-ink-border)] text-[var(--text-muted)]'
                        }`}
                      >
                        {row.display_name}
                        {row.company_name ? ` · ${row.company_name}` : ''}
                      </button>
                    );
                  })}
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <Input
                aria-label="Recipient name"
                placeholder="Name"
                value={freeName}
                className="min-h-11"
                onChange={(event) => setFreeName(event.target.value)}
              />
              <Input
                aria-label="Recipient company"
                placeholder="Company"
                value={freeCompany}
                className="min-h-11"
                onChange={(event) => setFreeCompany(event.target.value)}
              />
              <DocumentActionRow surfaceKey="plan-room" regionKey="add-recipient">
                <DocumentAction
                  actionKey="add-plan-recipient"
                  variant="secondary"
                  disabled={!freeName.trim()}
                  onClick={() => {
                    addRecipient({
                      key: foldName(freeName),
                      name: freeName.trim(),
                      company: freeCompany.trim() || null,
                      partyId: null,
                    });
                    setFreeName('');
                    setFreeCompany('');
                  }}
                >
                  Add
                </DocumentAction>
              </DocumentActionRow>
            </div>

            <div className="mt-3 grid">
              {recipients.map((recipient) => {
                const held = holdingFor(recipient);
                const link = mintedFor(recipient.key);
                return (
                  <div
                    key={recipient.key}
                    className="border-b border-[var(--color-pearl)] py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="text-[0.85rem] text-[var(--color-charcoal)]">
                          {recipient.name}
                          {recipient.company ? ` · ${recipient.company}` : ''}
                        </span>
                        {held && (
                          <span className="block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                            {held}
                          </span>
                        )}
                      </span>
                      {link ? (
                        <StatusChip label="sent" color="#85947C" />
                      ) : (
                        <DocumentActionRow
                          surfaceKey="plan-room"
                          regionKey={`recipient-${recipient.key}`}
                        >
                          <DocumentAction
                            actionKey="remove-plan-recipient"
                            variant="tertiary"
                            disabled={sending}
                            onClick={() =>
                              setRecipients((prev) =>
                                prev.filter((entry) => entry.key !== recipient.key),
                              )
                            }
                          >
                            Remove
                          </DocumentAction>
                        </DocumentActionRow>
                      )}
                    </div>

                    {link && (
                      <PlanLinkOnce
                        url={link.url}
                        regionKey={`link-${link.transmittalId}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* The mint — stacked paper, depth by value not shadow */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="relative">
            <span
              aria-hidden
              className="absolute inset-0 translate-x-[10px] translate-y-[10px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-3)]"
            />
            <span
              aria-hidden
              className="absolute inset-0 translate-x-[5px] translate-y-[5px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)]"
            />
            <div className="relative border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-heading text-lg text-[var(--color-charcoal)]">
                  {name}
                </p>
                {finalized ? (
                  <Stamp label="ISSUED" color="var(--color-sage)" ink="var(--color-sage-ink)" />
                ) : (
                  <StatusChip label="Not yet minted" color="var(--color-aged-oak)" />
                )}
              </div>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                {selectedIds.length}{' '}
                {selectedIds.length === 1 ? 'sheet' : 'sheets'} · for {purpose} ·{' '}
                {minted.length} of {recipients.length} sent
              </p>
              {preview.data && (
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  checksum {preview.data.checksumPreview.slice(0, 8)}
                </p>
              )}

              {failure && (
                <p
                  role="alert"
                  className="mt-3 border-l-2 border-[var(--color-terracotta)] pl-2 text-[0.78rem] leading-snug text-[var(--color-terracotta-ink)]"
                >
                  {failure}
                </p>
              )}

              <DocumentActionGroup
                surfaceKey="plan-room"
                regionKey="issue-ceremony"
                className="mt-4"
                aria-label="Issue the set"
              >
                {!finalized && (
                  <DocumentAction
                    actionKey="issue-and-send"
                    variant="primary"
                    disabled={
                      unsent.length === 0 || selectedIds.length === 0 || sending
                    }
                    loading={sending}
                    loadingLabel="Sending…"
                    onClick={issueAndSend}
                  >
                    {primaryLabel}
                  </DocumentAction>
                )}
                <DocumentAction
                  actionKey="back-from-issue"
                  variant="tertiary"
                  onClick={onBack}
                >
                  ← The current set
                </DocumentAction>
              </DocumentActionGroup>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
