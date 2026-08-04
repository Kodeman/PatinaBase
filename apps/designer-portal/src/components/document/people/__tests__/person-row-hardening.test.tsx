/**
 * PersonRow hardening (Call Sheet Wave 4) — the studio-scoped `people_directory`
 * (00420) can now hand PersonRow any of the 12 PartyRole values, in either
 * scope. This spec pins the contract: no role/scope combination ever throws
 * or renders `undefined`, the allied-professional kinds (architect/
 * photographer/stager) and the rolodex 'contact' branch get a neutral status
 * dot and a sensible relationship line, and a foreign-scope ('studio') row
 * wears the mono STUDIO marker instead of the due-state (terracotta) accent.
 */
import { render, screen } from '@testing-library/react';
import type { PartyRole, PeopleDirectoryRow } from '@patina/supabase';
import { PersonRow } from '../directory/person-row';

jest.mock('@patina/supabase', () => ({
  // Reimplemented rather than requireActual (same posture as
  // directory-scope.test.tsx) — this spec is a pure unit test of PersonRow,
  // not a transitive test of every hook module @patina/supabase re-exports.
  isFieldRosterRole: (role: string | null | undefined) =>
    !!role && ['gc', 'sub', 'installer', 'receiver'].includes(role),
}));

const NOW = new Date('2026-08-04T12:00:00.000Z');

function person(over: Partial<PeopleDirectoryRow> & { role: PartyRole }): PeopleDirectoryRow {
  return {
    person_id: `p-${over.role}`,
    display_name: 'Row Person',
    email: null,
    phone: null,
    profile_id: null,
    project_id: null,
    designer_id: null,
    status_raw: null,
    last_touch_at: null,
    meta: {},
    scope: 'mine',
    ...over,
  };
}

const ALL_ROLES: PartyRole[] = [
  'client',
  'maker',
  'gc',
  'team',
  'lead',
  'sub',
  'installer',
  'receiver',
  'architect',
  'photographer',
  'stager',
  'contact',
];

describe('PersonRow — every PartyRole renders without throwing', () => {
  it.each(ALL_ROLES)('renders role=%s (scope: mine)', (role) => {
    expect(() =>
      render(<PersonRow person={person({ role })} now={NOW} onOpen={jest.fn()} />),
    ).not.toThrow();
    expect(screen.getByText('Row Person')).toBeInTheDocument();
  });

  it.each(ALL_ROLES)('renders role=%s (scope: studio, foreign row)', (role) => {
    expect(() =>
      render(
        <PersonRow person={person({ role, scope: 'studio' })} now={NOW} onOpen={jest.fn()} />,
      ),
    ).not.toThrow();
    expect(screen.getByText('Row Person')).toBeInTheDocument();
  });
});

describe('PersonRow — allied professionals (00419) read gracefully', () => {
  it.each([
    ['architect', 'Architect'],
    ['photographer', 'Photographer'],
    ['stager', 'Stager'],
  ] as const)('%s carries the %s role badge and a neutral (non-due) line', (role, label) => {
    render(
      <PersonRow
        person={person({ role, meta: { project_name: 'Ellsworth' } })}
        now={NOW}
        onOpen={jest.fn()}
      />,
    );
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(`${label} · Ellsworth`)).toBeInTheDocument();
  });

  it('falls back to the bare role label with no project on file', () => {
    render(<PersonRow person={person({ role: 'architect' })} now={NOW} onOpen={jest.fn()} />);
    expect(screen.getAllByText('Architect')).toHaveLength(2); // badge + line
  });
});

describe('PersonRow — the studio rolodex contact branch (00420)', () => {
  it('reads the contact_kind + specialties from meta, never a due/nurture line', () => {
    render(
      <PersonRow
        person={person({
          role: 'contact',
          meta: { contact_kind: 'vendor', specialties: ['lighting', 'hardware'] },
        })}
        now={NOW}
        onOpen={jest.fn()}
      />,
    );
    expect(screen.getByText('Vendor · Lighting, Hardware')).toBeInTheDocument();
  });

  it('falls back to just the kind label with no specialties on file', () => {
    render(
      <PersonRow
        person={person({ role: 'contact', meta: { contact_kind: 'architect' } })}
        now={NOW}
        onOpen={jest.fn()}
      />,
    );
    expect(screen.getByText('Architect')).toBeInTheDocument();
  });

  it('never renders the SMS-consent chip (contact is not a field roster role)', () => {
    render(
      <PersonRow
        person={person({ role: 'contact', meta: { contact_kind: 'sub' } })}
        now={NOW}
        onOpen={jest.fn()}
      />,
    );
    for (const label of ['Not asked', 'Invited', 'Texting', 'Opted out']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });
});

describe('PersonRow — foreign-scope (STUDIO) rows never show due-state theatrics', () => {
  const newLead = person({
    role: 'lead',
    status_raw: 'new',
    meta: { project_type: 'full_home' },
  });

  it('reads terracotta-due in scope=mine (the owner\'s own work queue)', () => {
    render(<PersonRow person={{ ...newLead, scope: 'mine' }} now={NOW} onOpen={jest.fn()} />);
    expect(
      screen.getByText('New lead · full home · respond within 24 hours'),
    ).toBeInTheDocument();
  });

  it('reads mono STUDIO instead — never the due copy — for the identical row seen via a co-member\'s STUDIO scope', () => {
    render(<PersonRow person={{ ...newLead, scope: 'studio' }} now={NOW} onOpen={jest.fn()} />);
    expect(screen.getByText('Lead · full home · STUDIO')).toBeInTheDocument();
    expect(
      screen.queryByText('New lead · full home · respond within 24 hours'),
    ).not.toBeInTheDocument();
  });

  it('suffixes the STUDIO marker on an ordinary (never-due) role too', () => {
    render(
      <PersonRow
        person={person({ role: 'maker', scope: 'studio', meta: { primary_category: 'lighting' } })}
        now={NOW}
        onOpen={jest.fn()}
      />,
    );
    expect(screen.getByText('Maker · lighting · STUDIO')).toBeInTheDocument();
  });
});
