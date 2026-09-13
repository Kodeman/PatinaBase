'use client';

/**
 * THE SITE ACCESS CARD (E15, direction §3.7, SPEC §5.6) — Leah's third task,
 * "who has site access on Okonkwo right now", answered from one screen.
 *
 * PR-r IS THE SHAPE. Patina stores the lockbox VERSION, the key holder, the
 * hours, the receiving note and who was told. THE CODE IS NEVER STORED and
 * there is no field in which to type one: the card prints that the code is held
 * off Patina and names who to ask.
 *
 * PR-w IS THE AUDIENCE. Studio only. There is no client leg in the RLS, no
 * `show_to_client` toggle, and the card says so on its face.
 *
 * R-X — at 390 the WHOLE who-to-call line is the `tel:` target, at least 44px
 * tall. Every line is one control with the name, the role and the number in its
 * accessible name, so a thumb on a site never has to find eleven digits.
 */

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import {
  useSiteAccessCard,
  useUpdateSiteAccessCard,
  type ProjectPartyAuthority,
} from '@patina/supabase';
import {
  rosterShortDate,
  siteAccessSummaryLine,
  wayInSentence,
  type CallSheetProjection,
  type CallSheetRow,
} from '@/lib/document/roster-derivation';
import { peopleEvents } from '@/lib/analytics/people-events';
import { DocSheet } from '../overlays/doc-sheet';
import { DocumentAction, DocumentActionRow } from '../document-action';
import { StateWord } from '../people/state-word';
import { TelLink } from '../people/tel-link';
import { NoticeLog } from './notice-log';

const REGION_HEAD =
  'font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-clay-ink)]';
const LINE = 'text-[0.82rem] text-[var(--color-charcoal)]';

/** An emergency line as the card stores it. The seed writes `label` where the
 *  hook's type says `role`; both are read, so a line never loses its word. */
interface StoredLine {
  name?: string | null;
  role?: string | null;
  label?: string | null;
  phone?: string | null;
}

/** The seat this project says controls the gate — the `site_access` grant. */
export function gateControllerName(
  rows: CallSheetRow[],
  authorityBySeat: Record<string, ProjectPartyAuthority[]>,
): string | null {
  for (const row of rows) {
    if (!row.seatId) continue;
    const grants = authorityBySeat[row.seatId] ?? [];
    if (grants.some((g) => g.scope === 'site_access' && !g.prepares_only)) return row.name;
  }
  return null;
}

/** The seat holding the key, by the card's own pointer. */
export function keyHolderRow(
  rows: CallSheetRow[],
  keyHolderEngagementId: string | null | undefined,
): CallSheetRow | null {
  if (!keyHolderEngagementId) return null;
  return rows.find((row) => row.seatId === keyHolderEngagementId) ?? null;
}

/** R-U's one-line fold, for the head of the Call Sheet. */
export function useSiteAccessSummary(
  projectId: string | null | undefined,
  rows: CallSheetRow[],
  authorityBySeat: Record<string, ProjectPartyAuthority[]>,
): string {
  const { data: card } = useSiteAccessCard(projectId);
  if (!card) return '';
  return siteAccessSummaryLine({
    keyHolderName: keyHolderRow(rows, card.key_holder_engagement_id)?.name ?? null,
    gateControllerName: gateControllerName(rows, authorityBySeat),
    changedAt: card.changed_at,
  });
}

