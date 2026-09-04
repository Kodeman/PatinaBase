import { render, screen } from '@testing-library/react';

import type { SpinePhase } from '@/components/making/making-spine';

import { GroundFloor } from '../ground-floor';

/* ── Path A's order ─────────────────────────────────────────────────────────
   The ground floor owns nothing but the reading sequence, so that is what is
   asserted: Doorstep → Note → Enclosures → Bench → Toll → (rooms, of which
   there are none) → Previously → Ahead → Mat. Each slot is a marked node, so
   the test reads the ORDER rather than any leaf's internals. ─────────────── */

function slot(id: string) {
  return <div data-testid={id} id={id} />;
}

const AHEAD: SpinePhase[] = [
  {
    id: 'ph-5',
    index: 4,
    slug: 'installation',
    label: 'Installation',
    title: 'Installation',
    color: 'var(--phase-installation)',
    status: 'upcoming',
    targetDate: '2026-10-12',
    checklistDone: 0,
    checklistTotal: 0,
  },
  {
    id: 'ph-6',
    index: 5,
    slug: 'completion',
    label: 'Completion',
    title: 'Completion',
    color: 'var(--phase-completion)',
    status: 'upcoming',
    targetDate: '2026-10-26',
    checklistDone: 0,
    checklistTotal: 0,
  },
];

function renderGroundFloor(ahead: SpinePhase[] = AHEAD) {
  return render(
    <GroundFloor
      doorstep={slot('doorstep')}
      note={slot('note')}
      enclosures={slot('enclosures')}
      bench={slot('road')}
      toll={slot('letterbox')}
      previously={slot('previously')}
      ahead={ahead}
      mat={slot('mat')}
    />,
  );
}

describe('GroundFloor — Path A order', () => {
  it('reads doorstep, note, enclosures, bench, toll, previously, ahead, mat', () => {
    const { container } = renderGroundFloor();

    const ordered = Array.from(
      container.querySelectorAll(
        '#doorstep, #note, #enclosures, #road, #letterbox, #previously, #ahead, #mat',
      ),
    ).map((node) => node.id);

    expect(ordered).toEqual([
      'doorstep',
      'note',
      'enclosures',
      'road',
      'letterbox',
      'previously',
      'ahead',
      'mat',
    ]);
  });

  it('sketches the future as weeks, not days', () => {
    renderGroundFloor();

    const lines = screen.getAllByTestId('ahead-line').map((node) => node.textContent);
    expect(lines).toEqual([
      'Installation · the week of October 12',
      'Completion · the week of October 26',
    ]);
  });

  it('says nothing ahead when no future phase carries a date', () => {
    renderGroundFloor([{ ...AHEAD[0], targetDate: undefined }]);

    expect(screen.queryByTestId('ahead')).not.toBeInTheDocument();
  });
});
