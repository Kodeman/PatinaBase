/**
 * The client mirror's pigment (P-17, "Designer Desk pigments" ruling 2026-09-05).
 *
 * Sage stopped carrying approval meaning across the program: the SIGNED /
 * APPROVED / answered marks on the Desk, on the Record page and HERE — the
 * mirror of what the client sees — are mocha ink. Sage stays on material
 * states (DELIVERED, PULSE) only. The mirror was the last of the three named
 * surfaces still marking an answered approval in sage, which is exactly the
 * "two pigments for one meaning across the table" the move exists to close.
 */

import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClientMirror } from '../client-mirror';

import { CURRENT_ROW, PENDING_ROW, listEnvelope } from '../__fixtures__/client-editions';
const { normalizeClientEditions } = jest.requireActual('@patina/supabase');
let mockEditions: unknown;
const mockMirror: { data: unknown } = { data: null };

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mockMirror.data }),
}));

// The edition at the top of the mirror has its own suite (client-mirror-edition).
jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({}),
  useClientEditions: () => ({ data: mockEditions }),
  useClientEditionSourceUrls: () => ({ data: undefined }),
  useProjectFFEItems: () => ({ data: undefined }),
  useStudioIdentity: () => ({ data: undefined }),
  useProjectV2: () => ({ data: undefined }),
  useProjectPalettes: () => ({ data: undefined }),
}));

const answeredDecision = {
  id: 'dec-1',
  title: 'The dining chairs',
  context: null,
  due_date: null,
  status: 'responded',
  decision_kind: 'approval',
  responded_at: '2026-09-02',
  options: [],
};

const mirrorData = (decisions: unknown[]) => ({
  project: { name: 'Ridgeline', status: 'active', client_id: 'client-1' },
  decisions,
  files: [],
  milestones: [],
  messages: [],
  studioMessages: [],
  clientMessages: [],
});

const renderMirror = (decisions: unknown[] = [answeredDecision]) => {
  mockMirror.data = mirrorData(decisions);
  return render(
    <ClientMirror projectId="proj-1" clientName="Leah" onClose={() => {}} />,
  );
};

describe('the client mirror marks an answered approval in mocha', () => {
  afterEach(() => {
    mockMirror.data = null;
  });

  it('paints the answered mark mocha, not sage', () => {
    renderMirror();

    const mark = screen.getByText(/^answered/);
    expect(mark.className).toContain('text-[var(--color-mocha)]');
    expect(mark.className).not.toContain('sage');
  });

  it('leaves no sage anywhere in the section that carries the mark', () => {
    renderMirror();

    const section = screen.getByText(/^answered/).closest('section');
    expect(section).not.toBeNull();
    expect(section?.innerHTML).not.toContain('color-sage');
  });

  it('says the outcome in a word and a date, with no checkmark standing in', () => {
    renderMirror();

    const mark = screen.getByText(/^answered/);
    expect(mark.textContent).toBe('answered · 2 September');
    expect(mark.textContent).not.toMatch(/[✓✔]/u);
  });

  // The pigment must not creep back in on a neighbouring line, so the whole
  // source is held rather than only the one span the render test reaches.
  it('carries no sage token anywhere in the mirror source', () => {
    const source = readFileSync(
      join(__dirname, '..', 'client-mirror.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/color-sage/);
  });
});

describe('closed-job edition authority', () => {
  afterEach(() => { mockEditions = undefined; });

  it.each([true, false])('previews the closing awaiting_review draft on a closed job (prior approved: %s)', (hasApproved) => {
    const closing = { ...PENDING_ROW, closing: true };
    const editions = hasApproved ? [closing, { ...CURRENT_ROW, frozenAt: '2026-10-22T09:00:00+00:00' }] : [closing];
    mockEditions = normalizeClientEditions({ ...listEnvelope(editions, true), projectClosed: true });
    renderMirror([]);
    expect(screen.getByRole('region', { name: 'What Leah will see if approved' })).toHaveAttribute('data-mirror-edition', '5');
    expect(document.querySelector('[data-mirror-edition="4"]')).toBeNull();
  });

  it('a frozen approved edition still suppresses an ordinary waiting draft without projectClosed', () => {
    mockEditions = normalizeClientEditions(listEnvelope([
      PENDING_ROW,
      { ...CURRENT_ROW, frozenAt: '2026-10-22T09:00:00+00:00' },
    ], true));
    renderMirror([]);
    expect(screen.getByRole('region', { name: 'Edition 4' })).toHaveAttribute('data-mirror-edition', '4');
    expect(screen.queryByRole('region', { name: /will see if approved/ })).toBeNull();
  });

  it('an archived job previews the approved edition, never the pending edition', () => {
    mockEditions = normalizeClientEditions({ ...listEnvelope([PENDING_ROW, CURRENT_ROW], true), projectClosed: true });
    renderMirror([]);
    expect(screen.getByRole('region', { name: 'Edition 4' })).toHaveAttribute('data-mirror-edition', '4');
    expect(screen.queryByRole('region', { name: /will see if approved/ })).toBeNull();
    expect(document.querySelector('[data-mirror-edition="5"]')).toBeNull();
  });

  it('a closed pending-only job keeps the no-edition fallback without promising approval', () => {
    mockEditions = normalizeClientEditions({ ...listEnvelope([PENDING_ROW], true), projectClosed: true });
    renderMirror([]);
    expect(document.querySelector('[data-mirror-edition]')).toBeNull();
    expect(screen.queryByText(/will see if approved/)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Ridgeline' })).toBeInTheDocument();
  });
});
