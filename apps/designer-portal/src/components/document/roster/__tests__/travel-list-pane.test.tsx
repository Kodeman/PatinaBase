/**
 * The travel list (SPEC §5.7 #5, CRM-24).
 *
 * The list is FIXED and is the contract: the studio is told what the act will
 * carry, not what these four people happen to hold today. So the test pins
 * every item, in order, on both sides.
 */

import { render, screen } from '@testing-library/react';
import { STAYS_BEHIND, TRAVELS, TravelListPane } from '../travel-list-pane';

describe('TravelListPane', () => {
  it('names both heads', () => {
    render(<TravelListPane />);
    expect(screen.getByText('What travels')).toBeInTheDocument();
    expect(screen.getByText('What stays behind')).toBeInTheDocument();
  });

  it('prints CRM-24’s six travelling facts, in order', () => {
    render(<TravelListPane />);
    const items = Array.from(
      document.querySelectorAll('[data-travels] li'),
    ).map((el) => el.textContent);
    expect(items).toEqual([
      'identity',
      'typed channels',
      'contact rule',
      'consent by channel value',
      'document expiries',
      'one history line',
    ]);
    expect(items).toEqual([...TRAVELS]);
  });

  it('prints the three that never travel', () => {
    render(<TravelListPane />);
    const items = Array.from(
      document.querySelectorAll('[data-stays-behind] li'),
    ).map((el) => el.textContent);
    expect(items).toEqual([
      'prior pricing',
      'prior project notes',
      'show to client',
    ]);
    expect(items).toEqual([...STAYS_BEHIND]);
  });

  it('is labelled for a reader arriving at it out of order', () => {
    render(<TravelListPane />);
    expect(
      screen.getByRole('complementary', { name: 'What travels' }),
    ).toBeInTheDocument();
  });

  it('carries no schema word (SPEC §8 #3)', () => {
    render(<TravelListPane />);
    expect(document.body.textContent).not.toMatch(
      /studio_contact_id|party_kind|sms_consent|project_parties|show_to_client/,
    );
  });
});
