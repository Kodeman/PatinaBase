import { redirect } from 'next/navigation';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Legacy unsubscribe-link landing. The authed prefs editor moved into
// /portal/preferences so it picks up the portal navigation shell. Email
// links still point at /preferences?token=... — redirect with the query
// string preserved so the token-apply flow keeps working.
export default async function LegacyPreferencesRedirect({ searchParams }: PageProps) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    } else if (value !== undefined) {
      qs.set(key, value);
    }
  }
  const target = `/portal/preferences${qs.toString() ? `?${qs.toString()}` : ''}`;
  redirect(target);
}
