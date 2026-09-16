'use client';

/**
 * THE PAPERWORK SHEET (build/upload-door-spec.md §3).
 *
 * The firm's paperwork contact opens this from a link the studio minted against
 * the company card. It says what the studio holds, what a lapse holds up, and
 * what is owed — and it takes the missing paper, one form per document type.
 *
 * Everything the firm reads is `paperwork-model.ts`'s sentence, built from
 * `resolve_paperwork_link`'s answer. No sentence here tells the firm what
 * happens if it does not send the paper: the block printed in the row is the
 * whole notice (spec §3).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@patina/design-system';
import {
  buildPaperworkRows,
  receivedReading,
  type PaperworkContext,
} from './paperwork-model';
import { PaperworkUploadForm } from './paperwork-upload-form';

export interface PaperworkSheetProps {
  token: string;
  studioName: string;
  context: PaperworkContext;
}

/** The receipt, in one place: the live region says it and the paragraph prints it. */
export function paperworkReceiptSentence(studioName: string): string {
  return `Received. ${studioName} will confirm it.`;
}

export function PaperworkSheet({ token, studioName, context }: PaperworkSheetProps) {
  const rows = useMemo(() => buildPaperworkRows(context), [context]);
  const [received, setReceived] = useState<Record<string, true>>({});
  const [opened, setOpened] = useState<Record<string, true>>({});
  /**
   * W4 r2 MAJOR-5 — THE OUTCOME OF THIS PAGE'S ONE ACT, SAID OUT LOUD.
   *
   * A successful send unmounts the whole form, the focused submit button with
   * it, so focus fell to `document.body` and the only feedback was a plain
   * paragraph on a page with no live region anywhere. A screen-reader user
   * pressed "Send W-9", heard nothing, and lost her place. (The FAILURE path
   * was already announced — `role="status"` in `paperwork-upload-form`.)
   *
   * So: one polite region for the whole sheet, and focus moved to the receipt
   * paragraph of the row that was just sent, which is where the reader now is.
   */
  const [announcement, setAnnouncement] = useState('');
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const receiptRefs = useRef<Record<string, HTMLParagraphElement | null>>({});

  useEffect(() => {
    if (!focusKey) return;
    receiptRefs.current[focusKey]?.focus();
    setFocusKey(null);
  }, [focusKey]);

  const receiptSentence = paperworkReceiptSentence(studioName);

  const markReceived = useCallback(
    (key: string) => {
      setReceived((prior) => ({ ...prior, [key]: true }));
      setOpened((prior) => {
        const next = { ...prior };
        delete next[key];
        return next;
      });
      setAnnouncement(receiptSentence);
      setFocusKey(key);
    },
    [receiptSentence],
  );

  return (
    <section className="space-y-6" aria-label="Paperwork">
      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>
      {rows.map((source) => {
        // THE ROW SAYS WHAT THE SEND MADE TRUE (W4 r8 MAJOR-1 / QA F1). Nothing
        // on this page re-reads the server, so a row sent in THIS visit is
        // re-read here instead: `receivedReading` moves it to the reading R-BU
        // gives it on the next load, which is how "W-9 is not on file." stopped
        // standing one line above its own receipt.
        const sentThisVisit = received[source.key] === true;
        const row = sentThisVisit ? receivedReading(source) : source;
        // A refused row the firm has not acted on prints the refusal and opens
        // its form, and nothing is waiting, so no receipt (W4 r7 M-4) — it
        // arrives here as `refused` with no awaitingCheck flag. One the firm
        // HAS just re-sent is a send like any other: `receivedReading` has
        // already moved it to awaiting_check, so it prints the receipt, takes
        // the focus and closes its form (W4 r9 M-1).
        const isReceived = sentThisVisit || row.awaitingCheck;
        const isOpen = opened[row.key] === true || (row.openByDefault && !isReceived);

        return (
          <article
            key={row.key}
            className="border-t border-[var(--border-default)] pt-4"
            aria-label={row.title}
          >
            <p className="type-body text-[var(--text-primary)]">{row.sentence}</p>

            {row.blocksSentence && (
              <p className="type-body-small mt-1 text-[var(--terracotta-ink)]">
                {row.blocksSentence}
              </p>
            )}

            {/* THE REFUSAL TRAVELS HERE OR NOWHERE (W4 r7 M-4). The chase is an
                agent draft that lands `awaiting_review`, and Agent OS forbids
                automated external sends, so this page is the only face the
                firm has. The studio was told plainly that the firm reads these
                words when it typed them. */}
            {row.reasonSentence && (
              <p
                data-paperwork-refusal={row.key}
                className="type-body-small mt-1 text-[var(--terracotta-ink)]"
              >
                {row.reasonSentence}
              </p>
            )}

            {isReceived && (
              <p
                ref={(node) => {
                  receiptRefs.current[row.key] = node;
                }}
                tabIndex={-1}
                data-paperwork-receipt={row.key}
                className="type-body-small mt-2 text-[var(--text-muted)] outline-none"
              >
                {receiptSentence}
              </p>
            )}

            {isOpen ? (
              <PaperworkUploadForm
                token={token}
                // The row's own key, not its doc type: two `other_named` rows
                // share a type and must not share their field ids (W4 r4).
                fieldPrefix={row.key}
                docType={row.docType}
                docLabel={row.docLabel}
                title={row.title}
                uploadOnly={row.uploadOnly}
                expiryRequired={row.expiryRequired}
                onReceived={() => markReceived(row.key)}
              />
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 min-h-[44px]"
                onClick={() => setOpened((prior) => ({ ...prior, [row.key]: true }))}
              >
                Add {row.title}
              </Button>
            )}
          </article>
        );
      })}
    </section>
  );
}
