/**
 * The setup whisper's render predicate (R3 N1): the Desk arbiter's `when` is
 * `useStudioSetupWhisperEligible()`, and it must say true exactly when the
 * whisper renders, so the arbiter never gives the slot to a whisper that
 * renders nothing.
 */
import { render, renderHook, screen } from '@testing-library/react';
import { StudioSetupWhisper, useStudioSetupWhisperEligible } from './studio-setup-whisper';

let mockFlag = { value: true, isLoading: false };
let mockRole = 'owner';
let mockMembers: Array<Record<string, unknown>> = [];
let mockProjects: unknown[] = [];
let mockContacts: unknown[] = [];
let mockLoading = false;

jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: () => mockFlag }));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('./account-sheet', () => ({ openAccountPage: jest.fn() }));
jest.mock('@patina/supabase', () => ({
  useOrganizations: () => ({
    data: [
      {
        id: 'org-1',
        type: 'design_studio',
        created_at: '2026-01-01T00:00:00Z',
        rolodex_seed_skipped_at: null,
        membership: { role: mockRole },
      },
    ],
    isLoading: false,
  }),
  useOrganizationMembers: () => ({ data: mockMembers, isLoading: false }),
  useProjects: () => ({ data: mockProjects, isLoading: mockLoading }),
  useStudioContacts: () => ({ data: mockContacts, isLoading: false }),
}));

const TEXT = 'The studio isn’t fully set up.';
const HIRE = { user_id: 'hire-1', status: 'active', first_document_opened_at: '2026-01-05T00:00:00Z' };

beforeEach(() => {
  mockFlag = { value: true, isLoading: false };
  mockRole = 'owner';
  // Own title set; no crew, contacts or projects: four open steps.
  mockMembers = [{ user_id: 'me', job_title: 'Principal', status: 'active' }];
  mockProjects = [];
  mockContacts = [];
  mockLoading = false;
});

const eligible = () => renderHook(() => useStudioSetupWhisperEligible()).result.current;
const renders = () => {
  const { container, unmount } = render(<StudioSetupWhisper />);
  const shown = screen.queryByText(TEXT) !== null;
  expect(shown).toBe(container.childElementCount > 0);
  unmount();
  return shown;
};

describe('useStudioSetupWhisperEligible — the whisper’s own render predicate', () => {
  it('an owner with two or more open steps: eligible, and the whisper renders', () => {
    expect(eligible()).toBe(true);
    expect(renders()).toBe(true);
  });

  it('a member: not eligible, and the whisper renders nothing', () => {
    mockRole = 'member';
    expect(eligible()).toBe(false);
    expect(renders()).toBe(false);
  });

  it('an owner with one open step: not eligible, and the whisper renders nothing', () => {
    mockMembers = [{ user_id: 'me', job_title: 'Principal', status: 'active' }, HIRE];
    mockProjects = [{ id: 'proj-1' }];
    expect(eligible()).toBe(false);
    expect(renders()).toBe(false);
  });

  it('studio-workspaces off: not eligible', () => {
    mockFlag = { value: false, isLoading: false };
    expect(eligible()).toBe(false);
  });

  it('pending while the flag or a studio read loads', () => {
    mockFlag = { value: false, isLoading: true };
    expect(eligible()).toBe('pending');
    mockFlag = { value: true, isLoading: false };
    mockLoading = true;
    expect(eligible()).toBe('pending');
  });
});
