import { render, screen, cleanup } from '@testing-library/react';
import { useClient, useDesignerClientForClientUser } from '@patina/supabase';
import { BriefRecap } from './brief-recap';

jest.mock('@patina/supabase', () => ({
  useClient: jest.fn(),
  useDesignerClientForClientUser: jest.fn(),
}));
jest.mock('./brief-section', () => ({
  BriefSection: ({ leadId }: { leadId: string }) => <p>Original notes for {leadId}</p>,
}));
const client = jest.mocked(useClient);
const byProfile = jest.mocked(useDesignerClientForClientUser);

beforeEach(() => {
  jest.clearAllMocks();
  client.mockImplementation((id) => ({
    data: id ? { id, lead_id: id === 'relationship-a' ? 'lead-a' : id === 'relationship-b' ? 'lead-b' : null } : null,
    isLoading: false, isError: false,
  }) as ReturnType<typeof useClient>);
  // The defective lookup picks the newest relationship for this shared profile.
  byProfile.mockImplementation((id) => ({ data: id ? { lead_id: 'lead-b' } : null, isLoading: false }) as ReturnType<typeof useDesignerClientForClientUser>);
});

it('keeps two engagements for the same profile bound to their own original leads', () => {
  const { rerender } = render(<BriefRecap clientProfileId="same-profile" designerClientId="relationship-a" leadId={null} />);
  expect(screen.getByText('Original notes for lead-a')).toBeInTheDocument();
  expect(screen.queryByText('Original notes for lead-b')).not.toBeInTheDocument();
  rerender(<BriefRecap clientProfileId="same-profile" designerClientId="relationship-b" leadId={null} />);
  expect(screen.getByText('Original notes for lead-b')).toBeInTheDocument();
  expect(screen.queryByText('Original notes for lead-a')).not.toBeInTheDocument();
  expect(byProfile).not.toHaveBeenCalled();
});

it('resolves a no-login client through the canonical relationship', () => {
  render(<BriefRecap clientProfileId={null} designerClientId="relationship-a" leadId={null} />);
  expect(screen.getByText('Original notes for lead-a')).toBeInTheDocument();
});

it('shows missing history for a relationship without a lead, never another profile engagement', () => {
  render(<BriefRecap clientProfileId="same-profile" designerClientId="without-lead" leadId={null} />);
  expect(screen.getByText('No original brief is linked to this document.')).toBeInTheDocument();
  expect(screen.queryByText(/Original notes for/)).not.toBeInTheDocument();
});

it('keeps the explicit lead path ahead of the relationship', () => {
  render(<BriefRecap designerClientId="relationship-b" leadId="explicit-lead" />);
  expect(screen.getByText('Original notes for explicit-lead')).toBeInTheDocument();
});

it('does not infer history from a profile without a relationship or lead', () => {
  render(<BriefRecap clientProfileId="same-profile" designerClientId={null} leadId={null} />);
  expect(screen.getByText('No original brief is linked to this document.')).toBeInTheDocument();
  expect(byProfile).not.toHaveBeenCalled();
});

it('keeps relationship loading and failed reads distinct from missing history', () => {
  client.mockReturnValue({ data: null, isLoading: true, isError: false } as ReturnType<typeof useClient>);
  render(<BriefRecap designerClientId="relationship-a" leadId={null} />);
  expect(screen.getByText(/Opening the brief/)).toBeInTheDocument();
  expect(screen.queryByText(/No original brief/)).not.toBeInTheDocument();
  cleanup();
  client.mockReturnValue({ data: { lead_id: 'stale-lead' }, isLoading: false, isError: true } as ReturnType<typeof useClient>);
  render(<BriefRecap designerClientId="relationship-a" leadId={null} />);
  expect(screen.getByRole('alert')).toHaveTextContent('The original brief could not be read.');
  expect(screen.queryByText(/Original notes for/)).not.toBeInTheDocument();
});
