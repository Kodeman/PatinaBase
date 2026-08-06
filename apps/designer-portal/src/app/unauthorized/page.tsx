'use client';

import { createBrowserClient } from '@patina/supabase';
import { useState } from 'react';
import { PortalAuthNotice } from '@patina/design-system';
import { DesignerAuthShell } from '../auth/auth-shell';

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
    <DesignerAuthShell>
      <div className="space-y-5">
        <div>
          <h2 className="font-heading text-3xl leading-[1.1] tracking-[-0.03em] text-[#2C2926]">
            Wrong portal
          </h2>
          <div
            aria-hidden="true"
            className="mt-3.5 h-px bg-[linear-gradient(90deg,rgba(196,162,101,0.8)_0%,rgba(139,115,85,0.3)_52%,rgba(139,115,85,0)_100%)]"
          />
        </div>

        <PortalAuthNotice tone="info">
          Your account doesn&apos;t have access to the Patina designer workspace.
        </PortalAuthNotice>

        <p className="text-sm leading-6 text-[#65594E]">
          If you&apos;re a client working with a designer, head to{' '}
          <a
            href="https://client.patina.cloud"
            className="font-semibold text-[#2C2926] underline decoration-[#8B7355] underline-offset-4 transition-colors hover:decoration-[#2C2926] focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2 motion-reduce:transition-none"
          >
            client.patina.cloud
          </a>
          . If you believe this is an error, contact your administrator.
        </p>

        <button
          type="button"
          onClick={handleSignInWithDifferentAccount}
          disabled={isSigningOut}
          aria-busy={isSigningOut || undefined}
          className="h-12 w-full bg-[#1A1816] px-4 text-sm font-semibold text-[#FAF7F2] transition-colors hover:bg-[#2C2926] focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none"
        >
          {isSigningOut ? 'Signing out...' : 'Sign in with a different account'}
        </button>
      </div>
    </DesignerAuthShell>
  );
}
