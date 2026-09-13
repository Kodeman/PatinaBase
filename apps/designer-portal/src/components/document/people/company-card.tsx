'use client';

/**
 * THE COMPANY CARD — a firm as an object the studio can act on.
 *
 * Six regions, in this order: Identity, Crew & designations, Paper, Payee,
 * Jobs, History (direction §3.3). It is the ONLY place a compliance document,
 * a payee identity, a signer or a paperwork contact is written; every other
 * surface in Patina reads what is written here.
 *
 * Three rules the face keeps:
 *
 *  · A FIRM HAS NEITHER CONSENT NOR REACH (SPEC §5.3 #9). A company cannot
 *    agree to a text message, and no door is minted onto a firm — both words
 *    belong to the humans on its crew.
 *  · THE PAPER REGION ALWAYS PRINTS (C21/R-K/R-P), in one fixed order: the
 *    table, the leading-rule clause, the consequence sentence, the act row. A
 *    firm with no paper prints the word "Not on file" and the act; a lender or
 *    an inspector, who never owed the studio paper, prints one line and no act
 *    at all — "no documents" and "never owed paper" are different facts.
 *  · ON THE CREW LINE ONLY THE NAME IS A CONTROL (R-W). A designation is a
 *    fact about a seat, not a door to a card, and a run-on accessible name
 *    cannot be scanned by ear.
 */

import { useMemo, useState } from 'react';
import {
  partyKindOwesPaper,
  getFieldTradeLabel,
} from '@patina/types';
import {
  useAffiliations,
  useComplianceDocuments,
  useComplianceState,
  usePeopleSeats,
  useStudioContact,
  useStudioContacts,
  useUpdateStudioContact,
  type PeopleDirectorySeat,
  type StudioContact,
} from '@patina/supabase';
import { DocumentAction, DocumentActionRow } from '../document-action';
import { Avatar } from './person-bits';
import { StateWord, PlainFact } from './state-word';
import { SeatLine } from './seat-line';
import { ComplianceTable, NO_PAPER_OWED_SENTENCE, paperHeldClause } from './compliance-table';
import { RecordDocumentSheet } from './record-document-sheet';
import { useChaseTheRenewal, chaseConsequenceSentence } from './compliance-chase';
import { formatLongDate } from './people-format';

const REGION = 'border-t border-[var(--hairline-strong)] py-6';
const REGION_HEAD = 't-head mb-3 text-[var(--ink-subtle)]';

export const NO_CREW_SENTENCE = 'Nobody on file at this firm yet.';
export const NO_JOBS_SENTENCE = 'Not on a job yet.';
export const NO_VERDICT_SENTENCE = 'No verdict recorded.';
export const MONEY_BOOK_LINE = 'Waiver ledger and draw state, in the money book.';

/** "Electrical sub · 1 person · 2 projects · warranty through 21 Nov 2026" */
export function companyIdentityLine(
  card: StudioContact,
  counts: { crew: number; jobs: number | null },
): string {
  const parts: string[] = [];
  const kind = card.company_kind ?? card.contact_kind;
  const trade = card.trades?.[0] ?? card.specialties?.[0] ?? null;
  if (trade && kind) parts.push(`${getFieldTradeLabel(trade)} ${kind}`);
  else if (kind) parts.push(kind);
  parts.push(`${counts.crew} ${counts.crew === 1 ? 'person' : 'people'}`);
  if (counts.jobs != null) {
    parts.push(`${counts.jobs} ${counts.jobs === 1 ? 'project' : 'projects'}`);
  }
  const warranty = formatLongDate(card.warranty_until);
  if (warranty) parts.push(`warranty through ${warranty}`);
  return parts.join(' · ');
}

