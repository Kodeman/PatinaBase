import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@patina/supabase/server';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character'),
});

// PATCH /api/me/password - Change current user password
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
    const validatedData = changePasswordSchema.parse(body);

    // Verify current password by attempting sign-in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: validatedData.currentPassword,
    });

    if (signInError) {
      return NextResponse.json(
        { error: 'INVALID_PASSWORD', message: 'Current password is incorrect' },
        { status: 400 }
      );
    }

    // Update to new password
    const { error: updateError } = await supabase.auth.updateUser({
      password: validatedData.newPassword,
    });

    if (updateError) {
      return NextResponse.json(
        { error: 'UPDATE_FAILED', message: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { success: true } });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Invalid password', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message ?? 'Failed to change password' },
      { status: 500 }
    );
  }
}
