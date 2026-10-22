import {
  captionText,
  captionTriplet,
  catalogueCaption,
  hasBannedWords,
  plateAlt,
  silhouetteCaption,
  sourceWord,
} from '../caption';

const fields = { what: 'Walnut top, planed', whose: 'Harmon Bench Works', when: '15 October 2026' };

describe('caption', () => {
  it('builds exactly three fields from the record', () => {
    const caption = captionTriplet(fields);
    expect(caption).toEqual(fields);
    expect(captionText(caption!).split(' · ')).toHaveLength(3);
  });

  it('never lets a field carry the separator, so there is never a fourth segment', () => {
    const caption = captionTriplet({ ...fields, whose: 'Harmon Bench Works · Dayton' });
    expect(caption!.whose).toBe('Harmon Bench Works, Dayton');
    expect(captionText(caption!).split(' · ')).toHaveLength(3);
  });

  it('refuses a caption with a missing what or whose', () => {
    expect(captionTriplet({ ...fields, what: '   ' })).toBeNull();
    expect(captionTriplet({ ...fields, whose: null })).toBeNull();
  });

  it('keeps what · whose when the when is withheld, with no dangling separator', () => {
    const caption = captionTriplet({ ...fields, when: null });
    expect(caption).toEqual({ what: fields.what, whose: fields.whose, when: null });
    expect(captionText(caption!)).toBe('Walnut top, planed · Harmon Bench Works');
    expect(captionTriplet({ ...fields, when: '  ' })).toEqual({ what: fields.what, whose: fields.whose, when: null });
  });

  it('still refuses banned wording in the when', () => {
    expect(captionTriplet({ ...fields, when: 'AI render, 2026' })).toBeNull();
  });

  it.each([
    ['AI render of the room'],
    ['A generated living room'],
    ['Image of a sofa'],
  ])('refuses banned wording: %s', (what) => {
    expect(hasBannedWords(what)).toBe(true);
    expect(captionTriplet({ ...fields, what })).toBeNull();
  });

  it('does not mistake a word that merely contains the letters', () => {
    expect(hasBannedWords('Maine pine, plain finish')).toBe(false);
  });

  it('uses a clean perceived alt, and builds what · whose · source word otherwise', () => {
    expect(plateAlt({ alt: 'A hand plane on a workbench', caption: fields, sourceKind: 'maker' })).toBe(
      'A hand plane on a workbench',
    );
    expect(plateAlt({ alt: null, caption: fields, sourceKind: 'maker' })).toBe(
      "Walnut top, planed · Harmon Bench Works · maker's photograph",
    );
    expect(plateAlt({ alt: 'Image of a hand plane', caption: fields, sourceKind: 'installed' })).toBe(
      'Walnut top, planed · Harmon Bench Works · photograph',
    );
  });

  it('never emits banned wording in any alt it builds', () => {
    const alt = plateAlt({ alt: 'generated', caption: { what: 'AI sofa', whose: 'Studio', when: '2026' }, sourceKind: 'concept' });
    expect(hasBannedWords(alt)).toBe(false);
    expect(alt).toBe('Studio · concept render');
  });

  it('names each source kind in words', () => {
    expect(sourceWord('sheet')).toBe('drawing');
    expect(sourceWord('scan')).toBe('scan');
  });

  it('captions a catalogue photograph as the same model, from the maker', () => {
    expect(catalogueCaption('Walnut sideboard', 'Harmon Bench Works', 'photographed 2025')).toEqual({
      what: 'Walnut sideboard, the same model',
      whose: "from Harmon Bench Works' catalogue",
      when: 'photographed 2025',
    });
    expect(catalogueCaption('Lounge chair', 'Larkin Prairie', 'photographed 2024')!.whose).toBe(
      "from Larkin Prairie's catalogue",
    );
    expect(catalogueCaption('Floor lamp', null, 'photographed 2024')!.whose).toBe("from the maker's catalogue");
  });

  it.each(['–', '/', '   '])('uses This piece for a catalogue name without letters or digits: %s', (what) => {
    expect(catalogueCaption(what, null, null)?.what).toBe('This piece, the same model');
  });

  it.each(['Étagère', '椅子', '123'])('keeps catalogue names containing Unicode letters or digits: %s', (what) => {
    expect(catalogueCaption(what, null, null)?.what).toBe(`${what}, the same model`);
  });

  it.each([null, '–'])('uses This piece for makers-OFF category fallback: %s', (what) => {
    expect(catalogueCaption(what, null, null, 'Harmon seating', false)?.what).toBe('This piece, the same model');
  });

  it('uses the signed item name instead of the uncategorized slug', () => {
    expect(catalogueCaption('Oak table', null, null, 'uncategorized')?.what).toBe('Oak table, the same model');
    expect(catalogueCaption(null, null, null, 'uncategorized')?.what).toBe('This piece, the same model');
  });

  it('presents a slug category readably and preserves it with makers ON', () => {
    expect(catalogueCaption(null, null, null, 'living_room-seating')?.what).toBe('Living room seating, the same model');
    expect(catalogueCaption(null, null, null, 'Harmon seating', true)?.what).toBe('Harmon seating, the same model');
  });

  it.each(['– Walnut /', ' / — Walnut – / ', '— Walnut —'])('trims catalogue edge separators but keeps the name: %s', (what) => {
    expect(catalogueCaption(what, null, null)?.what).toBe('Walnut, the same model');
  });

  it('preserves separators inside the catalogue name', () => {
    expect(catalogueCaption('Oak / walnut — bench', null, null)?.what).toBe('Oak / walnut — bench, the same model');
  });

  it('keeps the silhouette note out of the when field', () => {
    expect(silhouetteCaption('Floor lamp')).toEqual({
      what: 'Floor lamp',
      whose: 'drawn from the specification',
      when: null,
    });
  });
});

it('keeps the installed photograph caption from its three stored fields', () => {
  const stored = { what: 'Living room', whose: 'Middle Studio', when: 'photographed 2 August 2026' };
  expect(captionTriplet(stored)).toEqual(stored);
  expect(captionText(captionTriplet(stored)!)).toBe('Living room · Middle Studio · photographed 2 August 2026');
  expect(plateAlt({ sourceKind: 'installed', caption: stored, alt: null })).toBe('Living room · Middle Studio · photograph');
});
