jest.mock('posthog-js', () => ({ __esModule: true, default: { capture: jest.fn() } }));
jest.mock('../posthog', () => ({ isAnalyticsEnabled: () => true }));

import posthog from 'posthog-js';
import { proposalEvents } from '../events';

const captureMock = (posthog as unknown as { capture: jest.Mock }).capture;

describe('proposalEvents', () => {
  beforeEach(() => captureMock.mockClear());

  it('created fires proposal_created with mapped props', () => {
    proposalEvents.created({ proposalId: 'p1', templateId: 't1', hasProject: true });
    expect(captureMock).toHaveBeenCalledWith('proposal_created', {
      proposal_id: 'p1',
      template_id: 't1',
      has_project: true,
    });
  });

  it('created fires proposal_created without optional templateId', () => {
    proposalEvents.created({ proposalId: 'p2', hasProject: false });
    expect(captureMock).toHaveBeenCalledWith('proposal_created', {
      proposal_id: 'p2',
      template_id: undefined,
      has_project: false,
    });
  });

  it('sectionSaved fires proposal_section_saved with mapped props', () => {
    proposalEvents.sectionSaved({ proposalId: 'p1', sectionType: 'intro', bodyLength: 120 });
    expect(captureMock).toHaveBeenCalledWith('proposal_section_saved', {
      proposal_id: 'p1',
      section_type: 'intro',
      body_length: 120,
    });
  });

  it('itemAdded fires proposal_item_added with mapped props', () => {
    proposalEvents.itemAdded({
      proposalId: 'p1',
      itemType: 'fixed',
      hasProduct: true,
      lineTotal: 5000,
    });
    expect(captureMock).toHaveBeenCalledWith('proposal_item_added', {
      proposal_id: 'p1',
      item_type: 'fixed',
      has_product: true,
      line_total: 5000,
    });
  });

  it('itemAdded fires proposal_item_added for allowance type', () => {
    proposalEvents.itemAdded({
      proposalId: 'p2',
      itemType: 'allowance',
      hasProduct: false,
      lineTotal: 0,
    });
    expect(captureMock).toHaveBeenCalledWith('proposal_item_added', {
      proposal_id: 'p2',
      item_type: 'allowance',
      has_product: false,
      line_total: 0,
    });
  });

  it('scopeUpdated fires proposal_scope_updated with mapped props', () => {
    proposalEvents.scopeUpdated({ proposalId: 'p1', field: 'room', action: 'add' });
    expect(captureMock).toHaveBeenCalledWith('proposal_scope_updated', {
      proposal_id: 'p1',
      field: 'room',
      action: 'add',
    });
  });

  it('sent fires proposal_sent with mapped props', () => {
    proposalEvents.sent({
      proposalId: 'p1',
      hasPersonalMessage: true,
      hasCcEmail: false,
      itemCount: 3,
      totalAmount: 12000,
    });
    expect(captureMock).toHaveBeenCalledWith('proposal_sent', {
      proposal_id: 'p1',
      has_personal_message: true,
      has_cc_email: false,
      item_count: 3,
      total_amount: 12000,
    });
  });

  it('revisionCreated fires proposal_revision_created with mapped props', () => {
    proposalEvents.revisionCreated({
      sourceProposalId: 'p1',
      newProposalId: 'p2',
      version: 2,
    });
    expect(captureMock).toHaveBeenCalledWith('proposal_revision_created', {
      source_proposal_id: 'p1',
      new_proposal_id: 'p2',
      version: 2,
    });
  });
});
