'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEnrollMfa, useVerifyMfaEnrollment } from '@patina/supabase/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ShieldCheck } from 'lucide-react';

function MfaEnrollInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/dashboard';

  const enroll = useEnrollMfa();
  const verify = useVerifyMfaEnrollment();

  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    enroll.mutate(
      { friendlyName: 'Admin Portal Authenticator' },
      {
        onSuccess: (data) => {
          setFactorId(data.factorId);
          setQrCode(data.qrCode);
          setSecret(data.secret);
          setError(null);
        },
        onError: (err) => {
          setError((err as Error).message ?? 'Failed to start MFA enrollment');
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    verify.mutate(
      { factorId, code: code.trim() },
      {
        onSuccess: () => {
          router.replace((callbackUrl || '/dashboard') as any);
        },
        onError: (err) => {
          setError((err as Error).message ?? 'Code did not verify');
        },
      },
    );
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Enroll multi-factor authentication
        </CardTitle>
        <CardDescription>
          This account requires MFA before continuing. Scan the QR code with an authenticator
          app (1Password, Authy, Google Authenticator) and enter the 6-digit code below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {enroll.isPending && (
          <p className="text-sm text-muted-foreground">Generating enrollment QR…</p>
        )}

        {qrCode && (
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrCode}
              alt="MFA enrollment QR code"
              className="w-48 h-48 border rounded"
            />
            {secret && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  Show secret manually
                </summary>
                <code className="font-mono text-xs block mt-2 break-all">{secret}</code>
              </details>
            )}
          </div>
        )}

        {factorId && (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="text-sm font-medium" htmlFor="mfa-code">
                Verification code
              </label>
              <Input
                id="mfa-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                className="mt-2 font-mono tracking-widest text-center"
                autoFocus
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={verify.isPending || code.length !== 6}
            >
              {verify.isPending ? 'Verifying…' : 'Verify and continue'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function MfaEnrollPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <MfaEnrollInner />
      </Suspense>
    </div>
  );
}
