'use client';

/**
 * Account · Devices — sign a fresh iOS device in by QR. Reuses the existing
 * PairDeviceQR component unchanged; it's framed on a paper card (its own
 * foreground/muted tokens are tuned for a light surface) sitting on the
 * charcoal sheet — "a paper card on the desk".
 */

import { PairDeviceQR } from '@/components/auth/PairDeviceQR';

export function AccountDevicesPage() {
  return (
    <div className="pt-1">
      <p className="mb-5 text-[12px] leading-relaxed text-[rgba(250,247,242,0.55)]">
        Open the Patina iOS app on a fresh device, choose &ldquo;Sign in with QR&rdquo;, and scan the
        code. Your phone is signed in as you — no password. Codes expire after 5 minutes and work
        once.
      </p>

      <div className="rounded-[8px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] px-6 py-8">
        <PairDeviceQR />
      </div>
    </div>
  );
}
