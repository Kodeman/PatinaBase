'use client';

/**
 * The issue ceremony — naming a set, choosing who holds it, and minting the
 * links that record the handing over.
 *
 * The contents grid is the whole current set on purpose. A recipient must hold
 * a WHOLE SET, not a diff: the sheets that changed are marked in golden hour so
 * the designer can see what moved, and every other sheet still goes along.
 *
 * The raw transmittal token exists exactly once, in the mutation's result. It
 * is rendered here and never written to the cache, to state that outlives the
 * ceremony, or to telemetry. If the designer navigates away without copying it,
 * the link must be reissued — that is the point of hashing it server-side.
 */

import { useMemo, useState } from 'react';
import {
  useCreatePlanIssue,
  useCreatePlanTransmittal,
  usePlanIssuePreview,
  useProjectRoster,
  useRevokePlanTransmittalLink,
  type PlanRoomBundle,
  type PlanRoomHoldings,
} from '@patina/supabase';
import { Input } from '@/components/ui/controls';
import { fmtDay } from '@/lib/document/format';
import { resolveClientPortalOrigin } from '@/lib/client-portal-url';
import { changedSinceLastIssue, deriveCurrentSet } from '@/lib/plans/model';
import { planRoomEvents } from '@/lib/analytics/plan-room-events';
import { DocumentAction, DocumentActionGroup, DocumentActionRow } from '../document-action';
import { SectionEyebrow } from '../section-eyebrow';
import { Stamp } from '../stamp';
import { StatusChip } from '../status-chip';

const PURPOSES = ['pricing', 'production', 'information', 'record'] as const;
type Purpose = (typeof PURPOSES)[number];

const CHIP_CLASS =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]';

interface Recipient {
  key: string;
  name: string;
  company: string | null;
  /** project_parties.id when the recipient came off the roster. */
  partyId: string | null;
}

