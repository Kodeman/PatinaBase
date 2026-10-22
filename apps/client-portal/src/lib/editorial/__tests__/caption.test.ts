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

  it('splits the silhouette caption into the three fields', () => {
    expect(silhouetteCaption('Floor lamp')).toEqual({
      what: 'Floor lamp',
      whose: 'drawn from the specification',
      when: 'photograph to follow',
    });
  });
});
