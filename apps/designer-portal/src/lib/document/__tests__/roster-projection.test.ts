import type { ProjectRosterRow } from '@patina/supabase';
import {
  projectRosterProjection,
  rosterHasIdentity,
} from '../roster-derivation';

function row(
  id: string,
  over: Partial<ProjectRosterRow> = {},
): ProjectRosterRow {
  return {
    roster_id: id,
    source: 'party',
    project_id: 'project-1',
    kind: 'sub',
    display_name: id,
    company_name: null,
    email: null,
    phone: null,
    trade: null,
    job_title: null,
    staff_role: null,
    studio_contact_id: null,
    profile_id: null,
    show_to_client: false,
    has_active_field_link: false,
    sms_consent_status: 'not_asked',
    updated_at: null,
    ...over,
  };
}

const summary = (projection: ReturnType<typeof projectRosterProjection>) => ({
  studioSide: projection.groups.studioSide.map((member) => [member.display_name, member.kind]),
  clientSide: projection.groups.clientSide.map((member) => [member.display_name, member.kind]),
  buildSupply: projection.groups.buildSupply.map((member) => [member.display_name, member.kind]),
});

describe('projectRosterProjection', () => {
  it('keeps one canonical GC-led roster with stable people, roles, and groups', () => {
    const projection = projectRosterProjection(
      [
        row('party-leah', {
          display_name: 'Leah Warner',
          email: 'leah@patina.dev',
          profile_id: 'profile-leah',
          kind: 'designer',
        }),
        row('team-leah', {
          source: 'team',
          display_name: 'Leah Warner',
          email: 'leah@patina.dev',
          profile_id: 'profile-leah',
          kind: 'lead_designer',
        }),
        row('gc-danny', { display_name: 'Danny Ochoa', kind: 'gc' }),
        row('sub-rosa', {
          display_name: 'Rosa Martínez',
          kind: 'sub',
          trade: 'tile',
          studio_contact_id: 'contact-rosa',
        }),
        row('duplicate-rosa', {
          display_name: 'Rosa Martínez',
          kind: 'sub',
          trade: 'tile',
          studio_contact_id: 'contact-rosa',
        }),
      ],
      { name: 'Margaret Ellsworth', profileId: 'profile-client', projectId: 'project-1' },
    );

    expect(summary(projection)).toEqual({
      studioSide: [['Leah Warner', 'lead_designer']],
      clientSide: [['Margaret Ellsworth', 'client']],
      buildSupply: [
        ['Danny Ochoa', 'gc'],
        ['Rosa Martínez', 'sub'],
      ],
    });
  });

  it('keeps direct trade members grouped when the project has no GC', () => {
    const projection = projectRosterProjection(
      [
        row('sub-electric', {
          display_name: 'Maya Electric',
          kind: 'sub',
          trade: 'electrical',
        }),
        row('installer', {
          display_name: 'North Star Install',
          kind: 'installer',
        }),
      ],
      null,
    );

    expect(summary(projection)).toEqual({
      studioSide: [],
      clientSide: [],
      buildSupply: [
        ['Maya Electric', 'sub'],
        ['North Star Install', 'installer'],
      ],
    });
    expect(projection.rows.some((member) => member.kind === 'gc')).toBe(false);
  });

  it('recognizes an existing person without deduplicating names alone', () => {
    const rows = [
      row('rosa', {
        display_name: 'Rosa Martínez',
        email: 'rosa@martineztile.co',
      }),
    ];

    expect(
      rosterHasIdentity(rows, {
        display_name: 'Rosa Martínez',
        email: 'ROSA@MARTINEZTILE.CO',
      }),
    ).toBe(true);
    expect(rosterHasIdentity(rows, { display_name: 'Rosa Martínez' })).toBe(false);
  });
});
