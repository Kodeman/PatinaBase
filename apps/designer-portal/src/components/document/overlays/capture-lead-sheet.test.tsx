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

  it('stacks email, phone, and project one per row at the sheet\'s width', () => {
    render(<CaptureLeadSheet open onClose={jest.fn()} />);

    // The sheet is a narrow overlay — a second column would squeeze a long
    // email or project line, so the stack stays single-column at every width.
    const fields = screen.getByTestId('lead-contact-project-fields');
    expect(fields.className).not.toContain('grid-cols-2');
    expect(screen.getByLabelText('Email')).toHaveClass('min-w-0');
    expect(screen.getByLabelText('Phone')).toHaveClass('min-w-0');
    expect(screen.getByLabelText(/The project \(one line\)/)).toHaveClass('min-w-0');
  });

  it('types the email and phone inputs so a phone keypad and autofill work', () => {
    render(<CaptureLeadSheet open onClose={jest.fn()} />);

    const email = screen.getByLabelText('Email');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('autocomplete', 'email');

    const phone = screen.getByLabelText('Phone');
    expect(phone).toHaveAttribute('type', 'tel');
    expect(phone).toHaveAttribute('autocomplete', 'tel');
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

  it('submits trimmed required values while leaving email, phone, and source optional', () => {
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
        contact_phone: undefined,
        source: undefined,
      }),
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it('submits a trimmed email and phone to their own columns', () => {
    render(<CaptureLeadSheet open onClose={jest.fn()} />);

    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: 'The Okafors' },
    });
    fireEvent.change(screen.getByLabelText(/The project \(one line\)/), {
      target: { value: 'Downtown loft refresh' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: '  okafors@email.com  ' },
    });
    fireEvent.change(screen.getByLabelText('Phone'), {
      target: { value: '  (555) 014-2200  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /begin the brief/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_email: 'okafors@email.com',
        contact_phone: '(555) 014-2200',
        // A phone no longer rides along in the Brief one-liner as prose.
        project_description: 'Downtown loft refresh',
      }),
      expect.anything(),
    );
  });

  it("gates a malformed email in the sheet's own error channel, not a native bubble", () => {
    render(<CaptureLeadSheet open onClose={jest.fn()} />);

    const email = screen.getByLabelText('Email');
    // noValidate: the browser never blocks the submit with an unstyled tooltip.
    expect(email.closest('form')).toHaveAttribute('novalidate');

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'The Okafors' } });
    fireEvent.change(screen.getByLabelText(/The project \(one line\)/), {
      target: { value: 'Downtown loft refresh' },
    });
    fireEvent.change(email, { target: { value: '(555) 014-2200' } });
    fireEvent.click(screen.getByRole('button', { name: /begin the brief/i }));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/it needs an @ and a domain/i)).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAttribute('aria-describedby', 'capture-lead-email-error');

    // Editing the address takes the notice away, and the capture goes through.
    fireEvent.change(email, { target: { value: 'okafors@email.com' } });
    expect(screen.queryByText(/it needs an @ and a domain/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /begin the brief/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
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
