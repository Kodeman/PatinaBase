'use client';

import { createBrowserClient } from '@patina/supabase';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function AdminSignOutPage() {
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
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Signing out...</h1>
          <p className="mt-2 text-muted-foreground">Please wait while we sign you out</p>
        </div>
      </div>
    </div>
  );
}
