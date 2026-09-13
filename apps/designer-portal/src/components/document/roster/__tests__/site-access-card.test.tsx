/**
 * The site access card (SPEC §5.6) — Leah's third task answered from one
 * screen, and PR-r's shape held: no code, anywhere, ever.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { SiteAccessCard, gateControllerName, keyHolderRow } from '../site-access-card';
import type { CallSheetProjection, CallSheetRow } from '@/lib/document/roster-derivation';

const updateMutate = jest.fn();
const logToldMutate = jest.fn();
let card: unknown = null;

jest.mock('@patina/supabase', () => ({
  useContactRules: () => ({ data: [] }),
  useStudioContactChannelsFor: () => ({ data: [] }),
  useStudioContacts: () => ({ data: [] }),
  useSiteAccessCard: () => ({ data: card, isLoading: false }),
  useUpdateSiteAccessCard: () => ({ mutateAsync: updateMutate, isPending: false }),
  useLogSiteAccessTold: () => ({ mutateAsync: logToldMutate, isPending: false }),
}));

function row(over: Partial<CallSheetRow>): CallSheetRow {
  return {
    key: 'seat:x',
    seatId: 'seat-x',
    personId: 'card-x',
    profileId: null,
    source: 'seat',
    name: 'Someone',
    partyKind: 'sub',
    trade: null,
    companyName: null,
    companyId: null,
    meta: '',
    phone: null,
    email: null,
    phoneE164: null,
    reach: 'on_paper',
    stage: 'active',
    consent: null,
    paper: null,
    ruleSummary: null,
    onSiteFrom: null,
    onSiteTo: null,
    offJobAt: null,
    offJobReason: null,
    showToClient: null,
    projectId: 'okonkwo',
    ...over,
  };
}

const NGOZI = row({
  key: 'seat:seat-ngozi',
  seatId: 'seat-ngozi',
  name: 'Ngozi Eze',
  partyKind: 'receiver',
  phone: '(612) 555-0106',
  consent: 'granted',
  reach: 'field_link',
});
const LUIS = row({
  key: 'seat:seat-luis',
  seatId: 'seat-luis',
  name: 'Luis Ochoa',
  partyKind: 'gc',
  phone: '(612) 555-0109',
});
const PRIYA = row({
  key: 'team:priya',
  seatId: null,
  personId: null,
  profileId: 'profile-priya',
  source: 'team',
  name: 'Priya Natarajan',
});

const ROWS = [PRIYA, NGOZI, LUIS];

const projection: CallSheetProjection = {
  rows: ROWS,
  bands: {
    studioSide: [PRIYA],
    clientSide: [],
    this_week: [NGOZI, LUIS],
    later: [],
    bidding: [],
    done: [],
  },
};

const AUTHORITY = {
  'seat-luis': [
    {
      id: 'a1',
      engagement_id: 'seat-luis',
      scope: 'site_access',
      threshold_cents: null,
      prepares_only: false,
      copy_to: [],
      source_clause: null,
      granted_by: null,
      effective_from: '2026-10-10',
      effective_to: null,
      created_at: '',
      updated_at: '',
    },
  ],
};

const props = {
  open: true,
  onClose: jest.fn(),
  projectId: 'okonkwo',
  projectTitle: 'Okonkwo residence',
  projectAddress: '4412 Fremont Ave S, Minneapolis MN 55409',
  projection,
  authorityBySeat: AUTHORITY as never,
};

beforeEach(() => {
  updateMutate.mockReset().mockResolvedValue({});
  logToldMutate.mockReset().mockResolvedValue({});
  card = {
    id: 'card-1',
    project_id: 'okonkwo',
    lockbox_version: 'Lockbox, version 3',
    alarm_ref: null,
    key_holder_engagement_id: 'seat-ngozi',
    site_hours: 'Weekdays 07:00 to 17:00. No Saturday work before 09:00.',
    site_notes: null,
    emergency_lines: [
      { label: 'Superintendent', name: 'Luis Ochoa', phone: '(612) 555-0109' },
      { label: 'Owner', name: 'Chidi Okonkwo', phone: '(612) 555-0105' },
      { label: 'Architect', name: 'Sam Rowe', phone: '(612) 555-0110' },
    ],
    receiver_instructions: 'Ngozi Eze receives deliveries. Stage in the detached garage.',
    changed_at: '2026-10-16T14:00:00Z',
    changed_by: 'profile-priya',
    told_refs: ['seat-luis'],
    created_by: null,
    created_at: '',
    updated_at: '',
  };
});

describe('SiteAccessCard — the six regions', () => {
  it('heads with the job and its address, and says who it is for', () => {
    render(<SiteAccessCard {...props} />);
    expect(screen.getByText('Site access · Okonkwo residence')).toBeInTheDocument();
    expect(
      screen.getByText('4412 Fremont Ave S, Minneapolis MN 55409'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Studio only. This card never reaches a client page.'),
    ).toBeInTheDocument();
  });

  it('makes every who-to-call line one tel: target, in stored order (R-X)', () => {
    render(<SiteAccessCard {...props} />);
    const calls = Array.from(document.querySelectorAll('a[data-tel-link]')).map(
      (a) => a.textContent,
    );
    expect(calls.slice(0, 3)).toEqual([
      'Luis Ochoa, Superintendent, (612) 555-0109',
      'Chidi Okonkwo, Owner, (612) 555-0105',
      'Sam Rowe, Architect, (612) 555-0110',
    ]);
  });

  it('prints the way in with no code and names who to ask (PR-r)', () => {
    render(<SiteAccessCard {...props} />);
    // CR-10 / SPEC §5.6 #3: the person to ASK is the GATE CONTROLLER — Luis
    // Ochoa, the superintendent — not Ngozi Eze, who holds the key. The
    // fallback order was inverted, so the card sent the reader to somebody who
    // does not control the code.
    expect(document.querySelector('[data-way-in]')).toHaveTextContent(
      'Lockbox, version 3. The code is held off Patina; ask Luis Ochoa.',
    );
    expect(screen.getByText('Luis Ochoa controls the gate.')).toBeInTheDocument();
  });

  it('never offers a field in which to type a code', () => {
    render(<SiteAccessCard {...props} />);
    const labels = Array.from(document.querySelectorAll('label')).map((l) => l.textContent);
    expect(labels.join(' ')).not.toMatch(/code/i);
  });

  it('opens the key holder and prints their consent word', () => {
    const onOpenSeat = jest.fn();
    render(<SiteAccessCard {...props} onOpenSeat={onOpenSeat} />);
    const opener = screen.getByRole('button', { name: 'Ngozi Eze' });
    fireEvent.click(opener);
    expect(onOpenSeat).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ngozi Eze' }));
    expect(screen.getByText('Texting')).toBeInTheDocument();
  });

  it('prints the hours and the receiving note', () => {
    render(<SiteAccessCard {...props} />);
    expect(
      screen.getByText('Weekdays 07:00 to 17:00. No Saturday work before 09:00.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ngozi Eze receives deliveries. Stage in the detached garage.'),
    ).toBeInTheDocument();
  });

  it('says when the way in changed, by whom, and who was told', () => {
    render(<SiteAccessCard {...props} />);
    expect(document.querySelector('[data-who-was-told]')).toHaveTextContent(
      'The way in changed 16 Oct 2026, by Priya Natarajan. Told: Luis Ochoa.',
    );
  });

  it('edits a region in place, as a tertiary act', () => {
    render(<SiteAccessCard {...props} />);
    // Three regions carry an Edit; the way in is the first.
    fireEvent.click(screen.getAllByRole('button', { name: /^Edit$/ })[0]);
    const field = screen.getByLabelText('The way in');
    fireEvent.change(field, { target: { value: 'Lockbox, version 4' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(updateMutate).toHaveBeenCalledWith({
      projectId: 'okonkwo',
      lockboxVersion: 'Lockbox, version 4',
    });
  });

  it('says plainly when nothing is written about the way in yet', () => {
    card = null;
    render(<SiteAccessCard {...props} />);
    expect(
      screen.getByText('– Nothing is written about the way in yet.'),
    ).toBeInTheDocument();
  });

  /**
   * CR3-3 — the hook's own pin asserted `{ projectId }` alone while the only
   * caller sent `lockboxVersion: null`. `useUpdateSiteAccessCard` reads
   * `lockboxVersion !== undefined` as "the way in changed", and `null` is not
   * `undefined`, so starting a blank card stamped `changed_at`/`changed_by`
   * and blanked `told_refs` — the card then printed "The way in changed
   * <today> … Nobody has been told yet." under "No lockbox on file." This pin
   * sits at the CALL SITE, where the fix was defeated.
   */
  it('starts a card without claiming the way in changed', () => {
    card = null;
    render(<SiteAccessCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start the card' }));
    expect(updateMutate).toHaveBeenCalledWith({ projectId: 'okonkwo' });
  });
});

