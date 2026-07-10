'use client';

/**
 * ConnectFieldModal — "Connect Patina Field" QR handoff.
 *
 * Opened from the AccountMenu. Renders a QR encoding `field://login?v=1&th=…`
 * (a single-use magiclink token for the signed-in designer). Patina Field scans
 * it and signs in as that designer. The QR auto-rotates every 60s.
 *
 * SECURITY: the QR value is never logged. Analytics fire without the token.
 */

import { useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { RefreshCw, Smartphone } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@patina/design-system';
import { Button } from '@/components/ui/controls';
import { useFieldLoginQr, QR_ROTATE_SECONDS } from '@/hooks/use-field-login-qr';
import { fieldEvents } from '@/lib/analytics/events';

export interface ConnectFieldModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Small circular countdown ring with the remaining seconds in the middle. */
function CountdownRing({ seconds }: { seconds: number }) {
  const size = 34;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = Math.max(0, Math.min(1, seconds / QR_ROTATE_SECONDS));
  const offset = circumference * (1 - fraction);
  return (
    <span className="relative inline-flex items-center justify-center" aria-hidden="true">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border-default)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent-primary)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      <span className="absolute font-mono text-[0.6rem] tabular-nums text-[var(--text-muted)]">
        {seconds}
      </span>
    </span>
  );
}

export function ConnectFieldModal({ open, onOpenChange }: ConnectFieldModalProps) {
  const { status, qrValue, secondsRemaining, error, refresh } = useFieldLoginQr(open);

  // Analytics on open (no token — see fieldEvents).
  useEffect(() => {
    if (open) fieldEvents.connectOpen();
  }, [open]);

  useEffect(() => {
    if (open && status === 'error') fieldEvents.connectError();
  }, [open, status]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Connect Patina Field</DialogTitle>
          <DialogDescription>
            Sign in to the Patina Field app on your phone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center pt-1">
          {/* QR / status surface — fixed square so the modal never jumps. */}
          <div className="flex h-[240px] w-[240px] items-center justify-center rounded-xl border border-[var(--border-default)] bg-white p-4">
            {status === 'ready' && qrValue ? (
              <QRCodeSVG
                value={qrValue}
                size={208}
                level="M"
                bgColor="transparent"
                fgColor="#3D2E2A"
              />
            ) : status === 'error' ? (
              <div className="px-6 text-center">
                <p className="text-sm text-[var(--color-error)]">{error}</p>
              </div>
            ) : (
              <div className="h-[208px] w-[208px] animate-pulse rounded-lg bg-[var(--bg-subtle)]" />
            )}
          </div>

          {/* Rotation / retry line */}
          {status === 'error' ? (
            <Button variant="secondary" size="sm" onClick={refresh} className="mt-5">
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
          ) : (
            <div className="mt-5 flex items-center gap-2 text-[var(--text-muted)]">
              <CountdownRing seconds={status === 'ready' ? secondsRemaining : QR_ROTATE_SECONDS} />
              <p className="text-xs">
                {status === 'ready'
                  ? 'This code refreshes automatically for your security.'
                  : 'Generating a secure code…'}
              </p>
            </div>
          )}

          {/* Instruction copy */}
          <div className="mt-4 flex items-start gap-2 px-2 text-center text-xs leading-relaxed text-[var(--text-muted)]">
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              Open Patina Field and point the camera at this code — or scan with your
              iPhone camera.
            </p>
          </div>
        </div>

        <DialogFooter className="sm:justify-center">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ConnectFieldModal;
