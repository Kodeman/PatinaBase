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
  ...jest.requireActual('@/hooks/use-feature-flag'),
  useFeatureFlag: () => ({ value: true, isLoading: false }),
}));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

const scope = '[data-paper-renderer="round8"]';
const css = postcss.parse(readFileSync(join(__dirname, '../../../components/document/paper/round8.css'), 'utf8'));
function declarations(selector: string) {
  const result: Record<string, string> = {};
  css.walkRules(selector, (rule) => {
    expect(rule.parent?.type).toBe('root');
    rule.walkDecls((decl) => { result[decl.prop] = decl.value; });
  });
  return result;
}

const originalOverride = process.env.NEXT_PUBLIC_FLAG_OVERRIDES;
afterEach(() => {
  if (originalOverride === undefined) delete process.env.NEXT_PUBLIC_FLAG_OVERRIDES;
  else process.env.NEXT_PUBLIC_FLAG_OVERRIDES = originalOverride;
});

describe('RC-4b round-8 presentation', () => {
  it('marks the current Studio room in forest at 600 while retaining its underline', () => {
    expect(declarations(`${scope} [data-studio-door][aria-current="page"]`)).toEqual({
      color: 'var(--color-forest)', 'font-weight': '600', 'border-color': 'var(--color-forest)',
    });
    const studio = readFileSync(join(__dirname, '../../../components/document/studio/studio-masthead.tsx'), 'utf8');
    expect(studio).toContain('border-b-2');
  });

  it('puts the renderer marker on the shared body portal only when round 8 is active', () => {
    process.env.NEXT_PUBLIC_FLAG_OVERRIDES = 'designer-paper-round8:true';
    const sheet = (open = true) => <DocSheet open={open} onClose={() => {}} title="Accounts"><span className="text-[11px]">Studio eyes only</span></DocSheet>;
    const view = render(sheet());
    const layer = screen.getByRole('dialog').closest('[data-doc-sheet-layer]');
    expect(layer?.parentElement).toBe(document.body);
    expect(layer).toHaveAttribute('data-paper-renderer', 'round8');
    process.env.NEXT_PUBLIC_FLAG_OVERRIDES = 'designer-paper-round8:false';
    view.rerender(sheet());
    expect(layer).not.toHaveAttribute('data-paper-renderer');
    view.rerender(sheet(false));
    expect(document.querySelector('[data-doc-sheet-layer]')).toBeNull();
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
    expect(document.querySelector('[data-lens-sentence]')).toHaveTextContent('F01 review living-room selections');
    view.unmount();
    render(band(false));
    expect(document.querySelector('[data-lens-sentence]')).toHaveTextContent(model.voice!.rungs[0]!.sentence);
  });

  it('lets phase headings shrink and wrap without shrinking their overflow trigger', () => {
    expect(declarations(`${scope} [data-schedule-phase] h3`)).toEqual({
      'min-width': '0', flex: '1', 'overflow-wrap': 'anywhere',
    });
    expect(declarations(`${scope} [data-schedule-phase] .doc-row-verbs`)).toEqual({ 'flex-shrink': '0' });
  });

  it('keeps the phase-name underline within its grid gutter', () => {
    expect(declarations(`${scope} input[aria-label="Name a phase"]`)).toEqual({ 'min-width': '0', width: '100%' });
  });
});