describe('SiteAccessCard — who the card names', () => {
  it('finds the gate controller by the site_access grant', () => {
    expect(gateControllerName(ROWS, AUTHORITY as never)).toBe('Luis Ochoa');
    expect(gateControllerName(ROWS, {})).toBeNull();
  });

  it('finds the key holder by the card own pointer', () => {
    expect(keyHolderRow(ROWS, 'seat-ngozi')?.name).toBe('Ngozi Eze');
    expect(keyHolderRow(ROWS, null)).toBeNull();
  });
});

describe('SiteAccessCard — logging who was told', () => {
  it('opens an inline band, never a modal, and writes the seats picked', async () => {
    render(<SiteAccessCard {...props} />);
    const act = screen.getByRole('button', { name: /Log who was told/ });
    expect(act).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(act);
    expect(act).toHaveAttribute('aria-expanded', 'true');
    // Luis is already told; Ngozi is not.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ngozi Eze' }));
    fireEvent.click(screen.getByRole('button', { name: /Save this note/ }));
    expect(logToldMutate).toHaveBeenCalledWith({
      projectId: 'okonkwo',
      seatIds: ['seat-ngozi'],
    });
    await screen.findByText('One more name is on the notice.');
  });
});

/**
 * CR3-5 — THE TWO COLUMNS NOTHING COULD WRITE.
 *
 * `useUpdateSiteAccessCard` has accepted `keyHolderEngagementId` and
 * `emergencyLines` since 00625 and no surface passed either, so in production
 * "Who to call first" always printed "– No emergency line on file." and
 * "Key holder" always printed "– Nobody on the job is marked as holding a
 * key." The dev seed writes both columns, which is why every local walk passed
 * while the shipped card could not produce either fact.
 */