/** The designations on one crew line, as plain text after the name (R-W). */
export function crewDesignations(
  card: StudioContact,
  affiliation: {
    role_at_firm: string | null;
    is_paperwork_contact: boolean;
    is_signer: boolean;
    holds_trade_license: boolean;
    person_id: string;
  },
): string[] {
  const words: string[] = [];
  if (affiliation.role_at_firm) words.push(affiliation.role_at_firm);
  if (affiliation.is_paperwork_contact || card.paperwork_contact_person_id === affiliation.person_id) {
    words.push('paperwork contact');
  }
  if (affiliation.is_signer || card.signer_person_id === affiliation.person_id) {
    words.push('signer');
  }
  if (card.site_contact_person_id === affiliation.person_id) words.push('site contact');
  if (affiliation.holds_trade_license) words.push('holds the trade licence');
  return words;
}

/** One crew member's seats, read where the hook may be called once per person. */
function CrewJobs({
  personId,
  personName,
  onOpenPerson,
}: {
  personId: string;
  personName: string;
  onOpenPerson: (personId: string) => void;
}) {
  const { data: seats } = usePeopleSeats({ personId });
  const live = (seats ?? []).filter((s) => s.stage !== 'off_job' && s.stage !== 'retired');
  if (live.length === 0) return null;
  return (
    <>
      {live.map((seat: PeopleDirectorySeat) => (
        <li key={seat.seat_id} className="border-t border-[var(--hairline)] py-2">
          <p className="t-body-sm text-[var(--ink-subtle)]">{personName}</p>
          <SeatLine seat={seat} onOpen={() => onOpenPerson(personId)} />
        </li>
      ))}
    </>
  );
}

