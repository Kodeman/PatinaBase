'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DesignerAuthShell } from '../auth-shell';

/**
 * The auth error surface speaks the same warm, flat vocabulary as the rest of
 * the portal auth family: no icon medallions, no tinted alert cards. State is a
 * single hairline over the words — terracotta `#9C3D31` when the door is shut,
 * aged oak `#8B7355` when it is only latched. Semantic hue lives on that edge
 * and nowhere else; every glyph on paper stays in the `#2C2926` / `#65594E` ink
 * family so contrast holds at every tone.
 */
const TONE_HALT = 'error';
const TONE_HOLD = 'info';

/** The same two edges `PortalAuthNotice` uses, so every notice on the surface reads at one weight. */
const TONE_EDGE: Record<string, string> = {
  error: 'border-t-[#9C3D31]',
  info: 'border-t-[#8B7355]',
};

const ERROR_CONFIGS: Record<string, { title: string; description: string; tone: string }> = {
  Configuration: {
    title: 'Configuration Error',
    description: 'There is a problem with the server configuration. Please contact your system administrator.',
    tone: TONE_HALT,
  },
  AccessDenied: {
    title: 'Access Denied',
    description: 'You do not have the required permissions to access this resource. Please contact your administrator if you believe this is an error.',
    tone: TONE_HALT,
  },
  InsufficientPermissions: {
    title: 'Insufficient Permissions',
    description: 'You do not have the required permissions to access this resource.',
    tone: TONE_HOLD,
  },
  Verification: {
    title: 'Verification Required',
    description: 'Your account needs to be verified before you can access the designer portal.',
    tone: TONE_HOLD,
  },
  SessionExpired: {
    title: 'Session Expired',
    description: 'Your session has expired. Please sign in again to continue.',
    tone: TONE_HOLD,
  },
  Default: {
    title: 'Authentication Error',
    description: 'An error occurred during authentication. Please try signing in again.',
    tone: TONE_HALT,
  },
};

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error') || 'Default';
  const errorConfig = ERROR_CONFIGS[error] || ERROR_CONFIGS.Default;

  return (
    <DesignerAuthShell>
      <div className="space-y-6">
        {/* The tone attribute is what the brand pane watches: on a hard error its
            light drops back, the way the shared notice makes it drop back. */}
        <div
          data-portal-auth-tone={errorConfig.tone}
          className={`border-t-2 pt-4 ${TONE_EDGE[errorConfig.tone]}`}
        >
          <h2 className="font-heading text-3xl leading-[1.1] tracking-[-0.03em] text-[#2C2926]">
            {errorConfig.title}
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#65594E]">
            {errorConfig.description}
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/auth/signin"
            className="flex h-12 w-full items-center justify-center px-4 text-sm font-semibold text-[#FAF7F2] bg-[#1A1816] transition-colors hover:bg-[#2C2926] focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2 motion-reduce:transition-none"
          >
            <ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />
            Back to Sign In
          </Link>

          {error === 'InsufficientPermissions' && (
            <Link
              href="/projects"
              className="flex h-12 w-full items-center justify-center border border-[#8B7355] px-4 text-sm font-semibold text-[#2C2926] transition-colors hover:border-[#2C2926] focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2 motion-reduce:transition-none"
            >
              Go to Projects
            </Link>
          )}
        </div>

        <div className="border-t border-[#8B7355] pt-4">
          <p className="text-sm leading-6 text-[#65594E]">
            Need help?{' '}
            <a
              href="mailto:support@patina.com"
              className="font-semibold text-[#2C2926] underline decoration-[#8B7355] underline-offset-4 transition-colors hover:decoration-[#2C2926] focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2 motion-reduce:transition-none"
            >
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </DesignerAuthShell>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<DesignerAuthShell><p className="text-sm text-[#65594E]">Loading your sign-in details.</p></DesignerAuthShell>}>
      <AuthErrorContent />
    </Suspense>
  );
}
