import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DocSpine } from './doc-spine';
import type { SpineSection } from '@/lib/document/section-derivation';

// The mark carries meaning now, so the stub carries its name and its fill:
// W7-R1 §1's whole subject is which single mark prints and how full it is.
jest.mock('./strata-mark', () => ({
  StrataMark: ({
    label,
    fill,
    size,
    breathing,
  }: {
    label?: string;
    fill?: [number, number, number];
    size?: string;
    breathing?: boolean;
  }) =>
    label ? (
      <span
        role="img"
        aria-label={label}
        data-mark-fill={fill?.join(',')}
        data-mark-size={size}
        data-mark-breathing={breathing ? 'true' : undefined}
      />
    ) : (
      <span aria-hidden>mark</span>
    ),
}));

const sections: SpineSection[] = [
  { key: 'brief', label: 'Brief', state: 'unrecorded', sub: 'Not recorded' },
  { key: 'project', label: 'Project', state: 'active', sub: 'Active' },
];

describe('DocSpine at the narrow tier (1180–1439) — F02', () => {
  it('prints the active section label and "Put down" from 1180, not only from 1440', () => {
    render(<DocSpine sections={sections} onJump={jest.fn()} />);
    expect(screen.getByText('Put down')).toHaveClass('min-[1180px]:inline');
  });

  it('mounts the ladder at BOTH desktop tiers — the block is no longer gated at 1440 (OD-15.3)', () => {
    // The shelved slot used to hide below 1440 because the paper needed its
    // measure more than the rail needed furniture. A 136px rail that prints
    // words does not have that trade to make: the ladder mounts once, and the
    // two tiers differ by class inside it (OD-14), not by whether it is there.
    const { container } = render(
      <DocSpine sections={sections} onJump={jest.fn()} />,
    );
    const ladder = screen.getByRole('navigation', { name: 'This paper' });
    expect(ladder).toBeInTheDocument();
    for (
      let node = ladder.parentElement;
      node && node !== container;
      node = node.parentElement
    ) {
      expect(node.className).not.toContain('min-[1440px]:block');
    }
  });
});

