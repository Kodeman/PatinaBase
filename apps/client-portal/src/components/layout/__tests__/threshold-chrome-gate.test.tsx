import { render, screen } from '@testing-library/react';

/* ── The header, and the two routes that do without it ────────────────────
   The Threshold is a chrome-less page, and it is now the only surface a
   client's project has. Both routes that render it — the front door `/` and
   a bare `/projects/[id]` — drop the global header for every client, however
   many projects she keeps: the mat carries her details, the way out, and her
   other houses, so nothing above the page is load-bearing.

   Every other route keeps the header, which is what keeps a nested page
   navigable. No flag is read. ─────────────────────────────────────────── */

import { ThresholdChromeGate } from '../threshold-chrome-gate';

const header = <div data-testid="header">header</div>;

function gate(pathname: string, hasHouse = true) {
  return render(
    <ThresholdChromeGate pathname={pathname} hasHouse={hasHouse}>
      {header}
    </ThresholdChromeGate>,
  );
}

describe('ThresholdChromeGate', () => {
  it('drops the header on the front door', () => {
    gate('/');

    expect(screen.queryByTestId('header')).not.toBeInTheDocument();
  });

  it('drops the header on a bare project route', () => {
    gate('/projects/proj-1');

    expect(screen.queryByTestId('header')).not.toBeInTheDocument();
  });

  it('drops the header on a bare project route for a multi-project client too', () => {
    // The count is no longer an input at all: the same route, the same
    // answer, for a client with two houses as for a client with one.
    gate('/projects/proj-2');

    expect(screen.queryByTestId('header')).not.toBeInTheDocument();
  });

  it('keeps the header on a nested project route (e.g. scope-change)', () => {
    gate('/projects/proj-1/scope-change/req-1');

    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('keeps the header on a non-project route (e.g. /invoices)', () => {
    gate('/invoices');

    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('keeps the header on the project list', () => {
    gate('/projects');

    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('keeps the header on the account page', () => {
    gate('/account');

    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  // A client with no house gets the empty state on `/`, and the empty state
  // has no mat under it — dropping the header there would leave her with no
  // sign-out, no /account and no way anywhere.
  it('keeps the header on the front door for a client with no house', () => {
    gate('/', false);

    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('renders the same answer on every re-render — there is nothing to resolve', () => {
    const { rerender } = gate('/projects/proj-1');
    expect(screen.queryByTestId('header')).not.toBeInTheDocument();

    rerender(
      <ThresholdChromeGate pathname="/projects/proj-1" hasHouse>
        {header}
      </ThresholdChromeGate>,
    );

    expect(screen.queryByTestId('header')).not.toBeInTheDocument();
  });
});
