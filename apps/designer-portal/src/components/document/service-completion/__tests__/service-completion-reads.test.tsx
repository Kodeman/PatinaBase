import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { logError, showErrorToast } from '@/lib/error-handler';
import { nextSubjectQueryClient } from '@/lib/react-query';

/**
 * The service-completion reads print their own calm read error with Retry, so
 * a failed read must never reach the designer's global QueryCache toast. The
 * REAL hook module and the REAL designer QueryCache run here; only the
 * Supabase client fails every read with a non-network, non-auth error.
 */
const mockFailure = { code: 'XX000', message: 'internal error while reading' };

jest.mock('@/lib/error-handler', () => ({
  ...jest.requireActual('@/lib/error-handler'),
  logError: jest.fn(),
  showErrorToast: jest.fn(),
  handleAuthExpiry: jest.fn(() => false),
}));
jest.mock('../../../../../../../packages/supabase/src/client', () => ({
  createBrowserClient: () => {
    const failed = { data: null, error: mockFailure };
    const query: Record<string, unknown> = {};
    for (const step of ['select', 'eq', 'order', 'range']) query[step] = () => query;
    query.maybeSingle = async () => failed;
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(failed).then(resolve);
    return {
      rpc: async () => failed,
      from: () => query,
      storage: { from: () => ({ list: async () => failed }) },
    };
  },
}));

import {
  serviceCompletionKeys,
  useServiceConditionEvidenceOptions,
  useStudioServiceCompletion,
  useStudioServiceObligations,
} from '../../../../../../../packages/supabase/src/hooks/use-service-completion';
import * as serviceCompletion from '../../../../../../../packages/supabase/src/hooks/use-service-completion';

const toast = jest.mocked(showErrorToast);
const logged = jest.mocked(logError);

let client: QueryClient;

beforeEach(() => {
  client = nextSubjectQueryClient();
  client.setQueryDefaults(serviceCompletionKeys.all, { retry: false });
});

afterEach(() => {
  client.clear();
});

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('service completion reads and the global error surface', () => {
  it.each([
    ['obligations', () => useStudioServiceObligations('job-1')],
    ['completion record', () => useStudioServiceCompletion('job-1')],
    ['evidence picker', () => useServiceConditionEvidenceOptions('job-1')],
  ])('a failed %s read is logged but produces no toast call', async (_label, useRead) => {
    const { result } = renderHook(useRead, { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(logged).toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('a failed citation check is logged but produces no toast call', async () => {
    const { result } = renderHook(
      () => serviceCompletion.useServiceConditionCitation('job-1', 'issue', '00000000-0000-4000-8000-000000000001'),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(logged).toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });
});
