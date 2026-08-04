/**
 * Wave 4 (00420) scope ruling — Nurture is a RELATIONSHIP-ACTION surface, so
 * it must always read `usePeopleDirectory` pinned to `scope: 'mine'`,
 * regardless of the Directory's MINE · STUDIO lens (which NurtureView doesn't
 * even receive). "studio visibility ≠ shared nurture queues."
 */
import { render } from '@testing-library/react';
import { NurtureView } from '../views/nurture-view';
import type { PeopleViewProps } from '../types';

const mockUsePeopleDirectory = jest.fn(() => ({ data: [], isLoading: false }));
jest.mock('@patina/supabase', () => ({
  usePeopleDirectory: (...args: unknown[]) => mockUsePeopleDirectory(...args),
  useCreateTouchpoint: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

const NAV: PeopleViewProps = {
  openPerson: jest.fn(),
  openThread: jest.fn(),
  goView: jest.fn(),
  notify: jest.fn(),
};

describe('NurtureView — scope pinning', () => {
  beforeEach(() => {
    mockUsePeopleDirectory.mockClear();
  });

  it('always passes scope: "mine" to usePeopleDirectory', () => {
    render(<NurtureView {...NAV} />);
    expect(mockUsePeopleDirectory).toHaveBeenCalledWith({ role: 'all', scope: 'mine' });
  });
});
