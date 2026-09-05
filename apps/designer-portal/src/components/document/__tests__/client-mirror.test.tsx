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

const mockMirror: { data: unknown } = { data: null };

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mockMirror.data }),
}));

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({}),
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
    expect(mark.textContent).toBe('answered · Sep 2');
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
