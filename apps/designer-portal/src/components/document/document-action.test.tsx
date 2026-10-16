import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DocumentAction } from './document-action';

describe('held DocumentAction focus cue', () => {
  it('cues the focused fixer after mouse activation', async () => {
    render(
      <>
        <DocumentAction
          actionKey="held"
          held
          disabled
          onHeldActivate={() => document.getElementById('fixer')?.focus()}
        >
          Held action
        </DocumentAction>
        <button id="fixer">Fix it</button>
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Held action' }), { detail: 1 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fix it' })).toHaveAttribute('data-held-focus-cue', ''));
  });

  it('leaves keyboard focus styling to the normal focus-visible path', () => {
    render(
      <>
        <DocumentAction
          actionKey="held"
          held
          disabled
          onHeldActivate={() => document.getElementById('fixer')?.focus()}
        >
          Held action
        </DocumentAction>
        <button id="fixer">Fix it</button>
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Held action' }), { detail: 0 });
    expect(screen.getByRole('button', { name: 'Fix it' })).not.toHaveAttribute('data-held-focus-cue');
  });
});
