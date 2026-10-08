/**
 * US-19 FR6 F6-6 (walk D13, `one-voice`) — at 390 the band may print its
 * `sentence` rung with no act; the dock's centre still prints Next's act,
 * because the letterhead registers `voice.next`, never the printed rung.
 *
 * The mocking shape is letterhead-compose-landing.test.tsx's.
 */
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { deriveLensBand } from '@/lib/document/lens-band-derivation';
import { LetterheadInstruments } from '../letterhead-instruments';
import { MOBILE_ACTION_PRIORITY } from '../mobile/lifecycle-mobile-action';
import { useMobilePrimaryAction } from '../mobile/mobile-shell';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    }),
    storage: { from: () => ({ createSignedUrls: () => Promise.resolve({ data: [], error: null }) }) },
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  }),
  useProjectV2: () => ({ data: {} }),
  useProjectRoster: () => ({ data: [] }),
  resolveCoverPhoto: () => null,
  publicUrlToPath: () => null,
}));
jest.mock('@/hooks/use-margin-items', () => ({ invalidateMarginSurfaces: jest.fn() }));
jest.mock('@/hooks/use-project-lifecycle', () => ({
  useSaveProjectVitals: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: true, isLoading: false }),
}));
jest.mock('../mobile/mobile-shell', () => ({
  useMobilePrimaryAction: jest.fn(),
  useMobileSecondaryAction: jest.fn(),
}));
jest.mock('../overlays/keys-sheet', () => ({ openKeys: jest.fn() }));
jest.mock('../letterhead-vitals', () => ({ openVitalsEditor: jest.fn() }));
jest.mock('../lens-band', () => ({ OPEN_STANDING_SHEET_EVENT: 'document:open-standing-sheet' }));
jest.mock('../client-mirror', () => ({ ClientMirror: () => null }));
jest.mock('../proposal-preview', () => ({ ProposalPreview: () => null }));
jest.mock('../overlays/household-sheet', () => ({ HouseholdSheet: () => null }));

const OLSEN_CLAIM = 'AP-012 has an open damage claim';

it('Olsen at 390: the band prints the sentence rung; the dock centre is still File the claim', () => {
  const { voice } = deriveLensBand({
    spreadKind: 'project',
    ticket: [],
    needs: [],
    guide: null,
    tier: 'mobile',
    household: 'Olsen',
    stageWord: 'Procurement & Orders',
    stageIndex: { position: 4, of: 6 },
    installDate: null,
    moneyFigure: null,
    proposalInvestment: null,
    sentDate: null,
    readingStop: null,
    now: new Date('2026-10-08T12:00:00'),
    ownAct: {
      key: 'own:claim',
      label: 'File the claim',
      targetId: 'document-act-pieces-head',
      tier: 'scored',
      sentence: OLSEN_CLAIM,
      onAct: jest.fn(),
    },
  });
  expect(voice.form).toBe('sentence');
  expect(voice.sentence).toBe(OLSEN_CLAIM);

  render(
    <QueryClientProvider client={new QueryClient()}>
      <LetterheadInstruments projectId="proj-1" clientProfileId={null} clientName="Olsen" voice={voice} />
    </QueryClientProvider>,
  );
  const registered = jest
    .mocked(useMobilePrimaryAction)
    .mock.calls.filter(([action]) => action?.regionKey === 'lens-band');
  expect(registered.length).toBeGreaterThan(0);
  const [action, options] = registered[registered.length - 1]!;
  expect(action?.label).toBe('File the claim');
  expect(action?.sentence).toBe(OLSEN_CLAIM);
  expect(options).toEqual({ priority: MOBILE_ACTION_PRIORITY.next });
});
