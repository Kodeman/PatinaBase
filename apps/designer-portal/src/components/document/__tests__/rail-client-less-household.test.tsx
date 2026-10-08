/**
 * US-19 FR6 F6-7 (D14, `one-voice`) — a client-less paper prints no household
 * name on the rail. page.tsx hands the rail `householdDisplayName(client_name)`
 * under one-voice; Halloran's `document_state.client_name` is the `Client`
 * fallback, which the rail printed as `the client`. `the client` stays the
 * sentence fallback and is never a name.
 */
import { render } from '@testing-library/react';
import { DocSpine } from '../doc-spine';
import { householdDisplayName } from '@/lib/document/act-names';
import type { SpineSection } from '@/lib/document/section-derivation';

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({ value: key === 'one-voice' }),
}));
jest.mock('../strata-mark', () => ({
  StrataMark: ({ label }: { label?: string }) => <span role="img" aria-label={label} />,
}));

const SECTIONS: SpineSection[] = [
  { key: 'brief', label: 'Brief', state: 'settled', sub: 'Recorded' },
  { key: 'project', label: 'Project', state: 'active', sub: 'Active' },
];

describe('the rail on a client-less paper (F6-7)', () => {
  it.each([
    ['Halloran (`Client`)', 'Client'],
    ['the seed’s `Client User`', 'Client User'],
    ['no client name', null],
  ])('%s: the rail carries no household text', (_case, clientName) => {
    const { container } = render(
      <DocSpine sections={SECTIONS} household={householdDisplayName(clientName)} />,
    );
    expect(container.textContent).not.toMatch(/the client|Client User|\bClient\b/);
  });

  it('a real household still prints', () => {
    const { container } = render(
      <DocSpine sections={SECTIONS} household={householdDisplayName('Nora Ellison')} />,
    );
    expect(container.textContent).toMatch(/Nora Ellison/);
  });
});
