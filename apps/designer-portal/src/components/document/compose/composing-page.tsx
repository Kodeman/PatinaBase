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
import {
  useComposePiece,
  type ComposeDraftInput,
} from '@/hooks/use-compose-piece';
import {
  composeFill,
  composePct,
  composeStateLabel,
  composeGaps,
  type ComposeSections,
} from '@/lib/document/compose-progress';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { useMobilePrimaryAction } from '../mobile/mobile-shell';

interface StyleArchetype {
  id: string;
  name: string;
}

const STATE_TONE: Record<string, { color: string; bg: string }> = {
  Capture: { color: 'var(--color-aged-oak)', bg: 'transparent' },
  Draft: { color: '#b89a2e', bg: 'transparent' },
  'Catalog-ready': { color: 'var(--color-sage)', bg: 'rgba(168,181,160,0.12)' },
};

type ComposeFacetId = keyof ComposeSections;

const COMPOSE_FACET_ORDER: ComposeFacetId[] = [
  'identity',
  'piece',
  'commerce',
  'folio',
  'eye',
];

function firstIncompleteComposeFacet(
  sections: ComposeSections,
): ComposeFacetId {
  return COMPOSE_FACET_ORDER.find((id) => !sections[id]) ?? 'identity';
}

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

  const [savedId, setSavedId] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);

  const sections = useMemo<ComposeSections>(
    () => ({
      identity: !!(name.trim() && maker.trim()),
      piece: !!(
        width.trim() &&
        depth.trim() &&
        height.trim() &&
        materials.trim()
      ),
      commerce: !!(trade.trim() && retail.trim() && lead.trim()),
      folio: images.length >= 1,
      eye: styleSel.size >= 1,
    }),
    [
      name,
      maker,
      width,
      depth,
      height,
      materials,
      trade,
      retail,
      lead,
      images,
      styleSel,
    ],
  );

  // Exactly one section stays in hand. The first incomplete section is the
  // initial landing, but choosing another never implies an order or a gate.
  const [activeFacet, setActiveFacet] = useState<ComposeFacetId>(() =>
    firstIncompleteComposeFacet(sections),
  );

  const fill = composeFill(sections);
  const pct = composePct(fill);
  const state = composeStateLabel(pct);
  const gaps = composeGaps(sections);

  const guide =
    pct === 0
      ? 'Start anywhere. Each section belongs to the same usable draft.'
      : pct >= 100
        ? 'Catalog-ready. Every section is written.'
        : `Still open: ${gaps.slice(0, 3).join(', ')}${gaps.length > 3 ? '…' : ''}. Choose any section.`;

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
        width || depth || height
          ? { width: width.trim(), depth: depth.trim(), height: height.trim() }
          : null,
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

  useMobilePrimaryAction({
    actionKey: 'save-piece-draft',
    surfaceKey: 'compose',
    regionKey: 'room-head',
    label: 'Save draft',
    target: { kind: 'press', onPress: () => void doSave() },
    loading: save.isPending,
  });

  const tone = STATE_TONE[state];

  return (
    <RoomShell
      title="Compose a piece"
      backTo="/library"
      backLabel="the Library"
      action={
        <DocumentActionGroup
          surfaceKey="compose"
          regionKey="room-head"
          aria-label="Compose actions"
        >
          <DocumentAction
            actionKey="save-piece-draft"
            variant="primary"
            loading={save.isPending}
            loadingLabel="Saving…"
            onClick={() => void doSave()}
          >
            {savedId ? 'Save draft ✓' : 'Save draft'}
          </DocumentAction>
        </DocumentActionGroup>
      }
    >
      <div className="mx-auto max-w-[760px] px-6 sm:px-8">
        {/* ── The product taking shape — live preview + the Strata Mark ── */}
        <section className="sticky top-[57px] z-[5] border-b border-[var(--doc-ink-border)] bg-[var(--doc-paper)] pb-4 pt-6">
          <div className="flex items-center gap-5">
            <span className="flex h-[84px] w-[84px] shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-[var(--doc-sheet-2)]">
              {images[0] ? (
                <img
                  src={images[0]}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="doc-type-meta uppercase tracking-[0.08em] opacity-70">
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
              <p className="doc-type-body mt-0.5 min-h-[1.1em] text-[var(--color-quiet-ink)]">
                {maker.trim() ||
                  (sections.piece
                    ? `${width} × ${depth} × ${height}`
                    : 'Fill any section below. The piece composes itself as you go.')}
              </p>
              <div className="mt-2 flex items-center gap-3">
                <StrataMark size="lg" fill={fill} />
                <span className="doc-type-meta tracking-[0.04em]">
                  <b className="font-heading text-[0.95rem] text-[var(--color-charcoal)]">
                    {pct}
                  </b>
                  % composed
                </span>
                <span
                  className="doc-type-meta rounded-[3px] border px-2 py-0.5 uppercase tracking-[0.1em]"
                  style={{
                    color: tone.color,
                    borderColor: tone.color,
                    background: tone.bg,
                  }}
                >
                  {state}
                </span>
              </div>
            </div>
          </div>
          <p className="doc-type-body mt-3 border-l-2 border-[var(--color-clay)] pl-3 text-[var(--color-quiet-ink)]">
            {guide}
          </p>
        </section>

        {/* ── Movement 1 · the record ── */}
        <Movement
          name="The record"
          meta="Line 1 · what it is"
          hue="var(--color-mocha)"
        >
          <ComposeSection
            name="Identity"
            status={
              sections.identity
                ? 'identity set'
                : name.trim()
                  ? 'needs a maker'
                  : 'not yet written'
            }
            done={sections.identity}
            open={activeFacet === 'identity'}
            onToggle={() => setActiveFacet('identity')}
          >
            <ComposeField
              label="Name"
              value={name}
              onChange={setName}
              placeholder="e.g. Heirloom Oak Dining Table"
            />
            <div className="flex gap-3">
              <div className="flex-1">
                <ComposeField
                  label="Maker"
                  value={maker}
                  onChange={setMaker}
                  placeholder="Nordic Atelier"
                />
              </div>
              <div className="flex-1">
                <ComposeField
                  label="Source URL"
                  value={sourceUrl}
                  onChange={setSourceUrl}
                  placeholder="paste, or from a capture"
                />
              </div>
            </div>
            <p className="doc-type-body mt-3 border-t border-[var(--doc-ink-border)] pt-2.5 italic text-[var(--color-quiet-ink)]">
              Often this arrives pre-filled — a{' '}
              <b className="not-italic font-semibold text-[var(--color-charcoal)]">
                capture
              </b>{' '}
              from the extension lands here already named.
            </p>
          </ComposeSection>

          <ComposeSection
            name="The piece"
            status={
              sections.piece
                ? `${width}×${depth}×${height}`
                : width || depth || height || materials
                  ? 'partly written'
                  : 'not yet written'
            }
            done={sections.piece}
            open={activeFacet === 'piece'}
            onToggle={() => setActiveFacet('piece')}
          >
            <div className="flex gap-3">
              <div className="flex-1">
                <ComposeField
                  label="Width"
                  value={width}
                  onChange={setWidth}
                  placeholder={'72"'}
                />
              </div>
              <div className="flex-1">
                <ComposeField
                  label="Depth"
                  value={depth}
                  onChange={setDepth}
                  placeholder={'38"'}
                />
              </div>
              <div className="flex-1">
                <ComposeField
                  label="Height"
                  value={height}
                  onChange={setHeight}
                  placeholder={'30"'}
                />
              </div>
            </div>
            <ComposeField
              label="Materials"
              value={materials}
              onChange={setMaterials}
              placeholder="solid white oak, hand-rubbed oil"
            />
          </ComposeSection>
        </Movement>

        {/* ── Movement 2 · the catalog ── */}
        <Movement
          name="The catalog"
          meta="Line 2 · into the marketplace"
          hue="var(--color-clay)"
        >
          <ComposeSection
            name="Commerce"
            status={
              sections.commerce
                ? `$${trade} trade`
                : trade || retail || lead
                  ? 'partly written'
                  : 'not yet written'
            }
            done={sections.commerce}
            open={activeFacet === 'commerce'}
            onToggle={() => setActiveFacet('commerce')}
          >
            <div className="flex gap-3">
              <div className="flex-1">
                <ComposeField
                  label="Trade price ($)"
                  value={trade}
                  onChange={setTrade}
                  placeholder="3360"
                />
              </div>
              <div className="flex-1">
                <ComposeField
                  label="Retail ($)"
                  value={retail}
                  onChange={setRetail}
                  placeholder="4200"
                />
              </div>
            </div>
            <ComposeField
              label="Lead time (weeks)"
              value={lead}
              onChange={setLead}
              placeholder="11"
            />
            <p className="doc-type-body mt-3 border-t border-[var(--doc-ink-border)] pt-2.5 italic text-[var(--color-quiet-ink)]">
              On the maker&apos;s side,{' '}
              <b className="not-italic font-semibold text-[var(--color-charcoal)]">
                this section is theirs
              </b>{' '}
              — the manufacturer fills price and lead time in their portal; the
              designer adds the eye. One page, two authors.
            </p>
          </ComposeSection>

          <ComposeSection
            name="The folio"
            status={
              images.length
                ? `${images.length} image${images.length > 1 ? 's' : ''}`
                : 'no images yet'
            }
            done={sections.folio}
            open={activeFacet === 'folio'}
            onToggle={() => setActiveFacet('folio')}
          >
            <div className="mt-2 flex flex-wrap gap-2">
              {images.map((src, i) => (
                <span
                  key={`${src}-${i}`}
                  className="relative h-[72px] w-[72px] overflow-hidden rounded-[6px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)]"
                >
                  <img
                    src={src}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() =>
                      setImages((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="da-glyph-btn absolute right-0 top-0 inline-flex min-h-11 min-w-11 items-center justify-center px-1 font-mono text-[9px]"
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
                onKeyDown={(e) =>
                  e.key === 'Enter' && (e.preventDefault(), addImage())
                }
                placeholder="paste an image URL (or a cut sheet)"
                className="doc-type-control min-h-11 flex-1 rounded-[6px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-3 py-2 focus:border-[var(--color-clay)] focus:bg-white focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
              />
              <DocumentAction
                actionKey="add-folio-image-url"
                surfaceKey="compose"
                regionKey="folio"
                variant="secondary"
                onClick={addImage}
                disabled={!imageDraft.trim()}
              >
                + add
              </DocumentAction>
            </div>
            <p className="doc-type-body mt-2 italic text-[var(--color-quiet-ink)]">
              Images and cut sheets clip here — the same folio that lives on a
              document section.
            </p>
          </ComposeSection>
        </Movement>

        {/* ── Movement 3 · the eye (the teaching) ── */}
        <Movement
          name="The eye"
          meta="Line 3 · the teaching"
          hue="var(--color-dusty-blue)"
        >
          <ComposeSection
            name="Style & character"
            status={
              sections.eye
                ? `taught · ${styleSel.size} trait${styleSel.size > 1 ? 's' : ''}`
                : styleSel.size
                  ? 'teaching…'
                  : 'untaught'
            }
            done={sections.eye}
            open={activeFacet === 'eye'}
            onToggle={() => setActiveFacet('eye')}
          >
            <span className="doc-type-meta mb-1.5 mt-3 block font-semibold uppercase tracking-[0.08em]">
              Character
            </span>
            <div className="flex flex-wrap gap-1.5">
              {styles.length === 0 && (
                <span className="doc-type-body italic text-[var(--color-quiet-ink)]">
                  Loading the style vocabulary…
                </span>
              )}
              {styles.map((s) => {
                const on = styleSel.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStyle(s.id)}
                    className={`doc-type-control min-h-11 min-w-11 px-2.5 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)] ${
                      on
                        ? 'text-[var(--color-charcoal)]'
                        : 'text-[var(--color-aged-oak)]'
                    }`}
                  >
                    {/* taught = the word ruled under, never a filled pill (I107) */}
                    <span
                      className={`da-score-hover${on ? ' da-score-on' : ''}`}
                    >
                      {s.name}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="doc-type-body mt-3 border-t border-[var(--doc-ink-border)] pt-2.5 italic text-[var(--color-quiet-ink)]">
              <b className="not-italic font-semibold text-[var(--color-charcoal)]">
                This is the teaching.
              </b>{' '}
              The same act you do inline on a card with Quick Tags — here, one
              section of the larger composition. Add it now, or leave the piece
              at draft and teach it later from the shelf.
            </p>
          </ComposeSection>
        </Movement>

        <p className="doc-type-body mx-auto mt-8 max-w-[620px] border-t border-[var(--doc-ink-border)] py-5 text-center italic text-[var(--color-quiet-ink)]">
          Work in any order. Every save is a usable draft; there are no steps to
          unlock.
        </p>
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="doc-type-body fixed bottom-[72px] left-1/2 z-[65] -translate-x-1/2 rounded-[8px] border border-[rgba(196,165,123,0.3)] bg-[var(--color-charcoal)] px-4 py-2.5 text-[var(--color-off-white)] motion-safe:animate-[doc-fade_200ms_ease-out]"
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
        <span
          aria-hidden
          className="h-[4px] w-[34px] shrink-0 self-center rounded-[2px]"
          style={{ background: hue }}
        />
        <h2 className="font-heading text-[1.2rem] font-medium italic text-[var(--color-charcoal)]">
          {name}
        </h2>
        <span className="doc-type-meta ml-auto uppercase tracking-[0.06em]">
          {meta}
        </span>
      </div>
      <div className="mb-4 h-px bg-[var(--doc-ink-border)]" />
      {children}
    </section>
  );
}
