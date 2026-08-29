import { fireEvent, render, screen, within } from '@testing-library/react';
import { DocSpine } from './doc-spine';
import type { SpineSection } from '@/lib/document/section-derivation';

jest.mock('./strata-mark', () => ({ StrataMark: () => <span aria-hidden>mark</span> }));

const sections: SpineSection[] = [
  { key: 'brief', label: 'Brief', state: 'unrecorded', sub: 'Not recorded' },
  { key: 'project', label: 'Project', state: 'active', sub: 'Active' },
];

describe('DocSpine unrecorded stages', () => {
  it('names unrecorded history but does not make it a jump target', () => {
    render(<DocSpine sections={sections} others={[]} onJump={jest.fn()} />);
    expect(screen.getByLabelText('Brief: Not recorded')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Jump to Brief/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Jump to Project/ })).toBeInTheDocument();
  });
});

describe('DocSpine at the narrow tier (1180–1439) — F02', () => {
  it('prints the active section label and "Put down" from 1180, not only from 1440', () => {
    render(<DocSpine sections={sections} others={[]} onJump={jest.fn()} />);
    expect(screen.getByText('Put down')).toHaveClass('min-[1180px]:inline');
  });

  it('keeps the spine’s one remaining block hidden below 1440 (C8 untouched)', () => {
    // The rail here is A3's form and B1 does not touch it: the label, the word
    // `Put down`, and no blocks — the map is the ticket on the paper now.
    render(
      <DocSpine
        sections={sections}
        others={[]}
        onJump={jest.fn()}
        shelved={<div data-testid="shelved-blocks">shelved</div>}
      />,
    );
    const shelved = screen.getByTestId('shelved-blocks');
    expect(shelved.parentElement).toHaveClass(
      'hidden',
      'min-[1440px]:block',
    );
  });
});

describe('DocSpine · the rail head (R127 W1)', () => {
  function renderHead() {
    const { container } = render(
      <DocSpine
        sections={sections}
        others={[]}
        onJump={jest.fn()}
        household="Vandersteen"
      />,
    );
    const head = container.querySelector('[data-spine-head]');
    if (!head) throw new Error('the rail head did not mount');
    return head as HTMLElement;
  }

  it('prints the household, the seven-mark arc and the two stage-phrase lines in one reserved block', () => {
    const head = renderHead();

    // The household, at the letterhead's own name, 13px.
    expect(within(head).getByText('Vandersteen')).toHaveClass('text-[13px]');

    // The arc, unmoved: one <li> per section, inside the head.
    const arc = within(head).getByRole('list');
    expect(within(arc).getAllByRole('listitem')).toHaveLength(sections.length);

    // The stage phrase: the caption's two strings, re-set as one mono block.
    const phrase = head.querySelector('[data-spine-stage-phrase]');
    expect(phrase).not.toBeNull();
    expect(phrase).toHaveClass('font-mono', 'text-[11px]', 'uppercase');
    expect(within(phrase as HTMLElement).getByText('Project')).toBeInTheDocument();
    expect(within(phrase as HTMLElement).getByText('Active')).toBeInTheDocument();

    // The height is reserved, not measured, at both desktop tiers.
    expect(head).toHaveClass('min-h-[84px]', 'min-[1440px]:min-h-[100px]');
  });

  it('carries no timer and no presence line — both left the rail (OD-16)', () => {
    const { container } = render(
      <DocSpine
        sections={sections}
        others={['Leah']}
        onJump={jest.fn()}
        household="Vandersteen"
      />,
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
        others={[]}
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
      <DocSpine sections={sections} others={[]} onJump={jest.fn()} household="Vandersteen" />,
    );
    expect(container.querySelector('[data-spine-room-in-hand]')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Put down the room' }),
    ).toBeNull();
  });

  it('publishes the one regime vocabulary — the narrow rail prints words (OD-5)', () => {
    const { container } = render(
      <DocSpine sections={sections} others={[]} onJump={jest.fn()} />,
    );
    expect(
      container.querySelector('[data-document-spine]'),
    ).toHaveAttribute(
      'data-spine-regime',
      'sheet-below-1180-narrow-to-1439-full-from-1440',
    );
  });
});
