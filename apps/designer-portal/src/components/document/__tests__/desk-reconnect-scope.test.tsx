/**
 * Wave 4 (00420) scope ruling — the Desk's reconnect population is a
 * RELATIONSHIP-ACTION surface (a "reach out" prompt derived from the nurture
 * queue), so it must always read `usePeopleDirectory` pinned to
 * `scope: 'mine'`. "studio visibility ≠ shared nurture queues."
 */
import { renderHook } from '@testing-library/react';
import { useDeskReconnectPopulation } from '../desk-reconnect';

const mockUsePeopleDirectory = jest.fn(() => ({
  data: [],
  isLoading: false,
  isError: false,
}));
jest.mock('@patina/supabase', () => ({
  usePeopleDirectory: (...args: unknown[]) => mockUsePeopleDirectory(...args),
}));

describe('useDeskReconnectPopulation — scope pinning', () => {
  beforeEach(() => {
    mockUsePeopleDirectory.mockClear();
  });

  it('always passes scope: "mine" to usePeopleDirectory', () => {
    renderHook(() => useDeskReconnectPopulation());
    expect(mockUsePeopleDirectory).toHaveBeenCalledWith({ role: 'all', scope: 'mine' });
  });
});
