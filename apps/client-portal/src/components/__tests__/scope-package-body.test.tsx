import { render, screen, within } from '@testing-library/react';
import { AGREEMENT_PART_COPY } from '@patina/types';
import { AgreementPartsBody } from '../agreement-parts-body';
import { adaptCommercialDocumentBundle } from '@/lib/commercial-documents';

const payload = {
  packageKey: 'pkg.kitchen', label: 'Kitchen cabinetry', inclusion: 'included',
  responsibilities: { design: 'studio', purchasing: 'client', payer: 'other', fabrication_contract: 'gc', installation: 'none' },
  serviceBindings: { design: ['f1991000-0000-4000-8000-000000000001'], installation: ['f1991000-0000-4000-8000-000000000002'] },
};
function show(value: unknown = payload, kind = 'scope_package', variant: string | null = null) {
  const bundle = adaptCommercialDocumentBundle({
    document: { id: 'signed-edition', documentKind: 'design_services', state: 'signed' },
    parts: [{ id: 'part-1', position: 1, kind, variant, part_key: 'kitchen', title: 'Signed scope', payload: value }],
  });
  expect(bundle).not.toBeNull();
  render(<AgreementPartsBody parts={bundle!.parts} currency="USD" />);
  return screen.getByRole('heading', { name: 'Signed scope' }).closest('section')!;
}

describe('signed scope package consumer', () => {
  it.each(['included', 'excluded', 'conditional'])('renders exact %s inclusion and independent responsibilities', (inclusion) => {
    const section = show({ ...payload, inclusion, conditionText: 'Only after site approval.\nKeep the existing stone.' });
    const body = within(section);
    expect(body.getByText(inclusion[0].toUpperCase() + inclusion.slice(1))).toBeVisible();
    expect(body.getByText('Kitchen cabinetry')).toBeVisible();
    for (const [label, party] of [['Design', 'Studio'], ['Purchasing', 'Client'], ['Payer', 'Other'], ['Fabrication contract', 'General contractor'], ['Installation', 'None']]) {
      expect(body.getByText(label).nextElementSibling).toHaveTextContent(party);
    }
    expect(body.getByText(/Only after site approval/).textContent).toBe('Only after site approval.\nKeep the existing stone.');
  });

  it('keeps unknown binding slots record-only rather than partially rendering a package', () => {
    const body = within(show({ ...payload, cents: 912300, serviceBindings: { ...payload.serviceBindings, purchasing: undefined } }));
    expect(body.queryByText(payload.label)).toBeNull(); // malformed typed binding slot is not partially rendered
    expect(body.getByText(AGREEMENT_PART_COPY.recorded)).toBeVisible();
  });

  it('preserves exact phase references in their signed service slots and ignores money-like extras', () => {
    const body = within(show({ ...payload, cents: 912300, amount: '5000' }));
    for (const slot of ['design', 'installation'] as const) {
      const heading = body.getByRole('heading', { name: `${slot === 'design' ? 'Design' : 'Installation'} service bindings` });
      expect(within(heading.parentElement!).getByRole('listitem')).toHaveTextContent(payload.serviceBindings[slot][0]);
    }
    expect(body.queryByText(/9,123|912300|5000|\$/)).toBeNull();
  });

  it.each([
    null, [], {}, { ...payload, inclusion: 'future' },
    { ...payload, responsibilities: { ...payload.responsibilities, payer: 'designer' } },
    { ...payload, inclusion: 'conditional' },
    { ...payload, serviceBindings: { design: [123] } },
  ])('keeps malformed payload record-only: %j', (value) => {
    const body = within(show(value));
    expect(body.getByText(AGREEMENT_PART_COPY.recorded)).toBeVisible();
    expect(body.queryByText(payload.label)).toBeNull();
  });

  it('leaves unknown future kinds record-only even with a scope-shaped payload', () => {
    const body = within(show(payload, 'future_package'));
    expect(body.getByText(AGREEMENT_PART_COPY.recorded)).toBeVisible();
    expect(body.queryByText(payload.label)).toBeNull();
  });

  it('does not coerce string schedule amounts into money', () => {
    const body = within(show({ cents: '123400' }, 'schedule', 'flat'));
    expect(body.queryByText(/1,234|123400/)).toBeNull();
  });
});
