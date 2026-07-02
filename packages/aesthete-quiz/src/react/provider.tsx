'use client';
/**
 * <QuizProvider> — carries wire-client configuration down to useStyleQuiz()
 * and the question components. No data fetching happens here; the provider is
 * just config (baseUrl + anon key + source + optional user JWT).
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { StyleQuizAttribution, StyleQuizSource } from '@patina/types';

export interface QuizProviderConfig {
  /** Supabase API origin, e.g. `https://api.patina.cloud` or `http://localhost:54321`. */
  baseUrl: string;
  /** The project anon key. */
  anonKey: string;
  /** Where this quiz runs: 'marketing_site' | 'client_portal' | 'ios' | 'web'. */
  source?: StyleQuizSource;
  /** Supabase user JWT when the visitor is signed in (enables authed submit + claim). */
  accessToken?: string;
  /** Attribution merged into every submit (utm_*, posthog_distinct_id). */
  attribution?: StyleQuizAttribution;
  /** localStorage key for the session key (default: DEFAULT_SESSION_STORAGE_KEY). */
  storageKey?: string;
  /** Injectable fetch (tests, SSR polyfills). */
  fetch?: typeof fetch;
}

const QuizConfigContext = createContext<QuizProviderConfig | null>(null);

export interface QuizProviderProps extends QuizProviderConfig {
  children: ReactNode;
}

export function QuizProvider({ children, ...config }: QuizProviderProps) {
  const value = useMemo(
    () => config,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      config.baseUrl,
      config.anonKey,
      config.source,
      config.accessToken,
      config.attribution,
      config.storageKey,
      config.fetch,
    ],
  );
  return <QuizConfigContext.Provider value={value}>{children}</QuizConfigContext.Provider>;
}

export function useQuizConfig(): QuizProviderConfig {
  const config = useContext(QuizConfigContext);
  if (!config) {
    throw new Error('useStyleQuiz/useQuizConfig must be used inside a <QuizProvider>');
  }
  return config;
}
