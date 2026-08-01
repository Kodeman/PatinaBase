import { render, screen } from '@testing-library/react';
import { CaptureLeadSheet } from './capture-lead-sheet';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  useCreateLead: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

describe('CaptureLeadSheet layout', () => {
  it('gives long contact and project values the full sheet width', () => {
    render(<CaptureLeadSheet open onClose={jest.fn()} />);

    const fields = screen.getByTestId('lead-contact-project-fields');
    expect(fields.className).not.toContain('grid-cols-2');
    expect(screen.getByLabelText('Contact')).toHaveClass('min-w-0');
    expect(screen.getByLabelText('The project (one line)')).toHaveClass('min-w-0');
  });
});
