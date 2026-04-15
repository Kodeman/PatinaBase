import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';
import { fetchPostHogStats, isPostHogConfigured } from '@/lib/posthog-server';

// GET /api/analytics/posthog - PostHog analytics stats for admin dashboard
// Requires admin auth + POSTHOG_PROJECT_ID + POSTHOG_PERSONAL_API_KEY env vars.
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  if (!isPostHogConfigured()) {
    return NextResponse.json(
      {
        configured: false,
        message:
          'PostHog not configured. Set POSTHOG_PROJECT_ID and POSTHOG_PERSONAL_API_KEY in admin-portal .env.',
      },
      { status: 200 }
    );
  }

  try {
    const stats = await fetchPostHogStats();
    if (!stats) {
      return serverError('Failed to fetch PostHog stats');
    }
    return NextResponse.json({ configured: true, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return serverError(message);
  }
}
