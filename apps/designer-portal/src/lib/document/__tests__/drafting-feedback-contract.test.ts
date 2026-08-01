/** Source-level feedback contract for the three lagging Drafting Room facets. */
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

const room = read('components/document/rooms/drafting/drafting-room.tsx');
const state = read('hooks/use-drafting-state.ts');
const ffe = read('components/portal/scope-builder/ffe-schedule-builder.tsx');
const phases = read('components/portal/scope-builder/phase-builder.tsx');
const palette = read('components/portal/scope-builder/palette-builder.tsx');

describe('Drafting Room mutation feedback', () => {
  it('announces composite-count reconciliation in the room header', () => {
    expect(state).toMatch(/isRefreshing/);
    expect(room).toContain('Refreshing saved work…');
    expect(room).toContain('aria-live="polite"');
  });

  it.each([
    ['FF&E', ffe],
    ['phases', phases],
    ['palette', palette],
  ])('%s writes immediately invalidate the drafting facet summary', (_name, source) => {
    expect(source).toContain("['drafting-facets', proposalId]");
  });

  it('phase and palette creation disable duplicate submission and name pending work', () => {
    expect(phases).toContain('Adding defaults…');
    expect(phases).toMatch(/disabled=\{phaseWritePending\}/);
    expect(palette).toContain('Creating palette…');
    expect(palette).toMatch(/creating=\{upsertPalette\.isPending\}/);
  });
});
