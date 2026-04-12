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
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900">Access Denied</h1>
        <p className="mt-4 text-lg text-gray-600">
          You do not have permission to access the admin portal.
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Contact your administrator if you believe this is an error.
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
