/**
 * Q10 (walk W-D5) — the studio's money is an owner's or admin's. The walk's
 * hire held a plain member seat in a studio whose margin is shown to everyone
 * (the R1 default), passed `useCanSeeMargin`, and read studio revenue, A/R,
 * margin and every invoice. The money rule is the seat, not the margin grant.
 *
 * SQ-774 R1 — and the seat that counts is the one in the RECORD's own studio.
 */
import { renderHook } from '@testing-library/react';

type MockOrg = { id: string; type: string; membership: { role: string } };
let mockOrganizations: MockOrg[] = [];
const mockLed = new Set(['project-led']);

jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'hire' } }) }));
jest.mock('@patina/supabase', () => ({
  useOrganizations: () => ({ data: mockOrganizations }),
  useLedProjectIds: () => ({ data: mockLed }),
}));

import { useStudioMoney } from '../use-studio-money';

const studio = (id: string, role: string): MockOrg => ({ id, type: 'design_studio', membership: { role } });

describe('useStudioMoney', () => {
  it('a member sees no studio book, only the money on jobs she leads', () => {
    mockOrganizations = [studio('studio-1', 'member')];
    const { result } = renderHook(() => useStudioMoney());
    expect(result.current.bookStudioIds).toEqual([]);
    expect(result.current.canSeeStudio('studio-1')).toBe(false);
    expect(result.current.canSeeRecord('studio-1', 'project-led')).toBe(true);
    expect(result.current.canSeeRecord('studio-1', 'project-other')).toBe(false);
    expect(result.current.canSeeRecord('studio-1', null)).toBe(false);
  });

  it.each(['owner', 'admin'])('an %s sees the whole book', (role) => {
    mockOrganizations = [studio('studio-1', role)];
    const { result } = renderHook(() => useStudioMoney());
    expect(result.current.bookStudioIds).toEqual(['studio-1']);
    expect(result.current.canSeeStudio('studio-1')).toBe(true);
    expect(result.current.canSeeRecord('studio-1', 'project-other')).toBe(true);
    expect(result.current.canSeeRecord('studio-1', null)).toBe(true);
  });

  it('owning her solo studio is never a seat over her employer’s book (SQ-774 R1)', () => {
    // The review input: the hire owns her solo studio and is a member of her
    // employer's, whichever of the two is selected.
    mockOrganizations = [studio('solo', 'owner'), studio('employer', 'member')];
    const { result } = renderHook(() => useStudioMoney());
    expect(result.current.bookStudioIds).toEqual(['solo']);
    expect(result.current.canSeeStudio('employer')).toBe(false);
    expect(result.current.canSeeRecord('employer', 'employer-unled')).toBe(false);
    expect(result.current.canSeeRecord('employer', null)).toBe(false);
    // Q10 per record: the employer job she leads, and all of her own studio.
    expect(result.current.canSeeRecord('employer', 'project-led')).toBe(true);
    expect(result.current.canSeeRecord('solo', 'solo-job')).toBe(true);
  });
});
