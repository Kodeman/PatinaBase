/**
 * US-14 §4c(e) — the ceremony's moves onto the lead's own Document are the same engagement, so
 * each is announced with `suppressNextArrival` immediately before the navigation.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { consumeSuppressed } from '@/lib/arrival/nav';
import { CeremonySurface } from '../ceremony-surface';

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

let mockFlag = { value: true, isLoading: false };
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => mockFlag,
}));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'designer-1' } }) }));
jest.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => true }));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    ceremonyOpened: jest.fn(),
    ceremonyPutDown: jest.fn(),
    ceremonyCompleted: jest.fn(),
  },
}));

const draft = {
  id: 'ceremony-1',
  state: 'draft',
  designer_client_id: null as string | null,
  intro_text: 'We saw the light in your room.',
  credential_line: null,
  portfolio_url: null,
  draft_slots: [
    { start: '2026-10-01T15:00:00Z' },
    { start: '2026-10-02T15:00:00Z' },
  ],
  created_at: '2026-09-28T00:00:00Z',
};
let mockCeremony: typeof draft | null = draft;
jest.mock('@patina/supabase', () => ({
  useCeremony: () => ({ data: mockCeremony, isLoading: false }),
  useLead: () => ({
    data: {
      id: 'lead-1',
      project_type: 'living_room',
      budget_range: null,
      contact_name: 'Ana Reyes',
      homeowner: null,
    },
    isLoading: false,
  }),
  useLeadScans: () => ({ data: [] }),
  useStudioIdentity: () => ({ data: null }),
  useSaveCeremonyDraft: () => ({ mutate: jest.fn() }),
  useCeremonyComplete: () => ({
    isPending: false,
    mutate: (
      _args: unknown,
      opts: { onSuccess: (r: { ceremony_id: string; designer_client_id: string }) => void },
    ) => opts.onSuccess({ ceremony_id: 'ceremony-1', designer_client_id: 'dc-9' }),
  }),
}));

jest.mock('../ceremony-arrival', () => ({ CeremonyArrival: () => null }));
jest.mock('../ceremony-slots', () => ({ CeremonySlots: () => null }));
jest.mock('@/components/document/section-eyebrow', () => ({
  SectionEyebrow: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));
jest.mock('../../document-action', () => ({
  DocumentActionGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DocumentAction: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

beforeEach(() => {
  mockReplace.mockClear();
  mockPush.mockClear();
  mockFlag = { value: true, isLoading: false };
  mockCeremony = draft;
  consumeSuppressed('/doc/lead-1');
  consumeSuppressed('/doc/dc-9');
});

describe('CeremonySurface — moves onto the same engagement (US-14)', () => {
  it('the flag-off quiet redirect onto the lead is announced', () => {
    mockFlag = { value: false, isLoading: false };
    render(<CeremonySurface leadId="lead-1" />);
    expect(mockReplace).toHaveBeenCalledWith('/doc/lead-1');
    expect(consumeSuppressed('/doc/lead-1')).toBe(true);
  });

  it('an already-sent ceremony redirects into its Document, announced', () => {
    mockCeremony = { ...draft, state: 'sent', designer_client_id: 'dc-9' };
    render(<CeremonySurface leadId="lead-1" />);
    expect(mockReplace).toHaveBeenCalledWith('/doc/dc-9');
    expect(consumeSuppressed('/doc/dc-9')).toBe(true);
  });

  it('the send lands in the new Document, announced', () => {
    render(<CeremonySurface leadId="lead-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Send — and begin the Document' }));
    expect(mockPush).toHaveBeenCalledWith('/doc/dc-9');
    expect(consumeSuppressed('/doc/dc-9')).toBe(true);
  });

  it('the put-down to the Desk is not announced', () => {
    render(<CeremonySurface leadId="lead-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Put down for now' }));
    expect(mockPush).toHaveBeenCalledWith('/desk');
    expect(consumeSuppressed('/desk')).toBe(false);
  });
});
