/**
 * Legacy NextAuth catch-all route — now handled by Supabase Auth.
 */
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { error: 'Auth is now handled by Supabase. Use the Supabase client SDK.' },
    { status: 410 }
  );
}

export async function POST() {
  return NextResponse.json(
    { error: 'Auth is now handled by Supabase. Use the Supabase client SDK.' },
    { status: 410 }
  );
}
