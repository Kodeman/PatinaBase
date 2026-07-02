'use client';

/**
 * /portal/teaching/your-eye — the designer's own taste profile (§8.5).
 * The panel itself lives with the profile components
 * (components/document/people/profile/your-eye.tsx); this page keeps it
 * reachable from Teaching.
 */

import Link from 'next/link';
import { Button } from '@/components/ui/controls';
import { YourEyePanel } from '@/components/document/people/profile/your-eye';

export default function YourEyePage() {
  return (
    <div className="pt-8">
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/portal/teaching">← Teaching</Link>
        </Button>
      </div>

      <h1 className="type-section-head mb-1">Your eye</h1>
      <p className="type-label-secondary mb-8">
        What the Engine has learned from your teaching — inspectable, editable, yours.
      </p>

      <YourEyePanel />
    </div>
  );
}
