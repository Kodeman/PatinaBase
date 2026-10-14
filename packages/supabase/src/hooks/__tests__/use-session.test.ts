import { describe, expect, it } from 'vitest';
import { useSession } from '../use-auth';

describe('useSession', () => {
  it('does not make an auth.getUser network call', () => {
    expect(useSession.toString()).not.toContain('auth.getUser');
  });
});
