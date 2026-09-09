import { render, screen } from '@testing-library/react';

import { LetterShell, type LetterSnapshotView } from '../letter-shell';

const SNAP: LetterSnapshotView = {
  kind: 'invite',
  recipientName: 'Dave Okonkwo',
  studioName: 'Middle West Studio',
  studioLogoUrl: null,
  signatureCity: 'Madison',
  designerFullName: 'Leah Hartwell',
  designerGivenName: 'Leah',
  projectName: 'Van Hise kitchen and back hall',
  standingSentence:
    "Leah Hartwell of Middle West Studio added you to the Van Hise kitchen and back hall on 8 September. The page below holds the studio's record of the job — the plans, the papers, and the numbers.",
  personalMessage: 'Dave — the drawings are in.',
  sentAt: '2026-09-08T14:00:00.000Z',
  expiresAt: '2026-09-15T14:00:00.000Z',
};

it('PP-1 — the studio is on top and Patina appears once, in the colophon', () => {
  const { container } = render(<LetterShell snapshot={SNAP}>{null}</LetterShell>);
  expect(screen.getByTestId('letter-letterhead')).toHaveTextContent('MIDDLE WEST STUDIO');
  expect(screen.getByTestId('letter-letterhead')).toHaveTextContent('Madison · 8 September 2026');
  expect(screen.getByTestId('letter-letterhead')).toHaveTextContent('Prepared for Dave Okonkwo');
  expect((container.textContent ?? '').match(/Patina/g) ?? []).toHaveLength(1);
  expect(screen.getByTestId('letter-colophon')).toHaveTextContent(
    'Prepared by Middle West Studio · Sent through Patina',
  );
});

it('R6 — the headline is the house, never "Welcome to Patina."', () => {
  render(<LetterShell snapshot={SNAP}>{null}</LetterShell>);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'Van Hise kitchen and back hall',
  );
  expect(screen.queryByText(/Welcome to Patina/)).toBeNull();
});

it('names the page when there is no project', () => {
  render(<LetterShell snapshot={{ ...SNAP, projectName: null }}>{null}</LetterShell>);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'A page for your work together',
  );
});

it('prints the FROZEN standing sentence, word for word', () => {
  render(<LetterShell snapshot={SNAP}>{null}</LetterShell>);
  expect(screen.getByTestId('letter-standing')).toHaveTextContent(SNAP.standingSentence);
});

it('carries the note as a quoted block, and prints nothing without one', () => {
  const { rerender } = render(<LetterShell snapshot={SNAP}>{null}</LetterShell>);
  expect(screen.getByTestId('letter-note')).toHaveTextContent('Dave — the drawings are in.');
  rerender(<LetterShell snapshot={{ ...SNAP, personalMessage: null }}>{null}</LetterShell>);
  // ABSENCE IS SILENCE: no empty frame, no "Leah didn't leave a note".
  expect(screen.queryByTestId('letter-note')).toBeNull();
});

it('R7′ — signs with the full name, dropping empty segments and separators', () => {
  const { rerender } = render(<LetterShell snapshot={SNAP}>{null}</LetterShell>);
  expect(screen.getByTestId('letter-signoff')).toHaveTextContent(
    '— Leah Hartwell · Middle West Studio · Madison',
  );
  rerender(
    <LetterShell
      snapshot={{ ...SNAP, studioName: null, signatureCity: null, designerFullName: 'Nora Feld' }}
    >
      {null}
    </LetterShell>,
  );
  expect(screen.getByTestId('letter-signoff')).toHaveTextContent('— Nora Feld');
  expect(screen.getByTestId('letter-signoff').textContent).not.toContain('·');
});

it('states the expiry once, with its remedy, and never for a notice', () => {
  const { rerender } = render(<LetterShell snapshot={SNAP}>{null}</LetterShell>);
  expect(screen.getByTestId('letter-expiry')).toHaveTextContent(
    'The link works until 15 September; Leah can send another.',
  );
  rerender(<LetterShell snapshot={{ ...SNAP, kind: 'notice' }}>{null}</LetterShell>);
  expect(screen.queryByTestId('letter-expiry')).toBeNull();
});