export function CompanyCard({
  firmId,
  organizationId,
  jobsCount = null,
  onOpenPerson,
  onAnnounce,
  onBack,
  today = new Date(),
}: {
  firmId: string;
  organizationId: string | null;
  /** Distinct live jobs across the firm's crew, counted by the Directory. */
  jobsCount?: number | null;
  onOpenPerson: (personId: string) => void;
  onAnnounce: (message: string) => void;
  onBack: () => void;
  today?: Date;
}) {
  const { data: card } = useStudioContact(firmId);
  const { data: contacts } = useStudioContacts(organizationId, { includeArchived: false });
  const { data: affiliations } = useAffiliations({ companyId: firmId });
  const { data: documents } = useComplianceDocuments({ holderId: firmId });
  const { data: paperState } = useComplianceState(firmId);
  const updateCard = useUpdateStudioContact();
  const chase = useChaseTheRenewal();

  const [recordOpen, setRecordOpen] = useState(false);
  const [verdictOpen, setVerdictOpen] = useState(false);
  const [verdict, setVerdict] = useState('');
  const [chased, setChased] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const namesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contacts ?? []) {
      if (c.entity_kind !== 'person') continue;
      map.set(c.id, c.full_name ?? 'Unnamed');
    }
    return map;
  }, [contacts]);

  if (!card) {
    return (
      <>
        <DocumentAction
          actionKey="back-to-directory"
          surfaceKey="people"
          regionKey="company-card"
          variant="tertiary"
          onClick={onBack}
        >
          Back
        </DocumentAction>
        <p className="t-body-sm py-6 text-[var(--ink-subtle)]">Reading the firm…</p>
      </>
    );
  }

  const name = card.company_name ?? card.full_name ?? 'This firm';
  const crew = affiliations ?? [];
  // R-A / C13: a lender or an inspector never owed the studio paper.
  const owesPaper = partyKindOwesPaper(card.company_kind ?? card.contact_kind);
  const docs = documents ?? [];
  const heldClause = paperHeldClause(docs, today);
  const chaseSentence = chaseConsequenceSentence(name);

  const recordVerdict = async () => {
    setError(null);
    try {
      await updateCard.mutateAsync({
        id: card.id,
        organizationId: card.organization_id,
        card: { studioVerdict: verdict.trim() || null },
      });
      setVerdictOpen(false);
      onAnnounce(`The studio's verdict on ${name} is recorded.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record that just now.');
    }
  };

  return (
    <div data-company-card={card.id} className="mx-auto max-w-[720px]">
      <DocumentAction
        actionKey="back-to-directory"
        surfaceKey="people"
        regionKey="company-card"
        variant="tertiary"
        onClick={onBack}
      >
        Back
      </DocumentAction>

      {/* R1 — Identity */}
      <header className="flex items-center gap-4 pb-6">
        <Avatar name={name} role={card.company_kind ?? card.contact_kind} shape="square" />
        <div className="min-w-0">
          <h2 className="t-d3 font-heading">{name}</h2>
          <p className="t-meta mt-1 text-[var(--ink-subtle)]">
            {companyIdentityLine(card, { crew: crew.length, jobs: jobsCount })}
          </p>
        </div>
      </header>

      {/* R2 — Crew & designations */}
      <section className={REGION}>
        <h3 className={REGION_HEAD}>Crew &amp; designations</h3>
        {crew.length === 0 ? (
          <p className="t-body-sm text-[var(--ink-subtle)]">{NO_CREW_SENTENCE}</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {crew.map((a) => {
              const personName = namesById.get(a.person_id) ?? 'Unnamed';
              const words = crewDesignations(card, a);
              return (
                <li key={a.id} className="border-t border-[var(--hairline)] py-3">
                  <p className="t-body-sm text-[var(--ink)]">
                    {/* R-W: the NAME is the control; the designations are plain
                        text beside it, never inside the accessible name. */}
                    <button
                      type="button"
                      data-open-person={a.person_id}
                      onClick={() => onOpenPerson(a.person_id)}
                      className="min-h-11 font-medium underline decoration-[var(--color-clay)] underline-offset-[3px]"
                    >
                      {personName}
                    </button>
                    {words.length > 0 ? <span> · {words.join(' · ')}</span> : null}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* R3 — Paper. Always printed; R-P fixes the order inside it. */}
      <section className={REGION} data-company-paper>
        <h3 className={REGION_HEAD}>Paper</h3>
        {!owesPaper ? (
          <p className="t-body-sm text-[var(--ink-subtle)]">{NO_PAPER_OWED_SENTENCE}</p>
        ) : (
          <>
            {docs.length > 0 ? (
              <ComplianceTable documents={docs} today={today} />
            ) : (
              <p>
                <StateWord family="paper" value={paperState ?? 'not_on_file'} />
              </p>
            )}
            {heldClause && (
              <p className="t-body-sm mt-3 border-l-2 border-[var(--terracotta-ink)] bg-[var(--rail)] py-[6px] pl-[11px] text-[var(--ink)]">
                {heldClause}
              </p>
            )}
            <p
              id={`company-chase-${card.id}`}
              className="t-body-sm mt-3 max-w-[56ch] text-[var(--ink-subtle)]"
            >
              {chaseSentence}
            </p>
            <DocumentActionRow
              surfaceKey="people"
              regionKey="company-paper"
              aria-label="Paper actions"
            >
              <DocumentAction
                actionKey="record-compliance-document"
                variant="secondary"
                onClick={() => setRecordOpen(true)}
              >
                Record a document
              </DocumentAction>
              <DocumentAction
                actionKey="chase-the-renewal"
                variant="tertiary"
                aria-describedby={`company-chase-${card.id}`}
                loading={chase.isPending}
                loadingLabel="Drafting…"
                onClick={() => {
                  setError(null);
                  if (!organizationId) return;
                  chase.mutate(
                    {
                      organizationId,
                      companyId: card.id,
                      companyName: name,
                      documentId: docs[0]?.id ?? null,
                      documentLabel: docs[0] ? null : 'a current certificate',
                      paperworkContactPersonId: card.paperwork_contact_person_id,
                    },
                    {
                      onSuccess: () => {
                        setChased(true);
                        onAnnounce(`A note to ${name} is waiting for your review.`);
                      },
                      onError: (e) =>
                        setError(
                          e instanceof Error
                            ? e.message
                            : 'Could not draft that note just now.',
                        ),
                    },
                  );
                }}
              >
                Chase the renewal
              </DocumentAction>
            </DocumentActionRow>
            {chased && (
              <p className="t-body-sm mt-1 text-[var(--ink-subtle)]">
                Filed for your review. Nothing is sent until you send it.
              </p>
            )}
          </>
        )}
      </section>

      {/* R4 — Payee */}
      <section className={REGION}>
        <h3 className={REGION_HEAD}>Payee</h3>
        <p className="t-body-sm text-[var(--ink)]">
          Remit to {card.remit_to ?? name}
        </p>
        {card.tax_id_last4 && (
          <p className="t-body-sm text-[var(--ink)]">
            Tax id ending {card.tax_id_last4}
          </p>
        )}
        {card.retainage_bps != null && (
          <p className="t-body-sm text-[var(--ink)]">
            Retainage {card.retainage_bps / 100}%
          </p>
        )}
        {card.signer_person_id && (
          <p className="t-body-sm mt-1">
            <PlainFact>
              Signs: {namesById.get(card.signer_person_id) ?? 'on file'}
            </PlainFact>
          </p>
        )}
      </section>

      {/* R5 — Jobs, with the money book read-only beside them */}
      <section className={REGION}>
        <h3 className={REGION_HEAD}>Jobs</h3>
        {crew.length === 0 ? (
          <p className="t-body-sm text-[var(--ink-subtle)]">{NO_JOBS_SENTENCE}</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {crew.map((a) => (
              <CrewJobs
                key={a.id}
                personId={a.person_id}
                personName={namesById.get(a.person_id) ?? 'Unnamed'}
                onOpenPerson={onOpenPerson}
              />
            ))}
          </ul>
        )}
        <p className="t-body-sm mt-3 text-[var(--ink-subtle)]">{MONEY_BOOK_LINE}</p>
      </section>

      {/* R6 — History */}
      <section className={REGION}>
        <h3 className={REGION_HEAD}>History</h3>
        <p className="t-body-sm text-[var(--ink)]">
          {card.studio_verdict ?? NO_VERDICT_SENTENCE}
        </p>
        <DocumentAction
          actionKey="record-studio-verdict"
          surfaceKey="people"
          regionKey="company-history"
          variant="tertiary"
          aria-expanded={verdictOpen}
          aria-controls={`company-verdict-${card.id}`}
          onClick={() => setVerdictOpen((open) => !open)}
        >
          Record a verdict
        </DocumentAction>
        <div id={`company-verdict-${card.id}`} hidden={!verdictOpen} className="mt-2">
          <label
            className="t-head mb-1 block text-[var(--ink-subtle)]"
            htmlFor={`company-verdict-field-${card.id}`}
          >
            What the studio thinks
          </label>
          <input
            id={`company-verdict-field-${card.id}`}
            type="text"
            value={verdict}
            onChange={(e) => setVerdict(e.target.value)}
            className="w-full rounded-[2px] border border-[var(--hairline-strong)] border-b-[var(--ink-faint)] bg-[var(--paper-doc)] p-3 text-[16px] leading-[1.55]"
          />
          <DocumentAction
            actionKey="save-studio-verdict"
            surfaceKey="people"
            regionKey="company-history"
            variant="secondary"
            loading={updateCard.isPending}
            loadingLabel="Recording…"
            onClick={() => void recordVerdict()}
          >
            Save the verdict
          </DocumentAction>
        </div>
      </section>

      {error && (
        <p role="alert" className="t-body-sm mt-2 text-[var(--terracotta-ink)]">
          {error}
        </p>
      )}

      {organizationId && (
        <RecordDocumentSheet
          open={recordOpen}
          onClose={() => setRecordOpen(false)}
          organizationId={organizationId}
          holderId={card.id}
          holderName={name}
          onRecorded={(message) => onAnnounce(message)}
        />
      )}
    </div>
  );
}
