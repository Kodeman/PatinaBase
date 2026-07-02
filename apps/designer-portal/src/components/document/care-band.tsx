'use client';

/**
 * The Care band (Track 7 · R80) — completion as ONE act. The Direction work
 * band's sibling (R68.1 grammar: tinted flat band, Strata-adjacent mono label,
 * one SOLID lead act, quiet seconds): the closure checklist + the portfolio
 * snapshot compose in place, and "Close the book" settles the project in a
 * single transaction (close_project, 00238).
 *
 * Where it lives: the tail of the active Project/Install section. It carries
 * its own volume control so an early project never wears a closure band —
 *   · install phases (installation / final_walkthrough): the full band opens
 *     unfolded — closing out IS the work of this stage.
 *   · earlier: one quiet mono line ("Close the book…") that unfolds on click,
 *     so a handshake project that never stages install can still settle.
 *   · completed: renders nothing (the Care section owns the settled read).
 *
 * After close: a quiet inline confirmation (R51), then the document re-derives
 * — active section flips to Care and the sections settle. No route change, no
 * toast (D2), zero shadows (D4).
 */

import { useState } from 'react';
import { useProjectV2 } from '@patina/supabase';
import { useCloseProject } from '@/hooks/use-project-lifecycle';
import {
  allClosureComplete,
  centsToDollarString,
  defaultClosureItems,
  dollarsToCents,
  seedSnapshot,
  toggleClosureItem,
  type ClosureItem,
} from '@/lib/document/closure-derivation';
import { StrataMark } from './strata-mark';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

const FIELD_CLS =
  'w-full rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-charcoal)] placeholder:italic placeholder:text-[var(--text-muted)] focus:border-[var(--color-clay)] focus:outline-none';
const LABEL_CLS =
  'mb-1 block font-mono text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';

