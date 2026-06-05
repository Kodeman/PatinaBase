'use client';

import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, RefreshCw, CheckCircle2, QrCode } from 'lucide-react';
import { useDevicePair } from '@/hooks/use-device-pair';
import { Button } from '@/components/ui/controls';

interface PairDeviceQRProps {
  baseUrl?: string;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Renders the "Sign in to mobile" QR. The portal user (already signed in)
 * shows this QR; a fresh iOS device scans it and gets signed in as them
 * via the device-pairing endpoints.
 */
export function PairDeviceQR({ baseUrl = '' }: PairDeviceQRProps) {
  const { state, qrUrl, secondsRemaining, error, regenerate } = useDevicePair(baseUrl);

  if (state === 'loading' || state === 'idle') {
    return (
      <div className="flex flex-col items-center">
        <div className="w-[240px] h-[240px] bg-muted/10 rounded-xl animate-pulse" />
        <div className="mt-4 h-5 w-48 bg-muted/10 rounded animate-pulse" />
      </div>
    );
  }

  if (state === 'consumed') {
    return (
      <div className="flex flex-col items-center py-4">
        <div className="w-[240px] h-[240px] flex items-center justify-center">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center animate-in zoom-in duration-300">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">
          Device signed in
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Open the Patina app on your phone — you&apos;re ready to go.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={regenerate}
          className="mt-4"
        >
          <RefreshCw className="w-4 h-4" />
          Pair another device
        </Button>
      </div>
    );
  }

  if (state === 'expired') {
    return (
      <div className="flex flex-col items-center py-4">
        <div className="w-[240px] h-[240px] flex items-center justify-center">
          <div className="text-center">
            <QrCode className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Code expired</p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={regenerate}
          className="mt-4"
        >
          <RefreshCw className="w-4 h-4" />
          Generate new code
        </Button>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col items-center py-4">
        <div className="w-[240px] h-[240px] flex items-center justify-center">
          <div className="text-center px-4">
            <QrCode className="w-12 h-12 text-destructive/40 mx-auto mb-3" />
            <p className="text-sm text-destructive">
              {error || 'Something went wrong'}
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={regenerate}
          className="mt-4"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="p-4 bg-white rounded-xl border border-border">
        {qrUrl && (
          <QRCodeSVG
            value={qrUrl}
            size={208}
            level="M"
            bgColor="transparent"
            fgColor="#3D2E2A"
          />
        )}
      </div>

      <div className="mt-5 flex items-center gap-2 text-muted-foreground">
        <Smartphone className="w-4 h-4" />
        <p className="text-sm">
          Open the Patina iOS app and tap &ldquo;Sign in with QR&rdquo;
        </p>
      </div>

      <p className="mt-2 text-xs text-muted-foreground/70">
        Expires in {formatTime(secondsRemaining)}
      </p>
    </div>
  );
}
