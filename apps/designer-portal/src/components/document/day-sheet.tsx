'use client';

/**
 * The Day Sheet (US-25 slice 4) — the top of the Desk. It replaces the
 * overdue sentence, the day's line and the setup whisper.
 *
 * Each line is one sentence: the job (or the person, for a hand-off), the
 * fact, its time word, and the act beside it with a quiet "Not today".
 * Monochrome by rule (Q1): ink only, and no badge, dot, overflow count,
 * "cleared today" or streak anywhere on it.
 *
 * US-14 arrival marks moved here with the content they lifted: the eyebrow's
 * date is the `head` (U-Q3 — the date left the Desk header for Today's
 * eyebrow) and, on a working sheet, the `settle`; line one carries
 * `headline` / `job` / `act`, and lines two and three are the facts
 * `f1` / `f2`. A quiet sheet's one sentence is its `headline settle`.
 */

import type { MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSetNeedState } from '@patina/supabase';
import type { DeskNeed } from '@/lib/document/desk-need-list';
import type { RosterLine } from '@/lib/document/desk-roster-derivation';
import type { DeskScope } from '@/lib/document/desk-scope';
import { deskActionLabel, deskNeedText } from '@/lib/document/desk-derivation';
import { nextWorkingDay, timeWord, type DaySheet as DaySheetModel } from '@/lib/document/day-sheet';
import { dayMonth, WEEKDAY_FORMAT, parseSourceDate } from '@/lib/document/dates';
import { DocumentAction, DocumentActionGroup } from './document-action';
import { useNeedActSheet } from './acts/need-act-sheet';
import { actSheetKindOf } from './acts/act-sheet-kind';
import { actLanding } from './desk-ledger-row';
import { openLedger } from './command-bar';
import { SectionEyebrow } from './section-eyebrow';

/** F4 — the quiet sheet's one sentence. */
export const NOTHING_NEEDS_YOU_TONIGHT = 'Nothing more needs you today.';
/** F4 — printed inside Today, above its closing rule: it captions the sheet. */
export const THE_REST = 'The rest are on their projects.';

/** F2 — a group head inside a section: the eyebrow's mono caps, no rule of
 *  its own (the old ink underline read as the section's close). */
export const DESK_GROUP_HEAD =
  'font-mono text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]';

const SCOPES: readonly (readonly [DeskScope, string])[] = [
  ['mine', 'Mine'],
  ['studio', 'The studio’s'],
];

function backOn(day: string): string {
  const date = parseSourceDate(day);
  return date ? `Back ${WEEKDAY_FORMAT.format(date)} ${dayMonth(date)}` : 'Back soon';
}

/** Walk W-D8 — the line joins the job and its fact with one em dash, so the
 *  fact's own dashes read as commas rather than a chain of dashes. */
const asOneClause = (fact: string) => fact.replace(/\s+—\s+/g, ', ');

