import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { RegionHead, type RegionLedgerEntry } from '../region-head';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

const GLOBALS_CSS = join(__dirname, '../../../../app/globals.css');

const ledger: RegionLedgerEntry[] = [
  { key: 'lead-act', label: 'Approve', onClick: jest.fn() },
  { key: 'second-act', label: 'Revise', onClick: jest.fn() },
  { key: 'third-act', label: 'Withdraw', variant: 'danger', onClick: jest.fn() },
  { key: 'fourth-act', label: 'History', variant: 'tertiary', href: '/x' },
];

function renderHead(props: Partial<Parameters<typeof RegionHead>[0]> = {}) {
  return render(
    <RegionHead
      headingId="region-approvals-heading"
      name="Approvals"
      status="Two decisions waiting"
      surfaceKey="document"
      regionKey="approvals"
      actions={ledger}
      {...props}
    />,
  );
}

describe('RegionHead', () => {
  // US-43 R4 — entry 0 is the one scored lead (primary, unfilled); the rest
  // keep their declared variant, secondary by default.
  it('scores the leading ledger entry primary and leaves the rest their declared variant', () => {
    renderHead();
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveAttribute(
      'data-action-variant',
      'primary',
    );
    expect(document.querySelectorAll('[data-action-variant="inked"]')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Revise' })).toHaveAttribute(
      'data-action-variant',
      'secondary',
    );
    expect(screen.getByRole('button', { name: 'Withdraw' })).toHaveAttribute(
      'data-action-variant',
      'danger',
    );
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute(
      'data-action-variant',
      'tertiary',
    );
  });

  // FR2 F2-13 (R150 R5) — a head whose caller says it has no leader scores
  // nothing: entry 0 keeps its declared variant, secondary by default.
  it('scores nothing when the head is leaderless', () => {
    renderHead({ leaderless: true });
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveAttribute(
      'data-action-variant',
      'secondary',
    );
    expect(
      document.querySelectorAll('[data-action-variant="inked"], [data-action-variant="primary"]'),
    ).toHaveLength(0);
  });

  it('honours a variant the caller declares on the leading entry', () => {
    renderHead({
      actions: [
        { key: 'lead-act', label: 'Approve', variant: 'tertiary', onClick: jest.fn() },
        ...ledger.slice(1),
      ],
    });
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveAttribute(
      'data-action-variant',
      'tertiary',
    );
    expect(document.querySelectorAll('[data-action-variant="primary"]')).toHaveLength(0);
  });

  it('prints the same lead whatever else stands on the view (no band context)', () => {
    renderHead({ actsAtQuiet: 'leader' });
    const acts = document.querySelectorAll('[data-action-key]');
    expect(acts).toHaveLength(1);
    expect(acts[0]).toHaveTextContent('Approve');
    expect(acts[0]).toHaveAttribute('data-action-variant', 'primary');
  });

  // US-43 R2 — the region name is a real heading level: `.t-d2`, 26px
  // Playfair in ink, sentence case as authored, with no ornament or mono
  // eyebrow register; the status is one `.t-body` ink sentence.
  it('prints the region name as a .t-d2 heading in ink, over its eyebrow', () => {
    const { container } = renderHead({ eyebrow: 'The job · project' });
    const heading = screen.getByRole('heading', { name: 'Approvals' });
    expect(heading).toHaveClass('t-d2', 'text-[var(--ink)]');
    expect(heading).not.toHaveClass('eb');
    expect(heading).not.toHaveClass('uppercase');
    expect(heading.querySelector('svg.orn')).toBeNull();
    expect(heading).toHaveTextContent(/^Approvals$/);
    // `.t-d2` is the 26px Playfair display step.
    const css = readFileSync(GLOBALS_CSS, 'utf8');
    expect(css).toMatch(/\.t-d2\s*\{\s*font-family: var\(--font-display\); font-size: 26px;/);
    // The status line still follows the heading directly (prework-regions
    // e2e reads `[data-region-head] h2 + p`).
    const status = heading.nextElementSibling!;
    expect(status).toHaveTextContent('Two decisions waiting');
    expect(status).toHaveClass('t-body', 'text-[var(--ink)]');
    expect(status.className).not.toMatch(/text-\[12\.5px\]|mocha|rail/);
    const eyebrow = container.querySelector('p')!;
    expect(eyebrow).toHaveTextContent('The job · project');
    expect(eyebrow).toHaveClass(
      'font-mono',
      'text-[11px]',
      'uppercase',
      'text-[var(--text-muted)]',
    );
  });

  it('names the region on a focusable heading, and draws the ring it lands with (D2)', () => {
    renderHead();
    const heading = screen.getByRole('heading', { name: 'Approvals' });
    expect(heading).toHaveAttribute('id', 'region-approvals-heading');
    expect(heading).toHaveAttribute('tabindex', '-1');
    // D2 — a -1 tabindex heading that a rail jump focuses cannot suppress its
    // own outline. The letterhead's declaration, verbatim.
    expect(heading.className).not.toMatch(/\boutline-none\b/);
    expect(heading).toHaveClass(
      'focus-visible:outline',
      'focus-visible:outline-2',
      'focus-visible:outline-offset-2',
      'focus-visible:outline-[var(--color-clay-ink)]',
    );
    // Clay drew the ring at 2.18:1 (under 1.4.11); clay-ink is 5.75:1.
    expect(heading).not.toHaveClass('focus-visible:outline-[var(--color-clay)]');
  });

  it('renders no fold toggle without a body id', () => {
    renderHead();
    expect(
      screen.queryByRole('button', { name: /fold/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the fold toggle expanded and pointed at the body', () => {
    const onFold = jest.fn();
    renderHead({ bodyId: 'region-approvals-body', onFold });
    const fold = screen.getByRole('button', { name: 'Collapse ↑' });
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    expect(fold).toHaveAttribute('aria-controls', 'region-approvals-body');
    expect(fold).toHaveAttribute('data-action-variant', 'tertiary');
  });

  it('keeps the fold when the ledger is empty', () => {
    const onFold = jest.fn();
    renderHead({
      actions: [],
      bodyId: 'region-approvals-body',
      onFold,
    });
    expect(screen.getByRole('button', { name: 'Collapse ↑' })).toBeInTheDocument();
    expect(
      document.querySelectorAll('[data-action-variant="inked"], [data-action-variant="primary"]'),
    ).toHaveLength(0);
    // The fold is the head's own disclosure, not a ledger act: with nothing
    // in the ledger there is no empty, unnamed action group printed for it.
    expect(document.querySelector('[role="group"]')).not.toBeInTheDocument();
  });

  // US-46 B — the Fold sits beside the name on its baseline, outside the
  // ledger, still the region's tertiary disclosure with its telemetry key.
  it('sets the fold beside the name, outside the ledger', () => {
    renderHead({ bodyId: 'region-approvals-body', onFold: jest.fn() });
    const heading = screen.getByRole('heading', { level: 2, name: 'Approvals' });
    const fold = screen.getByRole('button', { name: 'Collapse ↑' });
    const nameLine = heading.parentElement!;

    expect(nameLine).toContainElement(fold);
    expect(nameLine).toHaveClass('flex', 'flex-wrap', 'items-baseline');
    expect(fold).toHaveAttribute('data-action-key', 'approvals-fold');
    expect(fold.closest('[role="group"]')).toBeNull();
    // `h2 + p` stays the status (prework-regions e2e), printed on its own
    // line below the name line.
    const status = document.querySelector('[data-region-head] h2 + p')!;
    expect(status).toHaveTextContent('Two decisions waiting');
    expect(status).toHaveClass('basis-full', 'order-last');
    // Tab order runs the name line before the ledger.
    const group = document.querySelector('[role="group"][data-action-region="approvals"]')!;
    expect(
      fold.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // US-46 B — one left-justified column at every width: the lead alone on its
  // own line, the remaining tools on a wrapping row beneath it.
  it('stacks the lead on its own line over a left-justified tools row', () => {
    renderHead();
    const head = document.querySelector('[data-region-head="approvals"]')!;
    const group = document.querySelector('[role="group"][data-action-region="approvals"]')!;
    const lead = group.querySelector('[data-region-lead]')!;
    const tools = group.querySelector('[data-region-tools]')!;

    expect(head).toHaveClass('grid-cols-1');
    expect(lead).toHaveClass('basis-full');
    expect(lead.querySelectorAll('[data-action-key]')).toHaveLength(1);
    expect(lead).toContainElement(screen.getByRole('button', { name: 'Approve' }));
    expect(tools).toHaveClass('basis-full', 'flex-wrap', 'justify-start');
    expect(
      Array.from(tools.querySelectorAll('[data-action-key]')).map((act) =>
        act.getAttribute('data-action-key'),
      ),
    ).toEqual(['second-act', 'third-act', 'fourth-act']);
    // Nothing at any width sets the head in two tracks or pushes acts right.
    for (const element of [head, group, lead, tools]) {
      expect(element.className).not.toMatch(/justify-end|text-right|grid-cols-\[/);
    }
  });

  it('prints every act on the tools row when nothing leads', () => {
    renderHead({ leaderless: true });
    const group = document.querySelector('[role="group"][data-action-region="approvals"]')!;
    expect(group.querySelector('[data-region-lead]')).toBeNull();
    expect(
      group.querySelectorAll('[data-region-tools] [data-action-key]'),
    ).toHaveLength(4);
  });

  it('prints the lead alone at quiet, with no tools row', () => {
    renderHead({ actsAtQuiet: 'leader' });
    const group = document.querySelector('[role="group"][data-action-region="approvals"]')!;
    expect(group.querySelectorAll('[data-region-lead] [data-action-key]')).toHaveLength(1);
    expect(group.querySelector('[data-region-tools]')).toBeNull();
  });

  // The lead line and the tools row are two lines of ONE named action region:
  // `action-visibility.spec.ts` and the one-leader guard query that element.
  it('keeps one named ledger action region over both lines', () => {
    renderHead({
      status: 'the FF&E schedule, by room · 5 groups · 62 lines',
      actions: [
        { key: 'file-claim', label: 'File the claim', onClick: jest.fn() },
        { key: 'add-line', label: 'Add a line', onClick: jest.fn() },
        { key: 'bill', label: 'Bill 62 uninvoiced lines →', onClick: jest.fn() },
        { key: 'spec', label: 'Spec the 4 unspecified →', onClick: jest.fn() },
      ],
      bodyId: 'region-approvals-body',
      onFold: jest.fn(),
    });
    const groups = document.querySelectorAll('[role="group"][data-action-region="approvals"]');
    expect(groups).toHaveLength(1);
    const group = groups[0];
    expect(group).toHaveAttribute('aria-label', 'Approvals actions');
    expect(group.querySelectorAll('[data-action-key]')).toHaveLength(4);
    expect(group.querySelectorAll('[data-action-variant="primary"]')).toHaveLength(1);
    expect(
      screen.getByText('the FF&E schedule, by room · 5 groups · 62 lines'),
    ).not.toHaveClass('truncate');
    for (const element of [document.querySelector('[data-region-head]')!, group]) {
      expect(
        Array.from(element.classList).filter((name) => /(?:^|:)hidden$/.test(name)),
      ).toEqual([]);
    }
  });

  it('wraps a long status instead of truncating it (F87)', () => {
    const status =
      'Client approvals — 2 awaiting · the Vandersteens · sent Tuesday, August 25';
    renderHead({ status });
    expect(screen.getByText(status)).not.toHaveClass('truncate');
  });

  it('prints the worst two exceptions and drops a third whole', () => {
    renderHead({
      status: 'the FF&E schedule, by room · 3 groups · 12 lines',
      exceptions: ['1 open damage claim', '2 unspecified', '3 uninvoiced'],
    });
    expect(screen.getByText(/1 open damage claim/)).toBeInTheDocument();
    expect(screen.getByText(/2 unspecified/)).toBeInTheDocument();
    // Dropped whole, never abbreviated.
    expect(screen.queryByText(/3 uninvoiced/)).not.toBeInTheDocument();
    expect(screen.queryByText(/…/)).not.toBeInTheDocument();
  });

  // US-43 — status and exceptions are one `.t-body` sentence, never two lines.
  it('prints the status and its exceptions as one ink sentence', () => {
    renderHead({
      status: 'the FF&E schedule, by room · 3 groups · 12 lines',
      exceptions: ['1 open damage claim', '2 unspecified'],
    });
    const lines = document.querySelectorAll('[data-region-head] p.t-body');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveTextContent(
      'the FF&E schedule, by room · 3 groups · 12 lines · 1 open damage claim · 2 unspecified',
    );
  });

  it('prints one status line when the region carries no exception', () => {
    renderHead({ status: 'the FF&E schedule, by room · 1 group · 2 lines' });
    expect(document.querySelectorAll('[data-region-head] p.t-body')).toHaveLength(1);
  });

  it('reports an empty head with nothing to fold', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    renderHead({ actions: [] });
    expect(spy.mock.calls.some((call) => /neither a ledger entry/.test(String(call[0])))).toBe(true);
    spy.mockRestore();
  });

  // W3-L4 — `allowNoActs` silences the guard for a head that is neither
  // foldable nor ledgered by construction (a ratified state), while leaving
  // the guard on everywhere else.
  it('silences the empty-head guard when allowNoActs is set', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    renderHead({ actions: [], allowNoActs: true });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // 0a-8 / D3 Gated — a disabled entry with a reason is held: focusable,
  // `aria-disabled`, the press swallowed, the reason beneath and linked.
  it('holds a disabled entry that carries a reason, and prints the reason beneath', () => {
    const onClick = jest.fn();
    renderHead({
      actions: [
        { key: 'lead-act', label: 'Release', onClick, disabled: true, reason: 'Nothing is ready.' },
        { key: 'second-act', label: 'Revise', onClick: jest.fn(), disabled: true },
      ],
    });
    const held = screen.getByRole('button', { name: 'Release' });
    expect(held).toHaveAttribute('aria-disabled', 'true');
    expect(held).not.toHaveAttribute('disabled');
    held.focus();
    expect(held).toHaveFocus();
    const reason = document.getElementById(held.getAttribute('aria-describedby')!)!;
    expect(reason).toHaveTextContent('Nothing is ready.');
    // US-46 B — the lead's reason prints left-aligned directly under the lead
    // line, before the tools row.
    expect(reason.className).not.toMatch(/text-right/);
    expect(reason.previousElementSibling).toHaveAttribute('data-region-lead');
    held.click();
    expect(onClick).not.toHaveBeenCalled();

    // Without a reason, a disabled entry keeps its native form.
    const plain = screen.getByRole('button', { name: 'Revise' });
    expect(plain).toBeDisabled();
    expect(plain).not.toHaveAttribute('aria-describedby');
  });
});

