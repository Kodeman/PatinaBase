import { describe, expect, it } from 'vitest';
import type { AgreementPart } from '@patina/types';
import { toAgreementPartPayload } from '../use-agreement-parts';

function part(input: Partial<AgreementPart> = {}): AgreementPart {
  return {
    id: 'part-1',
    proposalId: 'agreement-1',
    position: 1,
    kind: 'clause',
    variant: null,
    partKey: 'patina.services',
    title: '  Services  ',
    payload: { body: 'Interior design services.' },
    required: true,
    clientVisible: true,
    sourceTemplateKey: null,
    sourcePartId: null,
    updatedAt: null,
    ...input,
  };
}

describe('toAgreementPartPayload', () => {
  it('carries provenance through to the RPC', () => {
    // `materialize_agreement_template` writes source_part_id on the way in and
    // `upsert_agreement_parts` re-reads it on every save (00575). A mapper that
    // dropped it would blank the column on the first edit after a template was
    // laid in.
    const [entry] = toAgreementPartPayload([
      part({
        sourceTemplateKey: 'studio.full-service',
        sourcePartId: '11111111-1111-1111-1111-111111111111',
      }),
    ]);
    expect(entry.sourceTemplateKey).toBe('studio.full-service');
    expect(entry.sourcePartId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('sends null rather than undefined for a part with no origin', () => {
    const [entry] = toAgreementPartPayload([part()]);
    expect(entry.sourceTemplateKey).toBeNull();
    expect(entry.sourcePartId).toBeNull();
  });

  it('still trims the title and keeps the rest of the shape', () => {
    const [entry] = toAgreementPartPayload([part()]);
    expect(entry).toEqual({
      kind: 'clause',
      variant: null,
      partKey: 'patina.services',
      title: 'Services',
      payload: { body: 'Interior design services.' },
      required: true,
      clientVisible: true,
      sourceTemplateKey: null,
      sourcePartId: null,
    });
  });
});
