import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import postcss from 'postcss';
import { DocSheet } from '@/components/document/overlays/doc-sheet';
import { LensBand } from '@/components/document/lens-band';
import { Round8MarginContext } from '@/components/document/paper/margin-layout';
import { deriveLensBand, type LensBandInput } from '../lens-band-derivation';

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: true, isLoading: false }),
}));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

const scope = '[data-paper-renderer="round8"]';
const css = postcss.parse(readFileSync(join(__dirname, '../../../components/document/paper/round8.css'), 'utf8'));
/** Declarations for `selector`, keyed by the at-rule params it sits in ('' = top level). */
function declarationsByMedia(selector: string) {
  const result: Record<string, Record<string, string>> = {};
  css.walkRules(selector, (rule) => {
    const media = rule.parent?.type === 'atrule' ? (rule.parent as postcss.AtRule).params : '';
    rule.walkDecls((decl) => { (result[media] ??= {})[decl.prop] = decl.value; });
  });
  return result;
}
function declarations(selector: string) {
  const byMedia = declarationsByMedia(selector);
  expect(Object.keys(byMedia)).toEqual(['']);
  return byMedia[''];
}

afterEach(() => { document.body.innerHTML = ''; });

describe('RC-4b round-8 presentation', () => {
  it('marks the current Studio room in forest at 600 while retaining its underline', () => {
    expect(declarations(`${scope} [data-studio-door][aria-current="page"]`)).toEqual({
      color: 'var(--color-forest)', 'font-weight': '600', 'border-color': 'var(--color-forest)',
    });
    const studio = readFileSync(join(__dirname, '../../../components/document/studio/studio-masthead.tsx'), 'utf8');
    expect(studio).toContain('border-b-2');
  });

  describe('the shared body portal takes the round-8 scope from the page it opens over', () => {
    // The page: a round-8 root (frame, desk, room) when the route renders one.
    const page = (round8: boolean, open: boolean) => (
      <div data-paper-renderer={round8 ? 'round8' : undefined}>
        <DocSheet open={open} onClose={() => {}} title="Accounts"><span className="text-[11px]">Studio eyes only</span></DocSheet>
      </div>
    );
    const layer = () => screen.getByRole('dialog').closest('[data-doc-sheet-layer]');

    it('marks the layer when the page renders a round-8 root', () => {
      render(page(true, true));
      expect(layer()?.parentElement).toBe(document.body);
      expect(layer()).toHaveAttribute('data-paper-renderer', 'round8');
    });

    it('leaves the layer legacy when the page has no round-8 root', () => {
      render(page(false, true));
      expect(layer()?.parentElement).toBe(document.body);
      expect(layer()).not.toHaveAttribute('data-paper-renderer');
    });

    it('leaves a legacy route legacy after a round-8 route, and no layer vouches for the next', () => {
      const round8Route = render(page(true, true));
      expect(layer()).toHaveAttribute('data-paper-renderer', 'round8');
      round8Route.unmount();
      expect(document.querySelector('[data-paper-renderer="round8"]')).toBeNull();
      // Client navigation to a legacy route: the round-8 root is gone.
      const legacyRoute = render(page(false, false));
      legacyRoute.rerender(page(false, true));
      expect(layer()).not.toHaveAttribute('data-paper-renderer');
      // A second sheet stacked over it reads the page, not the first layer.
      render(<DocSheet open onClose={() => {}} title="Ledger">Ledger</DocSheet>);
      const layers = document.querySelectorAll('[data-doc-sheet-layer]');
      expect(layers).toHaveLength(2);
      layers.forEach((each) => expect(each).not.toHaveAttribute('data-paper-renderer'));
    });
  });

  it.each(['narrow', 'mobile'] as const)('keeps the task name in the compact %s band, leaving legacy words unchanged', (tier) => {
    const input = {
      spreadKind: 'project', ticket: [], guide: null, tier,
      household: 'Test house', stageWord: 'Project', stageIndex: { position: 1, of: 6 },
      installDate: null, moneyFigure: null, proposalInvestment: null, sentDate: null, readingStop: null,
      needs: [{ key: 'task-1', kind: 'task_due', text: 'Task due — F01 review living-room selections',
        actionLabel: 'Open the task', onAct: jest.fn(), urgent: true }],
    } as LensBandInput;
    const model = deriveLensBand(input);
    // Exercise the compact rung explicitly: jsdom cannot measure the band.
    model.voice!.rungs = [{ form: 'short', lead: 'Next', sentence: model.voice!.next!.shortSentence! }];
    const band = (round8: boolean) => <Round8MarginContext.Provider value={round8}><LensBand model={model} docId="p1" /></Round8MarginContext.Provider>;
    const view = render(band(true));
    const named = document.querySelector('[data-lens-sentence]');
    expect(named).toHaveTextContent(/^F01 review living-room selections$/);
    // F3 — one clamped row under the declared band height; the live line
    // still speaks the whole sentence.
    expect(named).toHaveClass('truncate');
    expect(named).toHaveAttribute('aria-hidden', 'true');
    const line2 = document.querySelector('[data-lens-line="2"]');
    expect(line2).toHaveClass('flex-nowrap');
    expect(line2?.querySelector('[data-lens-full-sentence]')).toHaveTextContent('Task due — F01 review living-room selections');
    view.unmount();
    render(band(false));
    const legacy = document.querySelector('[data-lens-sentence]');
    expect(legacy).toHaveTextContent(model.voice!.rungs[0]!.sentence);
    expect(legacy).not.toHaveAttribute('aria-hidden');
    expect(document.querySelector('[data-lens-full-sentence]')).toBeNull();
  });

  it('lets phase headings shrink and wrap without shrinking their overflow trigger', () => {
    expect(declarations(`${scope} [data-schedule-phase] h3`)).toEqual({
      'min-width': '0', flex: '1', 'overflow-wrap': 'anywhere',
    });
    expect(declarations(`${scope} [data-schedule-phase] .doc-row-verbs`)).toEqual({ 'flex-shrink': '0' });
  });

  it('keeps the phase-name underline within its phone gutter, leaving wider paper its intrinsic width', () => {
    expect(declarationsByMedia(`${scope} input[aria-label="Name a phase"]`)).toEqual({
      '(max-width: 599px)': { 'min-width': '0', width: '100%' },
    });
  });
});