function EditableLine({
  label,
  value,
  empty,
  onSave,
  fieldId,
  saving,
}: {
  label: string;
  value: string;
  empty: string;
  /** Resolves when the write lands; REJECTS when it does not, and the editor
   *  stays open on the rejection (CR-11). */
  onSave: (next: string) => Promise<void>;
  fieldId: string;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  return (
    <div>
      {editing ? (
        <>
          <label className={REGION_HEAD} htmlFor={fieldId}>
            {label}
          </label>
          <input
            id={fieldId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-11 w-full border-0 border-b border-[var(--color-pearl)] bg-transparent py-2 text-[0.82rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
          />
          <DocumentActionRow
            surfaceKey="site-access"
            regionKey={`edit-${fieldId}`}
            className="mt-1"
            aria-label={`Save ${label.toLowerCase()}`}
          >
            <DocumentAction
              actionKey="save-site-access-line"
              variant="primary"
              onClick={() => {
                void onSave(draft).then(
                  () => setEditing(false),
                  // The error prints in the card's own slot; the editor stays
                  // open with what the studio typed still in it.
                  () => undefined,
                );
              }}
              loading={saving}
              loadingLabel="Writing…"
            >
              Save
            </DocumentAction>
            <DocumentAction
              actionKey="cancel-site-access-line"
              variant="tertiary"
              onClick={() => {
                setDraft(value);
                setEditing(false);
              }}
            >
              Leave it
            </DocumentAction>
          </DocumentActionRow>
        </>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <p className={LINE}>{value || empty}</p>
          <DocumentAction
            actionKey={`edit-${fieldId}`}
            surfaceKey="site-access"
            regionKey="site-access-regions"
            variant="tertiary"
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
          >
            Edit
          </DocumentAction>
        </div>
      )}
    </div>
  );
}

export function SiteAccessCard({
  open,
  onClose,
  projectId,
  projectTitle,
  projectAddress,
  projection,
  authorityBySeat = {},
  onOpenSeat,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectTitle: string;
  projectAddress?: string | null;
  projection: CallSheetProjection;
  authorityBySeat?: Record<string, ProjectPartyAuthority[]>;
  onOpenSeat?: (row: CallSheetRow) => void;
}) {
  const { data: card, isLoading } = useSiteAccessCard(open ? projectId : null);
  const updateCard = useUpdateSiteAccessCard();
  const [saveError, setSaveError] = useState<string | null>(null);

  const rows = projection.rows;
  const keyHolder = keyHolderRow(rows, card?.key_holder_engagement_id);
  const gate = gateControllerName(rows, authorityBySeat);
  const told = card?.told_refs ?? [];
  const toldNames = told
    .map((seatId) => rows.find((row) => row.seatId === seatId)?.name)
    .filter((name): name is string => !!name);
  const changedBy =
    rows.find((row) => row.profileId && row.profileId === card?.changed_by)?.name ?? null;

  const lines = ((card?.emergency_lines ?? []) as StoredLine[]).filter(
    (line) => !!line?.name,
  );

  // CR-11: an RLS refusal, the `key_holder_engagement_id` BEFORE trigger
  // (00625:185-207) or a dropped connection used to leave the card looking
  // saved with the OLD value in it and no message anywhere — on the one
  // surface whose value is "who to call and who was told". The promise is
  // returned so the editor can stay open until it resolves, and a failure
  // lands in a real error slot.
  const save = async (
    patch: Parameters<typeof updateCard.mutateAsync>[0],
    region: string,
  ) => {
    setSaveError(null);
    try {
      await updateCard.mutateAsync(patch);
      peopleEvents.siteAccessChanged({ region });
    } catch (e) {
      setSaveError(
        e instanceof Error
          ? e.message
          : 'That did not save. The card still reads what it did before.',
      );
      throw e;
    }
  };

  return (
    <DocSheet open={open} onClose={onClose} title="Site access" icon={KeyRound}>
      <div data-site-access-card>
        <p className="font-heading text-[1.05rem] italic leading-snug text-[var(--color-charcoal)]">
          Site access · {projectTitle}
        </p>
        {projectAddress && (
          <p className="mt-1 text-[0.8rem] text-[var(--color-aged-oak)]">{projectAddress}</p>
        )}
        <p className="mt-1 text-[0.74rem] text-[var(--color-aged-oak)]">
          Studio only. This card never reaches a client page.
        </p>

        {/* CR-11 — the card had no error slot at all. A silent write loss on
            the one surface that answers "who do I call" is the worst failure
            available to it. */}
        {saveError && (
          <p
            role="alert"
            data-site-access-error
            className="mt-2 border-l-2 border-[var(--color-terracotta-ink)] bg-[rgba(196,131,111,0.07)] px-3 py-2 text-[0.74rem] text-[var(--color-charcoal)]"
          >
            {saveError}
          </p>
        )}

        {isLoading && (
          <p className="py-8 text-center text-[0.74rem] text-[var(--color-aged-oak)]">
            Reading the way in…
          </p>
        )}

        {!isLoading && !card && (
          <div className="mt-6 border-t border-[var(--color-pearl)] pt-6">
            <p className="text-[0.8rem] text-[var(--color-aged-oak)]">
              – Nothing is written about the way in yet.
            </p>
            <DocumentActionRow
              surfaceKey="site-access"
              regionKey="site-access-empty"
              className="mt-2"
              aria-label="Start the site access card"
            >
              <DocumentAction
                actionKey="start-site-access-card"
                variant="primary"
                onClick={() => {
                  void save({ projectId, lockboxVersion: null }, 'way_in').catch(
                    () => undefined,
                  );
                }}
                loading={updateCard.isPending}
                loadingLabel="Writing…"
              >
                Start the card
              </DocumentAction>
            </DocumentActionRow>
          </div>
        )}

        {!isLoading && card && (
          <div className="mt-6 flex flex-col gap-6">
            <section>
              <h3 className={REGION_HEAD}>Who to call first</h3>
              <ul className="mt-1 flex flex-col">
                {lines.length === 0 && (
                  <li className="text-[0.78rem] text-[var(--color-aged-oak)]">
                    – No emergency line on file.
                  </li>
                )}
                {lines.map((line, index) => {
                  const role = (line.role ?? line.label ?? '').trim();
                  const text = [line.name, role, line.phone].filter(Boolean).join(', ');
                  return (
                    <li key={`${line.name}-${index}`}>
                      {line.phone ? (
                        <TelLink
                          phone={line.phone}
                          label={text}
                          personName={line.name}
                          fullWidth
                        />
                      ) : (
                        <span className={LINE}>{text}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            <section>
              <h3 className={REGION_HEAD}>The way in</h3>
              <div className="mt-1">
                <EditableLine
                  label="The way in"
                  fieldId="site-access-way-in"
                  value={card.lockbox_version ?? ''}
                  empty="No lockbox on file."
                  saving={updateCard.isPending}
                  onSave={(next) =>
                    save({ projectId, lockboxVersion: next }, 'way_in')
                  }
                />
              </div>
              <p className={`mt-1 ${LINE}`} data-way-in>
                {/* CR-10: the GATE CONTROLLER first. SPEC §5.6 #3 and
                    direction §3.7 both fix the line as "…ask Luis Ochoa" —
                    the superintendent who controls the gate, not Ngozi Eze
                    who holds the key. PR-r's whole value is naming the right
                    person to ask. */}
                {wayInSentence(card.lockbox_version, gate ?? keyHolder?.name)}
              </p>
              {gate && <p className={`mt-1 ${LINE}`}>{gate} controls the gate.</p>}
            </section>

            <section>
              <h3 className={REGION_HEAD}>Key holder</h3>
              {keyHolder ? (
                <p className={`mt-1 ${LINE}`}>
                  <button
                    type="button"
                    onClick={() => {
                      peopleEvents.personCardOpened({ source: 'site_access' });
                      onOpenSeat?.(keyHolder);
                    }}
                    className="min-h-11 underline decoration-[var(--color-clay)] underline-offset-[3px]"
                  >
                    {keyHolder.name}
                  </button>{' '}
                  holds a key.{' '}
                  <StateWord family="consent" value={keyHolder.consent} plain />{' '}
                  {keyHolder.phone && (
                    <TelLink phone={keyHolder.phone} personName={keyHolder.name} />
                  )}
                </p>
              ) : (
                <p className="mt-1 text-[0.78rem] text-[var(--color-aged-oak)]">
                  – Nobody on the job is marked as holding a key.
                </p>
              )}
            </section>

            <section>
              <h3 className={REGION_HEAD}>Hours</h3>
              <div className="mt-1">
                <EditableLine
                  label="Hours"
                  fieldId="site-access-hours"
                  value={card.site_hours ?? ''}
                  empty="No site hours on file."
                  saving={updateCard.isPending}
                  onSave={(next) => save({ projectId, siteHours: next }, 'hours')}
                />
              </div>
            </section>

            <section>
              <h3 className={REGION_HEAD}>Receiving</h3>
              <div className="mt-1">
                <EditableLine
                  label="Receiving"
                  fieldId="site-access-receiving"
                  value={card.receiver_instructions ?? ''}
                  empty="No receiving note on file."
                  saving={updateCard.isPending}
                  onSave={(next) =>
                    save({ projectId, receiverInstructions: next }, 'receiving')
                  }
                />
              </div>
            </section>

            <section>
              <h3 className={REGION_HEAD}>Who was told</h3>
              <p className={`mt-1 ${LINE}`} data-who-was-told>
                {card.changed_at
                  ? `The way in changed ${rosterShortDate(card.changed_at)}${
                      changedBy ? `, by ${changedBy}` : ''
                    }.`
                  : 'Nothing has changed yet.'}
                {toldNames.length > 0 ? ` Told: ${toldNames.join(', ')}.` : ' Nobody has been told yet.'}
              </p>
              <div className="mt-2">
                <NoticeLog
                  projectId={projectId}
                  panelId="site-access-notice-log"
                  told={told}
                  seats={rows
                    .filter((row): row is CallSheetRow & { seatId: string } => !!row.seatId)
                    .map((row) => ({ seatId: row.seatId, name: row.name }))}
                />
              </div>
            </section>
          </div>
        )}
      </div>
    </DocSheet>
  );
}
