'use client';

import { createBrowserClient } from '@patina/supabase';
import { useState } from 'react';
import { Button } from '@/components/ui/controls';

export default function UnauthorizedPage() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignInWithDifferentAccount() {
    setIsSigningOut(true);
    try {
      const supabase = createBrowserClient();
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Sign out failed:', error);
    }
    window.location.href = '/auth/signin';
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="max-w-md px-6 text-center">
        <h1 className="text-4xl font-bold text-gray-900">Wrong portal</h1>
        <p className="mt-4 text-lg text-gray-600">
          Your account doesn&apos;t have access to the Patina designer workspace.
        </p>
        <p className="mt-2 text-sm text-gray-500">
          If you&apos;re a client working with a designer, head to{' '}
          <a
            href="https://client.patina.cloud"
            className="font-medium text-indigo-600 hover:text-indigo-500"
          >
            client.patina.cloud
          </a>
          . If you believe this is an error, contact your administrator.
        </p>
        <Button
          onClick={handleSignInWithDifferentAccount}
          disabled={isSigningOut}
          loading={isSigningOut}
          className="mt-8"
        >
          {isSigningOut ? 'Signing out...' : 'Sign in with a different account'}
        </Button>
      </div>
    </div>
  );
}
