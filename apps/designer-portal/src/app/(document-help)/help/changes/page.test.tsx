/**
 * R2-F2 (SQ-303, SQ-295 comment c_muhxqu2i_cdf706 #3) — `/help/changes` has
 * no `teaching-notes` flag gate of its own; `useChangesList` only filters
 * per-note flags. Fail-closed: while the flag is loading or off, the page
 * must render the same quiet empty state it shows when there are no
 * releases (no 404, no redirect) and must never call `useChangesList`.
 */
import { render, screen } from '@testing-library/react';

let mockTeachingNotesFlag: { value: boolean; isLoading: boolean } = {
  value: false,
  isLoading: true,
};
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => (name === 'teaching-notes' ? mockTeachingNotesFlag : { value: false, isLoading: false }),
}));

const mockUseChangesList = jest.fn();
jest.mock('@/hooks/use-changes-list', () => ({
  useChangesList: () => mockUseChangesList(),
}));

const mockCaptureTeachingEvent = jest.fn();
jest.mock('@/lib/analytics/teaching-events', () => ({
  captureTeachingEvent: (...args: unknown[]) => mockCaptureTeachingEvent(...args),
}));

import WhatChangedPage from './page';

describe('/help/changes — fail-closed on the teaching-notes flag', () => {
  beforeEach(() => {
    mockUseChangesList.mockReset();
    mockUseChangesList.mockReturnValue({ releases: [], also: [], isLoading: false });
    mockCaptureTeachingEvent.mockReset();
  });

  it('renders the quiet empty state and never calls useChangesList while the flag is loading', () => {
    mockTeachingNotesFlag = { value: false, isLoading: true };
    render(<WhatChangedPage />);

    expect(screen.getByText('Nothing has changed in the Document yet.')).toBeInTheDocument();
    expect(mockUseChangesList).not.toHaveBeenCalled();
    expect(mockCaptureTeachingEvent).not.toHaveBeenCalled();
  });

  it('renders the quiet empty state and never calls useChangesList with the flag off', () => {
    mockTeachingNotesFlag = { value: false, isLoading: false };
    render(<WhatChangedPage />);

    expect(screen.getByText('Nothing has changed in the Document yet.')).toBeInTheDocument();
    expect(mockUseChangesList).not.toHaveBeenCalled();
  });

  it('renders the real releases list with the flag on', () => {
    mockTeachingNotesFlag = { value: true, isLoading: false };
    mockUseChangesList.mockReturnValue({
      releases: [
        {
          id: 'r1',
          headline: 'A release',
          shippedOn: '2026-09-11',
          notes: [],
        },
      ],
      also: [],
      isLoading: false,
    });
    render(<WhatChangedPage />);

    expect(screen.getByText('A release')).toBeInTheDocument();
    expect(mockUseChangesList).toHaveBeenCalledTimes(1);
    expect(mockCaptureTeachingEvent).toHaveBeenCalledWith('help.teaching_changes.opened');
  });
});
