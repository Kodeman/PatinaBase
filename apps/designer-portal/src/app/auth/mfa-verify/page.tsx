'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useMfaFactors,
  useChallengeMfa,
} from '@patina/supabase';
import { Button, Input, Alert } from '@patina/design-system';
import { ShieldCheck, Smartphone } from 'lucide-react';

function MfaVerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  const { factors, isLoading } = useMfaFactors();
  const challengeMfa = useChallengeMfa();

  const [selectedFactorId, setSelectedFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const verifiedFactors = factors.filter((f) => f.status === 'verified');

  // Auto-select if there's only one factor
  useEffect(() => {
    if (verifiedFactors.length === 1 && !selectedFactorId) {
      setSelectedFactorId(verifiedFactors[0].id);
    }
  }, [verifiedFactors, selectedFactorId]);

  // Focus code input when factor is selected
  useEffect(() => {
    if (selectedFactorId && codeInputRef.current) {
      codeInputRef.current.focus();
    }
  }, [selectedFactorId]);

  const handleCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
  };

  const handleVerify = async () => {
    if (!selectedFactorId || code.length !== 6) return;
    setError(null);

    try {
      await challengeMfa.mutateAsync({
        factorId: selectedFactorId,
        code,
      });
      router.push(callbackUrl);
    } catch (err: any) {
      setError(err.message || 'Invalid verification code. Please try again.');
      setCode('');
      codeInputRef.current?.focus();
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  if (verifiedFactors.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow">
          <Alert variant="destructive">
            No two-factor authentication methods found. Please contact support.
          </Alert>
          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={() => router.push('/auth/signin')}
          >
            Back to Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <ShieldCheck className="h-6 w-6 text-blue-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">
            Two-Factor Verification
          </h1>
          <p className="text-sm text-gray-600">
            Enter the verification code from your authenticator app to continue.
          </p>
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}

        {/* Factor selection (only shown when multiple factors exist) */}
        {verifiedFactors.length > 1 && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Select authenticator
            </label>
            <div className="space-y-2">
              {verifiedFactors.map((factor) => (
                <button
                  key={factor.id}
                  type="button"
                  onClick={() => {
                    setSelectedFactorId(factor.id);
                    setCode('');
                    setError(null);
                  }}
                  className={`flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors ${
                    selectedFactorId === factor.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Smartphone className="h-5 w-5 text-gray-400" />
                  <span className="text-sm font-medium text-gray-900">
                    {factor.friendlyName || 'Authenticator App'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Code input */}
        {selectedFactorId && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Verification Code
              </label>
              <Input
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && code.length === 6) {
                    handleVerify();
                  }
                }}
                className="mt-1 font-mono text-lg tracking-[0.5em]"
                placeholder="000000"
                maxLength={6}
              />
            </div>

            <Button
              className="w-full"
              onClick={handleVerify}
              disabled={code.length !== 6 || challengeMfa.isPending}
            >
              {challengeMfa.isPending ? 'Verifying...' : 'Verify'}
            </Button>
          </div>
        )}

        <div className="text-center">
          <button
            type="button"
            onClick={() => router.push('/auth/signin')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel and sign in with a different account
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MfaVerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      }
    >
      <MfaVerifyContent />
    </Suspense>
  );
}
