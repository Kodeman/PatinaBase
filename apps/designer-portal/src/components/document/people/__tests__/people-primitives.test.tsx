/**
 * W2a — the four People-room primitives, pinned.
 *
 * Two builders are about to render these into the Directory, the cards, the
 * Call Sheet and the picker. What is asserted here is the CONTRACT the SPEC's
 * per-state acceptance rests on:
 *
 *   · the word is ALWAYS printed, and its pigment always agrees with it
 *     (SPEC §7 #9, §8 #10);
 *   · an unknown or absent value prints NOTHING, never a guess (R-V, R-BB);
 *   · a hard block carries the 2px terracotta leading rule, and only a hard
 *     block does (direction §5.4);
 *   · a routed line carries a WAY TO REACH the routed person (R-L / C22);
 *   · the stage word prints on the SEAT LINE and nowhere else (PR-p / C1);
 *   · every phone is its own `tel:` control, never nested in a button (C11).
 */

import { render, screen } from '@testing-library/react';
import { StateWord, PlainFact } from '../state-word';
import { ContactRuleLine, routedSentence } from '../contact-rule-line';
import { SeatLine, seatWindowText, formatSeatDate, seatLineParts } from '../seat-line';
import { TelLink, telHref } from '../tel-link';
import { STATE_WORD_PIGMENTS, resolveStateWord } from '@patina/types';
import type { PeopleDirectorySeat } from '@patina/supabase';

// ═══════════════════════════════════════════════════════════════════════════
// StateWord
// ═══════════════════════════════════════════════════════════════════════════

