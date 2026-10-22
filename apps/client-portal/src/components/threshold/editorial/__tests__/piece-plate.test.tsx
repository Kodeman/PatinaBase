import { render } from '@testing-library/react';

import type { EditorialAsset } from '@/lib/editorial/types';

import { PiecePlate, type PiecePlateProps } from '../piece-plate';

const item: PiecePlateProps['item'] = {
  nameAsSigned: 'Harmon Bench Works walnut sideboard',
  makerName: null,
  status: 'in_production',
  category: 'furniture',
  silhouetteKind: 'case',
};

const asset: EditorialAsset = {
  id: 'sideboard-picture',
  sha256: 'a'.repeat(64),
  sourceKind: 'maker',
  width: 1200,
  height: 1200,
  ground: 'white',
  dominantHex: null,
  lqip: null,
  focal: null,
  subjectBox: null,
  crops: { piece: { rect: [0, 0, 1200, 1200], widths: [256, 512, 768] } },
  caption: { what: 'walnut sideboard', whose: 'Birchwood Studio', when: 'photographed 2025' },
  alt: 'Walnut sideboard on a white ground',
};

function renderPiece(picture = asset, signedItem = item, showMakers = false) {
  return render(
    <PiecePlate scopeId="project-1" showMakers={showMakers} item={signedItem} asset={picture} statusWords="In production" />,
  );
}

