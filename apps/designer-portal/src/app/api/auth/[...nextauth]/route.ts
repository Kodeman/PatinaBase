/**
 * Legacy NextAuth catch-all route — now handled by Supabase Auth.
 * This file exists for backward compatibility. All auth is handled
 * client-side via Supabase JS SDK or via /api/auth/callback.
 */
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { error: 'Auth is now handled by Supabase. Use /api/auth/callback for OAuth callbacks.' },
    { status: 410 }
  );
}

export async function POST() {
  return NextResponse.json(
    { error: 'Auth is now handled by Supabase. Use the Supabase client SDK.' },
    { status: 410 }
  );
}
