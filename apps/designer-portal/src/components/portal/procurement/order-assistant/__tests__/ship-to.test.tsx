/**
 * C-02 ship-to: the explicit choice (studio / job site / somewhere else) with
 * nothing preselected, the one-line studio address, the Review step showing
 * the choice, and the retired hardcoded placeholder gone from the source.
 */

import fs from 'fs';
import path from 'path';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';

const mockSources: {
  orgs: Array<{ id: string; address: unknown }>;
  project: Record<string, unknown> | undefined;
  ownerStudioId: string | null;
  locations: Array<Record<string, unknown>>;
} = { orgs: [], project: undefined, ownerStudioId: null, locations: [] };
const mockStudioIdentityCalls: Array<Record<string, unknown>> = [];
const mockLocationCalls: Array<string | null | undefined> = [];
const mockSetShipTo = jest.fn();
const mockSetShipToLocation = jest.fn();

jest.mock('@patina/supabase', () => ({
  useOrganizations: () => ({ data: mockSources.orgs }),
  useProject: () => ({ data: mockSources.project }),
  useStudioIdentity: (params: Record<string, unknown>) => {
    mockStudioIdentityCalls.push(params);
    return {
      data: params.designerId ? { studioId: mockSources.ownerStudioId } : undefined,
    };
  },
  useStudioLocations: (orgId: string | null | undefined) => {
    mockLocationCalls.push(orgId);
    return { data: orgId ? mockSources.locations : undefined };
  },
  useSetPurchaseOrderShipTo: () => ({ mutateAsync: mockSetShipTo, isPending: false }),
  useSetPurchaseOrderShipToLocation: () => ({
    mutateAsync: mockSetShipToLocation,
    isPending: false,
  }),
}));

import {
  EMPTY_SHIP_TO,
  ShipToChoice,
  formatLocation,
  formatStudioAddress,
  orderShipToLocations,
  resolveShipTo,
  useSaveShipTo,
  useShipToAddresses,
  type ShipToLocation,
  type ShipToSelection,
} from '../ship-to-choice';
import { StepReview } from '../step-review';

const STUDIO = '1 Main St, Madison, WI 53703';
const SITE = '42 Lake Rd, Middleton, WI 53562';

describe('formatStudioAddress', () => {
  it('formats organizations.address on one line', () => {
    expect(
      formatStudioAddress({ street: '1 Main St', city: 'Madison', state: 'WI', zip: '53703' }),
    ).toBe(STUDIO);
    expect(
      formatStudioAddress({ street: ' 9 Rue Neuve ', city: 'Lyon', zip: '69002', country: 'FR' }),
    ).toBe('9 Rue Neuve, Lyon, 69002, FR');
  });

  it('is null when nothing usable is on file', () => {
    expect(formatStudioAddress(null)).toBeNull();
    expect(formatStudioAddress({})).toBeNull();
    expect(formatStudioAddress({ street: '  ', city: '' })).toBeNull();
    expect(formatStudioAddress(42)).toBeNull();
  });
});

const BADGER: ShipToLocation = {
  id: 'loc-badger',
  kind: 'receiver',
  label: 'Badger Receiving',
  address: { street: '7 Dock Rd', city: 'Madison', state: 'WI', zip: '53704' },
  is_default_receiver: true,
};
const ACME_RCV: ShipToLocation = {
  id: 'loc-acme',
  kind: 'receiver',
  label: 'Acme Freight',
  address: null,
  is_default_receiver: false,
};
const WORKROOM: ShipToLocation = {
  id: 'loc-workroom',
  kind: 'workroom',
  label: 'Able Workroom',
  address: { city: 'Verona', state: 'WI' },
  is_default_receiver: false,
};

describe('resolveShipTo', () => {
  const addresses = { locations: [BADGER], studioAddress: STUDIO, siteAddress: SITE };

  it('is null until a usable choice is made', () => {
    expect(resolveShipTo(EMPTY_SHIP_TO, addresses)).toBeNull();
    expect(resolveShipTo({ kind: 'other', otherText: '   ' }, addresses)).toBeNull();
    expect(
      resolveShipTo({ kind: 'location', otherText: '', locationId: 'gone' }, addresses),
    ).toBeNull();
  });

  it('returns the text the chosen option shows', () => {
    expect(resolveShipTo({ kind: 'studio', otherText: '' }, addresses)).toBe(STUDIO);
    expect(resolveShipTo({ kind: 'site', otherText: '' }, addresses)).toBe(SITE);
    expect(resolveShipTo({ kind: 'other', otherText: ' Dock 4, Racine ' }, addresses)).toBe(
      'Dock 4, Racine',
    );
    expect(
      resolveShipTo({ kind: 'location', otherText: '', locationId: 'loc-badger' }, addresses),
    ).toBe('Badger Receiving, 7 Dock Rd, Madison, WI 53704');
  });

  it('formats a location with no address as its label', () => {
    expect(formatLocation(ACME_RCV)).toBe('Acme Freight');
  });
});

