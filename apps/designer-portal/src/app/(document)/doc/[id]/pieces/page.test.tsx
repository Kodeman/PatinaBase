import { act, render, waitFor } from '@testing-library/react';
import Page from './page';
const build = jest.fn(() => null);
let search = new URLSearchParams();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), useSearchParams: () => search }));
jest.mock('@/components/document/pieces/build-room', () => ({ BuildRoom: (props: unknown) => build(props) }));
jest.mock('@/components/loading', () => ({ PiecesSkeleton: () => null }));
jest.mock('@/hooks/use-can-see-margin', () => ({ useCanSeeMargin: () => true }));
it.each([
  ['lens=spec&ffeItemId=placed', 'placed'],
  ['lens=spec&line=addressed&ffeItemId=stale', 'addressed'],
  ['', null],
])('passes the returned stable line to the native sheet for %s', async (query, line) => {
  search = new URLSearchParams(query);
  build.mockClear();
  await act(async () => { render(<Page params={Promise.resolve({ id: 'project-1' })} />); });
  await waitFor(() => expect(build).toHaveBeenCalledWith(expect.objectContaining({ docId: 'project-1', line })));
});
