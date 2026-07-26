'use client';

/**
 * LibraryCard — a piece on a shelf, in the document's paper grammar (R32/R39):
 * ink border, flat stacked depth on hover, zero shadows (D4). Teaching happens
 * in place — a needs-teaching card opens inline Quick Tags (the ~5-minute act,
 * reusing useStyleArchetypes + useAssignStyle) or escalates to Deep Analysis (a
 * paper sheet over the Room). Movement between shelves rides the existing
 * promote / nominate flows. No invented scores: a card shows only what its row
 * truthfully carries.
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  useStyleArchetypes,
  useAssignStyle,
  useProductStyles,
  useSubmitValidation,
  type LayerProductLayer,
} from '@patina/supabase';
import { StrataSweep } from '@/components/ui/strata-sweep';
import { DocumentAction, DocumentActionRow } from '../../document-action';

export interface LibraryItem {
  id: string;
  name: string;
  brand: string | null;
  images: string[] | null;
  source_url: string | null;
  category: string | null;
  layer: LayerProductLayer;
}

interface StyleArchetype {
  id: string;
  name: string;
  color_hex: string | null;
}

const SOURCE_HINT: Record<string, string> = {
  chrome_extension: 'via the extension',
  mobile_photo: 'from a photo',
  url_paste: 'pasted',
};

export function LibraryCard({
  item,
  needsTeaching,
  needsValidation = false,
  onDeep,
  onPromote,
  onNominate,
}: {
  item: LibraryItem;
  needsTeaching: boolean;
  /** In the validation queue (status='needs_validation') — a read awaiting a
   *  second eye. Distinct from needsTeaching; when set, the fold leads with the
   *  validate lens (R88). */
  needsValidation?: boolean;
  onDeep: (productId: string, name: string) => void;
  onPromote?: (productId: string) => void;
  onNominate?: (productId: string) => void;
}) {
  // One fold, opened by the card's toggle. What it holds depends on the piece's
  // queue state: the validate lens (needs a look) or Quick Tags (needs teaching).
  const [open, setOpen] = useState(false);
  const foldable = needsTeaching || needsValidation;
  const img = item.images?.[0] ?? null;
  const sub =
    item.brand ||
    (item.source_url ? hostOf(item.source_url) : null) ||
    'unknown maker';

  return (
    <article className="group relative overflow-hidden rounded-[8px] border border-[var(--doc-ink-border)] bg-white transition-colors duration-200 hover:border-[var(--color-clay)]">
      <Link
        href={`/library/${item.id}`}
        aria-label={`Open ${item.name}`}
        className="relative flex h-[150px] items-center justify-center overflow-hidden bg-[var(--doc-sheet-2)]"
      >
        {img ? (
          <img
            src={img}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-aged-oak)] opacity-50">
            {item.category ?? 'piece'}
          </span>
        )}

        {needsValidation ? (
          <span className="absolute left-2 top-2 rounded-[3px] bg-[rgba(139,156,173,0.92)] px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.08em] text-white">
            Needs a look
          </span>
        ) : (
          needsTeaching && (
            <span className="absolute left-2 top-2 rounded-[3px] bg-[rgba(232,197,71,0.92)] px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.08em] text-[#5c4a1a]">
              Needs teaching
            </span>
          )
        )}
        {item.layer === 'catalog' && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-[3px] border border-[rgba(196,165,123,0.5)] bg-[rgba(252,250,246,0.92)] px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
            <span aria-hidden className="inline-flex flex-col gap-[1px]">
              <i className="block h-px w-2 bg-[var(--color-clay)]" />
              <i className="block h-px w-1.5 bg-[var(--color-clay)] opacity-60" />
              <i className="block h-px w-1 bg-[var(--color-clay)] opacity-30" />
            </span>
            Patina
          </span>
        )}
      </Link>

      <div className="px-3.5 py-3">
        <Link
          href={`/library/${item.id}`}
          className="block text-[0.82rem] font-medium leading-snug text-[var(--color-charcoal)] transition-colors hover:text-[var(--color-clay)]"
        >
          {item.name}
        </Link>
        <div className="mt-0.5 text-[0.66rem] text-[var(--color-aged-oak)]">
          {sub}
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)] opacity-60">
            {LAYER_FOOT[item.layer]}
          </span>
          <div className="flex items-center gap-1.5">
            {foldable && (
              <CardLink
                actionKey="open-piece-teaching"
                onClick={() => setOpen((v) => !v)}
              >
                {open ? 'Close' : needsValidation ? 'Validate →' : 'Teach →'}
              </CardLink>
            )}
            {onPromote && (
              <CardLink
                actionKey="promote-piece"
                subtle
                onClick={() => onPromote(item.id)}
              >
                Promote ↑
              </CardLink>
            )}
            {onNominate && (
              <CardLink
                actionKey="nominate-maker"
                subtle
                onClick={() => onNominate(item.id)}
              >
                Nominate ↗
              </CardLink>
            )}
          </div>
        </div>
      </div>

      {open && needsValidation && (
        <InlineValidate
          productId={item.id}
          onDeep={() => onDeep(item.id, item.name)}
        />
      )}

      {open && !needsValidation && needsTeaching && (
        <InlineQuickTags
          productId={item.id}
          onDeep={() => onDeep(item.id, item.name)}
          onSaved={() => setOpen(false)}
        />
      )}
    </article>
  );
}

