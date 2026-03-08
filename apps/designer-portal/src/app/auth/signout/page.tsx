'use client';

import { createBrowserClient } from '@patina/supabase';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SignOutPage() {
  const router = useRouter();

  useEffect(() => {
    async function handleSignOut() {
      try {
        // First revoke backend tokens
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (error) {
        console.error('Backend logout failed:', error);
      }
      // Then clear Supabase session
      const supabase = createBrowserClient();
      await supabase.auth.signOut();
      router.push('/auth/signin');
    }
    handleSignOut();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-900">
          Signing out...
        </h1>
        <p className="mt-2 text-gray-600">
          Please wait while we sign you out
        </p>
      </div>
    </div>
  );
}
