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

/** Which rung of the shortcut ladder actually carried (proposal §10). */
export type KeysOpenSource = 'key' | 'palette' | 'panel';

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

/** One key cap. DM Mono, pearl rule, no fill and no shadow — the same ink the
 *  ⌘K rows already wear for their chord chips. */
function Cap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[22px] items-center justify-center rounded-[3px] border border-[var(--color-pearl)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--color-clay-ink)]">
      {children}
    </kbd>
  );
}

/**
 * The reference itself, frameless — shared by the sheet and the Help Center
 * article so the two can never drift apart.
 */
export function KeysReferenceList({ sections }: { sections?: KeysSection[] }) {
  const rendered = sections ?? buildKeysReference();

  return (
    <div className="space-y-7">
      {rendered.map((section) => (
        <section key={section.heading} className="space-y-3">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
            {section.heading}
          </h3>
          <dl className="divide-y divide-[var(--color-pearl)] border-t border-[var(--color-pearl)]">
            {section.rows.map((row, index) => (
              <div
                key={`${section.heading}-${index}`}
                className="grid grid-cols-[minmax(96px,auto)_1fr] items-baseline gap-x-5 py-2.5"
              >
                <dt className="flex flex-wrap items-center gap-1">
                  {row.keys.map((cap, capIndex) => (
                    <Cap key={`${cap}-${capIndex}`}>{cap}</Cap>
                  ))}
                </dt>
                <dd className="min-w-0">
                  <span className="text-[13px] text-[var(--color-charcoal)]">{row.label}</span>
                  <span className="block text-[12px] leading-relaxed text-[var(--text-muted)]">
                    {row.where}
                  </span>
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
      title="The keys"
      pageLabel="Reference"
      icon={Keyboard}
      helpKey={THE_KEYS_SURFACE_KEY}
      kind="keys"
    >
      <p className="mb-6 font-heading text-[15px] italic leading-relaxed text-[var(--text-muted)]">
        Every key the studio answers to. Two keys open any room or book; the rest
        are for the work you are already in the middle of.
      </p>
      <KeysReferenceList />
    </DocSheet>
  );
}
