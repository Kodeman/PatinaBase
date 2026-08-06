import { fireEvent, render, screen } from '@testing-library/react';
import type { KnownSheet, LightTableProposal } from '@/lib/plans/model';
import { LightTableCard } from '../light-table-card';

const SHEETS: KnownSheet[] = [
  { id: 's401', sheet_number: 'ID-401', title: 'Millwork Elevations — Study' },
  { id: 's402', sheet_number: 'ID-402', title: 'Millwork Elevations — Banquette' },
];

const base: LightTableProposal = {
  pageIndex: 1,
  parsedNumber: 'ID-4O2',
  textSha256: 'x',
  kind: 'revision',
  sheetId: 's402',
  sheetNumber: 'ID-402',
  sheetTitle: 'Millwork Elevations — Banquette',
  discipline: 'ID',
  nearMiss: { parsed: 'ID-4O2', canonical: 'ID-402', readAs: 'O', actual: '0' },
  fork: null,
  requiresFork: true,
};

describe('LightTableCard', () => {
  it('states the near miss in the studio’s own words', () => {
    render(
      <LightTableCard
        proposal={base}
        thumbnail={null}
        currentRev="B"
        sheets={SHEETS}
        conflict={null}
        onChange={jest.fn()}
      />,
    );
    expect(
      screen.getByText(
        /parsed ID-4O2 — a letter O, not a zero\. You hold an ID-402\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('becomes Rev C')).toBeInTheDocument();
  });

  it('holds the card unresolved until a fork is answered', () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <LightTableCard
        proposal={base}
        thumbnail={null}
        currentRev="B"
        sheets={SHEETS}
        conflict={null}
        onChange={onChange}
      />,
    );
    const card = document.querySelector('[data-plan-card]')!;
    expect(card.getAttribute('data-unresolved')).toBe('true');

    const chips = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') !== null);
    expect(chips).toHaveLength(3);
    for (const chip of chips) {
      expect(chip.getAttribute('aria-pressed')).toBe('false');
      expect(chip.className).toContain('min-h-[44px]');
    }
    expect(
      screen.getByRole('button', { name: 'a revision of ID-402' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'file to ID-402 · no new revision' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'a new sheet' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        fork: 'new_sheet',
        kind: 'new_sheet',
        // A new sheet keeps the number the page's own ink carried.
        sheetId: null,
        sheetNumber: 'ID-4O2',
      }),
    );

    const answered = { ...base, fork: 'revision' as const };
    rerender(
      <LightTableCard
        proposal={answered}
        thumbnail={null}
        currentRev="B"
        sheets={SHEETS}
        conflict={null}
        onChange={onChange}
      />,
    );
    expect(
      document.querySelector('[data-plan-card]')!.getAttribute('data-unresolved'),
    ).toBeNull();
  });

  it('offers editable identity fields for a page the room has never held', () => {
    const onChange = jest.fn();
    render(
      <LightTableCard
        proposal={{
          ...base,
          parsedNumber: 'ID-501',
          kind: 'new_sheet',
          sheetId: null,
          sheetNumber: 'ID-501',
          sheetTitle: 'Millwork Details',
          nearMiss: null,
          fork: 'new_sheet',
          requiresFork: false,
        }}
        thumbnail={null}
        currentRev={null}
        sheets={SHEETS}
        conflict={null}
        onChange={onChange}
      />,
    );

    const number = screen.getByLabelText('Sheet number for page 2');
    expect(number).toHaveValue('ID-501');
    fireEvent.change(number, { target: { value: 'ID-502' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ sheetNumber: 'ID-502' }),
    );

    fireEvent.change(screen.getByLabelText('Sheet title for page 2'), {
      target: { value: 'Millwork Details — Study Shelving' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ sheetTitle: 'Millwork Details — Study Shelving' }),
    );

    expect(screen.getByLabelText('Discipline for page 2')).toHaveValue('ID');
    // A brand new sheet's first print is Rev A — never a letter off a filename.
    expect(screen.getByText('becomes Rev A')).toBeInTheDocument();
  });

  it('sends a numberless page to the loose papers rather than guessing', () => {
    render(
      <LightTableCard
        proposal={{
          ...base,
          kind: 'unmatched',
          parsedNumber: null,
          sheetId: null,
          sheetNumber: null,
          nearMiss: null,
          fork: null,
          requiresFork: false,
        }}
        thumbnail={null}
        currentRev={null}
        sheets={SHEETS}
        conflict={null}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText(/It goes to the Folio as a loose paper/)).toBeInTheDocument();
    expect(screen.queryByText(/becomes Rev/)).not.toBeInTheDocument();
  });

  it('lets a page it could not read land on a sheet the room already holds', () => {
    const onChange = jest.fn();
    render(
      <LightTableCard
        proposal={{
          ...base,
          kind: 'unmatched',
          parsedNumber: null,
          sheetId: null,
          sheetNumber: null,
          nearMiss: null,
          fork: null,
          requiresFork: false,
        }}
        thumbnail={null}
        currentRev={null}
        sheets={SHEETS}
        conflict={null}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('File page 2 to an existing sheet'), {
      target: { value: 's401' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'revision',
        fork: 'revision',
        sheetId: 's401',
        sheetNumber: 'ID-401',
      }),
    );
  });

  it('marks a card that collides with another staged card', () => {
    render(
      <LightTableCard
        proposal={{ ...base, fork: 'revision' }}
        thumbnail={null}
        currentRev="B"
        sheets={SHEETS}
        conflict="Two pages are filed to this same sheet (p.2, p.3)."
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Two pages are filed to this same sheet/,
    );
    expect(
      document.querySelector('[data-plan-card]')!.getAttribute('data-conflicted'),
    ).toBe('true');
  });

  // A page that failed to draw and a page still being drawn used to share one
  // state, so a failure read as work in progress and the placeholder never
  // ended. The two states are now distinct and the card says which it is.
  it('says the page is being drawn while no attempt has finished', () => {
    render(
      <LightTableCard
        proposal={base}
        thumbnail={undefined}
        currentRev="B"
        sheets={SHEETS}
        conflict={null}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText('Drawing the page…')).toBeInTheDocument();
    expect(screen.queryByText('No preview')).not.toBeInTheDocument();
  });

  it('says there is no preview once the drawing has failed', () => {
    render(
      <LightTableCard
        proposal={base}
        thumbnail={null}
        currentRev="B"
        sheets={SHEETS}
        conflict={null}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText('No preview')).toBeInTheDocument();
    expect(screen.queryByText('Drawing the page…')).not.toBeInTheDocument();
    // The picture is what is missing — the page is still placeable.
    expect(screen.getByText('becomes Rev C')).toBeInTheDocument();
  });
});
