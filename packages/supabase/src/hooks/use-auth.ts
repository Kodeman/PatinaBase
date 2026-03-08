import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { Session } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════
// AUTH HOOKS
// ═══════════════════════════════════════════════════════════════════════════

// Lazy client getter
const getSupabase = () => createBrowserClient();

/**
 * Get current session - tracks auth state changes
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { session, isLoading };
}

/**
 * Get current user from session
 */
export function useUser() {
  const { session, isLoading } = useSession();
  return {
    user: session?.user ?? null,
    isLoading,
    isAuthenticated: !!session?.user,
  };
}

/**
 * Get current user with roles and domain info
 * Enhanced version that includes role-based checks
 */
export function useUserWithRoles() {
  const { session, isLoading: sessionLoading } = useSession();
  const [roles, setRoles] = useState<{
    id: string;
    name: string;
    domain: string;
    displayName: string;
  }[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);

  useEffect(() => {
    if (!session?.user) {
      setRoles([]);
      setRolesLoading(false);
      return;
    }

    const fetchRoles = async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('user_roles')
        .select(`
          role:roles (id, name, domain, display_name)
        `)
        .eq('user_id', session.user.id);

      if (error) {
        console.error('Error fetching user roles:', error);
        setRoles([]);
      } else {
        setRoles(
          data
            .map(r => r.role)
            .filter((r): r is NonNullable<typeof r> => r !== null)
            .map(r => ({
              id: r.id,
              name: r.name,
              domain: r.domain,
              displayName: r.display_name,
            }))
        );
      }
      setRolesLoading(false);
    };

    fetchRoles();
  }, [session?.user?.id]);

  return {
    user: session?.user ?? null,
    roles,
    isLoading: sessionLoading || rolesLoading,
    isAuthenticated: !!session?.user,
    // Convenience domain checks
    isDesigner: roles.some(r => r.domain === 'designer'),
    isManufacturer: roles.some(r => r.domain === 'manufacturer'),
    isAdmin: roles.some(r => r.domain === 'admin'),
    isConsumer: roles.some(r => r.domain === 'consumer'),
    // Specific role checks
    isSuperAdmin: roles.some(r => r.name === 'super_admin'),
    isStudioOwner: roles.some(r => r.name === 'studio_owner'),
    isBrandAdmin: roles.some(r => r.name === 'brand_admin'),
  };
}

/**
 * Sign in with email and password
 */
export function useSignIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });
}

/**
 * Sign up with email and password
 */
export function useSignUp() {
  return useMutation({
    mutationFn: async ({
      email,
      password,
      metadata,
    }: {
      email: string;
      password: string;
      metadata?: { displayName?: string };
    }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
        },
      });

      if (error) throw error;
      return data;
    },
  });
}

/**
 * Sign out
 */
export function useSignOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

/**
 * Send password reset email
 */
export function useResetPassword() {
  return useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const supabase = getSupabase();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
      });
      if (error) throw error;
    },
  });
}

/**
 * Update password (for authenticated users)
 */
export function useUpdatePassword() {
  return useMutation({
    mutationFn: async ({ password }: { password: string }) => {
      const supabase = getSupabase();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// OAUTH HOOKS (Phase 2: Consumer Auth)
// ═══════════════════════════════════════════════════════════════════════════

export type OAuthProvider = 'google' | 'apple';

/**
 * Sign in with OAuth provider (Google or Apple)
 * Redirects to provider's auth page
 */
export function useSignInWithOAuth() {
  return useMutation({
    mutationFn: async ({
      provider,
      redirectTo,
      scopes,
    }: {
      provider: OAuthProvider;
      redirectTo?: string;
      scopes?: string;
    }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectTo || `${window.location.origin}/auth/callback`,
          scopes,
          queryParams: provider === 'apple' ? {
            // Apple requires response_mode for web
            response_mode: 'fragment',
          } : undefined,
        },
      });

      if (error) throw error;
      return data;
    },
  });
}

/**
 * Send magic link email for passwordless login
 */
export function useSendMagicLink() {
  return useMutation({
    mutationFn: async ({
      email,
      redirectTo,
    }: {
      email: string;
      redirectTo?: string;
    }) => {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo || `${window.location.origin}/auth/callback?type=magiclink`,
          shouldCreateUser: true,
        },
      });

      if (error) throw error;
    },
  });
}

/**
 * Resend email verification for unverified users
 */
