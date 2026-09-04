import type { ProjectListItem } from '@/types/project';

import { toOtherHouses, waitingSentence } from '../other-houses';

const project = (
  id: string,
  overrides: Partial<ProjectListItem> = {},
): ProjectListItem => ({
  id,
  name: `House ${id}`,
  progressPercentage: 0,
  status: 'active',
  approvalsPending: 0,
  nonStage2ApprovalsPending: 0,
  unreadMessages: 0,
  ...overrides,
});

describe('toOtherHouses', () => {
  it('leaves out the house the client is standing in', () => {
    const houses = toOtherHouses([project('p1'), project('p2'), project('p3')], 'p2');

    expect(houses.map((house) => house.id)).toEqual(['p1', 'p3']);
  });

  it('answers nothing at all for a solo client', () => {
    expect(toOtherHouses([project('p1')], 'p1')).toEqual([]);
  });

  it('carries the name, the place, and what waits there', () => {
    const houses = toOtherHouses(
      [
        project('p1'),
        project('p2', {
          name: 'The Linden house',
          location: 'Des Moines',
          approvalsPending: 2,
          unreadMessages: 1,
        }),
      ],
      'p1',
    );

    expect(houses).toEqual([
      {
        id: 'p2',
        name: 'The Linden house',
        location: 'Des Moines',
        approvalsPending: 2,
        unreadMessages: 1,
      },
    ]);
  });
});

describe('waitingSentence', () => {
  const house = (approvalsPending?: number, unreadMessages?: number) => ({
    id: 'p1',
    name: 'The Linden house',
    approvalsPending,
    unreadMessages,
  });

  it('says nothing when nothing is waiting', () => {
    expect(waitingSentence(house(0, 0))).toBeNull();
    expect(waitingSentence(house())).toBeNull();
  });

  it('names one paper', () => {
    expect(waitingSentence(house(1, 0))).toBe('A paper is waiting there.');
  });

  it('names several papers', () => {
    expect(waitingSentence(house(3, 0))).toBe('Papers are waiting there.');
  });

  it('names one note', () => {
    expect(waitingSentence(house(0, 1))).toBe('A note is waiting there.');
  });

  it('names several notes', () => {
    expect(waitingSentence(house(0, 4))).toBe('Notes are waiting there.');
  });

  it('names both together', () => {
    expect(waitingSentence(house(1, 1))).toBe('A paper and a note are waiting there.');
    expect(waitingSentence(house(2, 3))).toBe('Papers and notes are waiting there.');
  });

  it('treats an unreadable count as nothing waiting, never as a negative', () => {
    expect(waitingSentence(house(-2, 0))).toBeNull();
    expect(waitingSentence(house(1.6, 0))).toBe('A paper is waiting there.');
  });
});
