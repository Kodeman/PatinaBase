import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// POST /api/me/avatar - Upload avatar to Supabase Storage and update profile
export async function POST(request: NextRequest) {
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
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'File must be an image' },
        { status: 400 }
      );
    }

    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'File must be less than 5MB' },
        { status: 400 }
      );
    }

    const ext = file.name.split('.').pop() ?? 'jpg';
    const filePath = `avatars/${user.id}.${ext}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      return NextResponse.json(
        { error: 'UPLOAD_FAILED', message: uploadError.message },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const avatarUrl = urlData.publicUrl;

    // Update profile
    await (supabase as any)
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', user.id);

    return NextResponse.json({ data: { avatarUrl } });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: err.message ?? 'Failed to upload avatar' },
      { status: 500 }
    );
  }
}

// PATCH /api/me/avatar - Update avatar URL directly
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
    if (!body.avatarUrl || typeof body.avatarUrl !== 'string') {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Invalid avatar URL' },
        { status: 400 }
      );
    }

    const { error } = await (supabase as any)
      .from('profiles')
      .update({ avatar_url: body.avatarUrl })
      .eq('id', user.id);

    if (error) {
      return NextResponse.json(
        { error: 'UPDATE_FAILED', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { avatarUrl: body.avatarUrl } });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: err.message ?? 'Failed to update avatar' },
      { status: 500 }
    );
  }
}
