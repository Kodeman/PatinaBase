import { fireEvent, render, screen } from '@testing-library/react';
import { CaptureLeadSheet } from './capture-lead-sheet';

const mutate = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  useCreateLead: () => ({ mutate, isPending: false }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

describe('CaptureLeadSheet layout', () => {
  beforeEach(() => {
    mutate.mockReset();
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