describe('StateWord · one bordered word for all four families', () => {
  it('prints the reach words, with Account current and Field link pending', () => {
    const { rerender } = render(<StateWord family="reach" value="account" />);
    expect(screen.getByText('Account')).toHaveAttribute(
      'data-state-pigment',
      'current',
    );

    rerender(<StateWord family="reach" value="field_link" />);
    expect(screen.getByText('Field link')).toHaveAttribute(
      'data-state-pigment',
      'pending',
    );

    rerender(<StateWord family="reach" value="on_paper" />);
    expect(screen.getByText('On paper')).toHaveAttribute(
      'data-state-pigment',
      'dormant',
    );
  });

  it("turns the record's stored status into the studio's consent word", () => {
    // The studio reads "Texting", never "granted". SPEC §5.1 #8/#9/#12.
    const cases: Array<[string, string, string]> = [
      ['granted', 'Texting', 'current'],
      ['pending', 'Invited', 'pending'],
      ['opted_out', 'Opted out', 'blocked'],
      ['not_asked', 'Not asked', 'dormant'],
    ];
    for (const [status, label, pigment] of cases) {
      const { unmount } = render(<StateWord family="consent" value={status} />);
      expect(screen.getByText(label)).toHaveAttribute('data-state-pigment', pigment);
      unmount();
    }
  });

  it('prints NOTHING for a null consent status — "no record" is not "Not asked"', () => {
    // R-BB / w1b r8 MAJOR-1: the readers return NULL when the caller cannot
    // read the record that decides the word, and "Not asked" over a studio's
    // dated `opted_out` is the fail-open word this program removed.
    const { container } = render(<StateWord family="consent" value={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reduces twelve stored stages to nine words', () => {
    const cases: Array<[string, string]> = [
      ['prospect', 'Prospect'],
      ['invited', 'Bidding'],
      ['bidding', 'Bidding'],
      ['declined', 'Declined'],
      ['no_response', 'No response'],
      ['awarded', 'Awarded'],
      ['mobilized', 'On the job'],
      ['active', 'On the job'],
      ['closeout', 'Closing out'],
      ['warranty', 'Warranty'],
      ['off_job', 'Off the job'],
      ['retired', 'Off the job'],
    ];
    for (const [stage, label] of cases) {
      const { unmount } = render(<StateWord family="stage" value={stage} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it('never spends the blocked pigment on a stage (direction §3.8)', () => {
    // A stage is where the work stands, not a thing that holds the work up.
    for (const stage of [
      'prospect',
      'invited',
      'bidding',
      'declined',
      'no_response',
      'awarded',
      'mobilized',
      'active',
      'closeout',
      'warranty',
      'off_job',
      'retired',
    ]) {
      const { container, unmount } = render(<StateWord family="stage" value={stage} />);
      expect(
        container.querySelector('[data-state-pigment="blocked"]'),
      ).toBeNull();
      unmount();
    }
  });

  it('prints the four paper words, with Lapsed blocked', () => {
    const cases: Array<[string, string, string]> = [
      ['current', 'Current', 'current'],
      ['lapses_soon', 'Lapses in 30 days', 'pending'],
      ['lapsed', 'Lapsed', 'blocked'],
      ['not_on_file', 'Not on file', 'dormant'],
    ];
    for (const [state, label, pigment] of cases) {
      const { unmount } = render(<StateWord family="paper" value={state} />);
      expect(screen.getByText(label)).toHaveAttribute('data-state-pigment', pigment);
      unmount();
    }
  });

  it('prints nothing for a value that names no word in its family', () => {
    const { container } = render(<StateWord family="paper" value="expired" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is a border and text on a transparent ground — never a fill (SPEC §8 #10)', () => {
    render(<StateWord family="paper" value="lapsed" />);
    const word = screen.getByText('Lapsed');
    // jsdom discards a `var(--x)` declaration entirely, so the TOKEN pairing is
    // asserted at its source below and the DOM is asserted for what jsdom does
    // keep: the transparent ground, the border box, and no shadow (D4).
    expect(word.getAttribute('style') ?? '').toMatch(/background:\s*transparent/);
    expect(word.className).toMatch(/\bborder\b/);
    expect(word.className).not.toMatch(/shadow/);
  });

  it('binds each pigment to its house-sheet token pair, and never to a fill', () => {
    // The four pairs are SPEC §2.2's `.word--*` rules, stated once in
    // @patina/types so the room and the specimens cannot drift.
    expect(STATE_WORD_PIGMENTS).toEqual({
      current: { border: 'var(--sage)', color: 'var(--sage-ink)' },
      pending: { border: 'var(--golden)', color: 'var(--golden-ink)' },
      blocked: { border: 'var(--terracotta)', color: 'var(--terracotta-ink)' },
      dormant: { border: 'var(--hairline-strong)', color: 'var(--ink-faint)' },
    });
    // Every `color` is an ink; a material pigment is never asked to be read.
    for (const pair of Object.values(STATE_WORD_PIGMENTS)) {
      expect(pair.color).toMatch(/-ink\)$|--ink-faint\)$/);
    }
  });

  it('resolves a value to its word AND its pigment in one reduction', () => {
    expect(resolveStateWord('paper', 'lapsed')).toMatchObject({
      family: 'paper',
      value: 'lapsed',
      label: 'Lapsed',
      pigment: 'blocked',
      tokens: { border: 'var(--terracotta)', color: 'var(--terracotta-ink)' },
    });
    expect(resolveStateWord('consent', null)).toBeNull();
    expect(resolveStateWord('stage', 'nonsense')).toBeNull();
  });

  it('drops the box but keeps the word and its pigment at 390 (R-M)', () => {
    render(<StateWord family="consent" value="opted_out" plain />);
    const word = screen.getByText('Opted out');
    expect(word.className).not.toMatch(/\bborder\b/);
    expect(word).toHaveAttribute('data-state-pigment', 'blocked');
    expect(word).toHaveAttribute('data-state-word', 'opted_out');
  });

  it('prints authority as plain uncoloured text, off the four state tokens', () => {
    const { container } = render(<PlainFact>Signs money to $2,500</PlainFact>);
    expect(screen.getByText('Signs money to $2,500')).toBeInTheDocument();
    expect(container.querySelector('[data-state-pigment]')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ContactRuleLine
// ═══════════════════════════════════════════════════════════════════════════

describe('ContactRuleLine · the E7 sentence', () => {
  it('prints the rule as prose, with no leading rule when it does not block', () => {
    render(<ContactRuleLine summary="Text only. The email on file bounces." />);
    const line = screen.getByText(/Text only\./);
    expect(line).not.toHaveAttribute('data-contact-rule-blocked');
    expect(line.className).not.toMatch(/border-l-2/);
  });

  it('carries the 2px terracotta leading rule on a hard block', () => {
    render(<ContactRuleLine summary="Never text. Use: email, office." blocked />);
    const line = screen.getByText(/Never text\./);
    expect(line).toHaveAttribute('data-contact-rule-blocked', 'true');
    expect(line.className).toMatch(/border-l-2/);
    expect(line.className).toMatch(/terracotta-ink/);
  });

  it('prints nothing at all when there is no rule and no route', () => {
    // "No contact rule on file." is the CARD's sentence (R-V), not this
    // line's — a row with no rule prints no clause.
    const { container } = render(<ContactRuleLine summary={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("appends the routed sentence and the routed person's email (R-L)", () => {
    render(
      <ContactRuleLine
        summary="Do not contact directly."
        blocked
        routeTo={{
          name: 'Rosa Delgado',
          email: 'rosa@twincitiesdrywall.com',
          officePhone: '(612) 555-0116',
        }}
      />,
    );
    expect(screen.getByText(/Write Rosa Delgado instead\./)).toBeInTheDocument();
    const mail = screen.getByText('rosa@twincitiesdrywall.com');
    expect(mail).toHaveAttribute('href', 'mailto:rosa@twincitiesdrywall.com');
    // Email if present, THEN the office phone — never both, so the reader is
    // shown one way to reach her rather than a choice.
    expect(screen.queryByText('(612) 555-0116')).not.toBeInTheDocument();
  });

  it('falls back to the office phone as a tel: link when there is no email', () => {
    render(
      <ContactRuleLine
        summary="Do not contact directly."
        blocked
        routeTo={{ name: 'Rosa Delgado', officePhone: '(612) 555-0116' }}
      />,
    );
    expect(screen.getByText('(612) 555-0116')).toHaveAttribute(
      'href',
      'tel:+16125550116',
    );
  });

  it('never prints a bare phone string (C22)', () => {
    // "a routing instruction with no channel attached sends the reader
    // nowhere; C7's 'a name is not a channel' cuts both ways."
    const { container } = render(
      <ContactRuleLine
        summary="Do not contact directly."
        blocked
        routeTo={{ name: 'Rosa Delgado', officePhone: '(612) 555-0116' }}
      />,
    );
    const phone = screen.getByText('(612) 555-0116');
    expect(phone.tagName).toBe('A');
    expect(container.textContent).toContain('Write Rosa Delgado instead.');
  });

  it('still prints the route when the rule itself has no summary', () => {
    render(<ContactRuleLine summary={null} routeTo={{ name: 'Rosa Delgado' }} />);
    expect(screen.getByText(/Write Rosa Delgado instead\./)).toBeInTheDocument();
  });

  it('uses one wording for the routed sentence everywhere', () => {
    expect(routedSentence('Rosa Delgado')).toBe('Write Rosa Delgado instead.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SeatLine
// ═══════════════════════════════════════════════════════════════════════════

function seat(partial: Partial<PeopleDirectorySeat> = {}): PeopleDirectorySeat {
  return {
    identity_key: 'card:c1',
    person_id: 'c1',
    seat_id: 's1',
    project_id: 'j1',
    project_name: 'Okonkwo residence',
    project_status: 'active',
    designer_id: 'd1',
    party_kind: 'sub',
    display_name: 'Dana Kowalski',
    trade: 'electrical',
    stage: 'active',
    on_site_from: '2026-10-12',
    on_site_to: '2027-08-13',
    site_access_mode: 'escorted',
    contracted_through: 'gc',
    company_id: 'f1',
    company_name: 'Northgate Electric',
    warranty_until: null,
    warranty_contact_person_id: null,
    off_job_at: null,
    off_job_reason: null,
    show_to_client: false,
    studio_contact_id: 'c1',
    phone_e164: '+16125550111',
    consent_status: 'granted',
    reach_state: 'field_link',
    paper_state: 'lapsed',
    contact_rule_summary: null,
    updated_at: '2026-10-17T00:00:00Z',
    scope: 'mine',
    ...partial,
  };
}

describe('SeatLine · project · kind · trade · stage · window', () => {
  it('prints the seat as one line, with the stage word and the window', () => {
    render(<SeatLine seat={seat()} onOpen={() => {}} />);
    expect(screen.getByText(/Okonkwo residence/)).toBeInTheDocument();
    expect(screen.getByText(/Subcontractor/)).toBeInTheDocument();
    expect(screen.getByText(/Electrical/)).toBeInTheDocument();
    expect(screen.getByText('On the job')).toBeInTheDocument();
    expect(screen.getByText('12 Oct 2026 to 13 Aug 2027')).toBeInTheDocument();
  });

  it('is a BUTTON that opens the person at this seat (R-AA), never an inert row', () => {
    const onOpen = jest.fn();
    render(<SeatLine seat={seat()} onOpen={onOpen} />);
    const line = screen.getByRole('button');
    expect(line).toHaveAttribute('data-seat-line', 's1');
    line.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0]![0].seat_id).toBe('s1');
  });

  it('is the ONLY place a stage word prints (PR-p / C1)', () => {
    // A seat line carries the stage; a person row never does. One human holds
    // many seats with many stages, so a person-level stage is a fabrication.
    const { container } = render(<SeatLine seat={seat()} onOpen={() => {}} />);
    const stageWords = container.querySelectorAll('[data-state-family="stage"]');
    expect(stageWords).toHaveLength(1);
  });

  it('prints no window at all when the seat has none — never "unknown"', () => {
    render(
      <SeatLine
        seat={seat({ on_site_from: null, on_site_to: null })}
        onOpen={() => {}}
      />,
    );
    expect(screen.queryByText(/\d{4}/)).not.toBeInTheDocument();
  });

  it('prints a half-open window with the preposition that makes it true', () => {
    expect(seatWindowText('2026-10-19', null)).toBe('from 19 Oct 2026');
    expect(seatWindowText(null, '2027-08-13')).toBe('to 13 Aug 2027');
    expect(seatWindowText(null, null)).toBeNull();
  });

  it('formats a DATE column by its parts, never through new Date(string)', () => {
    // A DATE parsed as a timestamp lands a day early west of UTC, and the
    // window on a Call Sheet is the thing a studio plans a week around.
    expect(formatSeatDate('2026-10-12')).toBe('12 Oct 2026');
    expect(formatSeatDate('2027-01-01')).toBe('1 Jan 2027');
    expect(formatSeatDate(null)).toBeNull();
    expect(formatSeatDate('not-a-date')).toBeNull();
  });

  it('drops a part it does not have rather than printing an empty slot', () => {
    expect(seatLineParts(seat({ trade: null }))).toEqual([
      'Okonkwo residence',
      'Subcontractor',
    ]);
    expect(seatLineParts(seat({ project_name: null, trade: null }))).toEqual([
      'Subcontractor',
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TelLink
// ═══════════════════════════════════════════════════════════════════════════

describe('TelLink · every phone, at every width', () => {
  it('dials a ten-digit number as +1', () => {
    render(<TelLink phone="(612) 555-0111" />);
    expect(screen.getByText('(612) 555-0111')).toHaveAttribute(
      'href',
      'tel:+16125550111',
    );
  });

  it('keeps the studio’s own formatting as the label', () => {
    render(<TelLink phone="612.555.0111" />);
    expect(screen.getByText('612.555.0111')).toBeInTheDocument();
  });

  it('carries a 44px minimum target (SPEC §5.1 #15)', () => {
    render(<TelLink phone="(612) 555-0111" />);
    const link = screen.getByRole('link');
    expect(link.className).toMatch(/min-h-\[44px\]/);
    expect(link.className).toMatch(/min-w-\[44px\]/);
  });

  it('takes the whole line at 390, where the thumb is (R-X)', () => {
    render(<TelLink phone="(612) 555-0111" fullWidth />);
    const link = screen.getByRole('link');
    expect(link.className).toMatch(/min-h-\[44px\]/);
    expect(link.className).toMatch(/w-full/);
    expect(link.className).not.toMatch(/min-w-\[44px\]/);
  });

  it('names the person for the ear, so eleven digits have an owner', () => {
    render(<TelLink phone="(612) 555-0111" personName="Dana Kowalski" />);
    expect(
      screen.getByLabelText('Call Dana Kowalski, (612) 555-0111'),
    ).toBeInTheDocument();
  });

  it('prints nothing when there is no number — an absent phone is not a dead link', () => {
    const { container, rerender } = render(<TelLink phone={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<TelLink phone="   " />);
    expect(container).toBeEmptyDOMElement();
    rerender(<TelLink phone="ask the office" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is an ANCHOR, so it can never be nested in the row button (C11)', () => {
    render(<TelLink phone="(612) 555-0111" />);
    expect(screen.getByRole('link').tagName).toBe('A');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('normalizes the href the way the database normalizes the column', () => {
    expect(telHref('6125550111')).toBe('tel:+16125550111');
    expect(telHref('16125550111')).toBe('tel:+16125550111');
    expect(telHref('+1 (612) 555-0111')).toBe('tel:+16125550111');
    expect(telHref('+44 20 7946 0958')).toBe('tel:+442079460958');
    expect(telHref('')).toBeNull();
    expect(telHref(undefined)).toBeNull();
  });
});
