/**
 * US-14 arrival — the inert `data-part` marks the brief lifts from (CONTRACT
 * §4). Rendered on the REAL components, so a mark that drifts off its printed
 * node fails here rather than as a declined arrival in production. Fixtures
 * are copied from each component's own suite.
 */

import { render } from '@testing-library/react';
import type { NeedLine } from '@/lib/document/desk-derivation';
import type { DeskNeed } from '@/lib/document/desk-need-list';
import { deriveDaySheet } from '@/lib/document/day-sheet';
import {
  deriveLensBand,
  type LensBandInput,
} from '@/lib/document/lens-band-derivation';
import type { RedLetterRow } from '@/components/document/red-letter-zone';
import type { SpineSection } from '@/lib/document/section-derivation';
import { DaySheet } from '@/components/document/day-sheet';
import { LensBand } from '@/components/document/lens-band';
import { DocLetterhead } from '@/components/document/doc-letterhead';
import { DocSpine } from '@/components/document/doc-spine';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@/components/document/command-bar', () => ({
  openLedger: jest.fn(),
}));

let mockProject: Record<string, unknown> | undefined;
jest.mock('@patina/supabase', () => ({
  useProjectV2: () => ({ data: mockProject }),
  useSetNeedState: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/use-project-lifecycle', () => ({
  useSaveProjectVitals: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@/components/document/date', () => ({
  FolioPopover: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  FolioCalendar: () => null,
}));

/** A mark is only liftable if it is text the page prints at rest. */
function expectPrinted(node: Element | null): asserts node is Element {
  expect(node).not.toBeNull();
  expect(node!.textContent?.trim()).not.toBe('');
  expect(node!.closest('.sr-only, [aria-hidden="true"], [hidden]')).toBeNull();
}

// A mark is a token list, read as the mockup's part() reads it
// (`[data-part~=name]`, arrival.js:225): one node may carry two parts.
const part = (root: ParentNode, name: string) =>
  root.querySelector(`[data-part~="${name}"]`);
const parts = (root: ParentNode, name: string) =>
  Array.from(root.querySelectorAll(`[data-part~="${name}"]`));

// ── The Desk (US-25 slice 4: the marks moved onto the Day Sheet) ──────────

const NOW = new Date(2026, 9, 9, 10, 0, 0);

function sheetNeed(i: number, over: Partial<NeedLine> = {}): DeskNeed {
  const key = `task_due:t${i}`;
  return {
    key,
    projectId: `p${i}`,
    projectName: `Job ${i}`,
    need: {
      key,
      kind: 'task_due',
      text: `Task ${i} is due`,
      actionLabel: 'Open the task',
      stamp: { label: 'DUE', color: 'var(--color-clay)' },
      urgent: false,
      owner: 'designer',
      ...over,
    } as NeedLine,
  };
}

function renderSheet(needs: DeskNeed[], unreadFeeds: string[] = []) {
  const sheet = deriveDaySheet({
    needs,
    states: new Map(),
    leads: new Map(),
    meUserId: 'me',
    scope: 'studio',
    unreadFeeds,
    now: NOW,
  });
  return render(<DaySheet sheet={sheet} scope="studio" onScope={() => {}} now={NOW} />);
}

describe('the Desk marks', () => {
  it('marks the top line’s job, sentence and act; lines two and three are the facts', () => {
    const { container } = renderSheet([1, 2, 3, 4].map((i) => sheetNeed(i)));
    const lines = Array.from(container.querySelectorAll('[data-day-sheet-line]'));

    expect(parts(container, 'headline')).toHaveLength(1);
    expect(parts(container, 'job')).toHaveLength(1);
    expect(parts(container, 'act')).toHaveLength(1);
    const headline = part(container, 'headline');
    expectPrinted(headline);
    expect(headline.closest('[data-day-sheet-line]')).toBe(lines[0]);
    const job = part(container, 'job');
    expectPrinted(job);
    expect(job.textContent).toBe('Job 1');
    const act = part(container, 'act');
    expectPrinted(act);
    expect(act.textContent).toBe('Open the task');
    expect(act.closest('[data-day-sheet-line]')).toBe(lines[0]);

    for (const [name, quoted] of [
      ['f1', lines[1]],
      ['f2', lines[2]],
    ] as const) {
      expect(parts(container, name)).toEqual([quoted]);
      expectPrinted(quoted);
    }
    expect(lines[3].hasAttribute('data-part')).toBe(false);

    expect(parts(container, 'settle')).toHaveLength(1);
    const settle = part(container, 'settle');
    expectPrinted(settle);
    expect(settle).not.toBe(headline);
  });

  it('on an empty sheet, the one sentence is the headline and the settle — never two nodes', () => {
    const { container } = renderSheet([]);
    expect(parts(container, 'headline')).toHaveLength(1);
    const headline = part(container, 'headline');
    expectPrinted(headline);
    expect(headline.textContent).toBe('No current action alerts.');
    expect(parts(container, 'settle')).toEqual([headline]);
    expect(parts(container, 'act')).toHaveLength(0);
  });

  it('while a feed is unread, the not-checked sentence is the headline instead', () => {
    const { container } = renderSheet([], ['invoices']);
    const headline = part(container, 'headline');
    expectPrinted(headline);
    expect(headline.textContent).toBe('Not checked: invoices.');
    expect(parts(container, 'settle')).toEqual([headline]);
  });
});