const LAYER_FOOT: Record<LayerProductLayer, string> = {
  personal: 'My Library',
  studio: 'Studio',
  catalog: 'Patina Catalog',
};

function CardLink({
  children,
  onClick,
  subtle,
  actionKey,
}: {
  children: React.ReactNode;
  onClick: () => void;
  subtle?: boolean;
  actionKey: string;
}) {
  return (
    <DocumentAction
      actionKey={actionKey}
      surfaceKey="library"
      regionKey="library-card"
      variant="secondary"
      onClick={onClick}
      className={subtle ? 'text-[var(--color-aged-oak)]' : undefined}
    >
      {children}
    </DocumentAction>
  );
}

/** The inline ~5-minute Quick Tags act (R32). Doc grammar over the catalog's
 *  real teaching hooks — pick a primary character, save, or go deep. */
function InlineQuickTags({
  productId,
  onDeep,
  onSaved,
}: {
  productId: string;
  onDeep: () => void;
  onSaved: () => void;
}) {
  const { data: archetypes, isLoading } = useStyleArchetypes();
  const assignStyle = useAssignStyle();
  const [picked, setPicked] = useState<string | null>(null);
  const styles = (archetypes ?? []) as unknown as StyleArchetype[];

  const save = async () => {
    if (!picked) return;
    await assignStyle.mutateAsync({
      productId,
      styleId: picked,
      isPrimary: true,
      confidence: 1.0,
    });
    onSaved();
  };

  return (
    <div className="border-t border-[var(--color-pearl)] bg-[rgba(232,197,71,0.05)] px-3.5 py-3 motion-safe:animate-[doc-fade_200ms_ease-out]">
      <div className="mb-2 font-mono text-[8px] font-semibold uppercase tracking-[0.08em] text-[#b89a2e]">
        What is its character?
      </div>
      {isLoading ? (
        <StrataSweep size="sm" label="Loading styles" />
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {styles.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setPicked((p) => (p === s.id ? null : s.id))}
              className={`min-h-11 min-w-11 rounded-[14px] border px-2.5 py-1 text-[0.66rem] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] ${
                picked === s.id
                  ? 'border-[var(--color-clay)] bg-[var(--color-clay)] text-white'
                  : 'border-[var(--color-pearl)] bg-white text-[var(--text-body)] hover:border-[var(--color-clay)]'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <DocumentActionRow
        surfaceKey="library"
        regionKey="quick-teaching"
        className="mt-3"
        aria-label="Quick teaching actions"
      >
        <DocumentAction
          actionKey="save-piece-teaching"
          variant="primary"
          disabled={!picked || assignStyle.isPending}
          loading={assignStyle.isPending}
          loadingLabel="Saving…"
          onClick={() => void save()}
        >
          Save teaching
        </DocumentAction>
        <DocumentAction
          actionKey="open-deep-analysis"
          variant="secondary"
          onClick={onDeep}
          trailing="→"
        >
          Deep analysis
        </DocumentAction>
      </DocumentActionRow>
    </div>
  );
}

/** The in-card validate lens (R88) — the teaching queue's `needs_validation`
 *  rows, folded in beside Quick Tags / Deep Analysis. Shows the read on file and
 *  asks for a second eye: Agree confirms it, Disagree flags it for review. Votes
 *  go through the real useSubmitValidation path (errorSurface 'inline' → no
 *  toast, D2/R83). The card's "Needs a look" badge lifts on the queue refetch. */
function InlineValidate({
  productId,
  onDeep,
}: {
  productId: string;
  onDeep: () => void;
}) {
  const { data: styleRows, isLoading } = useProductStyles(productId);
  const submit = useSubmitValidation({ errorSurface: 'inline' });
  const [done, setDone] = useState<null | 'confirm' | 'flag'>(null);
  const [error, setError] = useState<string | null>(null);

  const read = (
    (styleRows ?? []) as Array<{
      is_primary?: boolean;
      style?: { name?: string | null } | null;
    }>
  )
    .map((r) => ({ name: r.style?.name ?? null, primary: !!r.is_primary }))
    .filter((r): r is { name: string; primary: boolean } => !!r.name)
    .sort((a, b) => Number(b.primary) - Number(a.primary));

  const vote = async (v: 'confirm' | 'flag') => {
    setError(null);
    try {
      await submit.mutateAsync({ productId, vote: v });
      setDone(v);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not record your judgment.',
      );
    }
  };

  return (
    <div className="border-t border-[var(--color-pearl)] bg-[rgba(139,156,173,0.06)] px-3.5 py-3 motion-safe:animate-[doc-fade_200ms_ease-out]">
      <div className="mb-2 font-mono text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--color-dusty-blue)]">
        Does this read look right?
      </div>

      {isLoading ? (
        <StrataSweep size="sm" label="Loading the read" />
      ) : read.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {read.map((r) => (
            <span
              key={r.name}
              className={`rounded-[14px] border px-2.5 py-1 text-[0.66rem] ${
                r.primary
                  ? 'border-[var(--color-dusty-blue)] text-[var(--color-charcoal)]'
                  : 'border-[var(--color-pearl)] text-[var(--text-body)]'
              }`}
            >
              {r.name}
              {r.primary ? ' · primary' : ''}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[0.7rem] italic text-[var(--color-aged-oak)]">
          No read on file — confirm it belongs on the shelf, or flag it for a
          closer look.
        </p>
      )}

      {done ? (
        <p className="mt-3 text-[0.7rem] italic text-[var(--color-aged-oak)]">
          {done === 'confirm'
            ? 'Recorded — thank you for weighing in.'
            : 'Flagged for another eye.'}
        </p>
      ) : (
        <DocumentActionRow
          surfaceKey="library"
          regionKey="piece-validation"
          className="mt-3"
          aria-label="Piece validation actions"
        >
          <DocumentAction
            actionKey="confirm-piece-read"
            variant="primary"
            loading={submit.isPending && submit.variables?.vote === 'confirm'}
            disabled={submit.isPending}
            loadingLabel="Recording…"
            onClick={() => void vote('confirm')}
          >
            Agree
          </DocumentAction>
          <DocumentAction
            actionKey="flag-piece-read"
            variant="secondary"
            disabled={submit.isPending}
            loading={submit.isPending && submit.variables?.vote === 'flag'}
            loadingLabel="Recording…"
            onClick={() => void vote('flag')}
          >
            Disagree
          </DocumentAction>
          <DocumentAction
            actionKey="open-deep-analysis"
            variant="tertiary"
            onClick={onDeep}
            trailing="→"
          >
            Deep analysis
          </DocumentAction>
        </DocumentActionRow>
      )}

      {error && (
        <p className="mt-2 text-[0.7rem] text-[var(--color-terracotta)]">
          {error}
        </p>
      )}
    </div>
  );
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export { SOURCE_HINT };
