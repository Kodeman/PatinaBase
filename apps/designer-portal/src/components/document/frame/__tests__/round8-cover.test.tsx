/**
 * RC-4 D3 / D1 — the round-8 job cover (Room Proof 08) and the next-act band.
 * Inside the round-8 frame the letterhead prints kicker, serif title, the
 * italic subject, one facts line and the photograph's slot, without the stage
 * mark or the title rule; outside it the legacy letterhead is unchanged.
 * jsdom evaluates no stylesheet, so the band and plate geometry is asserted on
 * round8.css, the idiom the P02 gates use.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DocLetterhead } from '@/components/document/doc-letterhead';
import { LetterheadInstruments } from '@/components/document/letterhead-instruments';
import { Round8MarginContext } from '@/components/document/paper/margin-layout';

const mockProject: Record<string, unknown> = {
  title: 'Aspen Loft',
  current_phase: 'installation',
  start_date: '2026-08-07',
  target_end_date: '2026-12-18',
  budget_min: null,
  budget_max: null,
  total_amount_cents: null,
};
jest.mock('@patina/supabase', () => ({
  useProjectV2: () => ({ data: mockProject }),
  useSessionUserId: () => null,
  useDocumentClientLinkHold: () => ({ data: null }),
  useProjectRoster: () => ({ data: [] }),
  resolveCoverPhoto: () => null,
  publicUrlToPath: () => null,
  createBrowserClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
      }),
    }),
    storage: { from: () => ({ createSignedUrls: () => Promise.resolve({ data: [], error: null }) }) },
  }),
}));
jest.mock('@/hooks/use-project-lifecycle', () => ({
  useSaveProjectVitals: () => ({ mutateAsync: jest.fn(), mutate: jest.fn(), isPending: false }),
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/hooks/use-margin-items', () => ({ invalidateMarginSurfaces: jest.fn() }));
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: true, isLoading: false }),
}));
jest.mock('@/components/document/mobile/mobile-shell', () => ({
  useMobilePrimaryAction: jest.fn(),
  useMobileSecondaryAction: jest.fn(),
}));
jest.mock('@/components/document/client-mirror', () => ({ ClientMirror: () => null }));
jest.mock('@/components/document/proposal-preview', () => ({ ProposalPreview: () => null }));
jest.mock('@/components/document/press-band', () => ({
  PressBand: () => <section data-press-band="">Loading the edition</section>,
}));

const ROUND8_CSS = readFileSync(
  join(__dirname, '..', '..', 'paper', 'round8.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

function renderCover(props: Partial<Parameters<typeof DocLetterhead>[0]> = {}, round8 = true) {
  return render(
    <Round8MarginContext.Provider value={round8}>
      <DocLetterhead
        title="Aspen Loft — the long paper"
        vitals=""
        projectId="p1"
        stage="install"
        stageWord="Install"
        client={<button type="button">for the Hartwells</button>}
        subject={<button type="button" data-letterhead-subject="">A loft for long evenings.</button>}
        instruments={<section data-press-band="">The page opens on photographs of the pieces.</section>}
        {...props}
      />
    </Round8MarginContext.Provider>,
  );
}

describe('the round-8 job cover (RC-4 D3)', () => {
  it('prints kicker, title, subject, facts and the photograph slot, in the reference order', () => {
    const { container } = renderCover();
    const head = container.querySelector('header[data-r8-cover]')!;
    expect(head).not.toBeNull();
    const order = [
      '[data-r8-cover-line]',
      '[data-part="name"]',
      '[data-letterhead-subject]',
      '[data-r8-cover-facts]',
      '[data-r8-cover-plate] [data-press-band]',
    ].map((selector) => head.querySelector(selector));
    expect(order.every(Boolean)).toBe(true);
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(head.querySelector('[data-r8-cover-kicker]')).toHaveTextContent(/^Project · Install$/);
    expect(head.querySelector('[data-r8-cover-client]')).toHaveTextContent('Prepared for the Hartwells');
    expect(head.querySelector('[data-r8-cover-facts] [data-letterhead-vitals]')).not.toBeNull();
    // the facts line does not repeat the stage the kicker now carries
    expect(head.querySelector('[data-r8-cover-facts]')).toHaveAttribute('data-r8-stage-in-kicker');
  });

  it('keeps the head landing contract and drops the stage mark and the title rule', () => {
    const { container } = renderCover();
    const head = container.querySelector('#document-project-status')!;
    expect(head).toHaveAttribute('data-part', 'head');
    expect(head).toHaveAttribute('tabindex', '-1');
    expect(container.querySelector('[data-part="crown"]')).toBeNull();
    expect(container.querySelector('[data-title-rule]')).toBeNull();
    expect(container.querySelector('.title-rule')).toBeNull();
    expect(screen.getByRole('button', { name: 'Rename the project' })).toBeInTheDocument();
  });

  it('prints only the job type when the paper is at its project stage, and omits an absent client', () => {
    const { container } = renderCover({ stage: 'project', stageWord: 'Project', client: undefined });
    expect(container.querySelector('[data-r8-cover-kicker]')).toHaveTextContent(/^Project$/);
    expect(container.querySelector('[data-r8-cover-client]')).toBeNull();
  });

  it('leaves the legacy letterhead as it was outside the round-8 frame', () => {
    const { container } = renderCover({}, false);
    expect(container.querySelector('[data-r8-cover]')).toBeNull();
    expect(container.querySelector('[data-part="crown"]')).not.toBeNull();
    expect(container.querySelector('[data-title-rule="install"]')).not.toBeNull();
  });

  it('hides "Prepared" while the household chip prints nothing', () => {
    expect(ROUND8_CSS).toMatch(
      /\[data-paper-renderer="round8"\] \[data-r8-cover-client\]:not\(:has\(button\)\)\s*\{\s*display: none;/,
    );
  });

  it.each(['proposal', 'brief'] as const)('does not reserve a Press-band box on %s papers', (stage) => {
    const instruments = (
      <QueryClientProvider client={new QueryClient()}>
        <LetterheadInstruments
          projectId={stage === 'brief' ? 'p1' : null}
          proposalId={stage === 'proposal' ? 'proposal-1' : null}
          brief={stage === 'brief'}
          clientProfileId={null}
          clientName="The Hartwells"
        />
      </QueryClientProvider>
    );
    const { container } = renderCover({ stage, instruments });
    expect(container.querySelector('[data-r8-cover-plate] [data-press-band]')).toBeNull();
    expect(ROUND8_CSS).not.toMatch(/\[data-r8-cover-plate\]\s*\{\s*min-height:/);
    expect(ROUND8_CSS).toMatch(/\[data-r8-cover-plate\] \[data-press-band\]\s*\{\s*min-height: 220px;/);
  });
});

describe('the round-8 next-act band (RC-4 D1)', () => {
  it('stands the act in its own 44px row box instead of insetting it over line 1', () => {
    expect(ROUND8_CSS).toMatch(
      /\[data-paper-renderer="round8"\] \[data-lens-band\] \[data-lens-line="2"\] > \[data-part="act"\]\s*\{\s*margin-block: 0;\s*\}/,
    );
  });
});
