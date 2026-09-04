import { render, screen } from '@testing-library/react';

import type { ThresholdMark } from '@/lib/threshold/derive';
import { PLAN_MARK_STROKE, planKeyGeometry, type KeyRoom } from '@/lib/threshold/plan-key';

import { PlanKey } from '../plan-key';

const ROOMS: KeyRoom[] = [
  { id: 'r1', name: 'Entry & stair hall', sortOrder: 0, floorAreaSqft: null },
  { id: 'r2', name: 'Library & lounge', sortOrder: 1, floorAreaSqft: null },
  { id: 'r3', name: 'Primary bedroom', sortOrder: 2, floorAreaSqft: null },
];

const MARKS: ThresholdMark[] = [
  {
    id: 'door:p1',
    kind: 'door',
    roomId: 'r2',
    label: 'The library door',
    anchor: 'door',
    proposalId: 'p1',
    amountCents: 689_000,
  },
  {
    id: 'wall:s1',
    kind: 'wall',
    roomId: 'r1',
    label: 'The painted wall',
    anchor: 'wall',
    proposalId: 'p2',
    amountCents: 144_000,
  },
];

function geometry(rooms: KeyRoom[] = ROOMS, marks: ThresholdMark[] = MARKS) {
  return planKeyGeometry(rooms, marks);
}

describe('PlanKey — a key on a drawing', () => {
  it('carries the anchor and the threshold unit', () => {
    render(
      <PlanKey
        geometry={geometry()}
        marks={MARKS}
        keySentence="Two marks stand open on this drawing."
      />,
    );

    const root = screen.getByTestId('plan-key');
    expect(root).toHaveAttribute('id', 'key');
    expect(root).toHaveAttribute('data-threshold-unit', 'key');
  });

  it('draws the whole house as a group', () => {
    render(
      <PlanKey
        geometry={geometry()}
        marks={MARKS}
        keySentence="Two marks stand open on this drawing."
      />,
    );

    expect(screen.getByRole('group', { name: 'The whole house' })).toBeInTheDocument();
  });

  it('gives one link to each room and one to the road', () => {
    const { container } = render(
      <PlanKey
        geometry={geometry()}
        marks={MARKS}
        keySentence="Two marks stand open on this drawing."
      />,
    );

    const hrefs = Array.from(container.querySelectorAll('svg a')).map((node) =>
      node.getAttribute('href'),
    );
    expect(hrefs).toEqual(['#room-r1', '#room-r2', '#room-r3', '#road']);
  });

  it('strikes the marks at the plan stroke, in the accent', () => {
    const { container } = render(
      <PlanKey
        geometry={geometry()}
        marks={MARKS}
        keySentence="Two marks stand open on this drawing."
      />,
    );

    const struck = Array.from(container.querySelectorAll('[data-plan-mark]'));
    expect(struck).toHaveLength(2);
    for (const mark of struck) {
      expect(mark).toHaveAttribute('stroke-width', String(PLAN_MARK_STROKE));
      expect(mark).toHaveAttribute('stroke', 'var(--threshold-accent)');
    }
  });

  it('letters the leaders in mono at eleven pixels or better', () => {
    const { container } = render(
      <PlanKey
        geometry={geometry()}
        marks={MARKS}
        keySentence="Two marks stand open on this drawing."
      />,
    );

    const texts = Array.from(container.querySelectorAll('svg text'));
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(Number(text.getAttribute('font-size'))).toBeGreaterThanOrEqual(11);
    }
  });

  it('lists each mark beside the drawing, state first', () => {
    render(
      <PlanKey
        geometry={geometry()}
        marks={MARKS}
        keySentence="Two marks stand open on this drawing."
      />,
    );

    expect(screen.getByTestId('plan-key-sentence')).toHaveTextContent(
      'Two marks stand open on this drawing.',
    );
    expect(screen.getByTestId('plan-key-item-door:p1')).toHaveTextContent('Shut');
    expect(screen.getByTestId('plan-key-item-door:p1')).toHaveTextContent('The library door');
    expect(screen.getByTestId('plan-key-item-wall:s1')).toHaveTextContent('Hatched');
    expect(screen.getByTestId('plan-key-item-wall:s1')).toHaveTextContent('The painted wall');
  });

  it('draws the road even when the house has no rooms yet', () => {
    const { container } = render(
      <PlanKey
        geometry={geometry([], [])}
        marks={[]}
        keySentence="Nothing stands open on this drawing."
      />,
    );

    const hrefs = Array.from(container.querySelectorAll('svg a')).map((node) =>
      node.getAttribute('href'),
    );
    expect(hrefs).toEqual(['#road']);
  });
});
