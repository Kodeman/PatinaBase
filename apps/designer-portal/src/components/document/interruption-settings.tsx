'use client';

/**
 * Interruption settings (D2): "Interruptions are designer-driven, never
 * system-dictated. Nothing breaks through by default." A quiet sheet listing
 * the six margin kinds, all OFF until the designer turns one on. Opened from
 * ⌘K ("Interruptions"); reachable without inventing a settings zone (the
 * Team/settings region is a later R5 destiny).
 */

import { useEffect, useState } from 'react';
import { DocSheet } from './overlays/doc-sheet';
import {
  useInterruptionRules,
  useSetInterruptionRule,
  type InterruptionKind,
} from '@/hooks/use-interruption-rules';
import { marginAccent } from '@/lib/document/margin-derivation';

const KINDS: { key: InterruptionKind; label: string; blurb: string }[] = [
  {
    key: 'decision',
    label: 'Decisions',
    blurb: 'An overdue decision breaks through.',
  },
  {
    key: 'message',
    label: 'Messages',
    blurb: 'A new client message breaks through.',
  },
  { key: 'invoice', label: 'Money', blurb: 'A payment event breaks through.' },
  {
    key: 'pulse',
    label: 'The Pulse',
    blurb: 'The Friday Pulse breaks through.',
  },
  { key: 'time', label: 'Time', blurb: 'Time summaries break through.' },
  { key: 'note', label: 'Notes', blurb: 'A dued note breaks through.' },
];

export function InterruptionSettings() {
  const [open, setOpen] = useState(false);
  const { data: rules } = useInterruptionRules();
  const setRule = useSetInterruptionRule();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('document:open-interruptions', onOpen);
    return () =>
      window.removeEventListener('document:open-interruptions', onOpen);
  }, []);

  return (
    <DocSheet open={open} onClose={() => setOpen(false)} title="Interruptions">
      <div className="mx-auto max-w-xl">
        <h2 className="font-heading text-xl text-[var(--color-charcoal)]">
          Interruptions
        </h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-mocha)]">
          The margin is the notification model — nothing breaks through unless
          you say so. Turn a kind on and it will surface louder than the quiet
          margin; everything stays off until you choose.
        </p>

        <ul className="mt-5">
          {KINDS.map(({ key, label, blurb }) => {
            const enabled = rules?.[key] ?? false;
            return (
              <li
                key={key}
                className="flex items-center gap-3 border-b border-[var(--color-pearl)] py-3"
              >
                <span
                  aria-hidden
                  className="h-[18px] w-[2.5px] rounded-[1px]"
                  style={{ background: marginAccent(key).border }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-[var(--color-charcoal)]">
                    {label}
                  </span>
                  <span className="block text-[11px] text-[var(--color-aged-oak)]">
                    {blurb}
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`${label} interruptions`}
                  disabled={setRule.isPending}
                  onClick={() =>
                    setRule.mutate({ kind: key, enabled: !enabled })
                  }
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] disabled:opacity-50"
                >
                  <span
                    className={`relative h-[20px] w-[36px] rounded-full border transition-colors ${
                      enabled
                        ? 'border-[var(--color-clay)] bg-[var(--color-clay)]'
                        : 'border-[var(--color-aged-oak)] bg-transparent'
                    }`}
                  >
                    <span
                      className={`absolute top-[2px] h-[14px] w-[14px] rounded-full transition-all ${
                        enabled ? 'bg-white' : 'bg-[var(--color-aged-oak)]'
                      }`}
                      style={{ left: enabled ? 18 : 2 }}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </DocSheet>
  );
}
