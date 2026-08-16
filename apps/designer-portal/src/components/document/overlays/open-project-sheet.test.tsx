import { fireEvent, render, screen } from '@testing-library/react';
import { OpenProjectSheet } from './open-project-sheet';

const mutate = jest.fn();
let mockOrganizations: Array<Record<string, unknown>> = [];
let mockClients: Array<Record<string, unknown>> = [];

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/hooks/use-project-lifecycle', () => ({
  useOpenProjectDirect: () => ({ mutate, isPending: false }),
}));

jest.mock('@patina/supabase', () => ({
  useOrganizations: () => ({ data: mockOrganizations }),
  useClients: () => ({ data: mockClients }),
}));

jest.mock('@/components/portal/client-picker', () => ({
  ClientPicker: ({
    clientOptions,
    onChange,
    onRelationshipChange,
    disabled,
  }: {
    clientOptions: Array<{ id: string; client_id: string | null }>;
    onChange: (id: string | null) => void;
    onRelationshipChange: (id: string | null) => void;
    disabled: boolean;
  }) => (
    <span>
      <button type="button" disabled={disabled}>Choose household</button>
      {clientOptions.map((client) => (
        <button
          key={client.id}
          type="button"
          onClick={() => {
            onChange(client.client_id);
            onRelationshipChange(client.id);
          }}
        >
          Choose relationship {client.id}
        </button>
      ))}
    </span>
  ),
}));

// The Folio-backed trigger is proven in its own suite (date-text-input.test.tsx);
// here we only need a controlled stand-in so the sheet's own plumbing (default,
// change, clear, AND the validity gate it wires to submit) can be exercised
// directly — the real trigger can never itself go invalid, but the prop still
// has to reach the sheet's submit gate correctly.
jest.mock('../date-text-input', () => ({
  DateTextInput: ({
    value,
    onChange,
    ariaLabel,
    onValidityChange,
  }: {
    value: string | null;
    onChange: (value: string | null) => void;
    ariaLabel?: string;
    onValidityChange?: (valid: boolean) => void;
  }) => (
    <span>
      <input
        type="text"
        aria-label={ariaLabel}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
      />
      <button type="button" aria-label={`${ariaLabel} invalid`} onClick={() => onValidityChange?.(false)}>
        Mark invalid
      </button>
      <button type="button" aria-label={`${ariaLabel} valid`} onClick={() => onValidityChange?.(true)}>
        Mark valid
      </button>
    </span>
  ),
}));

describe('OpenProjectSheet date validity', () => {
  beforeEach(() => {
    mutate.mockReset();
    mockOrganizations = [
      {
        id: 'studio-1',
        name: 'Studio One',
        type: 'design_studio',
        status: 'active',
        membership: { status: 'active', role: 'member' },
      },
    ];
    mockClients = [];
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: jest.fn(() => 'project-1'),
    });
  });

  it('opens a project with no start date when the date is cleared', () => {
    render(<OpenProjectSheet open onClose={jest.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Lake house refresh' },
    });

    // The Folio can only ever commit a whole calendar date or clear to
    // nothing — an impossible date like Feb 30 has no pathway into state at
    // all, so the case worth proving is that clearing opens the project with
    // no start date rather than blocking it.
    const start = screen.getByLabelText('Start date');
    fireEvent.change(start, { target: { value: '' } });
    expect(start).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: /open the project/i }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        title: 'Lake house refresh',
        studioId: 'studio-1',
        designerClientId: null,
        startDate: null,
      }),
    );
  });

  it('requires an explicit workspace and binds the exact same-client relationship', () => {
    mockOrganizations = [
      {
        id: 'studio-1',
        name: 'Studio One',
        type: 'design_studio',
        status: 'active',
        membership: { status: 'active', role: 'member' },
      },
      {
        id: 'studio-2',
        name: 'Studio Two',
        type: 'design_studio',
        status: 'active',
        membership: { status: 'active', role: 'owner' },
      },
    ];
    mockClients = [
      { id: 'relationship-1', client_id: 'client-1', studio_id: 'studio-1' },
      { id: 'relationship-2', client_id: 'client-1', studio_id: 'studio-2' },
    ];

    render(<OpenProjectSheet open onClose={jest.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Two-studio project' },
    });

    const submit = screen.getByRole('button', { name: /open the project/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByRole('combobox', { name: 'Studio workspace' }), {
      target: { value: 'studio-2' },
    });
    expect(screen.queryByText('Choose relationship relationship-1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Choose relationship relationship-2'));
    fireEvent.click(submit);

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        studioId: 'studio-2',
        designerClientId: 'relationship-2',
      }),
      expect.any(Object),
    );
  });

  it('carries a real start date through to the mutation', () => {
    render(<OpenProjectSheet open onClose={jest.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Lake house refresh' },
    });
    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2027-03-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: /open the project/i }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual(
      expect.objectContaining({ startDate: '2027-03-01' }),
    );
  });

  it('disables opening the project while the date reports invalid, and re-enables once it reports valid', () => {
    render(<OpenProjectSheet open onClose={jest.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Lake house refresh' },
    });
    const submit = screen.getByRole('button', { name: /open the project/i });
    expect(submit).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Start date invalid' }));
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Start date valid' }));
    expect(submit).not.toBeDisabled();
  });
});
