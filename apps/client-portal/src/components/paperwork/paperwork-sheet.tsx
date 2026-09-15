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

import { useMemo, useState } from 'react';
import { Button } from '@patina/design-system';
import { buildPaperworkRows, type PaperworkContext } from './paperwork-model';
import { PaperworkUploadForm } from './paperwork-upload-form';

export interface PaperworkSheetProps {
  token: string;
  studioName: string;
  context: PaperworkContext;
}

export function PaperworkSheet({ token, studioName, context }: PaperworkSheetProps) {
  const rows = useMemo(() => buildPaperworkRows(context), [context]);
  const [received, setReceived] = useState<Record<string, true>>({});
  const [opened, setOpened] = useState<Record<string, true>>({});

  return (
    <section className="space-y-6" aria-label="Paperwork">
      {rows.map((row) => {
        const isReceived = received[row.key] === true || row.awaitingCheck;
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

            {isReceived && (
              <p className="type-body-small mt-2 text-[var(--text-muted)]">
                Received. {studioName} will confirm it.
              </p>
            )}

            {isOpen ? (
              <PaperworkUploadForm
                token={token}
                docType={row.docType}
                docLabel={row.docLabel}
                title={row.title}
                uploadOnly={row.uploadOnly}
                expiryRequired={row.expiryRequired}
                onReceived={() => {
                  setReceived((prior) => ({ ...prior, [row.key]: true }));
                  setOpened((prior) => {
                    const next = { ...prior };
                    delete next[row.key];
                    return next;
                  });
                }}
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
