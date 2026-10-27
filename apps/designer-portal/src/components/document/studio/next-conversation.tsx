'use client';

/**
 * The next conversation (WP-01.8): the studio's inquiries, kept close to the
 * work. The rows are the Desk's own lead engagements with the roster's words,
 * named by who holds each (deskHolderOf, read on useProjectLeads); recording
 * another opens the existing CaptureLeadSheet, the Desk's front door (G1).
 */

import Link from 'next/link';
import type { CapturedLead } from '@/components/document/overlays/capture-lead-sheet';
import type { RosterLine } from '@/lib/document/desk-roster-derivation';
import { holderCalled, type DeskHolder } from '@/lib/document/desk-scope';
import { DocumentAction } from '@/components/document/document-action';

export function NextConversation({
  inquiries,
  holderOf,
  recorded,
  onRecord,
  onLeave,
}: {
  inquiries: readonly RosterLine[];
  holderOf: (jobId: string) => DeskHolder;
  recorded: CapturedLead | null;
  onRecord: () => void;
  onLeave: (anchorId: string, docId: string) => void;
}) {
  return (
    <section
      aria-labelledby="studio-inquiries-head"
      data-studio-inquiries
      className="mt-12 border-t border-[var(--ink)] pt-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2 pb-4">
        <h2 id="studio-inquiries-head" className="t-d1">
          The next conversation
        </h2>
        <DocumentAction
          actionKey="capture-lead"
          variant="secondary"
          leading="＋"
          aria-label="Record an inquiry"
          data-tour-anchor="desk-capture-lead"
          onClick={onRecord}
        >
          Record an inquiry
        </DocumentAction>
      </div>
      {/* U-Q7 — this visit's one line for the inquiry she just recorded. */}
      {recorded && (
        <p data-desk-visit role="status" className="t-body-sm pb-4 text-[var(--ink-faint)] [overflow-wrap:anywhere]">
          {`${recorded.name} recorded · just now · `}
          {/* The visit line disappears on remount; return to the persisted inquiry's row. */}
          <DocumentAction
            id={`studio-recorded-${recorded.id}`}
            actionKey="desk-visit-open-brief"
            variant="tertiary"
            href={`/doc/${recorded.id}`}
            onClick={() => onLeave(`studio-inquiry-${recorded.id}`, recorded.id)}
            aria-label={`Open the brief — ${recorded.name}`}
          >
            Open the brief
          </DocumentAction>
        </p>
      )}
      {inquiries.length === 0 ? (
        <p className="t-body-sm border-t border-[var(--hairline-strong)] py-5 text-[var(--ink-faint)]">
          No inquiries waiting.
        </p>
      ) : (
        <ul>
          {inquiries.map((line) => {
            const anchorId = `studio-inquiry-${line.engagementId}`;
            const holder = holderOf(line.projectId ?? line.engagementId);
            return (
              <li
                key={line.engagementId}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-6 border-t border-[var(--hairline-strong)] py-5"
              >
                <div className="min-w-0">
                  <h3 className="t-d3 [overflow-wrap:anywhere]">
                    <Link
                      id={anchorId}
                      href={line.jobHref}
                      onClick={() => onLeave(anchorId, line.engagementId)}
                      className="underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                    >
                      {line.name}
                    </Link>
                  </h3>
                  <p className="t-body-sm mt-1 text-[var(--ink-faint)] [overflow-wrap:anywhere]">
                    {line.needText ?? line.state}
                  </p>
                </div>
                {!holder.mine && (
                  <p className="r8-small text-[var(--ink-faint)]">{`With ${holderCalled(holder)}`}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
