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

function renderPiece(picture = asset, signedItem = item) {
  return render(
    <PiecePlate scopeId="project-1" item={signedItem} asset={picture} statusWords="In production" />,
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
    );
    const caption = container.querySelector('figcaption')!;
    expect(caption.querySelector('[data-caption-field="what"]')).toHaveTextContent(`${item.nameAsSigned}, the same model`);
    expect(caption.querySelector('[data-caption-field="whose"]')).toHaveTextContent("from Harmon Bench Works' catalogue");
    expect(caption.querySelector('[data-caption-field="when"]')).toHaveTextContent('photographed 2025');
  });

  it('falls back to the signed name when the catalogue what is absent', () => {
    const { container } = renderPiece({ ...asset, caption: { ...asset.caption, what: null } });
    expect(container.querySelector('[data-caption-field="what"]')).toHaveTextContent(`${item.nameAsSigned}, the same model`);
  });

  it('keeps the stored caption triplet for non-catalogue pictures', () => {
    const { container } = renderPiece({ ...asset, sourceKind: 'installed', ground: 'scene' });
    expect(container.querySelector('[data-caption-field="what"]')).toHaveTextContent(/^walnut sideboard$/);
    expect(container.querySelector('[data-caption-field="whose"]')).toHaveTextContent('Birchwood Studio');
    expect(container.querySelector('[data-caption-field="when"]')).toHaveTextContent('photographed 2025');
    expect(container.querySelector('.plate-note')).toBeNull();
  });
});