// ── The Document ────────────────────────────────────────────────────────

const need = (
  key: string,
  kind: RedLetterRow['kind'],
  text: string,
  actionLabel: string,
): RedLetterRow => ({
  key,
  kind,
  text,
  actionLabel,
  onAct: jest.fn(),
  urgent: true,
});

const bandInput = (over: Partial<LensBandInput> = {}): LensBandInput => ({
  spreadKind: 'project',
  ticket: [],
  needs: [],
  guide: null,
  tier: 'full',
  household: 'Vandersteen residence',
  stageWord: 'Procurement & Orders',
  stageIndex: { position: 4, of: 6 },
  installDate: 'SEP 15',
  moneyFigure: '$17,500 OUT',
  proposalInvestment: null,
  sentDate: null,
  readingStop: null,
  ...over,
});

describe('the Document marks', () => {
  it('marks the band’s printed sentence as the headline and its act as the act', () => {
    const model = deriveLensBand(
      bandInput({
        needs: [
          need(
            'a',
            'overdue_decision',
            'Primary bedroom approval overdue 6 days',
            'Send a reminder',
          ),
        ],
      }),
    );
    const { container } = render(<LensBand model={model} docId="doc-1" />);

    const headline = part(container, 'headline');
    expectPrinted(headline);
    expect(headline).toHaveAttribute('data-lens-sentence');
    expect(headline.textContent).toBe(model.line2.sentence);
    // The full tier prints the long form: the card reads the page itself.
    expect(model.line2.form).toBe('long');
    expect(headline).not.toHaveAttribute('data-arr-long');

    const act = part(container, 'act');
    expectPrinted(act);
    expect(act.closest('[data-lens-line="2"]')).not.toBeNull();
    expect(act.textContent).toBe(model.line2.act!.label);
  });

  it('marks no headline on a quiet band — the sentence prints nothing', () => {
    const model = deriveLensBand(bandInput());
    expect(model.line2.kind).toBe('none');
    const { container } = render(<LensBand model={model} docId="doc-1" />);

    expect(part(container, 'headline')).toBeNull();
    expect(part(container, 'act')).toBeNull();
    expect(container.querySelector('[data-lens-sentence]')).not.toBeNull();
    expect(container.querySelector('[data-arr-long]')).toBeNull();
  });

  it.each(['full', 'narrow'] as const)(
    'prints the long sentence at the %s tier and carries no data-arr-long',
    (tier) => {
      const model = deriveLensBand(
        bandInput({
          tier,
          needs: [
            need('a', 'overdue_decision', 'Primary bedroom approval overdue 6 days', 'Send a reminder'),
          ],
        }),
      );
      expect(model.line2.form).toBe('long');
      const { container } = render(<LensBand model={model} docId="doc-1" />);
      const headline = part(container, 'headline');
      expect(headline.textContent).toBe(model.line2.long.sentence);
      expect(headline).not.toHaveAttribute('data-arr-long');
    },
  );

  it('prints a medium guide sentence at the mobile tier and carries no data-arr-long (D2)', () => {
    const model = deriveLensBand(
      bandInput({
        tier: 'mobile',
        guide: {
          text: 'Client signature is due before the Vandersteen project can be activated.',
          act: null,
          medium: 'Signature due from the Vandersteens.',
          short: 'SIGNATURE DUE',
        },
      }),
    );
    expect(model.line2.kind).toBe('guide');
    expect(model.line2.form).toBe('medium');
    const { container } = render(<LensBand model={model} docId="doc-1" />);
    const headline = part(container, 'headline');
    expectPrinted(headline);
    expect(headline.textContent).toBe('Signature due from the Vandersteens.');
    expect(headline).not.toHaveAttribute('data-arr-long');
  });

  it('carries the long form on the headline where the tier prints a shorter one (D2)', () => {
    const model = deriveLensBand(
      bandInput({
        tier: 'mobile',
        needs: [
          need(
            'a',
            'overdue_decision',
            'Primary bedroom approval overdue 6 days',
            'Send a reminder',
          ),
        ],
      }),
    );
    expect(model.line2.form).toBe('short');
    expect(model.line2.long.sentence).not.toBe(model.line2.sentence);
    const { container } = render(<LensBand model={model} docId="doc-1" />);

    const headline = part(container, 'headline');
    expectPrinted(headline);
    expect(headline.textContent).toBe(model.line2.sentence);
    expect(headline).toHaveAttribute('data-arr-long', model.line2.long.sentence);
  });

  it('marks the letterhead itself as head — the focusable landing, holding the name', () => {
    mockProject = {
      current_phase: 'procurement',
      start_date: null,
      target_end_date: null,
      budget_min: null,
      budget_max: null,
      total_amount_cents: null,
    };
    for (const projectId of [null, 'project-1']) {
      const { container, unmount } = render(
        <DocLetterhead
          title="Vandersteen residence"
          vitals="$12,400 proposed"
          projectId={projectId}
          fill={[1, 0.4, 0]}
        />,
      );

      expect(parts(container, 'head')).toHaveLength(1);
      const head = part(container, 'head') as HTMLElement;
      expect(head.tagName).toBe('HEADER');
      expect(head.id).toBe('document-project-status');
      expect(head.tabIndex).toBe(-1);
      expect(head.closest('[aria-hidden="true"], [hidden]')).toBeNull();
      expect(head.contains(part(container, 'name'))).toBe(true);
      unmount();
    }
  });

  it('marks the pre-project letterhead: its name, its crown and its one vital', () => {
    const { container } = render(
      <DocLetterhead
        title="Byrne remodel"
        vitals="$12,400 proposed"
        fill={[1, 0.4, 0]}
      />,
    );

    const name = part(container, 'name');
    expectPrinted(name);
    expect(name.tagName).toBe('H1');
    expect(name.textContent).toBe('Byrne remodel');

    const f1 = part(container, 'f1');
    expectPrinted(f1);
    expect(f1).toHaveAttribute('data-letterhead-vitals');
    expect(f1.textContent).toBe('$12,400 proposed');

    // The crown is the mark itself — a graphic, as the mockup's is.
    const crown = part(container, 'crown');
    expect(crown).not.toBeNull();
    expect(crown!.closest('[aria-hidden="true"], [hidden]')).toBeNull();
    expect(crown!.querySelector('.strata-mark')).not.toBeNull();
  });

  it('marks the project letterhead: name, stage and the recorded vitals', () => {
    mockProject = {
      current_phase: 'procurement',
      start_date: '2026-08-03',
      target_end_date: '2026-10-16',
      budget_min: null,
      budget_max: null,
      total_amount_cents: 5_200_000,
    };
    const { container } = render(
      <DocLetterhead
        title="Vandersteen residence"
        vitals=""
        projectId="project-1"
        fill={[1, 0.4, 0]}
      />,
    );

    const name = part(container, 'name');
    expectPrinted(name);
    expect(name.tagName).toBe('H1');
    expect(name.textContent).toBe('Vandersteen residence');

    for (const vital of ['stage', 'f1', 'f2', 'f3']) {
      expect(parts(container, vital)).toHaveLength(1);
      const node = part(container, vital);
      expectPrinted(node);
      expect(node.closest('[data-letterhead-vitals]')).not.toBeNull();
    }
    // The date vitals as they print — the label and the value, never the ×
    // that clears one or a save status beside it.
    for (const [name, printed] of [
      ['f1', ['Start', '3 August']],
      ['f2', ['Target', '16 October']],
    ] as const) {
      const vital = part(container, name)!;
      expect(Array.from(vital.children, (child) => child.textContent)).toEqual(
        printed,
      );
      expect(vital.textContent).toBe(printed.join(' '));
      expect(
        vital.querySelector('[aria-label^="Clear"], [role="status"]'),
      ).toBeNull();
    }
    expect(part(container, 'f3')!.textContent).toBe('$52,000');
    expect(part(container, 'crown')).not.toBeNull();
  });

  it('never marks a date act — only a recorded value is a vital', () => {
    mockProject = {
      current_phase: 'procurement',
      start_date: null,
      target_end_date: null,
      budget_min: null,
      budget_max: null,
      total_amount_cents: null,
    };
    const { container } = render(
      <DocLetterhead
        title="Vandersteen residence"
        vitals=""
        projectId="project-1"
        fill={[1, 0.4, 0]}
      />,
    );

    expect(container).toHaveTextContent('Set dates');
    for (const vital of ['f1', 'f2', 'f3']) {
      expect(part(container, vital)).toBeNull();
    }
  });

  it('marks the spine’s crown, the one the rail prints at ≥1180', () => {
    const sections: SpineSection[] = [
      { key: 'brief', label: 'Brief', state: 'settled', sub: 'Recorded' },
      { key: 'project', label: 'Project', state: 'active', sub: 'Active' },
    ];
    const { container } = render(
      <DocSpine sections={sections} onJump={jest.fn()} household="Vandersteen" />,
    );

    const crown = part(container, 'crown');
    expect(crown).not.toBeNull();
    expect(crown).toHaveAttribute('data-spine-mark');
    expect(crown!.querySelector('.strata-mark')).not.toBeNull();
  });
});
