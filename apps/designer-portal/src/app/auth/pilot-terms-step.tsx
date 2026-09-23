'use client';

import { useState } from 'react';
import { PILOT_TERMS_PATH } from '@/lib/pilot-terms';

/**
 * The one step interposed on the designer-invite leg (P2b): the pilot terms in
 * summary, the terms themselves a click away, and one button that records the
 * acceptance and opens the desk.
 */
export function PilotTermsStep({
  onAccept,
}: {
  onAccept: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid border-t-2 border-t-[#5E7059] pt-[15px]">
      <h2 className="font-heading text-[30px] font-medium leading-[1.1] tracking-[-0.03em] text-[#2C2926] [text-wrap:balance]">
        Before your desk opens.
      </h2>
      <p className="mt-[8px] text-[14px] leading-[1.6] text-[#65594E]">
        Patina costs you nothing for ninety days from today. Whenever a bill is
        due you can ask for a sit-down and Kody will take it with you. Your
        invoices, payments and clients come back to you as a spreadsheet any
        time you ask, and you can stop whenever you like.
      </p>
      {/* A new tab, not a navigation: leaving this page drops the session back
          through middleware, which sends an authenticated designer to /desk and
          the acceptance would never be recorded. */}
      <a
        href={PILOT_TERMS_PATH}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-[10px] inline-flex min-h-[44px] items-center text-[14px] font-semibold text-[#2C2926] underline decoration-[#8B7355] underline-offset-4 transition-colors duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] hover:decoration-[#2C2926] focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2 motion-reduce:transition-none"
      >
        Read the pilot terms
      </a>
      {error && (
        <p
          role="alert"
          className="mt-[8px] text-[14px] leading-[1.6] text-[#9C3D31]"
        >
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          setPending(true);
          // Pending is only released on failure: a recorded acceptance leaves
          // for the desk, and re-enabling the button mid-navigation invites a
          // second write.
          void onAccept().catch(() => {
            setError('We could not record that. Please try again.');
            setPending(false);
          });
        }}
        className="mt-[16px] h-[48px] w-full bg-[#1A1816] px-[16px] text-[14px] font-semibold text-[#FAF7F2] transition-colors duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] hover:bg-[#2C2926] disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-[#5C4A3C] focus:ring-offset-2 motion-reduce:transition-none"
      >
        {pending ? 'Opening your desk…' : 'Accept and open the desk'}
      </button>
    </div>
  );
}
