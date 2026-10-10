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
 * US-14 arrival marks moved here with the content they lifted: the head
 * sentence is `settle`, line one carries `headline` / `job` / `act`, and
 * lines two and three are the facts `f1` / `f2`.
 */

import type { MouseEvent } from 'react';
import { useSetNeedState } from '@patina/supabase';
import type { DeskNeed } from '@/lib/document/desk-need-list';
import type { DeskScope } from '@/lib/document/desk-scope';
import { deskActionLabel, deskNeedText } from '@/lib/document/desk-derivation';
import { nextWorkingDay, timeWord, type DaySheet as DaySheetModel } from '@/lib/document/day-sheet';
import { dayMonth, WEEKDAY_FORMAT, parseSourceDate } from '@/lib/document/dates';
import { DocumentAction, DocumentActionGroup } from './document-action';
import { useNeedActSheet } from './acts/need-act-sheet';
import { openLedger } from './command-bar';

export const NOTHING_NEEDS_YOU_TONIGHT = 'Nothing needs you tonight.';
export const THE_REST = 'The rest are on their jobs.';

const SCOPES: readonly (readonly [DeskScope, string])[] = [
  ['mine', 'Mine'],
  ['studio', 'The studio’s'],
];

function salutation(now: Date): string {
  const hour = now.getHours();
  const part = hour < 12 ? 'This morning' : hour < 18 ? 'This afternoon' : 'This evening';
  return `${part}, these need you.`;
}

function backOn(day: string): string {
  const date = parseSourceDate(day);
  return date ? `Back ${WEEKDAY_FORMAT.format(date)} ${dayMonth(date)}` : 'Back soon';
}

function SheetLine({
  entry,
  index,
  oneVoice,
  now,
}: {
  entry: DeskNeed;
  index: number;
  oneVoice: boolean;
  now: Date;
}) {
  const acts = useNeedActSheet();
  const setNeedState = useSetNeedState();
  const { need } = entry;
  const handoff = need.kind === 'handoff';
  const sentence = deskNeedText(need, oneVoice);
  const when = timeWord(need.at, now);
  const label = deskActionLabel(need, oneVoice) ?? 'Open the job';
  const href = need.deepLink ?? `/doc/${entry.projectId}`;
  const top = index === 0;

  const act = (event: MouseEvent<HTMLAnchorElement>) => {
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
            <strong data-part={top ? 'job' : undefined} className="font-semibold">
              {entry.projectName}
            </strong>
            {` — ${sentence}`}
          </>
        )}
        {when && <span className="text-[var(--text-muted)]">{`, ${when}`}</span>}
      </p>
      <div className="day-sheet-acts">
        <DocumentAction
          actionKey={`day-sheet-${need.kind}`}
          variant="secondary"
          href={href}
          onClick={act}
          aria-label={`${label} — ${entry.projectName}`}
          data-part={top ? 'act' : undefined}
        >
          {label}
        </DocumentAction>
        {!handoff && (
          <DocumentAction
            actionKey="day-sheet-not-today"
            variant="tertiary"
            aria-label={`Not today — ${entry.projectName}`}
            disabled={setNeedState.isPending}
            onClick={() =>
              setNeedState.mutate({
                needKey: entry.key,
                projectId: entry.projectId,
                action: 'not_today',
                until: nextWorkingDay(now),
              })
            }
          >
            Not today
          </DocumentAction>
        )}
      </div>
    </li>
  );
}

export function DaySheet({
  sheet,
  scope,
  onScope,
  oneVoice = false,
  now,
}: {
  sheet: DaySheetModel;
  scope: DeskScope;
  onScope: (scope: DeskScope) => void;
  oneVoice?: boolean;
  now: Date;
}) {
  const quiet = sheet.lines.length === 0;
  const notChecked =
    sheet.unchecked.length > 0 ? `Not checked: ${sheet.unchecked.join(', ')}.` : null;
  // Fix-now 6 — an unread feed never lets the sheet say nothing needs her.
  const head = sheet.empty ? NOTHING_NEEDS_YOU_TONIGHT : quiet ? notChecked! : salutation(now);

  return (
    <section aria-labelledby="day-sheet-head" data-testid="day-sheet" className="day-sheet">
      <div className="day-sheet-head">
        <p
          id="day-sheet-head"
          data-part={quiet ? 'headline settle' : 'settle'}
          className="font-heading text-[22px] italic leading-[1.3] text-[var(--text-primary)]"
        >
          {head}
        </p>
        <div role="group" aria-label="Whose jobs" className="day-sheet-scope">
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

      {!quiet && (
        <DocumentActionGroup surfaceKey="desk" regionKey="day-sheet" aria-label="Day Sheet actions">
          <ol className="day-sheet-lines">
            {sheet.lines.map((entry, index) => (
              <SheetLine key={entry.key} entry={entry} index={index} oneVoice={oneVoice} now={now} />
            ))}
          </ol>
        </DocumentActionGroup>
      )}
      {!quiet && notChecked && (
        <p className="doc-type-body mt-4 text-[var(--text-muted)]">{notChecked}</p>
      )}

      {quiet && sheet.setAside.length > 0 && (
        <div className="day-sheet-block">
          <h3 className="border-b border-[color:var(--text-primary)] pb-2 font-mono text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">Coming back</h3>
          <ul>
            {sheet.setAside.map(({ need: entry, until }) => (
              <li key={entry.key} className="day-sheet-waiting">
                <span className="font-heading text-[18px]">{entry.projectName}</span>
                <span className="text-[var(--text-muted)]">{deskNeedText(entry.need, oneVoice)}</span>
                <span className="font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--text-muted)]">{backOn(until)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {quiet && sheet.waitingOn.length > 0 && (
        <div className="day-sheet-block">
          <h3 className="border-b border-[color:var(--text-primary)] pb-2 font-mono text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">Waiting on</h3>
          <ul>
            {sheet.waitingOn.map(({ need: entry, who, since }) => (
              <li key={entry.key} data-day-sheet-waiting={entry.key} className="day-sheet-waiting">
                <span className="text-[var(--text-primary)]">
                  {`Waiting on ${who} since ${dayMonth(since) ?? 'today'}`}
                </span>
                <span className="text-[var(--text-muted)]">{entry.projectName}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 font-heading text-[17px] italic text-[var(--text-muted)]">{THE_REST}</p>
    </section>
  );
}
