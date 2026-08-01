import { render, screen } from '@testing-library/react';
import { HouseholdChip } from '../household-chip';

jest.mock('../overlays/household-sheet', () => ({
  HouseholdSheet: () => null,
}));

describe('HouseholdChip', () => {
  it('keeps a profile-less Discovery household linked after Direction begins', () => {
    render(
      <HouseholdChip
        engagementKind="proposal"
        projectId={null}
        proposalId="proposal-1"
        clientProfileId={null}
        designerClientId="designer-client-1"
        clientName="Harper Vale"
        proposalStatus="draft"
      />,
    );

    expect(screen.getByText(/for the Vales/i)).toBeInTheDocument();
    expect(screen.queryByText(/No client linked/i)).not.toBeInTheDocument();
  });
});
