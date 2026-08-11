/**
 * ItemComposer — the court-party picker swap, and the contract it may not move.
 *
 * Behind `call-sheet` the gc/vendor court block renders PartyMiniRow radios
 * instead of a <select>. That is a PRESENTATION change and nothing else: the
 * same `courtPartyId` state, the same auto-select-sole-match rule, the same
 * empty-court sentence, and — the thing this file exists to prove — the same
 * submit payload. If a future edit lets the two modes disagree by one field,
 * this suite says so before the coordination flow does.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProjectParty } from '@patina/supabase';
import { composerItemTypeOrder, ItemComposer } from '../item-composer';

const createMutate = jest.fn();
const updateMutate = jest.fn();
const publishMutate = jest.fn();
const deleteMutate = jest.fn();

jest.mock('@patina/supabase', () => ({
  useCreateCoordinationItem: () => ({ mutateAsync: createMutate }),
  useUpdateCoordinationItem: () => ({ mutateAsync: updateMutate }),
  usePublishCoordinationItem: () => ({ mutateAsync: publishMutate }),
  useDeleteCoordinationItem: () => ({ mutateAsync: deleteMutate }),
}));

// The option builder is a different surface with its own suite; the composer
// only needs it to exist.
jest.mock('@/components/portal/decision-option-builder', () => ({
  emptyOption: () => ({ name: '', sort_order: 0 }),
  optionToValue: (o: unknown) => o,
  optionValueToInput: (o: unknown) => o,
  useMaterializeDraftOptions: () => async (options: unknown[]) => options,
}));

jest.mock('@/components/document/coordination/composer-option-builder', () => ({
  ComposerOptionBuilder: () => null,
}));

// The rolodex is proven in its own suite — here we only care that the composer
// opens it pre-scoped to the court being filled, and adopts what it returns.
jest.mock('@/components/document/roster/rolodex-picker', () => ({
  RolodexPicker: ({
    scopeKinds,
    onAdded,
  }: {
    scopeKinds?: string[];
    onAdded?: (name: string) => void;
  }) => (
    <div data-testid="rolodex-picker" data-scope={(scopeKinds ?? []).join(',')}>
      <button type="button" onClick={() => onAdded?.('Hector Salas')}>
        Stub add
      </button>
    </div>
  ),
}));

let mockCallSheetOn = false;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: mockCallSheetOn, isLoading: false }),
}));

// ── fixture ──────────────────────────────────────────────────────────────────

function party(over: Partial<ProjectParty> & { id: string }): ProjectParty {
  return {
    project_id: 'proj-1',
    party_kind: 'gc',
    display_name: 'Unnamed',
    company_name: null,
    email: null,
    phone: null,
    phone_e164: null,
    trade: null,
    sms_consent_status: 'not_asked',
    sms_consented_at: null,
    sms_opt_out_at: null,
    vendor_id: null,
    profile_id: null,
    studio_contact_id: null,
    show_to_client: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  } as ProjectParty;
}

const NOLAN = party({
  id: 'party-nolan',
  display_name: 'Nolan Brothers',
  company_name: 'Nolan Brothers Construction',
  trade: 'framing',
});
const REYES = party({
  id: 'party-reyes',
  display_name: 'Reyes Building Co.',
  company_name: 'Reyes Building Co.',
});
const TWO_GCS = [NOLAN, REYES];

function baseProps(parties: ProjectParty[]) {
  return {
    projectId: 'proj-1',
    designerClientId: 'dc-1',
    tasks: [],
    ffeItems: [],
    phases: [],
    parties,
    onClose: jest.fn(),
    onCreated: jest.fn(),
  };
}

const PROMPT = 'e.g. Which pendant for the entry?';

function pickGcCourt() {
  fireEvent.click(screen.getByRole('button', { name: 'GC' }));
}

function writeAndPublish() {
  fireEvent.change(screen.getByPlaceholderText(PROMPT), {
    target: { value: 'Which pendant for the entry?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
}

beforeEach(() => {
  mockCallSheetOn = false;
  createMutate.mockReset().mockResolvedValue({ id: 'item-1' });
});

// ── the frozen contract ──────────────────────────────────────────────────────

describe('ItemComposer court party — payload parity across the flag', () => {
  it('the mini-row pick and the <select> pick submit byte-identical payloads', async () => {
    // FLAG OFF — the shipped <select>.
    mockCallSheetOn = false;
    const off = render(<ItemComposer {...baseProps(TWO_GCS)} />);
    pickGcCourt();
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'party-nolan' },
    });
    writeAndPublish();
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    const offPayload = createMutate.mock.calls[0][0];
    off.unmount();

    createMutate.mockReset().mockResolvedValue({ id: 'item-1' });

    // FLAG ON — the PartyMiniRow radio list over the same array.
    mockCallSheetOn = true;
    render(<ItemComposer {...baseProps(TWO_GCS)} />);
    pickGcCourt();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Nolan Brothers/ }));
    writeAndPublish();
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    const onPayload = createMutate.mock.calls[0][0];

    expect(onPayload).toEqual(offPayload);
    expect(onPayload).toEqual(
      expect.objectContaining({
        projectId: 'proj-1',
        designerClientId: 'dc-1',
        court: 'gc',
        courtPartyId: 'party-nolan',
        status: 'pending',
      }),
    );
  });

  it('carries the same payload when nothing is picked (the Unassigned path)', async () => {
    mockCallSheetOn = false;
    const off = render(<ItemComposer {...baseProps(TWO_GCS)} />);
    pickGcCourt();
    writeAndPublish();
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    const offPayload = createMutate.mock.calls[0][0];
    off.unmount();

    createMutate.mockReset().mockResolvedValue({ id: 'item-1' });

    mockCallSheetOn = true;
    render(<ItemComposer {...baseProps(TWO_GCS)} />);
    pickGcCourt();
    writeAndPublish();
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));

    expect(createMutate.mock.calls[0][0]).toEqual(offPayload);
    expect(offPayload.courtPartyId).toBeNull();
  });

  it('re-picking the chosen mini-row clears it, the way Unassigned did', async () => {
    mockCallSheetOn = true;
    render(<ItemComposer {...baseProps(TWO_GCS)} />);
    pickGcCourt();
    const row = () => screen.getByRole('radio', { name: /Nolan Brothers/ });
    fireEvent.click(row());
    expect(row()).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(row());
    expect(row()).toHaveAttribute('aria-checked', 'false');

    writeAndPublish();
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0][0].courtPartyId).toBeNull();
  });
});

describe('ItemComposer court party — the rules that did not move', () => {
  it('retires sign-off from new choices while preserving historical draft editing', () => {
    expect(composerItemTypeOrder()).not.toContain('signoff');
    expect(
      composerItemTypeOrder({ coordination_kind: 'signoff' }),
    ).toContain('signoff');
  });

  it('auto-selects the sole match in BOTH modes', async () => {
    mockCallSheetOn = false;
    const off = render(<ItemComposer {...baseProps([NOLAN])} />);
    pickGcCourt();
    expect(screen.getByRole('combobox')).toHaveValue('party-nolan');
    off.unmount();

    mockCallSheetOn = true;
    render(<ItemComposer {...baseProps([NOLAN])} />);
    pickGcCourt();
    expect(screen.getByRole('radio', { name: /Nolan Brothers/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('renders the same empty-court sentence in BOTH modes', () => {
    // Verbatim, including the missing space after the kind — a pre-existing JSX
    // whitespace quirk in this sentence. Pinning the exact string is the point:
    // the two modes read from ONE copy path, so they cannot drift apart, and a
    // deliberate fix has to move both at once.
    const copy = 'No GCon this project yet — it’ll wait in the GC court.';

    mockCallSheetOn = false;
    const off = render(<ItemComposer {...baseProps([])} />);
    pickGcCourt();
    expect(screen.getByText(copy)).toBeInTheDocument();
    off.unmount();

    mockCallSheetOn = true;
    render(<ItemComposer {...baseProps([])} />);
    pickGcCourt();
    expect(screen.getByText(copy)).toBeInTheDocument();
  });

  it('leaves the flag-off court block a plain <select> — no radios, no rolodex', () => {
    mockCallSheetOn = false;
    render(<ItemComposer {...baseProps(TWO_GCS)} />);
    pickGcCourt();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Someone new' })).not.toBeInTheDocument();
  });
});

describe('ItemComposer court party — the way out to the rolodex', () => {
  it('opens the picker pre-scoped to the court, and adopts the party it adds', async () => {
    mockCallSheetOn = true;
    const props = baseProps(TWO_GCS);
    const { rerender } = render(<ItemComposer {...props} />);
    pickGcCourt();

    expect(screen.queryByTestId('rolodex-picker')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Someone new' }));
    expect(screen.getByTestId('rolodex-picker')).toHaveAttribute(
      'data-scope',
      'gc',
    );

    // The picker adds the party; the host's refreshed list carries it back.
    fireEvent.click(screen.getByRole('button', { name: 'Stub add' }));
    const HECTOR = party({ id: 'party-hector', display_name: 'Hector Salas' });
    rerender(<ItemComposer {...props} parties={[...TWO_GCS, HECTOR]} />);

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /Hector Salas/ })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );

    writeAndPublish();
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0][0].courtPartyId).toBe('party-hector');
  });

  it('scopes the picker to the vendor court when the vendor court is picked', () => {
    mockCallSheetOn = true;
    render(
      <ItemComposer
        {...baseProps([party({ id: 'v1', party_kind: 'vendor', display_name: 'Ainsley Textiles' })])}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Vendor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Someone new' }));
    expect(screen.getByTestId('rolodex-picker')).toHaveAttribute(
      'data-scope',
      'vendor',
    );
  });
});
