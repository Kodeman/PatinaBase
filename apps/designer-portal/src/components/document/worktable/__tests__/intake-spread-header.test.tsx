/**
 * Table I's spread header prints who this is and how they arrived — and
 * nothing else. What it must do: print name / description / arrival on the
 * DISCOVERY spread, where nothing else states them; print nothing on the brief
 * spread, where BriefSection prints all three off the same lead row; print
 * nothing when identity is absent, when the flag is off (no table), or on a
 * non-intake table; wait for the lead rather than growing after first paint;
 * and offer no act of any kind (Q6 — printed identity, not a control surface).
 */
import { render } from '@testing-library/react';

import { IntakeSpreadHeader } from '../intake-spread-header';

let mockLead: Record<string, unknown> | undefined;
let mockLeadLoading = false;
const useLead = jest.fn(() => ({ data: mockLead, isLoading: mockLeadLoading }));

jest.mock('@patina/supabase', () => ({
  useLead: (leadId: string) => useLead(leadId),
}));

// A lead doc's lead: designer-captured contact, captured "Where from".
const CAPTURED_LEAD = {
  contact_name: 'Marion Ellsworth',
  homeowner_id: null,
  homeowner: null,
  source: 'Referral — the Hartley project',
  project_description: 'Full refresh of a 1920s Tudor — living room first.',
};

// A discovery doc's lead: an inbound Patina prospect with a joined profile
// and no captured source line.
const INBOUND_LEAD = {
  contact_name: null,
  homeowner_id: 'homeowner-1',
  homeowner: { full_name: 'Priya Natarajan' },
  source: null,
  project_description: 'Coastal condo, three rooms, spring deadline.',
};

function header(
  props: Partial<React.ComponentProps<typeof IntakeSpreadHeader>> = {},
) {
  return render(
    <IntakeSpreadHeader
      table="intake"
      section="discovery"
      leadId="lead-1"
      clientName="Marion Ellsworth"
      {...props}
    />,
  );
}

beforeEach(() => {
  mockLead = undefined;
  mockLeadLoading = false;
  useLead.mockClear();
});

describe('IntakeSpreadHeader', () => {
  it('prints name, description and arrival on the discovery spread', () => {
    mockLead = CAPTURED_LEAD;
    const { container } = header();

    const root = container.querySelector('[data-intake-spread-header]')!;
    expect(root.textContent).toContain('Marion Ellsworth');
    expect(root.textContent).toContain(
      'Full refresh of a 1920s Tudor — living room first.',
    );
    expect(root.textContent).toContain('Referral — the Hartley project');
  });

  it('prints nothing on the brief spread — BriefSection states all three below', () => {
    // Contact name, source and project description are exactly what
    // brief-section.tsx prints, off the same `useLead` row, immediately under
    // this header. Two printings of one fact is two documents.
    mockLead = CAPTURED_LEAD;
    const { container } = header({ section: 'brief' });

    expect(container.firstChild).toBeNull();
    // And it costs nothing on the wire there either.
    expect(useLead).toHaveBeenCalledWith('');
  });

  it('prints the profile name and the honest inbound arrival for a discovery doc', () => {
    mockLead = INBOUND_LEAD;
    const { container } = header({ leadId: 'lead-2', clientName: 'New client' });

    const root = container.querySelector('[data-intake-spread-header]')!;
    expect(root.textContent).toContain('Priya Natarajan');
    // The joined profile's name wins over the view's coalesced fallback.
    expect(root.textContent).not.toContain('New client');
    expect(root.textContent).toContain(
      'Coastal condo, three rooms, spring deadline.',
    );
    expect(root.textContent).toContain('Inbound via Patina');
  });

  it('is printed identity only — no act to press (Q6)', () => {
    mockLead = CAPTURED_LEAD;
    const { container } = header();

    expect(container.querySelector('button, a, input, [role="button"]')).toBeNull();
  });

  it('prints nothing when the identity data is absent', () => {
    mockLead = undefined;
    const { container } = header({ leadId: null, clientName: null });

    expect(container.firstChild).toBeNull();
  });

  it('omits the arrival and description clauses rather than inventing them', () => {
    // A legacy discovery row: no lead linked, only the row's own name.
    mockLead = undefined;
    const { container } = header({ leadId: null, clientName: 'Marion Ellsworth' });

    const root = container.querySelector('[data-intake-spread-header]')!;
    expect(root.textContent).toBe('Marion Ellsworth');
  });

  it('prints once, whole — nothing while the lead is still loading', () => {
    mockLeadLoading = true;
    const { container } = header();

    expect(container.firstChild).toBeNull();
  });

  it('prints nothing with no table (the flag is off) and disables the read', () => {
    mockLead = CAPTURED_LEAD;
    const { container } = header({ table: null });

    expect(container.firstChild).toBeNull();
    // Byte-identical on the wire too: '' disables useLead's query.
    expect(useLead).toHaveBeenCalledWith('');
  });

  it('prints nothing on a non-intake table', () => {
    mockLead = CAPTURED_LEAD;
    const { container } = header({ table: 'speccing' });

    expect(container.firstChild).toBeNull();
    expect(useLead).toHaveBeenCalledWith('');
  });
});
