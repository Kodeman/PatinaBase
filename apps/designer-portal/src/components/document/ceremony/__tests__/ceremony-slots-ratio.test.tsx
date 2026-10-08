/**
 * US-19 FR4 Fix 12 (523-4 / 524-g, `one-voice`) — the offered-times count
 * line reads as a fraction (`{n} of {MAX} offered`). Under the flag it
 * converts to `{n} offered`; off, the old string stands.
 */
import { render, screen } from '@testing-library/react';
import { CeremonySlots } from '../ceremony-slots';

let mockOneVoice = false;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({ value: key === 'one-voice' ? mockOneVoice : false }),
}));

jest.mock('../../document-action', () => ({
  DocumentAction: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
}));

const slot = (id: string) => ({
  id,
  starts_at: '2026-10-08T10:00:00.000Z',
  duration_minutes: 45,
});

describe('CeremonySlots offered count (FR4 Fix 12)', () => {
  beforeEach(() => {
    mockOneVoice = false;
  });

  it('flag off: keeps "{n} of {MAX} offered"', () => {
    render(<CeremonySlots slots={[slot('a')]} onChange={jest.fn()} />);
    expect(screen.getByText(/1 of 3 offered/)).toBeInTheDocument();
  });

  it('one-voice: converts to "{n} offered"', () => {
    mockOneVoice = true;
    render(<CeremonySlots slots={[slot('a'), slot('b')]} onChange={jest.fn()} />);
    expect(screen.getByText(/^2 offered/)).toBeInTheDocument();
    expect(screen.queryByText(/2 of 3 offered/)).not.toBeInTheDocument();
    // The conditional "offer two or three" tail is untouched.
    expect(screen.getByText(/offer two or three/)).toBeInTheDocument();
  });
});
