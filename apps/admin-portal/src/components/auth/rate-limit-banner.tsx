'use client';

import { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Clock } from 'lucide-react';
import { RateLimitHandler, RateLimitInfo } from '@/lib/auth/rate-limit-handler';

interface RateLimitBannerProps {
  endpoint?: string;
  info?: RateLimitInfo | null;
  onExpire?: () => void;
}

/**
 * Rate Limit Banner Component
 *
 * Displays a prominent banner when user is rate limited with countdown timer
 */
export function RateLimitBanner({ endpoint = 'auth', info: propInfo, onExpire }: RateLimitBannerProps) {
  const [info, setInfo] = useState<RateLimitInfo | null>(
    propInfo || RateLimitHandler.getStoredRateLimitInfo(endpoint),
  );
  const [remainingSeconds, setRemainingSeconds] = useState(info?.retryAfter || 0);

  useEffect(() => {
    if (!info || !info.isRateLimited) return;

    // Update countdown every second
    const interval = setInterval(() => {
      const stored = RateLimitHandler.getStoredRateLimitInfo(endpoint);
      if (!stored) {
        setInfo(null);
        setRemainingSeconds(0);
        onExpire?.();
        return;
      }

      setRemainingSeconds(stored.retryAfter);

      if (stored.retryAfter <= 0) {
        RateLimitHandler.clearRateLimitInfo(endpoint);
        setInfo(null);
        onExpire?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [info, endpoint, onExpire]);

  if (!info || !info.isRateLimited || remainingSeconds <= 0) {
    return null;
  }

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Too Many Attempts</AlertTitle>
      <AlertDescription className="mt-2 space-y-2">
        <p>{info.message}</p>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Clock className="h-3.5 w-3.5" />
          <span>
            Try again in: {RateLimitHandler.formatRemainingTime(remainingSeconds)}
          </span>
        </div>
        {info.remainingAttempts !== undefined && info.remainingAttempts > 0 && (
          <p className="text-sm text-muted-foreground">
            Remaining attempts: {info.remainingAttempts}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
