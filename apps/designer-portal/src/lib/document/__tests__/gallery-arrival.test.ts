import { selectArrival, arrivalRendition } from '../plate-crop';
import { arrivalCases, bed } from '../../../../../client-portal/src/lib/editorial/__tests__/arrival-fixtures';
import { selectArrival as clientArrival } from '../../../../../client-portal/src/lib/editorial/rank';

it.each(arrivalCases)('matches the client arrival for $name', ({ editorial, kind, id, mode }) => {
  const client = clientArrival(editorial);
  const designer = selectArrival(editorial);
  expect({ kind: designer.kind, id: designer.asset?.id ?? null, mode: designer.mode }).toEqual({ kind, id, mode });
  expect(designer).toEqual(client);
});
it('previews the largest stored crop that holds the whole catalogue bed', () => {
  expect(arrivalRendition(bed, null)).toMatchObject({ key: 'pair', width: 1600, rect: [0, 197 / 1600, 1, 1143 / 1600] });
});
