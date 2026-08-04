import type { EditableMoodBoardItem } from '@patina/types';
import { resolveBoardRoomTidyTarget } from './board-room-tidy';

function item(id: string, locked = false): EditableMoodBoardItem {
  return {
    id,
    type: 'image',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    locked,
    data: {},
  };
}

describe('resolveBoardRoomTidyTarget', () => {
  const items = [item('a'), item('b'), item('locked', true)];

  it('uses the unlocked whole board for zero or one selected pin', () => {
    expect(resolveBoardRoomTidyTarget(items, [])).toMatchObject({
      scope: 'board',
      itemIds: [],
      itemCount: 2,
      enabled: true,
    });
    expect(resolveBoardRoomTidyTarget(items, ['locked'])).toMatchObject({
      scope: 'board',
      itemCount: 2,
      enabled: true,
    });
  });

  it('uses only movable pins from a two-plus selection and disables a one-pin result', () => {
    expect(resolveBoardRoomTidyTarget(items, ['a', 'b'])).toMatchObject({
      scope: 'selection',
      itemIds: ['a', 'b'],
      itemCount: 2,
      enabled: true,
    });
    expect(resolveBoardRoomTidyTarget(items, ['a', 'locked'])).toMatchObject({
      scope: 'selection',
      itemIds: ['a'],
      itemCount: 1,
      enabled: false,
    });
  });
});
