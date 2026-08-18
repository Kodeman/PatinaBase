import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  useCreateOrganization,
  useLeaveOrganization,
  useOrganizationMembers,
  useOrganizations,
  useProjects,
  useRemoveMember,
  useStudioBillingSettings,
  useStudioContacts,
  useTransferOrganizationOwnership,
  useUpdateMemberRole,
  useUpdateOrganization,
  useUpdateStudioBillingSettings,
} from '@patina/supabase';
import { AccountStudioPage } from '../account-studio-page';

jest.mock('@patina/supabase', () => ({
  useCreateOrganization: jest.fn(),
  useLeaveOrganization: jest.fn(),
  useOrganizationMembers: jest.fn(),
  useOrganizations: jest.fn(),
  useProjects: jest.fn(),
  useRemoveMember: jest.fn(),
  useStudioBillingSettings: jest.fn(),
  useStudioContacts: jest.fn(),
  useTransferOrganizationOwnership: jest.fn(),
  useUpdateMemberRole: jest.fn(),
  useUpdateOrganization: jest.fn(),
  useUpdateStudioBillingSettings: jest.fn(),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'owner-user' } }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

jest.mock('@/lib/analytics/studio-events', () => ({
  studioEvents: { created: jest.fn() },
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

jest.mock('../studio-invite-modal', () => ({
  StudioInviteModal: () => null,
}));

jest.mock('../studio-logo-upload-field', () => ({
  StudioLogoUploadField: () => null,
}));

jest.mock('../studio-setup-checklist', () => ({
  StudioSetupChecklist: () => null,
}));

jest.mock('../member-title-line', () => ({
  MemberTitleLine: () => null,
}));

jest.mock('../../people/directory/rolodex-seed-sheet', () => ({
  RolodexSeedSheet: () => null,
}));

const mockUseOrganizations = useOrganizations as jest.Mock;
const mockUseOrganizationMembers = useOrganizationMembers as jest.Mock;
const mockUseProjects = useProjects as jest.Mock;
const mockUseStudioContacts = useStudioContacts as jest.Mock;
const mockUseStudioBillingSettings = useStudioBillingSettings as jest.Mock;
const mockUseCreateOrganization = useCreateOrganization as jest.Mock;
const mockUseUpdateOrganization = useUpdateOrganization as jest.Mock;
const mockUseUpdateMemberRole = useUpdateMemberRole as jest.Mock;
const mockUseRemoveMember = useRemoveMember as jest.Mock;
const mockUseLeaveOrganization = useLeaveOrganization as jest.Mock;
const mockUseTransferOrganizationOwnership =
  useTransferOrganizationOwnership as jest.Mock;
const mockUseUpdateStudioBillingSettings =
  useUpdateStudioBillingSettings as jest.Mock;

const updateMemberRole = jest.fn();
const transferOwnership = jest.fn();
const removeMembership = jest.fn();

function mutation(mutate = jest.fn()) {
  return {
    mutate,
    isPending: false,
    isError: false,
    error: null,
  };
}

function organization(role: 'owner' | 'admin') {
  return {
    id: 'studio-1',
    type: 'design_studio',
    name: 'Test Studio',
    slug: 'test-studio',
    logo_url: null,
    website: null,
    email: null,
    phone: null,
    address: null,
    created_at: '2026-01-01T00:00:00.000Z',
    rolodex_seed_skipped_at: null,
    membership: { role },
  };
}

function organizationMembers(selfRole: 'owner' | 'admin') {
  return [
    {
      id: 'membership-self',
      user_id: 'owner-user',
      role: selfRole,
      status: 'active',
      job_title: null,
      profiles: {
        display_name: 'Current Owner',
        email: 'owner@test.invalid',
      },
    },
    {
      id: 'membership-co-owner',
      user_id: 'co-owner-user',
      role: 'owner',
      status: 'active',
      job_title: null,
      profiles: {
        display_name: 'Co Owner',
        email: 'co-owner@test.invalid',
      },
    },
    {
      id: 'membership-member',
      user_id: 'member-user',
      role: 'member',
      status: 'active',
      job_title: null,
      profiles: {
        display_name: 'Team Member',
        email: 'member@test.invalid',
      },
    },
  ];
}

beforeEach(() => {
  mockUseOrganizations.mockReturnValue({
    data: [organization('owner')],
    isLoading: false,
  });
  mockUseOrganizationMembers.mockReturnValue({
    data: organizationMembers('owner'),
  });
  mockUseProjects.mockReturnValue({ data: [] });
  mockUseStudioContacts.mockReturnValue({ data: [] });
  mockUseStudioBillingSettings.mockReturnValue({ data: undefined });
  mockUseCreateOrganization.mockReturnValue(mutation());
  mockUseUpdateOrganization.mockReturnValue(mutation());
  mockUseUpdateMemberRole.mockReturnValue(mutation(updateMemberRole));
  mockUseRemoveMember.mockReturnValue(mutation(removeMembership));
  mockUseLeaveOrganization.mockReturnValue(mutation());
  mockUseTransferOrganizationOwnership.mockReturnValue(
    mutation(transferOwnership),
  );
  mockUseUpdateStudioBillingSettings.mockReturnValue(mutation());
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AccountStudioPage owner transitions', () => {
  it('omits Owner from direct role updates and exposes no demotion control for an owner row', () => {
    render(<AccountStudioPage />);

    expect(
      screen.queryByRole('combobox', { name: 'Role for Co Owner' }),
    ).not.toBeInTheDocument();
    const coOwnerRow = screen.getByText('Co Owner').closest('li');
    expect(coOwnerRow).not.toBeNull();
    expect(
      within(coOwnerRow as HTMLElement).queryByRole('button', {
        name: 'Remove',
      }),
    ).not.toBeInTheDocument();

    const memberRole = screen.getByRole('combobox', {
      name: 'Role for Team Member',
    });
    expect(
      within(memberRole).queryByRole('option', { name: 'Owner' }),
    ).not.toBeInTheDocument();
    expect(
      within(memberRole).getByRole('option', { name: 'Admin' }),
    ).toBeInTheDocument();
    expect(
      within(memberRole).getByRole('option', { name: 'Member' }),
    ).toBeInTheDocument();

    fireEvent.change(memberRole, { target: { value: 'admin' } });
    expect(updateMemberRole).toHaveBeenCalledWith({
      memberId: 'membership-member',
      role: 'admin',
    });

    updateMemberRole.mockClear();
    const forgedOwnerOption = document.createElement('option');
    forgedOwnerOption.value = 'owner';
    forgedOwnerOption.textContent = 'Owner';
    memberRole.append(forgedOwnerOption);
    fireEvent.change(memberRole, { target: { value: 'owner' } });
    expect(updateMemberRole).not.toHaveBeenCalled();
  });

  it('uses the dedicated transfer RPC path to make an active member the owner', () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AccountStudioPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Make owner' }));

    expect(transferOwnership).toHaveBeenCalledWith({
      organizationId: 'studio-1',
      newOwnerUserId: 'member-user',
    });
    expect(updateMemberRole).not.toHaveBeenCalled();
  });

  it('transfers to an existing co-owner without exposing direct update or removal', () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AccountStudioPage />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Transfer ownership' }),
    );

    expect(transferOwnership).toHaveBeenCalledWith({
      organizationId: 'studio-1',
      newOwnerUserId: 'co-owner-user',
    });
    expect(updateMemberRole).not.toHaveBeenCalled();
    expect(removeMembership).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Leave studio' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Transfer ownership to an active teammate before leaving the studio.',
      ),
    ).toBeInTheDocument();
  });

  it('lets an admin manage non-owners but never exposes an ownership transfer', () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    mockUseOrganizations.mockReturnValue({
      data: [organization('admin')],
      isLoading: false,
    });
    mockUseOrganizationMembers.mockReturnValue({
      data: organizationMembers('admin'),
    });
    render(<AccountStudioPage />);

    expect(
      screen.queryByRole('button', { name: 'Make owner' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Transfer ownership' }),
    ).not.toBeInTheDocument();

    fireEvent.change(
      screen.getByRole('combobox', { name: 'Role for Team Member' }),
      { target: { value: 'admin' } },
    );
    expect(updateMemberRole).toHaveBeenCalledWith({
      memberId: 'membership-member',
      role: 'admin',
    });

    const memberRow = screen.getByText('Team Member').closest('li');
    expect(memberRow).not.toBeNull();
    fireEvent.click(
      within(memberRow as HTMLElement).getByRole('button', { name: 'Remove' }),
    );
    expect(removeMembership).toHaveBeenCalledWith('membership-member');
    expect(transferOwnership).not.toHaveBeenCalled();
  });
});
