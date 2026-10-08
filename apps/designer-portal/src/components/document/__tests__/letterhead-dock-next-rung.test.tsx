/**
 * US-19 FR6 F6-6 (walk D13, `one-voice`) — at 390 the band may print its
 * `sentence` rung with no act; the dock's centre still prints Next's act,
 * because the letterhead registers `voice.next`, never the printed rung.
 *
 * The mocking shape is letterhead-compose-landing.test.tsx's.
 */
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { installReading } from '@/lib/document/install-reading';
import {
  deriveLensBand,
  type LensBandInput,
  type LensOwnAct,
  type LensVoice,
} from '@/lib/document/lens-band-derivation';
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

const OCT_8 = new Date('2026-10-08T12:00:00');

const phoneVoice = (over: Partial<LensBandInput>) =>
  deriveLensBand({
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
    now: OCT_8,
    ...over,
  }).voice;

/** The act the band registers with the dock's centre, and its options. */
const dockOf = (voice: LensVoice, clientName: string) => {
  jest.mocked(useMobilePrimaryAction).mockClear();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LetterheadInstruments projectId="proj-1" clientProfileId={null} clientName={clientName} voice={voice} />
    </QueryClientProvider>,
  );
  const registered = jest
    .mocked(useMobilePrimaryAction)
    .mock.calls.filter(([action]) => action?.regionKey === 'lens-band');
  expect(registered.length).toBeGreaterThan(0);
  return registered[registered.length - 1]!;
};

const ASK: LensOwnAct = {
  key: 'own:ask',
  label: 'Ask the maker for a date',
  targetId: 'document-act-install-reading',
  tier: 'scored',
  sentence: null,
  onAct: jest.fn(),
};

it('Olsen at 390: the band prints the long sentence alone; the dock centre is still File the claim', () => {
  const voice = phoneVoice({
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
  expect(voice.rungs[0]?.alone).toBe('long');
  expect(voice.sentence).toBe(OLSEN_CLAIM);

  const [action, options] = dockOf(voice, 'Olsen');
  expect(action?.label).toBe('File the claim');
  expect(action?.sentence).toBe(OLSEN_CLAIM);
  expect(options).toEqual({ priority: MOBILE_ACTION_PRIORITY.next });
});

// FR7 F7-4 (D13) — the phone form alone in the band; the dock carries the act.
it('Wren held at 390: the band prints the phone form alone; the dock centre is Open the held draft', () => {
  const reading = installReading(
    [
      {
        id: 'ffe-ladder',
        name: 'Library ladder and rail',
        status: 'ordered',
        purchase_order: { confirmed_eta: '2026-10-03' },
      },
    ],
    OCT_8,
    false,
  );
  const voice = phoneVoice({
    spreadKind: 'install',
    household: 'Wren',
    jobName: 'Wren Library',
    ownAct: ASK,
    installReading: reading,
    needs: [
      {
        key: 'draft-0',
        kind: 'po_unacknowledged',
        text: 'Arrival date request to the maker drafted',
        actionLabel: 'Review and send',
        onAct: jest.fn(),
        urgent: true,
        owner: 'designer',
        draft: { kind: 'maker_eta_request', status: 'awaiting_review', ffeItemId: 'ffe-ladder' },
      },
    ],
  });
  expect(voice.form).toBe('sentence');
  expect(voice.rungs[0]?.alone).toBe('phone');
  expect(voice.sentence).toBe("Library ladder and rail isn't here.");

  const [action] = dockOf(voice, 'Wren');
  expect(action?.label).toBe('Open the held draft');
});

it('Cedar at 390: the band prints the repair’s phone form alone; the dock centre is Add the maker', () => {
  const reading = installReading(
    [{ id: 'ffe-1', name: 'Side table, walnut', status: 'ordered', purchase_order: null }],
    OCT_8,
    false,
  )!;
  const voice = phoneVoice({
    spreadKind: 'install',
    household: 'Nora Ellison',
    jobName: 'Cedar Lane Study',
    installReading: reading,
    ownAct: {
      key: 'own:document-act-install-reading',
      label: 'Add the maker',
      targetId: 'document-act-install-reading',
      tier: 'scored',
      sentence: reading.sentence,
      shortSentence: reading.shortSentence ?? '',
      phoneSentence: reading.phoneSentence,
      onAct: jest.fn(),
    },
  });
  expect(voice.form).toBe('sentence');
  expect(voice.rungs[0]?.alone).toBe('phone');
  expect(voice.sentence).toBe("Side table isn't here.");

  const [action] = dockOf(voice, 'Nora Ellison');
  expect(action?.label).toBe('Add the maker');
});
