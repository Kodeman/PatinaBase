import { render, screen } from '@testing-library/react';
import { CompanyRow, companyKindLabel } from '../directory/company-row';

describe('CompanyRow — the square avatar (slide 9)', () => {
  it('renders a rounded SQUARE avatar, never a circle', () => {
    render(<CompanyRow name="Hale Brothers Builders" kind="gc" />);
    const avatar = screen.getByText('HB');
    expect(avatar).toHaveClass('rounded-[8px]');
    expect(avatar).not.toHaveClass('rounded-full');
  });
});

describe('CompanyRow — kind labels', () => {
  it.each([
    ['gc', 'GC firm'],
    ['workroom', 'Workroom'],
    ['showroom', 'Showroom'],
    ['vendor', 'Vendor'],
    ['supplier', 'Supplier'],
  ])('labels contact_kind %s as %s', (kind, label) => {
    render(<CompanyRow name="Some Co" kind={kind} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('falls back to a prettified raw value for an unrecognized kind, never raw snake_case', () => {
    render(<CompanyRow name="Some Co" kind="custom_kind" />);
    expect(screen.getByText('Custom Kind')).toBeInTheDocument();
    expect(screen.queryByText('custom_kind')).not.toBeInTheDocument();
  });

  it('companyKindLabel defaults to "Company" for a null/undefined kind', () => {
    expect(companyKindLabel(null)).toBe('Company');
    expect(companyKindLabel(undefined)).toBe('Company');
  });
});

describe('CompanyRow — no consent dot', () => {
  it('never renders the SMS-consent chip a person row wears', () => {
    render(<CompanyRow name="Hale Brothers Builders" kind="gc" />);
    // ConsentChip's four possible labels (person-row.tsx / field-config.ts) —
    // a company card cannot consent to a text message (slide 9), so none of
    // them are reachable from a company row.
    for (const label of ['Not asked', 'Invited', 'Texting', 'Opted out']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });
});

describe('CompanyRow — graceful with a partial or absent relationship history', () => {
  it('renders an honest "not yet on a project" line when every count is absent', () => {
    render(<CompanyRow name="Junie's Tile" kind="vendor" />);
    expect(screen.getByText('Not yet on a project')).toBeInTheDocument();
  });

  it('renders whichever counts ARE present, in order', () => {
    render(
      <CompanyRow
        name="Hale Brothers Builders"
        kind="gc"
        companyPeopleCount={3}
        projectsCount={4}
        lastProjectName="Ellsworth"
      />,
    );
    expect(
      screen.getByText('3 people · 4 projects · last: Ellsworth'),
    ).toBeInTheDocument();
  });

  it('omits a zero people-count rather than claiming "0 people"', () => {
    render(
      <CompanyRow
        name="Hale Brothers Builders"
        kind="gc"
        companyPeopleCount={0}
        projectsCount={2}
        lastProjectName="Marsh House"
      />,
    );
    expect(screen.queryByText(/0 people/)).not.toBeInTheDocument();
    expect(screen.getByText('2 projects · last: Marsh House')).toBeInTheDocument();
  });

  it('singularizes a count of exactly one', () => {
    render(<CompanyRow name="Solo Studio" kind="vendor" companyPeopleCount={1} projectsCount={1} />);
    expect(screen.getByText('1 person · 1 project')).toBeInTheDocument();
  });
});
