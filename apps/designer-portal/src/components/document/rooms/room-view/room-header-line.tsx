'use client';

/**
 * RoomHeaderLine — the one Header line the room page and the room file share
 * (US-28 S10a; uplift.md (b)6 and (c) area 3; specimens/rooms-1440.html frame
 * p2). One row on --paper: the back act when nested, the `.t-d2` title, acts
 * at the right; then the double rule. Wraps, never truncates; at 390 it
 * takes two rows with the back act's full accessible name.
 *
 * The classes are the US-28 S1 block's (`.hline`, `.hline-l`, `.hline-r`,
 * `.rule-strong`). The back act is a tertiary DocumentAction: never a filled
 * act here.
 */

import type { ReactNode } from 'react';
import { DocumentAction } from '../../document-action';

export function RoomHeaderLine({
  title,
  as: Heading = 'h2',
  back,
  acts,
}: {
  title: ReactNode;
  /** h1 where no RoomShell above already holds the page's heading. */
  as?: 'h1' | 'h2';
  back?: { href: string; label: string };
  acts?: ReactNode;
}) {
  return (
    <>
      <header className="hline" data-room-header-line>
        <div className="hline-l">
          {back && (
            <DocumentAction
              href={back.href}
              actionKey="room-header-back"
              surfaceKey="room"
              regionKey="room-header-line"
              variant="tertiary"
              wrap
              aria-label={`Back to ${back.label}`}
            >
              <span aria-hidden="true">← </span>
              {back.label}
            </DocumentAction>
          )}
          <Heading className="t-d2 m-0 text-[var(--text-primary)]">{title}</Heading>
        </div>
        {acts && <div className="hline-r">{acts}</div>}
      </header>
      <div className="rule-strong" role="presentation" />
    </>
  );
}
