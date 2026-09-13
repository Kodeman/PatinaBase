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
    expect(document.querySelector('[data-way-in]')).toHaveTextContent(
      'Lockbox, version 3. The code is held off Patina; ask Ngozi Eze.',
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
