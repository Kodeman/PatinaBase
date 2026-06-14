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
import { useStyleArchetypes, useAssignStyle, type LayerProductLayer } from '@patina/supabase';
import { StrataSweep } from '@/components/ui/strata-sweep';

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
  onDeep,
  onPromote,
  onNominate,
}: {
  item: LibraryItem;
  needsTeaching: boolean;
  onDeep: (productId: string, name: string) => void;
  onPromote?: (productId: string) => void;
  onNominate?: (productId: string) => void;
}) {
  const [teaching, setTeaching] = useState(false);
  const img = item.images?.[0] ?? null;
  const sub =
    item.brand ||
    (item.source_url ? hostOf(item.source_url) : null) ||
    'unknown maker';

  return (
    <article className="group relative overflow-hidden rounded-[8px] border border-[var(--doc-ink-border)] bg-white transition-colors duration-200 hover:border-[var(--color-clay)]">
      <div className="relative flex h-[150px] items-center justify-center overflow-hidden bg-[var(--doc-sheet-2)]">
        {img ? (
          <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-aged-oak)] opacity-50">
            {item.category ?? 'piece'}
          </span>
        )}

        {needsTeaching && (
          <span className="absolute left-2 top-2 rounded-[3px] bg-[rgba(232,197,71,0.92)] px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.08em] text-[#5c4a1a]">
            Needs teaching
          </span>
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
      </div>

      <div className="px-3.5 py-3">
        <div className="text-[0.82rem] font-medium leading-snug text-[var(--color-charcoal)]">
          {item.name}
        </div>
        <div className="mt-0.5 text-[0.66rem] text-[var(--color-aged-oak)]">{sub}</div>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)] opacity-60">
            {LAYER_FOOT[item.layer]}
          </span>
          <div className="flex items-center gap-1.5">
            {needsTeaching && (
              <CardLink onClick={() => setTeaching((v) => !v)}>
                {teaching ? 'Close' : 'Teach →'}
              </CardLink>
            )}
            {onPromote && (
              <CardLink subtle onClick={() => onPromote(item.id)}>
                Promote ↑
              </CardLink>
            )}
            {onNominate && (
              <CardLink subtle onClick={() => onNominate(item.id)}>
                Nominate ↗
              </CardLink>
            )}
          </div>
        </div>
      </div>

      {teaching && (
        <InlineQuickTags
          productId={item.id}
          onDeep={() => onDeep(item.id, item.name)}
          onSaved={() => setTeaching(false)}
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
}: {
  children: React.ReactNode;
  onClick: () => void;
  subtle?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[4px] border px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] transition-colors ${
        subtle
          ? 'border-[var(--color-pearl)] text-[var(--color-aged-oak)] hover:border-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]'
          : 'border-[rgba(196,165,123,0.4)] text-[var(--color-clay)] hover:bg-[var(--color-clay)] hover:text-white'
      }`}
    >
      {children}
    </button>
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
    await assignStyle.mutateAsync({ productId, styleId: picked, isPrimary: true, confidence: 1.0 });
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
              className={`rounded-[14px] border px-2.5 py-1 text-[0.66rem] transition-colors ${
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
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={!picked || assignStyle.isPending}
          onClick={() => void save()}
          className="rounded-[4px] bg-[var(--color-charcoal)] px-2.5 py-1.5 font-mono text-[8px] font-semibold uppercase tracking-[0.06em] text-white disabled:opacity-40"
        >
          {assignStyle.isPending ? 'Saving…' : 'Save teaching'}
        </button>
        <button
          type="button"
          onClick={onDeep}
          className="font-mono text-[8px] font-semibold uppercase tracking-[0.06em] text-[var(--color-aged-oak)] hover:text-[var(--color-clay)]"
        >
          Deep analysis →
        </button>
      </div>
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