describe('orderShipToLocations', () => {
  it('puts receivers first and keeps the hook order within each group', () => {
    expect(orderShipToLocations([WORKROOM, BADGER, ACME_RCV]).map((l) => l.id)).toEqual([
      'loc-badger',
      'loc-acme',
      'loc-workroom',
    ]);
  });
});

describe('useSaveShipTo', () => {
  beforeEach(() => {
    mockSetShipTo.mockReset().mockResolvedValue({ id: 'po-1' });
    mockSetShipToLocation.mockReset().mockResolvedValue({ id: 'po-1' });
  });

  it('saves a location through set_purchase_order_ship_to_location with its id', async () => {
    const { result } = renderHook(() => useSaveShipTo());
    await result.current.save(
      'po-1',
      { kind: 'location', otherText: '', locationId: 'loc-badger' },
      'Badger Receiving, 7 Dock Rd',
    );
    expect(mockSetShipToLocation).toHaveBeenCalledWith({
      purchaseOrderId: 'po-1',
      locationId: 'loc-badger',
    });
    expect(mockSetShipTo).not.toHaveBeenCalled();
  });

  it('saves any other choice as text', async () => {
    const { result } = renderHook(() => useSaveShipTo());
    await result.current.save('po-1', { kind: 'site', otherText: '' }, SITE);
    expect(mockSetShipTo).toHaveBeenCalledWith({ purchaseOrderId: 'po-1', shipTo: SITE });
    expect(mockSetShipToLocation).not.toHaveBeenCalled();
  });
});

describe('useShipToAddresses · "The studio" is the project studio (F11)', () => {
  const ADDR_OTHER = { street: '9 Elm St', city: 'Racine', state: 'WI', zip: '53403' };
  const ADDR_PROJECT = { street: '1 Main St', city: 'Madison', state: 'WI', zip: '53703' };

  beforeEach(() => {
    // The caller's FIRST org is never the project's studio here.
    mockSources.orgs = [
      { id: 'org-other', address: ADDR_OTHER },
      { id: 'org-project', address: ADDR_PROJECT },
    ];
    mockSources.project = undefined;
    mockSources.ownerStudioId = null;
    mockSources.locations = [];
    mockStudioIdentityCalls.length = 0;
    mockLocationCalls.length = 0;
  });

  it('uses the address of projects.studio_id, not the first org', () => {
    mockSources.project = { studio_id: 'org-project', designer_id: 'owner-1', site_address: SITE };
    const { result } = renderHook(() => useShipToAddresses('project-1'));
    expect(result.current).toEqual({ locations: [], studioAddress: STUDIO, siteAddress: SITE });
    // studio_id is on file, so the owner fallback is never asked.
    expect(mockStudioIdentityCalls.every((p) => !p.designerId)).toBe(true);
  });

  it("falls back to the owner's primary studio when studio_id is null", () => {
    mockSources.project = { studio_id: null, designer_id: 'owner-1', site_address: null };
    mockSources.ownerStudioId = 'org-project';
    const { result } = renderHook(() => useShipToAddresses('project-1'));
    expect(mockStudioIdentityCalls).toContainEqual({ designerId: 'owner-1' });
    expect(result.current.studioAddress).toBe(STUDIO);
  });

  it('hides the studio when that studio has no address on file', () => {
    mockSources.orgs = [
      { id: 'org-other', address: ADDR_OTHER },
      { id: 'org-project', address: null },
    ];
    mockSources.project = { studio_id: 'org-project', designer_id: 'owner-1', site_address: null };
    const { result } = renderHook(() => useShipToAddresses('project-1'));
    expect(result.current.studioAddress).toBeNull();
  });

  it("reads the project studio's locations, receivers first", () => {
    mockSources.project = { studio_id: 'org-project', designer_id: 'owner-1', site_address: null };
    mockSources.locations = [WORKROOM, BADGER];
    const { result } = renderHook(() => useShipToAddresses('project-1'));
    expect(mockLocationCalls).toContain('org-project');
    expect(mockLocationCalls).not.toContain('org-other');
    expect(result.current.locations.map((l) => l.id)).toEqual(['loc-badger', 'loc-workroom']);
  });

  it('hides the studio when no studio resolves, and while the project loads', () => {
    mockSources.project = { studio_id: null, designer_id: 'owner-1', site_address: null };
    expect(renderHook(() => useShipToAddresses('project-1')).result.current.studioAddress).toBeNull();
    mockSources.project = undefined;
    expect(renderHook(() => useShipToAddresses('project-1')).result.current.studioAddress).toBeNull();
  });
});

