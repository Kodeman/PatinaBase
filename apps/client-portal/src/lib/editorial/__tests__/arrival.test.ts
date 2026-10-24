import { arrivalMode, containedRendition } from '../gallery-picture';
import { selectArrival } from '../rank';
import { arrivalCases, arrivalFixture, bed, smallScene } from './arrival-fixtures';

it.each(arrivalCases)('selects $name before paint', ({ editorial, kind, id, mode }) => {
  const result = selectArrival(editorial);
  expect({ kind: result.kind, id: result.asset?.id ?? null, mode: result.mode }).toEqual({ kind, id, mode });
});
it('serves the largest crop that contains the whole bed', () => {
  expect(containedRendition('edition', bed)).toMatchObject({ key: 'pair', width: 1600 });
  expect(containedRendition('edition', bed)?.src).toContain('/pair-1600.webp');
});
it('rejects concept, sheet and unservable chosen assets, ranking photographs before paint', () => {
  const editorial = arrivalFixture([{ ...bed, crops: {} }, { ...smallScene, sourceKind: 'concept' }, { ...smallScene, id: 'sheet', sourceKind: 'sheet' }]);
  expect(selectArrival(editorial).kind).toBe('empty');
  editorial.assets.push(smallScene);
  expect(selectArrival(editorial).asset?.id).toBe('scene');
});
it('contains a small scene but covers one with both full-height crops', () => {
  expect(arrivalMode(smallScene)).toBe('contained');
  expect(arrivalMode({ ...smallScene, crops: { cover_phone: { rect: [0, 0, 400, 400], widths: [256] }, wide: { rect: [0, 0, 400, 400], widths: [256] } } })).toBe('cover');
});
it('skips a crop that cuts through the subject', () => {
  expect(containedRendition('', { ...bed, crops: { pair: { rect: [0, 0, 0.5, 0.5], widths: [1600] }, piece: bed.crops.piece } })).toMatchObject({ key: 'piece', width: 768 });
});