export function CareBand({ projectId }: { projectId: string }) {
  const { data: project } = useProjectV2(projectId) as { data: AnyRecord };
  const closeProject = useCloseProject();

  const nearClose =
    project?.current_phase === 'installation' || project?.current_phase === 'final_walkthrough';

  const [unfolded, setUnfolded] = useState(false);
  const [items, setItems] = useState<ClosureItem[]>(defaultClosureItems);
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [valueDollars, setValueDollars] = useState<string | null>(null);
  const [duration, setDuration] = useState<string | null>(null);
  const [rooms, setRooms] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);

  if (!project || project.status === 'completed') return null;

  const seed = seedSnapshot(project);
  const open = unfolded || nearClose;
  const ready = allClosureComplete(items);
  const done = items.filter((i) => i.completed).length;

  // R51 — the quiet inline confirmation while the read models re-derive.
  if (closed) {
    return (
      <div className="mt-8 rounded-[3px] bg-[rgba(168,181,160,0.16)] px-4 py-3.5">
        <p className="text-[13px] text-[var(--color-charcoal)]">
          <b>The book is closed.</b>{' '}
          <span className="text-[var(--text-muted)]">
            The project settles into Care — its sections fold behind it.
          </span>
        </p>
      </div>
    );
  }

  // The folded quiet line — closure stays reachable without wearing a band.
  if (!open) {
    return (
      <div className="mt-8">
        <button
          type="button"
          onClick={() => setUnfolded(true)}
          className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)] hover:text-[var(--color-clay)]"
        >
          Close the book…
        </button>
      </div>
    );
  }

  const submit = () => {
    setError(null);
    closeProject.mutate(
      {
        projectId,
        closure: items,
        snapshot: {
          headline: headline.trim(),
          description: description.trim(),
          value_cents:
            valueDollars === null ? seed.value_cents : dollarsToCents(valueDollars),
          duration: (duration ?? seed.duration).trim(),
          rooms: rooms.trim(),
        },
      },
      {
        onSuccess: () => setClosed(true),
        onError: (err) =>
          setError(err instanceof Error ? err.message : 'Could not close the book. Try again.'),
      },
    );
  };

  return (
    <div className="mt-8 rounded-[3px] bg-[rgba(229,221,208,0.5)] px-4 py-3.5">
      {/* The band head — R68.1: mark · mono label · reading · the solid act. */}
      <div className="flex items-center gap-4">
        <StrataMark size="lg" label="Closing the book" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Care · closing the book
          </p>
          <p className="mt-0.5 text-[14px] leading-snug text-[var(--color-charcoal)]">
            {ready ? (
              <>
                <b>Everything is settled</b> — close the book when you&rsquo;re ready
              </>
            ) : (
              <>
                <b>{done} of {items.length} closed out</b> · the checklist settles this project
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          disabled={!ready || closeProject.isPending}
          onClick={submit}
          className="shrink-0 rounded-[4px] bg-[var(--color-clay)] px-4 py-2 text-[12px] font-medium text-[var(--color-charcoal)] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {closeProject.isPending ? 'Closing…' : 'Close the book →'}
        </button>
      </div>

      {/* The closure checklist — square ticks that fill sage (the Work
          block's stamp grammar, not a SaaS checkbox). */}
      <ul className="mt-3 border-t border-[rgba(139,115,85,0.14)] pt-2">
        {items.map((item) => (
          <li key={item.key} className="border-b border-dashed border-[rgba(139,115,85,0.14)]">
            <button
              type="button"
              onClick={() => setItems((prev) => toggleClosureItem(prev, item.key))}
              className="grid w-full grid-cols-[auto_1fr] items-baseline gap-2.5 px-1 py-1.5 text-left hover:bg-[rgba(196,165,123,0.06)]"
            >
              <span
                aria-hidden
                className="relative top-px inline-flex h-[13px] w-[13px] items-center justify-center rounded-[3px] border-[1.5px] text-[8px] font-bold leading-none"
                style={{
                  borderColor: item.completed ? 'var(--color-sage)' : 'var(--doc-ink-border)',
                  background: item.completed ? 'rgba(168,181,160,0.15)' : 'transparent',
                  color: 'var(--color-sage)',
                }}
              >
                {item.completed ? '✓' : ''}
              </span>
              <span
                className={`text-[12px] leading-snug ${
                  item.completed ? 'text-[var(--text-muted)]' : 'text-[var(--color-charcoal)]'
                }`}
              >
                {item.label}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* The portfolio snapshot — what this project becomes once it's a
          memory. Persisted by the same one act. */}
      <div className="mt-3">
        <p className="mb-2 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          The portfolio snapshot
        </p>
        <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={LABEL_CLS}>Headline</span>
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="e.g. A prairie home reimagined — full living space redesign"
              className={FIELD_CLS}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={LABEL_CLS}>For the portfolio card</span>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Two or three sentences — the challenge, the transformation, the result."
              className={`${FIELD_CLS} resize-y`}
            />
          </label>
          <label className="block">
            <span className={LABEL_CLS}>Project value</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11.5px] text-[var(--color-aged-oak)]">
                $
              </span>
              <input
                inputMode="decimal"
                value={valueDollars ?? centsToDollarString(seed.value_cents)}
                onChange={(e) => setValueDollars(e.target.value)}
                className={`${FIELD_CLS} pl-6`}
              />
            </div>
          </label>
          <label className="block">
            <span className={LABEL_CLS}>Duration</span>
            <input
              value={duration ?? seed.duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g. 5 months"
              className={FIELD_CLS}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={LABEL_CLS}>Rooms</span>
            <input
              value={rooms}
              onChange={(e) => setRooms(e.target.value)}
              placeholder="e.g. Living room, dining room, entry"
              className={FIELD_CLS}
            />
          </label>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[11.5px] text-[var(--color-terracotta)]">
          {error} <span className="opacity-80">The act is safe to retry.</span>
        </p>
      )}

      {!nearClose && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setUnfolded(false)}
            className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)] hover:text-[var(--color-clay)]"
          >
            Not yet — fold it away
          </button>
        </div>
      )}
    </div>
  );
}
