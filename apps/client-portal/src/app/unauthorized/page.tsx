'use client';

import { createBrowserClient } from '@patina/supabase';
import { useState } from 'react';

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
          Your account doesn&apos;t have access to the Patina client portal.
        </p>
        <p className="mt-2 text-sm text-gray-500">
          If you&apos;re a designer, head to{' '}
          <a
            href="https://app.patina.cloud"
            className="font-medium text-indigo-600 hover:text-indigo-500"
          >
            app.patina.cloud
          </a>
          . If you believe this is an error, contact your designer or our support team.
        </p>
        <button
          onClick={handleSignInWithDifferentAccount}
          disabled={isSigningOut}
          className="mt-8 inline-block rounded-md bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
        >
          {isSigningOut ? 'Signing out...' : 'Sign in with a different account'}
        </button>
      </div>
    </div>
  );
}