it('says none of the words a homeowner must never read here', () => {
  const { container } = render(<LetterShell snapshot={SNAP}>{null}</LetterShell>);
  const text = container.textContent ?? '';
  for (const banned of ['Accept', 'accept', 'collaborate', 'workspace', 'dashboard', 'Welcome']) {
    expect(text).not.toContain(banned);
  }
});

it('prints no slot it has no fact for', () => {
  render(
    <LetterShell snapshot={{ ...SNAP, recipientName: null, signatureCity: null }}>
      {null}
    </LetterShell>,
  );
  const head = screen.getByTestId('letter-letterhead').textContent ?? '';
  expect(head).not.toContain('Prepared for');
  expect(head).toContain('8 September 2026');
  expect(head).not.toContain('· 8 September 2026');
});

it('carries the studio mark when the snapshot froze one', () => {
  render(
    <LetterShell snapshot={{ ...SNAP, studioLogoUrl: 'https://cdn.test/mw.png' }}>
      {null}
    </LetterShell>,
  );
  expect(screen.getByRole('img', { name: 'Middle West Studio' })).toHaveAttribute(
    'src',
    'https://cdn.test/mw.png',
  );
});

it('puts the designer on the letterhead when there is no studio', () => {
  render(<LetterShell snapshot={{ ...SNAP, studioName: null }}>{null}</LetterShell>);
  expect(screen.getByTestId('letter-letterhead')).toHaveTextContent('LEAH HARTWELL');
  expect(screen.getByTestId('letter-colophon')).toHaveTextContent(
    'Prepared by Leah Hartwell · Sent through Patina',
  );
});

/**
 * The production defect, on page two. A studio owner with no full_name and no
 * display_name froze a snapshot with no person on it; this page used to fill
 * the gap with 'Your designer' and — worse — a guessed pronoun, 'she'.
 */
describe('a snapshot with no person on it', () => {
  const NAMELESS: LetterSnapshotView = {
    ...SNAP,
    studioName: 'Middle Studio',
    signatureCity: 'Prairie du Sac',
    designerFullName: null,
    designerGivenName: null,
    projectName: null,
    standingSentence:
      "Middle Studio set up a page for your work together on 9 September. It's where the studio keeps the record — the plans, the papers, and the numbers, as they come.",
  };

  it('lets the studio author the letter, and names no person anywhere', () => {
    const { container } = render(<LetterShell snapshot={NAMELESS}>{null}</LetterShell>);
    const text = container.textContent ?? '';
    expect(text).not.toContain('Your designer');
    expect(text).not.toContain('Your keep');
    expect(text).not.toMatch(/\bshe\b/);
    expect(text).not.toContain('null');
    expect(text).not.toContain('undefined');
    expect(screen.getByTestId('letter-letterhead')).toHaveTextContent('MIDDLE STUDIO');
    expect(screen.getByTestId('letter-colophon')).toHaveTextContent(
      'Prepared by Middle Studio · Sent through Patina',
    );
  });

  it('offers the remedy in the studio\'s name, never a pronoun', () => {
    render(<LetterShell snapshot={NAMELESS}>{null}</LetterShell>);
    expect(screen.getByTestId('letter-expiry')).toHaveTextContent(
      'The link works until 15 September; Middle Studio can send another.',
    );
  });

  it('signs with the studio alone', () => {
    render(<LetterShell snapshot={NAMELESS}>{null}</LetterShell>);
    expect(screen.getByTestId('letter-signoff')).toHaveTextContent(
      '— Middle Studio · Prairie du Sac',
    );
  });

  it('with no studio either: no letterhead name, no sign-off, no remedy name', () => {
    const bare: LetterSnapshotView = {
      ...NAMELESS,
      studioName: null,
      studioLogoUrl: null,
      signatureCity: null,
      standingSentence:
        "A page for your work together was set up on 9 September. It's where the record is kept — the plans, the papers, and the numbers, as they come.",
    };
    const { container } = render(<LetterShell snapshot={bare}>{null}</LetterShell>);
    expect(screen.queryByTestId('letter-signoff')).toBeNull();
    expect(screen.getByTestId('letter-expiry')).toHaveTextContent(
      'The link works until 15 September.',
    );
    expect(screen.getByTestId('letter-colophon')).toHaveTextContent('Sent through Patina');
    expect(screen.getByTestId('letter-colophon')).not.toHaveTextContent('Prepared by');
    expect(container.textContent ?? '').not.toContain('Your designer');
  });
});
