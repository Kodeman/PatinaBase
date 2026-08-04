import { fireEvent, render, screen } from '@testing-library/react';
import { openOpenProject } from '../../command-bar';
import { StudioSetupChecklist } from '../studio-setup-checklist';
import type { StudioSetupInput } from '@/lib/document/studio-setup';

jest.mock('../../command-bar', () => ({
  openOpenProject: jest.fn(),
}));

const INCOMPLETE: StudioSetupInput = {
  orgCreatedAt: '2026-01-01T00:00:00.000Z',
  myJobTitle: null,
  memberCountBeyondSelf: 0,
  projectsCount: 0,
};

const COMPLETE: StudioSetupInput = {
  orgCreatedAt: '2026-01-01T00:00:00.000Z',
  myJobTitle: 'Principal',
  memberCountBeyondSelf: 2,
  contactsCount: 4,
  projectsCount: 1,
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-08-04T12:00:00.000Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('StudioSetupChecklist — ticks are derived, never clickable', () => {
  it('renders the always-true step as plain text, not an interactive control', () => {
    render(<StudioSetupChecklist {...INCOMPLETE} onInvite={jest.fn()} />);

    const label = screen.getByText('Name & brand the studio');
    expect(label.closest('button')).toBeNull();
  });

  it('renders the still-open count from the derivation', () => {
    render(<StudioSetupChecklist {...INCOMPLETE} onInvite={jest.fn()} />);
    // 4 of 5 steps open with the bare-minimum studio.
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Still to do')).toBeInTheDocument();
  });
});

describe('StudioSetupChecklist — row 3, invite your crew', () => {
  it('the label is a scored word that opens the invite sheet when not done', () => {
    const onInvite = jest.fn();
    render(<StudioSetupChecklist {...INCOMPLETE} onInvite={onInvite} />);

    fireEvent.click(screen.getByText('Invite your crew'));
    expect(onInvite).toHaveBeenCalledTimes(1);
  });

  it('is plain text once a crew member exists', () => {
    const onInvite = jest.fn();
    render(
      <StudioSetupChecklist
        {...INCOMPLETE}
        memberCountBeyondSelf={1}
        onInvite={onInvite}
      />,
    );

    const label = screen.getByText('Invite your crew');
    expect(label.closest('button')).toBeNull();
  });
});

describe('StudioSetupChecklist — row 4, the rolodex SKIP affordance', () => {
  it('renders SKIP disabled with the Wave-2 explainer title, and never calls anything', () => {
    render(<StudioSetupChecklist {...INCOMPLETE} onInvite={jest.fn()} />);

    const skip = screen.getByRole('button', { name: 'Skip' });
    expect(skip).toBeDisabled();
    expect(skip).toHaveAttribute('title', 'coming with the rolodex');

    fireEvent.click(skip);
    // Disabled buttons don't fire onClick — nothing to assert beyond "no throw".
  });

  it('shows the Wave-2 hint copy while un-ticked', () => {
    render(<StudioSetupChecklist {...INCOMPLETE} onInvite={jest.fn()} />);
    expect(
      screen.getByText('The rolodex fills itself from your projects'),
    ).toBeInTheDocument();
  });

  it('un-ticks unless contactsCount>0 or seedSkipped, even with both Wave-2 inputs absent', () => {
    render(<StudioSetupChecklist {...INCOMPLETE} onInvite={jest.fn()} />);
    // Un-ticked row still shows the SKIP button.
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
  });

  it('ticks and drops SKIP once contactsCount is seeded', () => {
    render(
      <StudioSetupChecklist
        {...INCOMPLETE}
        contactsCount={2}
        onInvite={jest.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
  });
});

describe('StudioSetupChecklist — row 4, Call Sheet Wave 2 live behavior', () => {
  it('the label stays plain text (not a button) when onOpenSeedReview is omitted', () => {
    render(<StudioSetupChecklist {...INCOMPLETE} onInvite={jest.fn()} />);
    const label = screen.getByText('Seed the rolodex');
    expect(label.closest('button')).toBeNull();
  });

  it('the label is a scored word that opens the rolodex review when onOpenSeedReview is provided', () => {
    const onOpenSeedReview = jest.fn();
    render(
      <StudioSetupChecklist
        {...INCOMPLETE}
        onInvite={jest.fn()}
        onOpenSeedReview={onOpenSeedReview}
      />,
    );

    fireEvent.click(screen.getByText('Seed the rolodex'));
    expect(onOpenSeedReview).toHaveBeenCalledTimes(1);
  });

  it('SKIP is enabled (not the Wave-1 disabled placeholder) once onSkipSeed is provided', () => {
    const onSkipSeed = jest.fn();
    render(
      <StudioSetupChecklist {...INCOMPLETE} onInvite={jest.fn()} onSkipSeed={onSkipSeed} />,
    );

    const skip = screen.getByRole('button', { name: 'Skip' });
    expect(skip).not.toBeDisabled();
    expect(skip).not.toHaveAttribute('title', 'coming with the rolodex');

    fireEvent.click(skip);
    expect(onSkipSeed).toHaveBeenCalledTimes(1);
  });

  it('disables SKIP while the skip write is in flight', () => {
    render(
      <StudioSetupChecklist
        {...INCOMPLETE}
        onInvite={jest.fn()}
        onSkipSeed={jest.fn()}
        skipSeedPending
      />,
    );
    expect(screen.getByRole('button', { name: 'Skip' })).toBeDisabled();
  });

  it('drops the interactive row-4 controls once the row is done, even with the Wave-2 handlers present', () => {
    render(
      <StudioSetupChecklist
        {...INCOMPLETE}
        contactsCount={2}
        onInvite={jest.fn()}
        onSkipSeed={jest.fn()}
        onOpenSeedReview={jest.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
    expect(screen.getByText('Seed the rolodex').closest('button')).toBeNull();
  });
});

describe('StudioSetupChecklist — row 5, open the first project', () => {
  it('opens the cross-surface open-project front door when not done', () => {
    render(<StudioSetupChecklist {...INCOMPLETE} onInvite={jest.fn()} />);

    fireEvent.click(screen.getByText('Open the first project'));
    expect(openOpenProject).toHaveBeenCalledTimes(1);
  });

  it('is plain text once a project exists', () => {
    render(
      <StudioSetupChecklist {...INCOMPLETE} projectsCount={1} onInvite={jest.fn()} />,
    );
    const label = screen.getByText('Open the first project');
    expect(label.closest('button')).toBeNull();
  });
});

describe('StudioSetupChecklist — settled compression', () => {
  it('collapses to a single mono settled line once every step is done', () => {
    render(<StudioSetupChecklist {...COMPLETE} onInvite={jest.fn()} />);

    expect(screen.getByText('Set up · August 2026')).toBeInTheDocument();
    expect(screen.queryByText('Still to do')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
  });
});