describe('DocSpine · the rail head (R127 W1; W7-R1 §1)', () => {
  function renderHead(props: Partial<Parameters<typeof DocSpine>[0]> = {}) {
    const { container } = render(
      <DocSpine
        sections={sections}
        onJump={jest.fn()}
        household="Vandersteen"
        {...props}
      />,
    );
    const head = container.querySelector('[data-spine-head]');
    if (!head) throw new Error('the rail head did not mount');
    return head as HTMLElement;
  }

  it('prints the household, ONE progress mark and the two stage-phrase lines in one reserved block', () => {
    const head = renderHead({
      stageWord: 'Procurement & Orders',
      stagePhase: { name: 'Procurement & Orders', position: 3, of: 5 },
    });

    // The household, at the letterhead's own name, 13px.
    expect(within(head).getByText('Vandersteen')).toHaveClass('text-[13px]');

    // W7-R1 §1 — the seven-mark arc is gone: no list, no jump cells, and ONE
    // mark in its place, named by the stage word and the ordinal.
    expect(within(head).queryByRole('list')).toBeNull();
    expect(head.querySelectorAll('[role="img"]')).toHaveLength(1);
    const mark = within(head).getByRole('img', {
      name: 'Procurement & Orders — 3 of 5',
    });
    expect(mark).toHaveAttribute('data-mark-size', 'md');
    expect(mark).toHaveAttribute('data-mark-breathing', 'true');

    // The count itself stays printed — Kody called the ROW useless, not the
    // number — and it is formatted from the same phase the mark is named from.
    const phrase = head.querySelector('[data-spine-stage-phrase]');
    expect(phrase).not.toBeNull();
    expect(phrase).toHaveClass('font-mono', 'text-[11px]', 'uppercase');
    expect(
      within(phrase as HTMLElement).getByText('Procurement & Orders'),
    ).toBeInTheDocument();
    expect(within(phrase as HTMLElement).getByText('3 OF 5')).toBeInTheDocument();

    // The height is still RESERVED, not measured — at the new, smaller
    // reserve the arc's 44/48px row left behind.
    expect(head).toHaveClass('min-h-[107px]', 'min-[1440px]:min-h-[93px]');
  });

  it('is inert: no press, no tooltip, no tabstop on the mark (W7-R1 §1)', () => {
    const head = renderHead({
      stageWord: 'Procurement & Orders',
      stagePhase: { name: 'Procurement & Orders', position: 3, of: 5 },
    });
    const mark = within(head).getByRole('img', {
      name: 'Procurement & Orders — 3 of 5',
    });
    expect(mark.closest('button')).toBeNull();
    expect(mark.closest('a')).toBeNull();
    expect(mark).not.toHaveAttribute('title');
    expect(mark).not.toHaveAttribute('tabindex');
    expect(screen.queryByRole('button', { name: /Jump to/ })).toBeNull();
  });

  it('takes its fill from the engagement’s own section — and prints UNFILLED before the work (W7-R1 §1)', () => {
    // `project` is active, so shaping and commitment are behind her and
    // delivery has just begun: the staircase `fillStateAtSection` already
    // computes, unchanged.
    const working = renderHead({ stageWord: 'Procurement & Orders' });
    expect(
      within(working).getByRole('img', { name: 'Procurement & Orders' }),
    ).toHaveAttribute('data-mark-fill', '1,1,0.16666666666666666');

    cleanup();

    // A pre-work spread has placed no phase: the mark keeps its box and its
    // stage word, and claims no progress.
    const preWork = renderHead({ preWork: true, stageWord: 'Proposal' });
    const mark = within(preWork).getByRole('img', { name: 'Proposal' });
    expect(mark).toHaveAttribute('data-mark-fill', '0,0,0');
    expect(preWork.querySelectorAll('[role="img"]')).toHaveLength(1);
  });

  it('the mark is a GLYPH, never a rail label — the R1 census is unchanged', () => {
    const head = renderHead({ stageWord: 'Procurement & Orders' });
    const mark = within(head).getByRole('img', { name: 'Procurement & Orders' });
    expect(mark).not.toHaveAttribute('data-rail-label');
    expect(mark.closest('[data-rail-label]')).toBeNull();
    // Two head labels remain: the household and the stage phrase's top line.
    expect(head.querySelectorAll('[data-rail-label]')).toHaveLength(2);
  });

  it('carries no timer and no presence line — both left the rail (OD-16)', () => {
    const { container } = render(
      <DocSpine sections={sections} onJump={jest.fn()} household="Vandersteen" />,
    );
    expect(screen.queryByTestId('spine-timer')).toBeNull();
    expect(container.querySelector('[data-spine-timer-regime]')).toBeNull();
    expect(container.querySelector('[data-full-spine-timer]')).toBeNull();
    expect(container.querySelector('[data-compact-spine-timer-doorway]')).toBeNull();
    expect(screen.queryByText(/Leah/)).toBeNull();
    expect(screen.queryByText(/visible to the studio/)).toBeNull();
  });

  it('names the held room in the head and puts it down from there (C-1)', () => {
    const onReleaseRoom = jest.fn();
    render(
      <DocSpine
        sections={sections}
        onJump={jest.fn()}
        household="Vandersteen"
        roomInHand={{ id: 'r1', name: 'Kitchen' }}
        onReleaseRoom={onReleaseRoom}
      />,
    );

    // Prints IN HAND · KITCHEN — the words are sentence-cased in the tree and
    // set uppercase, so the line reads the same as the letterhead's did.
    const line = screen.getByText('In hand · Kitchen');
    expect(line).toHaveClass('uppercase', 'font-mono', 'text-[11px]');

    fireEvent.click(screen.getByRole('button', { name: 'Put down the room' }));
    expect(onReleaseRoom).toHaveBeenCalledWith('r1');
  });

  it('prints nothing about a room when none is held', () => {
    const { container } = render(
      <DocSpine sections={sections} onJump={jest.fn()} household="Vandersteen" />,
    );
    expect(container.querySelector('[data-spine-room-in-hand]')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Put down the room' }),
    ).toBeNull();
  });

  it('publishes the one regime vocabulary — the narrow rail prints words (OD-5)', () => {
    const { container } = render(
      <DocSpine sections={sections} onJump={jest.fn()} />,
    );
    expect(
      container.querySelector('[data-document-spine]'),
    ).toHaveAttribute(
      'data-spine-regime',
      'sheet-below-1180-narrow-to-1439-full-from-1440',
    );
  });
});