describe('SiteAccessCard — naming the key holder', () => {
  it('offers a picker over the job’s own seats and writes the one chosen', async () => {
    render(<SiteAccessCard {...props} />);
    const act = screen.getByRole('button', { name: 'Name a different key holder' });
    expect(act).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(act);

    const picker = screen.getByLabelText('Who holds a key');
    // Seeded from the card's own pointer, not left empty.
    expect(picker).toHaveValue('seat-ngozi');
    // Only SEATS are offered — a studio teammate holds no engagement id.
    expect(
      Array.from(picker.querySelectorAll('option')).map((o) => o.textContent),
    ).toEqual(['Nobody on the job holds one', 'Ngozi Eze', 'Luis Ochoa']);

    fireEvent.change(picker, { target: { value: 'seat-luis' } });
    fireEvent.click(screen.getByRole('button', { name: 'Write it down' }));
    expect(updateMutate).toHaveBeenCalledWith({
      projectId: 'okonkwo',
      keyHolderEngagementId: 'seat-luis',
    });
  });

  it('can take the key off everybody', async () => {
    render(<SiteAccessCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Name a different key holder' }));
    fireEvent.change(screen.getByLabelText('Who holds a key'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Write it down' }));
    expect(updateMutate).toHaveBeenCalledWith({
      projectId: 'okonkwo',
      keyHolderEngagementId: null,
    });
  });

  it('names the act for a card that holds nobody yet', () => {
    card = { ...(card as Record<string, unknown>), key_holder_engagement_id: null };
    render(<SiteAccessCard {...props} />);
    expect(
      screen.getByRole('button', { name: 'Name the key holder' }),
    ).toBeInTheDocument();
  });
});

describe('SiteAccessCard — who to call first', () => {
  it('adds a line, keeping every line already on the list', () => {
    render(<SiteAccessCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add someone to call' }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Priya Natarajan' },
    });
    fireEvent.change(screen.getByLabelText('What they are to this job'), {
      target: { value: 'Studio' },
    });
    fireEvent.change(screen.getByLabelText('Number'), {
      target: { value: '(612) 555-0101' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add them' }));

    expect(updateMutate).toHaveBeenCalledWith({
      projectId: 'okonkwo',
      emergencyLines: [
        // The seed writes `label` where the hook's type says `role`; both are
        // read and normalised, so an edit never drops a word a line carried.
        { name: 'Luis Ochoa', role: 'Superintendent', phone: '(612) 555-0109' },
        { name: 'Chidi Okonkwo', role: 'Owner', phone: '(612) 555-0105' },
        { name: 'Sam Rowe', role: 'Architect', phone: '(612) 555-0110' },
        { name: 'Priya Natarajan', role: 'Studio', phone: '(612) 555-0101' },
      ],
    });
  });

  it('refuses a nameless line, and writes nothing', () => {
    render(<SiteAccessCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add someone to call' }));
    fireEvent.change(screen.getByLabelText('Number'), {
      target: { value: '(612) 555-0101' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add them' }));
    expect(screen.getByRole('alert')).toHaveTextContent('A line to call needs a name.');
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it('takes one line off the list and leaves the rest standing', () => {
    render(<SiteAccessCard {...props} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Take Chidi Okonkwo off the list' }),
    );
    expect(updateMutate).toHaveBeenCalledWith({
      projectId: 'okonkwo',
      emergencyLines: [
        { name: 'Luis Ochoa', role: 'Superintendent', phone: '(612) 555-0109' },
        { name: 'Sam Rowe', role: 'Architect', phone: '(612) 555-0110' },
      ],
    });
  });
});
