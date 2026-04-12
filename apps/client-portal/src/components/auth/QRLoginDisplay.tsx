'use client';

import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, RefreshCw, CheckCircle2, QrCode } from 'lucide-react';
import { useQRAuth } from '@/hooks/use-qr-auth';

interface QRLoginDisplayProps {
  redirectTo: string;
  baseUrl?: string;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function QRLoginDisplay({ redirectTo, baseUrl = '' }: QRLoginDisplayProps) {
  const { state, qrUrl, secondsRemaining, regenerate } = useQRAuth(redirectTo, baseUrl);

  if (!baseUrl) {
    return null;
  }

  if (state === 'loading' || state === 'idle') {
    return (
      <div className="flex flex-col items-center">
        <div className="w-[240px] h-[240px] bg-muted/10 rounded-xl animate-pulse" />
        <div className="mt-4 h-5 w-48 bg-muted/10 rounded animate-pulse" />
      </div>
    );
  }

  if (state === 'approved') {
    return (
      <div className="flex flex-col items-center py-4">
        <div className="w-[240px] h-[240px] flex items-center justify-center">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center animate-in zoom-in duration-300">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">
          Signing you in...
        </p>
      </div>
    );
  }

  if (state === 'expired') {
    return (
      <div className="flex flex-col items-center py-4">
        <div className="w-[240px] h-[240px] flex items-center justify-center">
          <div className="text-center">
            <QrCode className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Code expired
            </p>
          </div>
        </div>
        <button
          onClick={regenerate}
          className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground border border-border rounded-lg hover:bg-muted/50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Generate new code
        </button>
      </div>
    );
  }

  if (state === 'error') {
    // If the QR auth service is unreachable, hide the section entirely
    // rather than showing a broken error state
    return null;
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
          Scan with the Patina iOS app
        </p>
      </div>

      <p className="mt-2 text-xs text-muted-foreground/70">
        Expires in {formatTime(secondsRemaining)}
      </p>
    </div>
  );
}
