/**
 * C-02 ship-to: the explicit choice (studio / job site / somewhere else) with
 * nothing preselected, the one-line studio address, the Review step showing
 * the choice, and the retired hardcoded placeholder gone from the source.
 */

import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('@patina/supabase', () => ({
  useOrganizations: () => ({ data: [] }),
  useProject: () => ({ data: undefined }),
}));

import {
  EMPTY_SHIP_TO,
  ShipToChoice,
  formatStudioAddress,
  resolveShipTo,
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

describe('resolveShipTo', () => {
  const addresses = { studioAddress: STUDIO, siteAddress: SITE };

  it('is null until a usable choice is made', () => {
    expect(resolveShipTo(EMPTY_SHIP_TO, addresses)).toBeNull();
    expect(resolveShipTo({ kind: 'other', otherText: '   ' }, addresses)).toBeNull();
  });

  it('returns the text the chosen option shows', () => {
    expect(resolveShipTo({ kind: 'studio', otherText: '' }, addresses)).toBe(STUDIO);
    expect(resolveShipTo({ kind: 'site', otherText: '' }, addresses)).toBe(SITE);
    expect(resolveShipTo({ kind: 'other', otherText: ' Dock 4, Racine ' }, addresses)).toBe(
      'Dock 4, Racine',
    );
  });
});

describe('ShipToChoice', () => {
  function renderChoice(addresses: { studioAddress: string | null; siteAddress: string | null }) {
    const onChange = jest.fn();
    let value: ShipToSelection = EMPTY_SHIP_TO;
    const view = render(<ShipToChoice {...addresses} value={value} onChange={onChange} />);
    onChange.mockImplementation((next: ShipToSelection) => {
      value = next;
      view.rerender(<ShipToChoice {...addresses} value={value} onChange={onChange} />);
    });
    return { onChange };
  }

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