function SheetLine({
  entry,
  index,
  oneVoice,
  now,
  job,
}: {
  entry: DeskNeed;
  index: number;
  oneVoice: boolean;
  now: Date;
  job?: RosterLine;
}) {
  const acts = useNeedActSheet();
  const router = useRouter();
  // SQ-777 F2 — a failed mark says so on its line, never in a toast.
  const setNeedState = useSetNeedState({ errorSurface: 'inline' });
  const { need } = entry;
  const handoff = need.kind === 'handoff';
  const sentence = handoff ? deskNeedText(need, oneVoice) : asOneClause(deskNeedText(need, oneVoice));
  const when = timeWord(need.at, now);
  // A hand-off names its own act: one-voice's kind name ("Read the note")
  // would promise a note the hire's invite never carried.
  const label = (handoff ? need.actionLabel : deskActionLabel(need, oneVoice)) ?? 'Open project file';
  const href = need.deepLink ?? `/doc/${entry.projectId}`;
  const top = index === 0;
  // US-14 R-DM21 A — the act lands where the claim card's act landed: the
  // job's stage, read off its roster line. One that opens a sheet carries none.
  const landing =
    job && !actSheetKindOf(entry)
      ? actLanding({
          ...job,
          needKind: need.kind,
          jobHref: `/doc/${entry.projectId}`,
          act: { label, href, ...(need.ledger ? { ledger: need.ledger } : {}) },
        })
      : null;

  const act = (event: MouseEvent<HTMLAnchorElement>) => {
    // Walk W-D6 — opening the hand-off is reading it: the same `acted` mark
    // the Document's MARK READ writes. SQ-774 R7 — she leaves once the mark
    // has landed; a refused or offline mark stays here and says so.
    if (handoff) {
      event.preventDefault();
      setNeedState.mutate(
        { needKey: entry.key, projectId: entry.projectId, action: 'acted' },
        { onSuccess: () => router.push(href) },
      );
      return;
    }
    if (acts.open(entry)) {
      event.preventDefault();
      return;
    }
    if (need.ledger) {
      event.preventDefault();
      openLedger(need.ledger.name, need.ledger.context);
    }
  };

  return (
    <li
      data-day-sheet-line={entry.key}
      data-part={index === 1 ? 'f1' : index === 2 ? 'f2' : undefined}
      className="day-sheet-line"
    >
      <p
        data-part={top ? 'headline' : undefined}
        className="doc-type-body text-[17px] leading-[26px] text-[var(--text-primary)] [overflow-wrap:anywhere]"
      >
        {handoff ? (
          sentence
        ) : (
          <>
            {/* F3 — the job name opens the job, on every line. */}
            <Link
              href={job?.jobHref ?? `/doc/${entry.projectId}`}
              data-part={top ? 'job' : undefined}
              data-day-sheet-job
              className="font-semibold text-[var(--text-primary)] no-underline hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text-primary)]"
            >
              {entry.projectName}
            </Link>
            {` — ${sentence}`}
          </>
        )}
        {when && <span className="text-[var(--text-muted)]">{`, ${when}`}</span>}
      </p>
      {/* The arrival click token reads an act by `data-register="act"`. */}
      <div className="day-sheet-acts" data-register="act">
        <DocumentAction
          actionKey={`day-sheet-${need.kind}`}
          variant="secondary"
          href={href}
          onClick={act}
          aria-label={`${label} — ${entry.projectName}`}
          data-part={top ? 'act' : undefined}
          data-landing={landing ? JSON.stringify(landing) : undefined}
        >
          {label}
        </DocumentAction>
        {/* SQ-778 N5 — every line can be set aside for today, an inquiry or a
            proposal with no project and a legacy project with no studio
            included: the line's engagement names its studio. */}
        {!handoff && (
          <DocumentAction
            actionKey="day-sheet-not-today"
            variant="tertiary"
            aria-label={`Not today — ${entry.projectName}`}
            disabled={setNeedState.isPending}
            onClick={() =>
              setNeedState.mutate({
                needKey: entry.key,
                engagementId: entry.projectId,
                action: 'not_today',
                until: nextWorkingDay(now),
              })
            }
          >
            Not today
          </DocumentAction>
        )}
      </div>
      {setNeedState.isError && (
        <p role="alert" data-day-sheet-failed className="doc-type-body text-[var(--text-primary)]">
          {handoff ? 'The hand-off was not marked read. Try again.' : 'Not today did not save. Try again.'}
        </p>
      )}
    </li>
  );
}

