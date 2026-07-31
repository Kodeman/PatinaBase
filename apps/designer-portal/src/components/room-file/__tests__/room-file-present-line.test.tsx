/**
 * RoomFilePresentLine — the only reader of `room_files.present_status`.
 *
 * The property under test is not the wording; it is that a landed delivery
 * leaves a trace at all. Before this component, `present_status` was written
 * by `refine_delivery.deliver()` and read by nothing, so a version parked at
 * `'refining'` was invisible on every ungated surface.
 */

import { render, screen } from '@testing-library/react';
import type { RoomFile } from '@patina/supabase';
import { RoomFilePresentLine } from '../room-file-present-line';
import { ROOM_FILE_COPY as C } from '../room-file-copy';

type Subject = Pick<RoomFile, 'present' | 'present_status'>;

function subject(overrides: Partial<Subject> = {}): Subject {
  return { present: {}, present_status: null, ...overrides };
}

describe('RoomFilePresentLine', () => {
  it.each([
    ['null room file', null],
    ['undefined room file', undefined],
    ['a P1-only version (no Present Layer has run)', subject()],
  ])('%s → renders nothing at all', (_label, roomFile) => {
    const { container } = render(<RoomFilePresentLine roomFile={roomFile} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('a delivered refine is visible with NO feature flag in the loop', () => {
    render(
      <RoomFilePresentLine
        roomFile={subject({
          present_status: 'refining',
          present: { refine_engine: 'colmap-4-known-pose-triangulate-ba' },
        })}
      />,
    );
    const line = screen.getByTestId('room-file-present-line');
    expect(line).toHaveTextContent(C.presentPrefix);
    expect(line).toHaveTextContent(C.presentStatusLabel.refining);
    expect(line).toHaveTextContent('colmap-4-known-pose-triangulate-ba');
  });

  it.each([
    ['pending', C.presentStatusLabel.pending],
    ['refining', C.presentStatusLabel.refining],
    ['fusing', C.presentStatusLabel.fusing],
    ['training', C.presentStatusLabel.training],
    ['ready', C.presentStatusLabel.ready],
    ['error', C.presentStatusLabel.error],
  ] as const)('renders the %s lifecycle value', (status, label) => {
    render(<RoomFilePresentLine roomFile={subject({ present_status: status })} />);
    expect(screen.getByTestId('room-file-present-line')).toHaveTextContent(label);
  });

  it('an unrecognised status shows the raw token rather than a blank page', () => {
    render(
      <RoomFilePresentLine
        roomFile={
          subject({
            // A widened 00376 CHECK this catalogue has not caught up with.
            present_status: 'relighting',
          } as unknown as Partial<Subject>)
        }
      />,
    );
    expect(screen.getByTestId('room-file-present-line')).toHaveTextContent(
      'relighting',
    );
  });

  it.each([
    ['a missing engine', {}],
    ['an engine that is not a string', { refine_engine: { selected: 'colmap' } }],
    ['an empty engine name', { refine_engine: '' }],
  ])('%s → the status still renders, the engine does not', (_label, present) => {
    render(
      <RoomFilePresentLine roomFile={subject({ present_status: 'refining', present })} />,
    );
    const line = screen.getByTestId('room-file-present-line');
    expect(line).toHaveTextContent(C.presentStatusLabel.refining);
    expect(line.textContent).not.toContain('·  ');
    expect(line.textContent).not.toContain('[object Object]');
  });
});
