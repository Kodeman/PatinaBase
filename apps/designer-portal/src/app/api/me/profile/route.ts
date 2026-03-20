import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@patina/supabase/server';

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional(),
  locale: z.string().min(2).max(10).optional(),
  timezone: z.string().max(50).optional(),
  notifPrefs: z.record(z.any()).optional(),
});

// PATCH /api/me/profile - Update current user profile (uses RLS)
export async function PATCH(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const validatedData = updateProfileSchema.parse(body);

    const updates: Record<string, unknown> = {};
    if (validatedData.displayName !== undefined) updates.display_name = validatedData.displayName;
    if (validatedData.avatarUrl !== undefined) updates.avatar_url = validatedData.avatarUrl;

    const { data, error } = await (supabase as any)
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select('display_name, avatar_url')
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'UPDATE_FAILED', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        displayName: (data as any)?.display_name,
        avatarUrl: (data as any)?.avatar_url,
      },
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message ?? 'Failed to update profile' },
      { status: 500 }
    );
  }
}
