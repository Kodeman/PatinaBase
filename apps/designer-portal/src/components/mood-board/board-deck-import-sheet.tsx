'use client';

/**
 * Bring in a Deck (US-15 W2) — the deck sheet. Reads the deck in the browser
 * (nothing is uploaded until "Lay it out"), shows its name, slide count, a
 * filmstrip composited from the cropped pictures at their slide geometry, and
 * the skipped ledger line. The target is this board; the one action is
 * "Lay it out", and the sheet closes at once.
 */

import { useEffect, useMemo, useState } from 'react';
import { Presentation } from 'lucide-react';
import { DocSheet } from '@/components/document/overlays/doc-sheet';
import { Button } from '@/components/ui/controls';
import {
  DECK_COPY,
  deckImportMessage,
  deckLedgerLine,
  findExistingDeckImport,
  prepareDeck,
  type PreparedDeck,
} from '@/hooks/use-board-deck-import-layout';

const PIN_ROLES = new Set(['product', 'reference']);
const FILMSTRIP_MAX = 24;

function SlideFrame({
  deck,
  slideIndex,
  urls,
}: {
  deck: PreparedDeck;
  slideIndex: number;
  urls: Map<string, string>;
}) {
  const { cx, cy } = deck.manifest.slide_size;
  const elements = deck.manifest.elements
    .filter((element) => element.slide_index === slideIndex && urls.has(element.element_key))
    .sort((a, b) => a.z - b.z);
  return (
    <div
      className="relative w-32 shrink-0 overflow-hidden rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)]"
      style={{ aspectRatio: `${cx || 16} / ${cy || 9}` }}
    >
      {elements.map((element) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={element.element_key}
          src={urls.get(element.element_key)}
          alt=""
          draggable={false}
          className="absolute object-fill"
          style={{
            left: `${(element.bbox.x / (cx || 1)) * 100}%`,
            top: `${(element.bbox.y / (cy || 1)) * 100}%`,
            width: `${(element.bbox.w / (cx || 1)) * 100}%`,
            height: `${(element.bbox.h / (cy || 1)) * 100}%`,
            transform: element.rot ? `rotate(${element.rot}deg)` : undefined,
          }}
        />
      ))}
    </div>
  );
}

export function BoardDeckImportSheet({
  file,
  boardId,
  onClose,
  onLayOut,
}: {
  /** The deck to read; the sheet is open while this is set. */
  file: File | null;
  boardId: string;
  onClose: () => void;
  onLayOut: (deck: PreparedDeck, pastedLinks: string) => void;
}) {
  const [deck, setDeck] = useState<PreparedDeck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resumable, setResumable] = useState(false);
  const [pastedLinks, setPastedLinks] = useState('');

  useEffect(() => {
    setDeck(null);
    setError(null);
    setResumable(false);
    setPastedLinks('');
    if (!file) return;
    let live = true;
    void prepareDeck(file)
      .then(async (prepared) => {
        if (!live) return;
        setDeck(prepared);
        const existing = await findExistingDeckImport(boardId, prepared.manifest.deck_sha256);
        if (live) setResumable(existing);
      })
      .catch((cause) => {
        if (live) setError(deckImportMessage(cause));
      });
    return () => {
      live = false;
    };
  }, [boardId, file]);

  const urls = useMemo(() => {
    const map = new Map<string, string>();
    if (!deck || typeof URL.createObjectURL !== 'function') return map;
    for (const [key, crop] of deck.crops) map.set(key, URL.createObjectURL(crop.blob));
    return map;
  }, [deck]);
  useEffect(() => () => {
    for (const url of urls.values()) URL.revokeObjectURL(url);
  }, [urls]);

  const slidesWithPictures = useMemo(() => {
    if (!deck) return [] as number[];
    const indexes = new Set(
      deck.manifest.elements
        .filter((element) => PIN_ROLES.has(element.role) && deck.crops.has(element.element_key))
        .map((element) => element.slide_index),
    );
    return deck.manifest.slides.map((slide) => slide.index).filter((index) => indexes.has(index));
  }, [deck]);

  const ledger = deck ? deckLedgerLine(deck) : null;
  const slideCount = deck?.manifest.slides.length ?? 0;
  const deckName = file?.name.replace(/\.[A-Za-z0-9]+$/, '') ?? 'Deck';

  return (
    <DocSheet open={Boolean(file)} onClose={onClose} title={deckName} icon={Presentation} kind="deck-import">
      <div className="space-y-4" data-deck-import-sheet>
        <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {deck ? `${slideCount} ${slideCount === 1 ? 'slide' : 'slides'}` : error ? 'Deck' : 'Reading the deck…'}
          {' · onto this board'}
        </p>

        {error && (
          <p role="alert" className="text-[12px] text-[var(--color-clay-ink)]">{error}</p>
        )}

        {deck && (
          <>
            {slidesWithPictures.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Slides">
                {slidesWithPictures.slice(0, FILMSTRIP_MAX).map((index) => (
                  <SlideFrame key={index} deck={deck} slideIndex={index} urls={urls} />
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-[var(--text-muted)]">No pictures to lay out in this deck.</p>
            )}
            {ledger && (
              <p className="font-mono text-[10px] text-[var(--text-muted)]">{ledger}</p>
            )}
            <label className="block">
              <span className="mb-1 block text-[12px] text-[var(--text-primary)]">
                Links that came with this deck
              </span>
              <textarea
                value={pastedLinks}
                onChange={(event) => setPastedLinks(event.target.value)}
                rows={3}
                className="w-full rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[12px] text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
              />
            </label>
            {resumable && (
              <p role="status" className="text-[12px] text-[var(--text-primary)]">{DECK_COPY.resume}</p>
            )}
          </>
        )}

        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            disabled={!deck || slidesWithPictures.length === 0}
            onClick={() => {
              if (!deck) return;
              onLayOut(deck, pastedLinks);
              onClose();
            }}
          >
            {DECK_COPY.layOut}
          </Button>
        </div>
      </div>
    </DocSheet>
  );
}
