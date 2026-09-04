import { render, screen } from '@testing-library/react';

import type { ThresholdMark } from '@/lib/threshold/derive';
import { PLAN_MARK_STROKE, planKeyGeometry, type KeyRoom } from '@/lib/threshold/plan-key';

import {
  PLAN_PHONE_CONTENT_PX,
  PLAN_PHONE_TYPE,
  PlanKey,
  planPhoneViewBox,
} from '../plan-key';

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

function rooms(count: number): KeyRoom[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `r${index + 1}`,
    name: `Room ${index + 1}`,
    sortOrder: index,
    floorAreaSqft: null,
  }));
}

function geometry(keyRooms: KeyRoom[] = ROOMS, marks: ThresholdMark[] = MARKS) {
  return planKeyGeometry(keyRooms, marks);
}

describe('PlanKey — a key on a drawing', () => {
  it('carries the anchor, the unit, and opts into dimming', () => {
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
    expect(root).toHaveAttribute('data-dimmable');
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

  it('strikes the marks at the plan stroke, in the brass accent', () => {
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
      expect(mark).toHaveAttribute('stroke', 'var(--threshold-accent, #8A5F19)');
    }
  });

  it('keeps the letters above eleven rendered pixels on a phone, however many rooms', () => {
    // SVG type is in user units: rendered px = fontSize × contentWidth / viewBox
    // width. The phone crop exists so this ratio can never fall through 11.
    for (const count of [3, 4, 5]) {
      const phoneViewBox = planPhoneViewBox(planKeyGeometry(rooms(count), []).viewBox);
      const viewBoxWidth = Number(phoneViewBox.split(/\s+/)[2]);
      const renderedPx = (PLAN_PHONE_TYPE * PLAN_PHONE_CONTENT_PX) / viewBoxWidth;

      expect(renderedPx).toBeGreaterThanOrEqual(11);
    }
  });

  it('publishes the cropped viewBox the phone reads', () => {
    const wide = geometry(rooms(5), []);
    const { container } = render(
      <PlanKey geometry={wide} marks={[]} keySentence="Nothing stands open on this drawing." />,
    );

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('data-vb-phone', planPhoneViewBox(wide.viewBox));
    expect(Number(planPhoneViewBox(wide.viewBox).split(/\s+/)[2])).toBeLessThan(
      Number(wide.viewBox.split(/\s+/)[2]),
    );
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

  it('names a mark that belongs to no room, though the drawing cannot place it', () => {
    const homeless: ThresholdMark = {
      id: 'door:p9',
      kind: 'door',
      roomId: null,
      label: 'The design services agreement',
      anchor: 'doorstep',
      proposalId: 'p9',
      amountCents: 0,
    };

    const { container } = render(
      <PlanKey
        geometry={geometry(ROOMS, [homeless])}
        marks={[homeless]}
        keySentence="One mark stands open on this drawing."
      />,
    );

    expect(screen.getByTestId('plan-key-item-door:p9')).toHaveTextContent(
      'The design services agreement — your name.',
    );
    expect(container.querySelectorAll('[data-plan-mark]')).toHaveLength(0);
  });

  it('draws the road even when the house has no rooms yet, and claims nothing else', () => {
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
    expect(screen.queryByTestId('plan-key-item-open')).not.toBeInTheDocument();
  });
});