export function DaySheet({
  sheet,
  scope,
  onScope,
  oneVoice = false,
  now,
  jobs,
  dateLabel,
}: {
  sheet: DaySheetModel;
  scope: DeskScope;
  onScope: (scope: DeskScope) => void;
  oneVoice?: boolean;
  now: Date;
  /** Each job's roster line, by the need's project id — where its act lands. */
  jobs?: ReadonlyMap<string, RosterLine>;
  /** U-Q3 — the day, as "Monday 12 October"; blank until hydrated. */
  dateLabel?: string;
}) {
  const quiet = sheet.lines.length === 0;
  const notChecked =
    sheet.unchecked.length > 0 ? `Not checked: ${sheet.unchecked.join(', ')}.` : null;
  // Fix-now 6 — an unread feed never lets the sheet say nothing needs her.
  const head = sheet.empty ? NOTHING_NEEDS_YOU_TONIGHT : notChecked;

  return (
    <section aria-labelledby="day-sheet-head" data-testid="day-sheet" className="day-sheet">
      <div className="day-sheet-head">
        <SectionEyebrow>
          {/* US-14 `head` — the arrival's landing focus and the card's place. */}
          <span
            id="day-sheet-head"
            data-part={quiet ? 'head' : 'head settle'}
            tabIndex={-1}
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text-primary)]"
          >
            {dateLabel ? `${dateLabel} · Today` : 'Today'}
          </span>
        </SectionEyebrow>
        <div role="group" aria-label="Whose projects" className="day-sheet-scope">
          {SCOPES.map(([key, word], i) => (
            <span key={key} className="inline-flex items-baseline gap-2.5">
              {i > 0 && <span aria-hidden="true">·</span>}
              <button
                type="button"
                aria-pressed={scope === key}
                onClick={() => onScope(key)}
                className="min-h-11 text-[15px] text-[var(--text-muted)] aria-pressed:font-medium aria-pressed:text-[var(--text-primary)] aria-pressed:underline aria-pressed:decoration-2 aria-pressed:underline-offset-[7px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text-primary)]"
              >
                {word}
              </button>
            </span>
          ))}
        </div>
      </div>
      {quiet && head && (
        <p
          data-part="headline settle"
          className="font-heading text-[22px] italic leading-[1.3] text-[var(--text-primary)]"
        >
          {head}
        </p>
      )}

      {!quiet && (
        <DocumentActionGroup surfaceKey="desk" regionKey="day-sheet" aria-label="Day Sheet actions">
          <ol className="day-sheet-lines">
            {sheet.lines.map((entry, index) => (
              <SheetLine
                key={entry.key}
                entry={entry}
                index={index}
                oneVoice={oneVoice}
                now={now}
                job={jobs?.get(entry.projectId)}
              />
            ))}
          </ol>
        </DocumentActionGroup>
      )}
      {!quiet && notChecked && (
        <p className="doc-type-body mt-4 text-[var(--text-muted)]">{notChecked}</p>
      )}

      {/* F4 — both blocks print whenever they hold a line, not only on a
          quiet sheet: a line she acted on or put off never vanishes. */}
      {sheet.waitingOn.length > 0 && (
        <div className="day-sheet-block">
          <h3 className={DESK_GROUP_HEAD}>Awaiting</h3>
          <ul>
            {sheet.waitingOn.map(({ need: entry, who, since }) => (
              <li key={entry.key} data-day-sheet-waiting={entry.key} className="day-sheet-waiting">
                <span className="text-[var(--text-primary)]">
                  {`Awaiting ${who} since ${dayMonth(since) ?? 'today'}`}
                </span>
                <span className="text-[var(--text-muted)]">{entry.projectName}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {sheet.setAside.length > 0 && (
        <div className="day-sheet-block">
          <h3 className={DESK_GROUP_HEAD}>Coming back</h3>
          <ul>
            {sheet.setAside.map(({ need: entry, until }) => (
              <li key={entry.key} data-day-sheet-back={entry.key} className="day-sheet-waiting">
                <span className="font-heading text-[18px]">{entry.projectName}</span>
                <span className="text-[var(--text-muted)]">{deskNeedText(entry.need, oneVoice)}</span>
                <span className="font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--text-muted)]">{backOn(until)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* F4 — above Today's closing rule, so it captions the sheet, not the
          workload below it. */}
      <p className="mt-4 font-heading text-[17px] italic text-[var(--text-muted)]">{THE_REST}</p>
    </section>
  );
}
