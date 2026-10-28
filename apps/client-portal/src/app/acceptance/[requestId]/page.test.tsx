import { render, screen } from '@testing-library/react';
import AcceptancePage from './page';
jest.mock('@/components/service-acceptance/service-acceptance', () => ({ ServiceAcceptancePage: ({ requestId }: { requestId: string }) => <p>Acceptance request {requestId}</p> }));
it('passes the authenticated route request id to the acceptance instrument', async () => {
  render(await AcceptancePage({ params: Promise.resolve({ requestId: 'request-123' }) }));
  expect(screen.getByText('Acceptance request request-123')).toBeInTheDocument();
});
