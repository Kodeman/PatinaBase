/**
 * US-14 arrival — the inert `data-part` marks the brief lifts from (CONTRACT
 * §4). Rendered on the REAL components, so a mark that drifts off its printed
 * node fails here rather than as a declined arrival in production. Fixtures
 * are copied from each component's own suite.
 */

import { render } from '@testing-library/react';
import type {
  AnsweredClientNote,
  ClaimCard,
  DeskRoster as DeskRosterModel,
} from '@/lib/document/desk-roster-derivation';
import {
  deriveLensBand,
  type LensBandInput,
} from '@/lib/document/lens-band-derivation';
import type { RedLetterRow } from '@/components/document/red-letter-zone';
import type { SpineSection } from '@/lib/document/section-derivation';
import { DeskClaimCard } from '@/components/document/desk-claim-card';
import { DeskRoster } from '@/components/document/desk-roster';
import { LensBand } from '@/components/document/lens-band';
import { DocLetterhead } from '@/components/document/doc-letterhead';
import { DocSpine } from '@/components/document/doc-spine';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@/components/document/command-bar', () => ({
  openLedger: jest.fn(),
}));

const mockAnsweredNotes = jest.fn(() => [] as AnsweredClientNote[]);
jest.mock('@/hooks/use-answered-notes', () => ({
  useAnsweredNotes: () => ({ data: mockAnsweredNotes() }),
}));

