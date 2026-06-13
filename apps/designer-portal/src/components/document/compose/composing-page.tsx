'use client';

/**
 * The Composing Page (R40) — the anti-wizard. A detailed process rendered as a
 * paper artifact that BUILDS ITSELF: sections fill in any order, the page shows
 * its own gaps, and it is a real, usable draft at every percent — saveable at
 * any point. The Strata Mark (R35) is the ONLY progress indicator there is; the
 * three movements map to the three lines, and the state reads Capture → Draft →
 * Catalog-ready off the same fill. No Next, no Back, no Step N of M.
 *
 * First instance — "Compose a piece" (a catalog product), reached from the
 * Library: the record (identity + the piece) · the catalog (commerce + the
 * folio) · the eye (the teaching — the same Quick-Tags act, here one section of
 * the larger composition). Two-sided authorship: the maker fills price & lead
 * time in their portal; the designer adds the eye. Nothing is required to save.
 *
 * A Room — full-bleed paper, zero shadows (D4); reuses RoomShell's physics.
 */

import { useMemo, useState } from 'react';
import { useStyleArchetypes } from '@patina/supabase';
import { RoomShell } from '../rooms/room-shell';
import { StrataMark } from '../strata-mark';
import { ComposeSection, ComposeField } from './compose-section';
import { useComposePiece, type ComposeDraftInput } from '@/hooks/use-compose-piece';
import {
  composeFill,
  composePct,
  composeStateLabel,
  composeGaps,
  type ComposeSections,
} from '@/lib/document/compose-progress';

interface StyleArchetype {
  id: string;
  name: string;
}

const STATE_TONE: Record<string, { color: string; bg: string }> = {
  Capture: { color: 'var(--color-aged-oak)', bg: 'transparent' },
  Draft: { color: '#b89a2e', bg: 'transparent' },
  'Catalog-ready': { color: 'var(--color-sage)', bg: 'rgba(168,181,160,0.12)' },
};