describe('PiecePlate captions', () => {
  it('uses the sanitized catalogue what with makers OFF while preserving the signed name', () => {
    const { container } = renderPiece();
    const caption = container.querySelector('figcaption')!;
    expect(caption).not.toHaveTextContent('Harmon');
    expect(caption.querySelector('[data-caption-field="what"]')).toHaveTextContent('walnut sideboard, the same model');
    expect(caption.querySelector('[data-caption-field="whose"]')).toHaveTextContent("from the maker's catalogue");
    expect(caption.querySelector('[data-caption-field="when"]')).toHaveTextContent('photographed 2025');
    expect(container.querySelector('.ed-piece__name')).toHaveTextContent(item.nameAsSigned);
  });

  it('keeps the catalogue attribution and date with makers ON', () => {
    const { container } = renderPiece(
      { ...asset, caption: { ...asset.caption, what: item.nameAsSigned } },
      { ...item, makerName: 'Harmon Bench Works' },
      true,
    );
    const caption = container.querySelector('figcaption')!;
    expect(caption.querySelector('[data-caption-field="what"]')).toHaveTextContent(`${item.nameAsSigned}, the same model`);
    expect(caption.querySelector('[data-caption-field="whose"]')).toHaveTextContent("from Harmon Bench Works' catalogue");
    expect(caption.querySelector('[data-caption-field="when"]')).toHaveTextContent('photographed 2025');
  });

  it('uses each signed name with makers ON when two pieces share a catalogue asset', () => {
    const names = ['Harmon Bench Works walnut sideboard', 'Harmon Bench Works oak sideboard'];
    const { container } = render(
      <>
        {names.map((nameAsSigned) => (
          <PiecePlate key={nameAsSigned} scopeId="project-1" showMakers item={{ ...item, nameAsSigned, makerName: 'Harmon Bench Works' }} asset={asset} statusWords="In production" />
        ))}
      </>,
    );
    expect(Array.from(container.querySelectorAll('[data-caption-field="what"]')).map((node) => node.textContent)).toEqual(
      names.map((name) => `${name}, the same model`),
    );
  });

  it.each(['vendor-less', 'frozen makers-OFF'])('uses the own name for a makers-ON %s line sharing catalogue bytes', () => {
    const shared = { ...asset, caption: { ...asset.caption, what: "Another line's sideboard" } };
    const { container } = renderPiece(shared, { ...item, makerName: null }, true);
    expect(container.querySelector('[data-caption-field="what"]')?.textContent).toBe(
      item.nameAsSigned + ', the same model',
    );
  });

  it('keeps both shared-asset catalogue captions maker-free with makers OFF', () => {
    const names = [item.nameAsSigned, 'Larkin Prairie oak sideboard'];
    const { container } = render(
      <>
        {names.map((nameAsSigned) => (
          <PiecePlate key={nameAsSigned} scopeId="project-1" showMakers={false} item={{ ...item, nameAsSigned, status: 'installed' }} asset={asset} statusWords="Installed" />
        ))}
      </>,
    );
    const captions = Array.from(container.querySelectorAll('figcaption'));
    expect(captions).toHaveLength(2);
    for (const caption of captions) {
      expect(caption).toHaveTextContent(/^walnut sideboard, the same model · from the maker's catalogue · photographed 2025$/);
      expect(caption).not.toHaveTextContent(/Harmon Bench Works|Larkin Prairie/);
    }
    expect(Array.from(container.querySelectorAll('.ed-piece__name')).map((node) => node.textContent)).toEqual(names);
  });

  it('uses the own catalogue name with a null when and no dangling separator', () => {
    const { container } = renderPiece(
      { ...asset, caption: { ...asset.caption, when: null } },
      { ...item, makerName: 'Harmon Bench Works', status: 'installed' },
      true,
    );
    expect(container.querySelector('img')).not.toBeNull();
    expect(container.querySelector('figcaption')?.textContent).toBe(
      `${item.nameAsSigned}, the same model · from Harmon Bench Works' catalogue`,
    );
    expect(container.querySelector('[data-caption-field="when"]')).toBeNull();
  });

  it.each(['–', '/', ' · / – '])('uses This piece instead of makers-OFF category for punctuation-only what: %s', (what) => {
    const { container } = renderPiece({ ...asset, caption: { ...asset.caption, what } }, { ...item, category: 'Harmon seating', makerName: null });
    expect(container.querySelector('[data-caption-field="what"]')?.textContent).toBe('This piece, the same model');
    expect(container.querySelector('figcaption')).not.toHaveTextContent('Harmon seating');
    expect(container.querySelector('img')).not.toBeNull();
  });

  it('uses This piece for punctuation-only catalogue what without a category', () => {
    const { container } = renderPiece(
      { ...asset, caption: { ...asset.caption, what: '/' } },
      { ...item, category: null },
    );
    expect(container.querySelector('[data-caption-field="what"]')?.textContent).toBe('This piece, the same model');
  });

  it('uses This piece, not the category, when makers OFF what is null', () => {
    const { container } = renderPiece(
      { ...asset, caption: { ...asset.caption, what: null } }, { ...item, category: 'Harmon seating', makerName: null },
    );
    expect(container.querySelector('[data-caption-field="what"]')?.textContent).toBe('This piece, the same model');
    expect(container.querySelector('figcaption')).not.toHaveTextContent('Harmon seating');
  });

  it('uses This piece for makers-OFF punctuation-only catalogue what, not the category', () => {
    const { container } = renderPiece(
      { ...asset, caption: { ...asset.caption, what: '–' } }, { ...item, category: 'Harmon seating', makerName: null },
    );
    expect(container.querySelector('[data-caption-field="what"]')?.textContent).toBe('This piece, the same model');
    expect(container.querySelector('figcaption')).not.toHaveTextContent('Harmon seating');
  });

  it('never uses the category when makers OFF what is null', () => {
    const { container } = renderPiece(
      { ...asset, caption: { ...asset.caption, what: null } }, { ...item, category: 'living_room-seating', makerName: null },
    );
    expect(container.querySelector('[data-caption-field="what"]')?.textContent).toBe('This piece, the same model');
    expect(container.querySelector('figcaption')).not.toHaveTextContent('living_room-seating');
  });

  it.each(['– walnut sideboard /', ' / — walnut sideboard – / ', '— walnut sideboard —'])('trims catalogue what edge dashes and slashes: %s', (what) => {
    const { container } = renderPiece({ ...asset, caption: { ...asset.caption, what } });
    expect(container.querySelector('[data-caption-field="what"]')?.textContent).toBe('walnut sideboard, the same model');
  });

  it('keeps the stored caption triplet for non-catalogue pictures', () => {
    const { container } = renderPiece({ ...asset, sourceKind: 'installed', ground: 'scene' });
    expect(container.querySelector('[data-caption-field="what"]')).toHaveTextContent(/^walnut sideboard$/);
    expect(container.querySelector('[data-caption-field="whose"]')).toHaveTextContent('Birchwood Studio');
    expect(container.querySelector('[data-caption-field="when"]')).toHaveTextContent('photographed 2025');
    expect(container.querySelector('.plate-note')).toBeNull();
  });
});
