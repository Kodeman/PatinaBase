import { describe, expect, it } from 'vitest';

import { commercialKeys } from '../use-commercial-documents';

describe('commercialKeys', () => {
  it('keys a single commercial document by id', () => {
    expect(commercialKeys.all).toEqual(['commercial-documents']);
    expect(commercialKeys.document('agreement-1')).toEqual(['commercial-documents', 'agreement-1']);
  });

  it('keys the client-safe bundle distinctly from the internal document key', () => {
    expect(commercialKeys.clientBundle('agreement-1')).toEqual([
      'commercial-documents',
      'agreement-1',
      'client-safe',
    ]);
  });

  it('keys project-scoped billing authority, working budget, and furnishings waves by project id', () => {
    expect(commercialKeys.authority('project-1')).toEqual(['project-authority', 'project-1']);
    expect(commercialKeys.budget('project-1')).toEqual(['working-budget', 'project-1']);
    expect(commercialKeys.waves('project-1')).toEqual(['furnishings-authorizations', 'project-1']);
  });

  it('keys the send snapshot distinctly from the document and client-safe bundle', () => {
    expect(commercialKeys.sendSnapshot('agreement-1')).toEqual([
      'commercial-documents',
      'agreement-1',
      'send-snapshot',
    ]);
  });
});