describe('ShipToChoice', () => {
  function renderChoice(
    addresses: { studioAddress: string | null; siteAddress: string | null },
    locations: ShipToLocation[] = [],
  ) {
    const onChange = jest.fn();
    let value: ShipToSelection = EMPTY_SHIP_TO;
    const props = { ...addresses, locations };
    const view = render(<ShipToChoice {...props} value={value} onChange={onChange} />);
    onChange.mockImplementation((next: ShipToSelection) => {
      value = next;
      view.rerender(<ShipToChoice {...props} value={value} onChange={onChange} />);
    });
    return { onChange };
  }

  it('lists studio locations first, the default receiver marked, nothing preselected', () => {
    renderChoice({ studioAddress: STUDIO, siteAddress: SITE }, [BADGER, ACME_RCV, WORKROOM]);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(6);
    radios.forEach((r) => expect(r).not.toBeChecked());
    const names = radios.map((r) => r.closest('label')?.textContent ?? '');
    expect(names[0]).toMatch(/^Badger Receiving · Default receiver7 Dock Rd/);
    expect(names[1]).toBe('Acme Freight');
    expect(names[2]).toMatch(/^Able Workroom/);
    expect(names[3]).toMatch(/^The studio/);
    expect(names[4]).toMatch(/^The job site/);
    expect(names[5]).toBe('Somewhere else');
    expect(screen.getAllByText(/Default receiver/)).toHaveLength(1);
  });

  it('chooses a location by id, and only that one reads checked', () => {
    const { onChange } = renderChoice({ studioAddress: STUDIO, siteAddress: null }, [
      BADGER,
      ACME_RCV,
    ]);
    fireEvent.click(screen.getByRole('radio', { name: /Acme Freight/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      kind: 'location',
      otherText: '',
      locationId: 'loc-acme',
    });
    expect(screen.getByRole('radio', { name: /Acme Freight/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Badger Receiving/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /The studio/ }));
    expect(screen.getByRole('radio', { name: /Acme Freight/ })).not.toBeChecked();
  });

  it('renders the three choices with none selected', () => {
    renderChoice({ studioAddress: STUDIO, siteAddress: SITE });
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    radios.forEach((r) => expect(r).not.toBeChecked());
    expect(screen.getByRole('radio', { name: /the studio/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /the job site/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Somewhere else' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Ship-to address')).not.toBeInTheDocument();
  });

  it('hides the studio option with no studio address, and the job site with no site address', () => {
    renderChoice({ studioAddress: null, siteAddress: SITE });
    expect(screen.queryByRole('radio', { name: /the studio/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('hides the job-site option with no site address', () => {
    renderChoice({ studioAddress: STUDIO, siteAddress: null });
    expect(screen.queryByRole('radio', { name: /the job site/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('opens the free-text field for "Somewhere else"', () => {
    const { onChange } = renderChoice({ studioAddress: null, siteAddress: null });
    fireEvent.click(screen.getByRole('radio', { name: 'Somewhere else' }));
    fireEvent.change(screen.getByLabelText('Ship-to address'), {
      target: { value: 'Dock 4, Racine' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'other', otherText: 'Dock 4, Racine' });
  });
});

describe('StepReview ship-to line', () => {
  const props = {
    vendor: { id: 'v', name: 'Acme', default_payment_terms: null },
    ffeItems: [{ id: 'i', name: 'Sofa', line_total_cents: 100 }],
    copyState: 'idle' as const,
    onCopyDetails: jest.fn(),
  };

  it('shows the chosen ship-to', () => {
    render(<StepReview {...props} shipTo={STUDIO} />);
    expect(screen.getByText(`Ship to: ${STUDIO}`)).toBeInTheDocument();
  });

  it('points at the Details step before a choice is made', () => {
    render(<StepReview {...props} shipTo={null} />);
    expect(screen.getByText('Ship to: chosen in Order details')).toBeInTheDocument();
  });
});

describe('the hardcoded ship-to placeholder', () => {
  it('appears nowhere in the Order Assistant or PoPreview source', () => {
    const dir = path.resolve(__dirname, '..');
    const files = [
      ...fs
        .readdirSync(dir)
        .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
        .map((f) => path.join(dir, f)),
      path.resolve(__dirname, '../../../../document/po-preview.tsx'),
    ];
    expect(files.length).toBeGreaterThan(5);
    // Assembled so this file never matches itself.
    const banned = ['SHIP_TO_' + 'PLACEHOLDER', 'Middlewest Studio ' + '· Madison'];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      for (const needle of banned) expect(source).not.toContain(needle);
    }
  });
});
