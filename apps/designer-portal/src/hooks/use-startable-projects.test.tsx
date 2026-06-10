import { renderHook } from '@testing-library/react';

import { useStartableProjects } from './use-startable-projects';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

const mockProjects: Array<{ id: string; name: string; status: string }> = [];

jest.mock('@/hooks/use-projects', () => ({
  useProjects: () => ({ data: mockProjects }),
}));

describe('useStartableProjects', () => {
  beforeEach(() => {
    mockProjects.length = 0;
  });

  it('keeps only UUID-backed active/planning projects', () => {
    mockProjects.push(
      { id: UUID_A, name: 'Sage Loft', status: 'active' },
      { id: UUID_B, name: 'Oak House', status: 'planning' },
      { id: UUID_C, name: 'Done Deal', status: 'completed' },
      { id: 'olsen-residence', name: 'Mock Fixture', status: 'active' }
    );

    const { result } = renderHook(() => useStartableProjects());
    expect(result.current.map((p) => p.id)).toEqual([UUID_A, UUID_B]);
  });

  it('filters by name, case-insensitively', () => {
    mockProjects.push(
      { id: UUID_A, name: 'Sage Loft', status: 'active' },
      { id: UUID_B, name: 'Oak House', status: 'active' }
    );

    const { result } = renderHook(() => useStartableProjects('sage'));
    expect(result.current).toEqual([{ id: UUID_A, name: 'Sage Loft' }]);
  });

  it('caps at the default limit of 6 and honors a custom limit', () => {
    for (let i = 0; i < 8; i++) {
      mockProjects.push({
        id: `${i}1111111-1111-4111-8111-111111111111`,
        name: `Project ${i}`,
        status: 'active',
      });
    }

    const capped = renderHook(() => useStartableProjects());
    expect(capped.result.current).toHaveLength(6);

    const uncapped = renderHook(() =>
      useStartableProjects(undefined, Number.POSITIVE_INFINITY)
    );
    expect(uncapped.result.current).toHaveLength(8);
  });
});
