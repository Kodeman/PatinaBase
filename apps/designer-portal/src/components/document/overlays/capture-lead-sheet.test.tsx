import { fireEvent, render, screen } from '@testing-library/react';
import { CaptureLeadSheet } from './capture-lead-sheet';

const mutate = jest.fn();
let mockOrganizations: Array<Record<string, unknown>> = [];

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  useCreateLead: () => ({ mutate, isPending: false }),
  useOrganizations: () => ({ data: mockOrganizations }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

describe('CaptureLeadSheet layout', () => {
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
  });

  it('gives long contact and project values the full sheet width', () => {
    render(<CaptureLeadSheet open onClose={jest.fn()} />);

    const fields = screen.getByTestId('lead-contact-project-fields');
    expect(fields.className).not.toContain('grid-cols-2');
    expect(screen.getByLabelText('Contact')).toHaveClass('min-w-0');
    expect(screen.getByLabelText(/The project \(one line\)/)).toHaveClass('min-w-0');
  });

  it('keeps Begin disabled until a nonblank name and project note exist', () => {
    render(<CaptureLeadSheet open onClose={jest.fn()} />);

    const submit = screen.getByRole('button', { name: /begin the brief/i });
    expect(submit).toBeDisabled();
    expect(screen.getByText(/add a name and one-line project note to begin/i)).toHaveAttribute(
      'role',
      'status',
    );

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText(/The project \(one line\)/), {
      target: { value: 'Kitchen refresh' },
    });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'The Okafors' } });
    expect(submit).toBeEnabled();
  });

  it('submits trimmed required values while leaving contact and source optional', () => {
    render(<CaptureLeadSheet open onClose={jest.fn()} />);

    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: '  The Okafors  ' },
    });
    fireEvent.change(screen.getByLabelText(/The project \(one line\)/), {
      target: { value: '  Downtown loft refresh  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /begin the brief/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        studio_id: 'studio-1',
        contact_name: 'The Okafors',
        project_description: 'Downtown loft refresh',
        contact_email: undefined,
        source: undefined,
      }),
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it('requires an explicit workspace when the designer has two eligible studios', () => {
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
    render(<CaptureLeadSheet open onClose={jest.fn()} />);

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'The Okafors' } });
    fireEvent.change(screen.getByLabelText(/The project \(one line\)/), {
      target: { value: 'Kitchen refresh' },
    });
    const submit = screen.getByRole('button', { name: /begin the brief/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByRole('combobox', { name: 'Studio workspace' }), {
      target: { value: 'studio-2' },
    });
    fireEvent.click(submit);
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ studio_id: 'studio-2' }),
      expect.any(Object),
    );
  });

  it('announces field-specific validation when a required value is left blank', () => {
    render(<CaptureLeadSheet open onClose={jest.fn()} />);

    const name = screen.getByLabelText(/Name/);
    fireEvent.focus(name);
    fireEvent.blur(name);

    expect(screen.getByRole('alert', { name: '' })).toHaveTextContent(
      /add the client or household name/i,
    );
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAttribute('aria-describedby', 'capture-lead-name-error');
  });
});
