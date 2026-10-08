/**
 * US-19 FR2 F2-13 (`one-voice`) — the rail head prints one of the seven stage
 * words (D1, Q4). Design review 2 found Aspen's rail printing the workflow
 * phase `DESIGN DEVELOPMENT` and Cedar's the section sub-label `INSTALLATION`.
 * The workflow names stay data; a held or closed job keeps its state beneath.
 */
import { render } from '@testing-library/react';
import { DocSpine } from '../doc-spine';
import type { SpineSection } from '@/lib/document/section-derivation';

let mockOneVoice = true;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({ value: key === 'one-voice' ? mockOneVoice : false }),
}));
jest.mock('../strata-mark', () => ({
  StrataMark: ({ label }: { label?: string }) => (
    <span role="img" aria-label={label} />
  ),
}));

const at = (key: SpineSection['key'], label: string, sub: string): SpineSection[] => [
  { key: 'brief', label: 'Brief', state: 'settled', sub: 'Recorded' },
  { key, label, state: 'active', sub },
];

function phrase(container: HTMLElement): string {
  const node = container.querySelector('[data-spine-stage-phrase]');
  return (node?.textContent ?? '').trim();
}

beforeEach(() => {
  mockOneVoice = true;
});

describe('the rail’s stage word under one-voice (FR2 F2-13)', () => {
  it('Aspen: a project in a workflow phase prints `Project`, never the phase', () => {
    const { container } = render(
      <DocSpine
        sections={at('project', 'Project', 'Active')}
        stageWord="DESIGN DEVELOPMENT"
        stagePhase={{ name: 'Design Development', position: 2, of: 6 }}
        household="Client User"
      />,
    );
    expect(phrase(container)).toBe('Project');
    expect(container.textContent).not.toMatch(/design development/i);
  });

  it('Cedar: an install prints `Install`, never `Installation`', () => {
    const { container } = render(
      <DocSpine sections={at('install', 'Installation', 'Installation')} household="Nora Ellison" />,
    );
    expect(phrase(container)).toBe('Install');
    expect(container.textContent).not.toMatch(/installation/i);
  });

  it('a held job keeps its state beneath the word', () => {
    const { container } = render(
      <DocSpine
        sections={at('project', 'Project', 'Active')}
        stageWord="PROCUREMENT & ORDERS"
        projectStatus="on_hold"
      />,
    );
    expect(phrase(container)).toBe('ProjectOn hold');
  });

  it('flag off: the phase prints as today', () => {
    mockOneVoice = false;
    const { container } = render(
      <DocSpine sections={at('project', 'Project', 'Active')} stageWord="DESIGN DEVELOPMENT" />,
    );
    expect(phrase(container)).toBe('DESIGN DEVELOPMENT');
  });
});
