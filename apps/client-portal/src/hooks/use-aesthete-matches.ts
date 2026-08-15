'use client';

/**
 * Data hooks for the quiz results page (Wave 3A).
 *
 * Portal-local by design: the shared `packages/supabase` hooks batch is Wave
 * 3B territory, and these calls are anon-capable plain fetches (no supabase-js
 * client needed) — the session key IS the capability (§7.1).
 */
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AestheteQuizError,
  claimQuizSession,
  type ClaimQuizSessionParams,
} from '@patina/aesthete-quiz';
import {
  fetchAestheteMatches,
  fetchMatchProducts,
  type AestheteMatchRow,
  type MatchProduct,
  type WireConfig,
} from '@/lib/aesthete/matches';
import { configuredEdgeApiUrl } from '@/lib/aesthete/product-hydration';
import { markSessionClaimed, wasSessionClaimed } from '@/lib/aesthete/profile-store';
import { useAuth } from '@/hooks/use-auth';

export function aestheteWireConfig(): WireConfig {
  return {
    baseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    edgeApiUrl: configuredEdgeApiUrl(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    ),
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  };
}

export interface AestheteMatchesData {
  matches: AestheteMatchRow[];
  products: Map<string, MatchProduct>;
}

/**
 * Top-10 matches + the catalog product facts their cards need. Retry is off
 * for quiz-typed errors (rate-limit / unknown-session are not transient) and
 * limited to one attempt for genuine network blips.
 */
export function useAestheteMatches(sessionKey: string | null, limit = 10) {
  return useQuery<AestheteMatchesData, Error>({
    queryKey: ['aesthete-matches', sessionKey, limit],
    enabled: !!sessionKey,
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      if (error instanceof AestheteQuizError && error.kind !== 'network') return false;
      return failureCount < 1;
    },
    queryFn: async () => {
      const config = aestheteWireConfig();
      const matches = await fetchAestheteMatches(config, sessionKey!, limit);
      const products = await fetchMatchProducts(
        config,
        matches.map((m) => m.product_id),
      );
      return { matches, products };
    },
  });
}

/**
 * Claim-on-signed-in-visit (§7.1 "merge on signup", kept deliberately small):
 * when a signed-in user lands on the results page with an anonymous session
 * key in localStorage, bind it to their account. Idempotent server-side; the
 * local claimed-marker just avoids re-posting on every visit. Failures are
 * silent by design — a claim hiccup must never break the results page — with
 * one exception surfaced via `onForeign`: the key belongs to another account.
 */
export function useClaimQuizSession(
  sessionKey: string | null,
  onForeign?: () => void,
): void {
  const { session, isAuthenticated } = useAuth();
  const attempted = useRef<string | null>(null);
  const onForeignRef = useRef(onForeign);
  onForeignRef.current = onForeign;

  const accessToken = session?.accessToken;

  useEffect(() => {
    if (!sessionKey || !isAuthenticated || !accessToken) return;
    if (attempted.current === sessionKey) return;
    if (wasSessionClaimed(sessionKey)) return;
    attempted.current = sessionKey;

    const params: ClaimQuizSessionParams = {
      baseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      accessToken,
      sessionKey,
    };
    claimQuizSession(params)
      .then(() => markSessionClaimed(sessionKey))
      .catch((error: unknown) => {
        if (error instanceof AestheteQuizError && error.kind === 'forbidden') {
          onForeignRef.current?.();
        }
        // unknown_session (never submitted), network, etc. — quiet no-ops.
      });
  }, [sessionKey, isAuthenticated, accessToken]);
}