interface MintedLink {
  recipientKey: string;
  transmittalId: string;
  name: string;
  /** The raw token, held only for the life of this component. */
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

export interface PlanIssueCeremonyProps {
  projectId: string;
  bundle: PlanRoomBundle;
  holdings: PlanRoomHoldings | undefined;
  onBack: () => void;
}

export function PlanIssueCeremony({
  projectId,
  bundle,
  holdings,
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
  const [minted, setMinted] = useState<MintedLink[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [revoked, setRevoked] = useState<Record<string, string>>({});
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [startedAt] = useState(() => Date.now());
  // Minted once and held across retries: a failed send must not create a
  // second issue when the designer presses the verb again.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const set = useMemo(() => deriveCurrentSet(bundle), [bundle]);
  const changed = useMemo(() => changedSinceLastIssue(bundle), [bundle]);
  const roster = useProjectRoster(projectId);
  const createIssue = useCreatePlanIssue(projectId);
  const createTransmittal = useCreatePlanTransmittal(projectId);
  const revokeLink = useRevokePlanTransmittalLink(projectId);

  const sheetIds = useMemo(
    () => (selected ? set.filter((row) => selected.has(row.sheetId)) : set).map((row) => row.sheetId),
    [selected, set],
  );
  const preview = usePlanIssuePreview(projectId, sheetIds);

  const priorIssue = preview.data?.priorIssue ?? null;
  const changedCount = set.filter(
    (row) => changed.has(row.sheetId) && sheetIds.includes(row.sheetId),
  ).length;

  const toggleSheet = (sheetId: string) => {
    setSelected((prev) => {
      const next = new Set(prev ?? set.map((row) => row.sheetId));
      if (next.has(sheetId)) next.delete(sheetId);
      else next.add(sheetId);
      return next;
    });
  };

  const holdingFor = (recipient: Recipient) => {
    const party = holdings?.parties.find((entry) =>
      recipient.partyId
        ? entry.partyId === recipient.partyId
        : entry.partyDisplayName.trim().toLowerCase() ===
          recipient.name.trim().toLowerCase(),
    );
    if (!party) return null;
    const behind = party.holds.find((sheet) => sheet.behind) ?? party.holds[0];
    return `last sent ${fmtDay(party.sentAt)}${behind ? ` · holds Rev ${behind.heldRev}` : ''}`;
  };

  const addRecipient = (recipient: Recipient) => {
    setRecipients((prev) =>
      prev.some((entry) => entry.key === recipient.key) ? prev : [...prev, recipient],
    );
  };

  const issueAndSend = async () => {
    if (recipients.length === 0 || sheetIds.length === 0) return;
    setFailure(null);
    try {
      planRoomEvents.issueStarted({
        project_id: projectId,
        sheet_count: sheetIds.length,
      });
      const issue = await createIssue.mutateAsync({
        name: name.trim() || defaultIssueName(purpose),
        idempotencyKey,
        sheetIds,
      });

      const links: MintedLink[] = [];
      const origin = resolveClientPortalOrigin(
        typeof window === 'undefined' ? undefined : window.location.origin,
      );
      for (const recipient of recipients) {
        const result = await createTransmittal.mutateAsync({
          issueId: issue.issue.id,
          purpose,
          partyId: recipient.partyId,
          recipientName: recipient.partyId ? null : recipient.name,
          recipientCompany: recipient.partyId ? null : recipient.company,
        });
        const transmittalId = String(
          (result.transmittal as { id?: string }).id ?? '',
        );
        links.push({
          recipientKey: recipient.key,
          transmittalId,
          name: recipient.name,
          // The raw token, rendered once. Never cached, never persisted.
          url: `${origin}/plans/${result.token}`,
        });
        planRoomEvents.transmittalCreated({
          project_id: projectId,
          issue_id: issue.issue.id,
          purpose,
        });
      }

      setMinted(links);
      planRoomEvents.issueFinalized({
        project_id: projectId,
        issue_id: issue.issue.id,
        sheet_count: issue.issue.sheetCount,
        recipient_count: links.length,
        duration_ms: Date.now() - startedAt,
      });
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : 'The set could not be issued.',
      );
    }
  };

  const revoke = async (link: MintedLink) => {
    try {
      await revokeLink.mutateAsync(link.transmittalId);
      setRevoked((prev) => ({ ...prev, [link.transmittalId]: 'Link revoked.' }));
      planRoomEvents.transmittalRevoked({
        project_id: projectId,
        transmittal_id: link.transmittalId,
      });
    } catch (error) {
      setRevoked((prev) => ({
        ...prev,
        [link.transmittalId]:
          error instanceof Error ? error.message : 'It could not be revoked.',
      }));
    }
    setConfirmRevoke(null);
  };

  const busy = createIssue.isPending || createTransmittal.isPending;

  return (
    <section aria-label="Issue the current set" className="px-4 py-6 md:px-8">
      <div className="mx-auto grid max-w-[1200px] gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <SectionEyebrow>The issue</SectionEyebrow>

          <div className="grid gap-3">
            <Input
              aria-label="Issue name"
              value={name}
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
            <SectionEyebrow count={sheetIds.length}>Contents</SectionEyebrow>
            {priorIssue && (
              <p className="mb-3 max-w-xl text-[0.82rem] text-[var(--text-muted)]">
                {changedCount} of {sheetIds.length} changed since {priorIssue.name}.
                The rest go along so the recipient holds a whole set, not a diff.
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
                      className={`font-mono text-[9px] uppercase tracking-[0.08em] ${
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
                  .filter((row) => row.display_name)
                  .map((row) => {
                    const key = row.roster_id ?? row.display_name!;
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
                onChange={(event) => setFreeName(event.target.value)}
              />
              <Input
                aria-label="Recipient company"
                placeholder="Company"
                value={freeCompany}
                onChange={(event) => setFreeCompany(event.target.value)}
              />
              <DocumentActionRow surfaceKey="plan-room" regionKey="add-recipient">
                <DocumentAction
                  actionKey="add-plan-recipient"
                  variant="secondary"
                  disabled={!freeName.trim()}
                  onClick={() => {
                    addRecipient({
                      key: `free:${freeName.trim().toLowerCase()}`,
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
                const link = minted?.find((entry) => entry.recipientKey === recipient.key);
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
                          <span className="block font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                            {held}
                          </span>
                        )}
                      </span>
                      {!minted && (
                        <DocumentActionRow
                          surfaceKey="plan-room"
                          regionKey={`recipient-${recipient.key}`}
                        >
                          <DocumentAction
                            actionKey="remove-plan-recipient"
                            variant="tertiary"
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
                      <div className="mt-2 border-l-2 border-[var(--color-golden-hour)] pl-2.5">
                        <p className="break-all font-mono text-[10px] text-[var(--color-charcoal)]">
                          {link.url}
                        </p>
                        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-golden-hour)]">
                          This link won’t be shown again — copy it now.
                        </p>
                        <DocumentActionRow
                          surfaceKey="plan-room"
                          regionKey={`link-${link.transmittalId}`}
                        >
                          <DocumentAction
                            actionKey="copy-plan-link"
                            variant="secondary"
                            onClick={async () => {
                              await navigator.clipboard?.writeText(link.url);
                              setCopied(link.transmittalId);
                            }}
                          >
                            {copied === link.transmittalId ? 'Copied' : 'Copy the link'}
                          </DocumentAction>
                          {confirmRevoke === link.transmittalId ? (
                            <DocumentAction
                              actionKey="confirm-revoke-plan-link"
                              variant="danger"
                              onClick={() => revoke(link)}
                            >
                              Revoke it — the trade loses this link
                            </DocumentAction>
                          ) : (
                            <DocumentAction
                              actionKey="revoke-plan-link"
                              variant="tertiary"
                              onClick={() => setConfirmRevoke(link.transmittalId)}
                            >
                              Revoke
                            </DocumentAction>
                          )}
                        </DocumentActionRow>
                        {revoked[link.transmittalId] && (
                          <p
                            role="status"
                            className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-terracotta)]"
                          >
                            {revoked[link.transmittalId]}
                          </p>
                        )}
                      </div>
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
                {minted ? (
                  <Stamp label="ISSUED" color="var(--color-sage)" ink="#85947C" />
                ) : (
                  <StatusChip label="Not yet minted" color="var(--color-aged-oak)" />
                )}
              </div>
              <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                {sheetIds.length} {sheetIds.length === 1 ? 'sheet' : 'sheets'} · for{' '}
                {purpose} · {recipients.length}{' '}
                {recipients.length === 1 ? 'recipient' : 'recipients'}
              </p>
              {preview.data && (
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  checksum {preview.data.checksumPreview.slice(0, 8)}
                </p>
              )}

              {failure && (
                <p
                  role="alert"
                  className="mt-3 border-l-2 border-[var(--color-terracotta)] pl-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-terracotta)]"
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
                {!minted && (
                  <DocumentAction
                    actionKey="issue-and-send"
                    variant="primary"
                    disabled={recipients.length === 0 || sheetIds.length === 0 || busy}
                    loading={busy}
                    loadingLabel="Issuing…"
                    onClick={issueAndSend}
                  >
                    Issue &amp; send
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
