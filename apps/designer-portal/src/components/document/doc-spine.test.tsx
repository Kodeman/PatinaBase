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
