import { render, screen } from '@testing-library/react';
import { DocSpine } from './doc-spine';
import type { SpineSection } from '@/lib/document/section-derivation';

jest.mock('./spine-timer', () => ({ CompactSpineTimerDoorway: () => null, SpineTimer: () => null }));
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

describe('DocSpine at the compact tier (1180–1439) — F02', () => {
  it('prints the active section label and "Put down" from 1180, not only from 1440', () => {
    render(<DocSpine sections={sections} others={[]} onJump={jest.fn()} />);
    expect(screen.getByText('Put down')).toHaveClass('min-[1180px]:inline');
    expect(screen.getByText('Project').closest('p')).toHaveClass(
      'min-[1180px]:block',
    );
  });

  it('keeps the three shelved blocks hidden below 1440 (C8 untouched)', () => {
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
