/**
 * BriefScanStrip — door-navigation intent (I74a / W2-T5). `@patina/supabase`
 * is not tsconfig-paths-aliased in this app, so `jest.mock('@patina/supabase', ...)`
 * fires cleanly (patina-testing Trap 1 doesn't apply here — see
 * decisions-panel.test.tsx for the same pattern). Only `useLeadScans` +
 * `next/navigation`'s router need mocking; the component takes no other data.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { useLeadScans } from '@patina/supabase';
import { BriefScanStrip } from '../brief-scan-strip';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@patina/supabase', () => ({
  useLeadScans: jest.fn(),
}));

const mockUseLeadScans = useLeadScans as jest.Mock;

describe('BriefScanStrip — scan tiles navigate to the Room View', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUseLeadScans.mockReset();
  });

  it('a scan tile pushes /room/<scanId>?from=document', () => {
    mockUseLeadScans.mockReturnValue({
      data: [
        {
          id: 'row-1',
          scan_id: 'scan-abc',
          is_primary: true,
          scan: { name: 'Kitchen scan', thumbnail_url: 'https://example.com/thumb.jpg' },
        },
      ],
    });
    render(<BriefScanStrip leadId="lead-1" />);

    fireEvent.click(screen.getByTitle('Kitchen scan'));
    expect(mockPush).toHaveBeenCalledWith('/room/scan-abc?from=document');
  });

  it('renders nothing (and never navigates) when the lead has no scans', () => {
    mockUseLeadScans.mockReturnValue({ data: [] });
    const { container } = render(<BriefScanStrip leadId="lead-1" />);
    expect(container).toBeEmptyDOMElement();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