export function useResendVerification() {
  return useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const supabase = getSupabase();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?type=verification`,
        },
      });

      if (error) throw error;
    },
  });
}

/**
 * Link an OAuth provider to an existing account
 * User must be signed in
 */
export function useLinkOAuthAccount() {
  return useMutation({
    mutationFn: async ({
      provider,
      redirectTo,
    }: {
      provider: OAuthProvider;
      redirectTo?: string;
    }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.linkIdentity({
        provider,
        options: {
          redirectTo: redirectTo || `${window.location.origin}/auth/callback?type=link`,
        },
      });

      if (error) throw error;
      return data;
    },
  });
}

/**
 * Unlink an OAuth provider from the current account
 */
export function useUnlinkOAuthAccount() {
  return useMutation({
    mutationFn: async ({ identityId }: { identityId: string }) => {
      const supabase = getSupabase();
      const { error } = await supabase.auth.unlinkIdentity({
        provider: '', // Not needed when using identityId
        id: identityId,
      } as Parameters<typeof supabase.auth.unlinkIdentity>[0]);

      if (error) throw error;
    },
  });
}

/**
 * Get all linked identities for the current user
 */
export function useLinkedIdentities() {
  const { session, isLoading } = useSession();

  return {
    identities: session?.user?.identities ?? [],
    isLoading,
  };
}

/**
 * Verify OTP code for email verification
 */
export function useVerifyOtp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      email,
      token,
      type = 'email',
    }: {
      email: string;
      token: string;
      type?: 'email' | 'magiclink' | 'recovery' | 'signup' | 'email_change';
    }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MFA/TOTP HOOKS (Phase 3: Professional Auth)
// ═══════════════════════════════════════════════════════════════════════════

export type MfaFactorType = 'totp';

export interface MfaFactor {
  id: string;
  type: MfaFactorType;
  friendlyName: string | null;
  status: 'verified' | 'unverified';
  createdAt: string;
  updatedAt: string;
}

/**
 * Get MFA factors for the current user
 */
export function useMfaFactors() {
  const { session, isLoading: sessionLoading } = useSession();
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!session?.user) {
      setFactors([]);
      setIsLoading(false);
      return;
    }

    const fetchFactors = async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.mfa.listFactors();

      if (error) {
        console.error('Error fetching MFA factors:', error);
        setFactors([]);
      } else {
        setFactors(
          data.totp.map(f => ({
            id: f.id,
            type: 'totp' as const,
            friendlyName: f.friendly_name ?? null,
            status: f.status,
            createdAt: f.created_at,
            updatedAt: f.updated_at,
          }))
        );
      }
      setIsLoading(false);
    };

    fetchFactors();
  }, [session?.user?.id]);

  return {
    factors,
    isLoading: sessionLoading || isLoading,
    hasMfaEnabled: factors.some(f => f.status === 'verified'),
  };
}

/**
 * Enroll a new TOTP factor (start MFA setup)
 * Returns QR code and secret for authenticator app
 */
export function useEnrollMfa() {
  return useMutation({
    mutationFn: async ({ friendlyName }: { friendlyName?: string } = {}) => {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName,
      });

      if (error) throw error;

      return {
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      };
    },
  });
}

/**
 * Verify TOTP code to complete MFA enrollment
 */
export function useVerifyMfaEnrollment() {
  return useMutation({
    mutationFn: async ({
      factorId,
      code,
    }: {
      factorId: string;
      code: string;
    }) => {
      const supabase = getSupabase();

      // Create a challenge
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });

      if (challengeError) throw challengeError;

      // Verify the challenge with the code
      const { data, error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });

      if (error) throw error;
      return data;
    },
  });
}

/**
 * Challenge and verify MFA during login
 */
export function useChallengeMfa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      factorId,
      code,
    }: {
      factorId: string;
      code: string;
    }) => {
      const supabase = getSupabase();

      // Create a challenge
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });

      if (challengeError) throw challengeError;

      // Verify the challenge
      const { data, error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });
}

/**
 * Unenroll (remove) an MFA factor
 */
export function useUnenrollMfa() {
  return useMutation({
    mutationFn: async ({ factorId }: { factorId: string }) => {
      const supabase = getSupabase();
      const { error } = await supabase.auth.mfa.unenroll({ factorId });

      if (error) throw error;
    },
  });
}

/**
 * Get the current MFA assurance level
 */
export function useMfaAssuranceLevel() {
  const { session, isLoading } = useSession();
  const [assuranceLevel, setAssuranceLevel] = useState<{
    currentLevel: 'aal1' | 'aal2' | null;
    nextLevel: 'aal1' | 'aal2' | null;
    currentAuthenticationMethods: { method: string; timestamp: number }[];
  } | null>(null);

  useEffect(() => {
    if (!session) {
      setAssuranceLevel(null);
      return;
    }

    const fetchAssuranceLevel = async () => {
      const supabase = getSupabase();
      const { data, error } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (!error && data) {
        // Map authentication methods to expected shape
        const methods = Array.isArray(data.currentAuthenticationMethods)
          ? data.currentAuthenticationMethods.map(m =>
              typeof m === 'string'
                ? { method: m, timestamp: 0 }
                : { method: m.method, timestamp: m.timestamp }
            )
          : [];

        setAssuranceLevel({
          currentLevel: data.currentLevel,
          nextLevel: data.nextLevel,
          currentAuthenticationMethods: methods,
        });
      }
    };

    fetchAssuranceLevel();
  }, [session]);

  return {
    assuranceLevel,
    isLoading,
    needsMfaVerification:
      assuranceLevel?.currentLevel === 'aal1' &&
      assuranceLevel?.nextLevel === 'aal2',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT HOOKS (Phase 3: Professional Auth)
// ═══════════════════════════════════════════════════════════════════════════

export interface UserSession {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  factorId: string | null;
  aal: 'aal1' | 'aal2' | null;
  notAfter: string | null;
  refreshedAt: string | null;
  userAgent: string | null;
  ip: string | null;
  tag: string | null;
}

/**
 * Get current user's active sessions
 * Note: Supabase doesn't expose session listing directly,
 * so we track the current session info
 */
export function useCurrentSession() {
  const { session, isLoading } = useSession();

  return {
    session: session
      ? {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresAt: session.expires_at,
          expiresIn: session.expires_in,
          tokenType: session.token_type,
          user: session.user,
        }
      : null,
    isLoading,
  };
}

/**
 * Refresh the current session
 */
export function useRefreshSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.refreshSession();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });
}

/**
 * Sign out from all devices (revoke all sessions)
 */
export function useSignOutAllDevices() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signOut({ scope: 'global' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

/**
 * Sign out from other devices only (keep current session)
 */
export function useSignOutOtherDevices() {
  return useMutation({
    mutationFn: async () => {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signOut({ scope: 'others' });

      if (error) throw error;
    },
  });
}
