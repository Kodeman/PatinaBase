'use client';

/**
 * KeysSheet — "The keys" as a laid sheet (onboarding Wave 1, task L5;
 * decision 8).
 *
 * The `?` overlay and the Help Center article `/help/article/the-keys` render
 * the SAME `buildKeysReference()` data — one source, two doorways. Nothing is
 * retyped here; see keys-reference.ts for where each row comes from.
 *
 * Opened the `openCaptureLead` way: a window event, so ⌘K, the contextual
 * panel's KEYS block, and the global `?` listener all reach it without
 * knowing where it is mounted. Unlike the Desk-mounted sheets it needs no
 * pending flag — it is mounted once in the (document) layout, so the listener
 * never unmounts inside the document.
 *
 * Frame: DocSheet (R3/R96) — laid paper, one hairline rule, zero shadows (D4).
 * No badges, no status colour: this is reference, not state.
 */

import { useEffect, useState } from 'react';
import { Keyboard } from 'lucide-react';
import {
  buildKeysReference,
  THE_KEYS_SURFACE_KEY,
  type KeysSection,
} from '@/lib/help-system/keys-reference';
import { HELP_EVENTS, safeCapture } from '@/lib/help-system/help-events';
import { DocSheet } from './doc-sheet';

export const KEYS_SHEET_EVENT = 'document:open-keys';

/** Which rung of the shortcut ladder actually carried (proposal §10).
 *  Matches the three doorways that actually fire `help.shortcuts.opened`:
 *  the global `?` key, the ⌘K palette row (both via `openKeys()` below), and
 *  the Help Center article page (`/help/article/the-keys`, which fires
 *  `source: 'help_center'` directly — it's a route, not this overlay, so it
 *  never calls `openKeys()`). The contextual panel's "The keys" link
 *  (`PanelKeysBlock`) is a bare route link by design (it opens the article,
 *  not this sheet) and so carries no source of its own — cross-lane review
 *  2026-09-03, F2. US-19 D4 adds the Studio Drawer's printed `Keys ?` act
 *  (`drawer`), behind `ask-the-paper`. */
export type KeysOpenSource = 'key' | 'palette' | 'help_center' | 'drawer';

export interface OpenKeysEventDetail {
  source: KeysOpenSource;
}

/** Open "The keys" from anywhere in the document model. */
export function openKeys(source: KeysOpenSource = 'palette'): void {
  if (typeof window === 'undefined') return;
  safeCapture(HELP_EVENTS.SHORTCUTS_OPENED, { source });
  window.dispatchEvent(
    new CustomEvent<OpenKeysEventDetail>(KEYS_SHEET_EVENT, { detail: { source } }),
  );
}

/**
 * The reference itself, frameless — shared by the sheet and the Help Center
 * article so the two can never drift apart.
 *
 * US-28 S6 — text rows, not keycap boxes: a group is a head and its rows, and
 * a key is a word in ink (`.keycap`), never a bordered cap.
 */
export function KeysReferenceList({ sections }: { sections?: KeysSection[] }) {
  const rendered = sections ?? buildKeysReference();

  return (
    <div className="space-y-8">
      {rendered.map((section) => (
        <section key={section.heading}>
          <div className="sec-head">
            <h3 className="eb">
              <svg className="orn" viewBox="0 0 34 12" aria-hidden="true" focusable="false">
                <path d="M0 2h34M0 6h28M0 10h20" />
              </svg>
              <span>{section.heading}</span>
            </h3>
          </div>
          <dl className="rows">
            {section.rows.map((row, index) => (
              <div
                key={`${section.heading}-${index}`}
                className="grid grid-cols-[minmax(96px,auto)_minmax(0,1fr)] items-baseline gap-x-5 gap-y-1 border-b border-[var(--doc-ink-border)] py-2.5 max-[599px]:grid-cols-1"
              >
                <dt className="flex flex-wrap items-baseline gap-x-2">
                  {row.keys.map((cap, capIndex) => (
                    <kbd key={`${cap}-${capIndex}`} className="keycap">
                      {cap}
                    </kbd>
                  ))}
                </dt>
                <dd className="min-w-0">
                  <span className="t-body-sm text-[var(--text-primary)]">{row.label}</span>
                  <span className="t-body-sm block text-[var(--text-subtle)]">{row.where}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

export function KeysSheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(KEYS_SHEET_EVENT, onOpen);
    return () => window.removeEventListener(KEYS_SHEET_EVENT, onOpen);
  }, []);

  return (
    <DocSheet
      open={open}
      onClose={() => setOpen(false)}
      title="Keyboard shortcuts"
      pageLabel="Reference"
      icon={Keyboard}
      helpKey={THE_KEYS_SURFACE_KEY}
      kind="keys"
    >
      <p className="mb-6 t-body-sm text-[var(--text-muted)]">
        Every key the studio answers to. Two keys open any room or book; the rest
        are for the work you are already in the middle of.
      </p>
      <KeysReferenceList />
    </DocSheet>
  );
}