export function ComposingPage() {
  const { data: archetypes } = useStyleArchetypes();
  const styles = (archetypes ?? []) as unknown as StyleArchetype[];
  const save = useComposePiece();

  // The piece's fields — all optional, fillable in any order.
  const [name, setName] = useState('');
  const [maker, setMaker] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [width, setWidth] = useState('');
  const [depth, setDepth] = useState('');
  const [height, setHeight] = useState('');
  const [materials, setMaterials] = useState('');
  const [trade, setTrade] = useState('');
  const [retail, setRetail] = useState('');
  const [lead, setLead] = useState('');
  const [imageDraft, setImageDraft] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [styleSel, setStyleSel] = useState<Set<string>>(new Set());

  const [open, setOpen] = useState<Set<string>>(new Set(['identity']));
  const [savedId, setSavedId] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);

  const sections = useMemo<ComposeSections>(
    () => ({
      identity: !!(name.trim() && maker.trim()),
      piece: !!(width.trim() && depth.trim() && height.trim() && materials.trim()),
      commerce: !!(trade.trim() && retail.trim() && lead.trim()),
      folio: images.length >= 1,
      eye: styleSel.size >= 1,
    }),
    [name, maker, width, depth, height, materials, trade, retail, lead, images, styleSel],
  );

  const fill = composeFill(sections);
  const pct = composePct(fill);
  const state = composeStateLabel(pct);
  const gaps = composeGaps(sections);

  const guide =
    pct === 0
      ? 'The librarian is here if you want it (⌘K). Start anywhere — identity, the price, or just teach its style. Nothing is required to save.'
      : pct >= 100
        ? 'Fully composed. This piece is catalog-ready and taught — it joins the shelf at full strength.'
        : `Coming together. Still open: ${gaps.slice(0, 3).join(', ')}${gaps.length > 3 ? '…' : ''}. Fill them in any order.`;

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleStyle = (id: string) =>
    setStyleSel((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const addImage = () => {
    const url = imageDraft.trim();
    if (!url) return;
    setImages((prev) => [...prev, url]);
    setImageDraft('');
  };

  const num = (s: string) => {
    const n = parseFloat(s.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  const doSave = async () => {
    const input: ComposeDraftInput = {
      id: savedId,
      name,
      maker,
      sourceUrl,
      images,
      materials: materials
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
      dimensions:
        width || depth || height ? { width: width.trim(), depth: depth.trim(), height: height.trim() } : null,
      priceRetailDollars: num(retail),
      priceTradeDollars: num(trade),
      leadTimeWeeks: num(lead),
      styleIds: [...styleSel],
    };
    try {
      const { id } = await save.mutateAsync(input);
      setSavedId(id);
      setToast(
        pct >= 100
          ? 'Saved — catalog-ready and taught. It joins the shelf at full strength.'
          : `Saved as a draft at ${pct}%. It lives on your My Library shelf; deepen it anytime.`,
      );
      window.setTimeout(() => setToast(null), 3600);
    } catch {
      setToast('Could not save the draft just now — try again.');
      window.setTimeout(() => setToast(null), 3600);
    }
  };

  const tone = STATE_TONE[state];

  return (
    <RoomShell
      title="Compose a piece"
      backTo="/library"
      backLabel="the Library"
      action={
        <button
          type="button"
          onClick={() => void doSave()}
          disabled={save.isPending}
          className="rounded-[5px] border border-[var(--color-pearl)] bg-white px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)] transition-colors hover:border-[var(--color-clay)] disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : savedId ? 'Save draft ✓' : 'Save draft'}
        </button>
      }
    >
      <div className="mx-auto max-w-[760px] px-6 sm:px-8">
        {/* ── The product taking shape — live preview + the Strata Mark ── */}
        <section className="sticky top-[57px] z-[5] border-b border-[var(--doc-ink-border)] bg-[var(--doc-paper)] pb-4 pt-6">
          <div className="flex items-center gap-5">
            <span className="flex h-[84px] w-[84px] shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-[var(--doc-sheet-2)]">
              {images[0] ? (
                <img src={images[0]} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="font-mono text-[0.46rem] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] opacity-60">
                  no image
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`font-heading text-[1.5rem] leading-tight ${
                  name.trim()
                    ? 'text-[var(--color-charcoal)]'
                    : 'text-[1.2rem] italic text-[var(--color-aged-oak)]'
                }`}
              >
                {name.trim() || 'A piece, taking shape…'}
              </p>
              <p className="mt-0.5 min-h-[1.1em] text-[0.72rem] text-[var(--color-aged-oak)]">
                {maker.trim() ||
                  (sections.piece
                    ? `${width} × ${depth} × ${height}`
                    : 'Fill any section below. The piece composes itself as you go.')}
              </p>
              <div className="mt-2 flex items-center gap-3">
                <StrataMark size="lg" fill={fill} />
                <span className="font-mono text-[0.6rem] tracking-[0.04em] text-[var(--color-aged-oak)]">
                  <b className="font-heading text-[0.95rem] text-[var(--color-charcoal)]">{pct}</b>% composed
                </span>
                <span
                  className="rounded-[3px] border px-2 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.1em]"
                  style={{ color: tone.color, borderColor: tone.color, background: tone.bg }}
                >
                  {state}
                </span>
              </div>
            </div>
          </div>
          {/* The librarian offers, never blocks (R40). */}
          <p className="mt-3 rounded-[7px] border border-[rgba(196,165,123,0.25)] bg-[rgba(196,165,123,0.06)] px-3 py-2 text-[0.72rem] text-[var(--color-mocha)]">
            {guide}
          </p>
        </section>

        {/* ── Movement 1 · the record ── */}
        <Movement name="The record" meta="Line 1 · what it is" hue="var(--color-mocha)">
          <ComposeSection
            name="Identity"
            status={sections.identity ? 'identity set' : name.trim() ? 'needs a maker' : 'not yet written'}
            done={sections.identity}
            open={open.has('identity')}
            onToggle={() => toggle('identity')}
          >
            <ComposeField label="Name" value={name} onChange={setName} placeholder="e.g. Heirloom Oak Dining Table" />
            <div className="flex gap-3">
              <div className="flex-1">
                <ComposeField label="Maker" value={maker} onChange={setMaker} placeholder="Nordic Atelier" />
              </div>
              <div className="flex-1">
                <ComposeField label="Source URL" value={sourceUrl} onChange={setSourceUrl} placeholder="paste, or from a capture" />
              </div>
            </div>
            <p className="mt-3 border-t border-[var(--doc-ink-border)] pt-2.5 text-[0.7rem] italic text-[var(--color-aged-oak)]">
              Often this arrives pre-filled — a <b className="not-italic font-semibold text-[var(--color-mocha)]">capture</b> from the extension lands here already named.
            </p>
          </ComposeSection>

          <ComposeSection
            name="The piece"
            status={sections.piece ? `${width}×${depth}×${height}` : width || depth || height || materials ? 'partly written' : 'not yet written'}
            done={sections.piece}
            open={open.has('piece')}
            onToggle={() => toggle('piece')}
          >
            <div className="flex gap-3">
              <div className="flex-1"><ComposeField label="Width" value={width} onChange={setWidth} placeholder={'72"'} /></div>
              <div className="flex-1"><ComposeField label="Depth" value={depth} onChange={setDepth} placeholder={'38"'} /></div>
              <div className="flex-1"><ComposeField label="Height" value={height} onChange={setHeight} placeholder={'30"'} /></div>
            </div>
            <ComposeField label="Materials" value={materials} onChange={setMaterials} placeholder="solid white oak, hand-rubbed oil" />
          </ComposeSection>
        </Movement>

        {/* ── Movement 2 · the catalog ── */}
        <Movement name="The catalog" meta="Line 2 · into the marketplace" hue="var(--color-clay)">
          <ComposeSection
            name="Commerce"
            status={sections.commerce ? `$${trade} trade` : trade || retail || lead ? 'partly written' : 'not yet written'}
            done={sections.commerce}
            open={open.has('commerce')}
            onToggle={() => toggle('commerce')}
          >
            <div className="flex gap-3">
              <div className="flex-1"><ComposeField label="Trade price ($)" value={trade} onChange={setTrade} placeholder="3360" /></div>
              <div className="flex-1"><ComposeField label="Retail ($)" value={retail} onChange={setRetail} placeholder="4200" /></div>
            </div>
            <ComposeField label="Lead time (weeks)" value={lead} onChange={setLead} placeholder="11" />
            <p className="mt-3 border-t border-[var(--doc-ink-border)] pt-2.5 text-[0.7rem] italic text-[var(--color-aged-oak)]">
              On the maker&apos;s side, <b className="not-italic font-semibold text-[var(--color-mocha)]">this section is theirs</b> — the manufacturer fills price and lead time in their portal; the designer adds the eye. One page, two authors.
            </p>
          </ComposeSection>

          <ComposeSection
            name="The folio"
            status={images.length ? `${images.length} image${images.length > 1 ? 's' : ''}` : 'no images yet'}
            done={sections.folio}
            open={open.has('folio')}
            onToggle={() => toggle('folio')}
          >
            <div className="mt-2 flex flex-wrap gap-2">
              {images.map((src, i) => (
                <span key={`${src}-${i}`} className="relative h-[72px] w-[72px] overflow-hidden rounded-[6px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)]">
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute right-0 top-0 bg-[rgba(44,41,38,0.6)] px-1 font-mono text-[9px] text-white"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={imageDraft}
                onChange={(e) => setImageDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addImage())}
                placeholder="paste an image URL (or a cut sheet)"
                className="flex-1 rounded-[6px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-3 py-2 text-[0.8rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:bg-white focus:outline-none"
              />
              <button
                type="button"
                onClick={addImage}
                className="rounded-[6px] border border-[var(--color-clay)] px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--color-clay)] hover:bg-[var(--color-clay)] hover:text-white"
              >
                + add
              </button>
            </div>
            <p className="mt-2 text-[0.66rem] italic text-[var(--color-aged-oak)]">
              Images and cut sheets clip here — the same folio that lives on a document section.
            </p>
          </ComposeSection>
        </Movement>

        {/* ── Movement 3 · the eye (the teaching) ── */}
        <Movement name="The eye" meta="Line 3 · the teaching" hue="var(--color-dusty-blue)">
          <ComposeSection
            name="Style & character"
            status={sections.eye ? `taught · ${styleSel.size} trait${styleSel.size > 1 ? 's' : ''}` : styleSel.size ? 'teaching…' : 'untaught'}
            done={sections.eye}
            open={open.has('eye')}
            onToggle={() => toggle('eye')}
          >
            <span className="mb-1.5 mt-3 block font-mono text-[0.5rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
              Character
            </span>
            <div className="flex flex-wrap gap-1.5">
              {styles.length === 0 && (
                <span className="text-[0.72rem] italic text-[var(--color-aged-oak)]">Loading the style vocabulary…</span>
              )}
              {styles.map((s) => {
                const on = styleSel.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStyle(s.id)}
                    className={`rounded-[16px] border px-2.5 py-1 text-[0.68rem] transition-colors ${
                      on
                        ? 'border-[var(--color-clay)] bg-[var(--color-clay)] text-white'
                        : 'border-[var(--color-pearl)] bg-[var(--doc-paper)] text-[var(--color-mocha)] hover:border-[var(--color-clay)]'
                    }`}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 border-t border-[var(--doc-ink-border)] pt-2.5 text-[0.7rem] italic text-[var(--color-aged-oak)]">
              <b className="not-italic font-semibold text-[var(--color-mocha)]">This is the teaching.</b> The same act you do inline on a card with Quick Tags — here, one section of the larger composition. Add it now, or leave the piece at draft and teach it later from the shelf.
            </p>
          </ComposeSection>
        </Movement>

        <p className="mx-auto mt-8 max-w-[620px] border-t border-[var(--doc-ink-border)] py-5 text-center text-[0.72rem] italic text-[var(--color-aged-oak)]">
          No Next. No Back. No Step 3 of 7. The page fills in any order, shows its own gaps, and is a real,
          usable draft at every percent. The Strata Mark is the only progress indicator there is.
        </p>
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-[72px] left-1/2 z-[65] -translate-x-1/2 rounded-[8px] border border-[rgba(196,165,123,0.3)] bg-[var(--color-charcoal)] px-4 py-2.5 text-[0.74rem] text-[var(--color-off-white)] motion-safe:animate-[doc-fade_200ms_ease-out]"
        >
          {toast}
        </div>
      )}
    </RoomShell>
  );
}

function Movement({
  name,
  meta,
  hue,
  children,
}: {
  name: string;
  meta: string;
  hue: string;
  children: React.ReactNode;
}) {
  return (
    <section className="pb-1 pt-8">
      <div className="mb-1 flex items-baseline gap-3">
        <span aria-hidden className="h-[4px] w-[34px] shrink-0 self-center rounded-[2px]" style={{ background: hue }} />
        <h2 className="font-heading text-[1.2rem] font-medium italic text-[var(--color-charcoal)]">{name}</h2>
        <span className="ml-auto font-mono text-[0.5rem] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">{meta}</span>
      </div>
      <div className="mb-4 h-px bg-[var(--doc-ink-border)]" />
      {children}
    </section>
  );
}
