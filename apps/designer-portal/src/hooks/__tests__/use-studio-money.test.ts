/**
 * Q10 (walk W-D5) — the studio's money is an owner's or admin's. The walk's
 * hire held a plain member seat in a studio whose margin is shown to everyone
 * (the R1 default), passed `useCanSeeMargin`, and read studio revenue, A/R,
 * margin and every invoice. The money rule is the seat, not the margin grant.
 */
import { renderHook } from '@testing-library/react';

let mockRole: string | undefined = 'member';
const mockLeads = new Map([
  ['project-led', { leadUserId: 'hire', leadName: 'Jordan Pike' }],
  ['project-other', { leadUserId: 'owner-1', leadName: 'Leah Hartwell' }],
]);

jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'hire' } }) }));
jest.mock('@/hooks/use-viewer-studio', () => ({
  useInternalTimeStudio: () => ({
    studio: { id: 'studio-1', type: 'design_studio', membership: { role: mockRole } },
    isSettled: true,
  }),
}));
jest.mock('@patina/supabase', () => ({
  useProjectLeads: () => ({ data: mockLeads }),
}));

import { useStudioMoney } from '../use-studio-money';

describe('useStudioMoney', () => {
  it('a member sees no studio book, only the money on jobs she leads', () => {
    mockRole = 'member';
    const { result } = renderHook(() => useStudioMoney());
    expect(result.current.all).toBe(false);
    expect(result.current.canSeeProject('project-led')).toBe(true);
    expect(result.current.canSeeProject('project-other')).toBe(false);
    expect(result.current.canSeeProject(null)).toBe(false);
  });

  it.each(['owner', 'admin'])('an %s sees the whole book', (role) => {
    mockRole = role;
    const { result } = renderHook(() => useStudioMoney());
    expect(result.current.all).toBe(true);
    expect(result.current.canSeeProject('project-other')).toBe(true);
  });
});
