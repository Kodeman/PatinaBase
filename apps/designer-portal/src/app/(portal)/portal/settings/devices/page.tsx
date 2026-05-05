'use client';

import { PairDeviceQR } from '@/components/auth/PairDeviceQR';

export default function DevicesSettingsPage() {
  return (
    <div className="max-w-2xl mx-auto py-10 px-6">
      <header className="mb-8">
        <h1 className="text-2xl font-display text-foreground">Sign in to mobile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Open the Patina iOS app on a fresh device, choose &ldquo;Sign in with QR&rdquo;,
          and scan the code below. Your iOS app will be signed in as you — no
          password required.
        </p>
      </header>

      <div className="rounded-2xl border border-border bg-card p-8">
        <PairDeviceQR />
      </div>

      <p className="mt-6 text-xs text-muted-foreground/70">
        Codes expire after 5 minutes and can only be used once. If your iOS
        app doesn&apos;t open automatically, copy the code into the app
        manually.
      </p>
    </div>
  );
}