let mockProject: Record<string, unknown> | undefined;
jest.mock('@patina/supabase', () => ({
  useProjectV2: () => ({ data: mockProject }),
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

// ── The Desk ────────────────────────────────────────────────────────────

function card(over: Partial<ClaimCard> = {}): ClaimCard {
  return {
    stage: 'project',
    stageLabel: 'Project',
    custody: 'Your pen',
    band: 0,
    line: {
      engagementId: 'vandersteen',
      name: 'Vandersteen residence',
      stage: 'project',
      designerId: null,
      state: 'Anne Vandersteen · Procurement And Orders',
      personLine: 'Anne Vandersteen · Procurement And Orders',
      overdueText: 'Overdue 6 days — Invoice 1042 · $17,500 overdue',
      mark: 'urgent',
      needKind: 'overdue_invoice',
      overdue: { isOverdue: true, days: 6 },
      jobHref: '/doc/vandersteen',
      act: { label: 'Send reminder', href: '/doc/vandersteen' },
      client: 'Anne Vandersteen',
      custody: 'Your pen',
      needOwner: 'designer',
      dueOn: '2026-08-12',
      valueText: '12 Aug',
      needText: 'Invoice 1042 · $17,500 overdue',
      motionText: null,
      projectId: null,
    },
    ...over,
  };
}

function roster(over: Partial<DeskRosterModel> = {}): DeskRosterModel {
  return {
    heading: 'Every job · 3 live · 1 overdue',
    overdueLine: 'One thing is overdue — Vandersteen.',
    liveCount: 3,
    overdueCount: 1,
    groups: [
      {
        key: 'proposal',
        label: 'Proposal',
        count: 1,
        lines: [
          {
            engagementId: 'byrne',
            name: 'Byrne remodel',
            stage: 'proposal',
            designerId: null,
            state: 'Erin Byrne · design agreement sent August 19',
            overdueText: null,
            mark: 'quiet',
            custody: 'With Erin',
            needOwner: 'client',
            needKind: 'hesitating_proposal',
            overdue: { isOverdue: false, days: 0 },
            jobHref: '/doc/byrne',
            act: { label: 'Follow up', href: '/doc/byrne' },
          },
        ],
      },
      {
        key: 'project',
        label: 'Project',
        count: 2,
        lines: [
          {
            engagementId: 'vandersteen',
            name: 'Vandersteen residence',
            stage: 'project',
            designerId: null,
            state: 'Anne Vandersteen · Procurement And Orders',
            overdueText:
              'Overdue 6 days — Invoice 1042 · $17,500 overdue — oldest due Aug 2 — send a reminder',
            mark: 'urgent',
            custody: 'Your pen',
            needOwner: 'designer',
            needKind: 'overdue_invoice',
            overdue: { isOverdue: true, days: 6 },
            jobHref: '/doc/vandersteen',
            act: {
              label: 'Send reminder',
              href: '/doc/vandersteen',
              ledger: {
                name: 'accounts',
                context: { page: 'receivables', invoiceId: 'inv-1' },
              },
            },
          },
          {
            engagementId: 'reinhardt',
            name: 'Reinhardt lake house',
            stage: 'project',
            designerId: null,
            state: 'Reinhardt · Site Visit · quiet · nothing needs your hand',
            overdueText: null,
            mark: null,
            needKind: null,
            overdue: { isOverdue: false, days: 0 },
            jobHref: '/doc/reinhardt',
            act: { label: 'Open the job', href: '/doc/reinhardt' },
            custody: 'At rest',
            needOwner: null,
            motionText: 'With client since 4 Aug',
            valueText: '4 Aug',
          },
        ],
      },
    ],
    ...over,
  };
}

/** Five cards, so the day's line quotes three of them. */
function busyRoster(): DeskRosterModel {
  const model = roster();
  model.groups[0].lines.push(
    ...['halvorsen', 'osterberg', 'ellison'].map((id) => ({
      ...model.groups[0].lines[0],
      engagementId: id,
      name: `${id} loft`,
    })),
  );
  model.groups[0].count = 4;
  return model;
}

describe('the Desk marks', () => {
  beforeEach(() => {
    mockAnsweredNotes.mockReturnValue([]);
  });

  it('marks the top card’s job, sentence and act — and the sentence keeps its register', () => {
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" index={0} settle={false} />,
    );

    const job = part(container, 'job');
    expectPrinted(job);
    expect(job).toHaveAttribute('data-register', 'name');
    expect(job.textContent).toBe('Vandersteen residence');

    const headline = part(container, 'headline');
    expectPrinted(headline);
    expect(headline).toHaveAttribute('data-register', 'sentence');
    expect(headline.textContent).toBe(
      'Overdue 6 days — Invoice 1042 · $17,500 overdue',
    );

    const act = part(container, 'act');
    expectPrinted(act);
    expect(act.closest('[data-register="act"]')).not.toBeNull();
    expect(act.textContent).toBe('Send reminder');
  });

  it('marks nothing on a card below the top one', () => {
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" index={1} settle={false} />,
    );
    expect(container.querySelector('[data-part]')).toBeNull();
    expect(container.querySelector('[data-register="sentence"]')).not.toBeNull();
  });

  it('marks one headline on the roster, the day lines quoting cards 2 and 3, and the overdue line', () => {
    const { container } = render(<DeskRoster roster={busyRoster()} />);

    const cards = Array.from(container.querySelectorAll('[data-claim-card]'));
    expect(cards.length).toBeGreaterThanOrEqual(3);

    expect(parts(container, 'headline')).toHaveLength(1);
    expect(parts(container, 'act')).toHaveLength(1);
    expect(parts(container, 'job')).toHaveLength(1);
    const headline = part(container, 'headline');
    expectPrinted(headline);
    expect(headline.closest('[data-claim-card]')).toBe(cards[0]);
    expect(part(container, 'act')!.closest('[data-claim-card]')).toBe(cards[0]);
    expect(part(container, 'job')!.closest('[data-claim-card]')).toBe(cards[0]);

    for (const [name, quoted] of [
      ['f1', cards[1]],
      ['f2', cards[2]],
    ] as const) {
      expect(parts(container, name)).toHaveLength(1);
      const line = part(container, name);
      expectPrinted(line);
      expect(line).toHaveAttribute('data-day-line');
      expect(
        line.querySelector('a[href^="#roster-line-"]')!.getAttribute('href'),
      ).toBe(`#${quoted.id}`);
    }
    // The first day line quotes the headline's own card, so it is no fact.
    expect(
      container.querySelector('[data-day-line]')!.hasAttribute('data-part'),
    ).toBe(false);

    expect(parts(container, 'settle')).toHaveLength(1);
    const settle = part(container, 'settle');
    expectPrinted(settle);
    expect(settle.textContent).toBe('One thing is overdue — Vandersteen.');
    expect(settle).not.toBe(headline);
  });

  it('never marks the answered note as a fact', () => {
    const model = roster();
    model.groups[1].lines[1] = {
      ...model.groups[1].lines[1],
      client: 'Nora Ellison',
      projectId: 'p-reinhardt',
    };
    mockAnsweredNotes.mockReturnValue([
      { projectId: 'p-reinhardt', answeredAt: new Date().toISOString() },
    ]);
    const { container } = render(<DeskRoster roster={model} />);

    const answered = container.querySelector('[data-day-line="answered"]');
    expect(answered).not.toBeNull();
    expect(answered!.hasAttribute('data-part')).toBe(false);
  });

  it('on a quiet roster, the always-printed overdue line is the one headline and the settle', () => {
    const model = roster();
    for (const group of model.groups) {
      for (const line of group.lines) {
        line.mark = null;
        line.needKind = null;
        line.overdueText = null;
        line.overdue = { isOverdue: false, days: 0 };
      }
    }
    model.overdueCount = 0;
    model.overdueLine = 'Nothing is overdue.';
    const { container } = render(<DeskRoster roster={model} />);

    expect(container.querySelector('[data-claim-card]')).toBeNull();
    expect(parts(container, 'headline')).toHaveLength(1);
    const headline = part(container, 'headline');
    expectPrinted(headline);
    expect(headline.textContent).toBe('Nothing is overdue.');
    expect(parts(container, 'settle')).toEqual([headline]);
    expect(parts(container, 'act')).toHaveLength(0);
  });

  it('with no live jobs, the quiet line is the one headline and the settle — never two nodes', () => {
    const { container } = render(
      <DeskRoster
        roster={roster({
          groups: [],
          liveCount: 0,
          overdueCount: 0,
          overdueLine: 'Nothing is overdue.',
        })}
      />,
    );

    expect(parts(container, 'headline')).toHaveLength(1);
    const headline = part(container, 'headline');
    expectPrinted(headline);
    expect(headline.textContent).toBe(
      'Nothing needs your hand. The work is in motion.',
    );
    expect(parts(container, 'settle')).toEqual([headline]);
    expect(parts(container, 'act')).toHaveLength(0);
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
    expect(part(container, 'f1')!.textContent).toMatch(/^Start/);
    expect(part(container, 'f2')!.textContent).toMatch(/^Target/);
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
