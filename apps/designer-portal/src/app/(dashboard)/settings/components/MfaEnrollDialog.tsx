'use client';

import { useState, useRef, useEffect } from 'react';
import {
  useEnrollMfa,
  useVerifyMfaEnrollment,
} from '@patina/supabase';
import {
  Button,
  Input,
  Alert,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@patina/design-system';
import { Smartphone, Copy, Check, ShieldCheck } from 'lucide-react';

type EnrollStep = 'qr' | 'verify' | 'success';

interface MfaEnrollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function MfaEnrollDialog({
  open,
  onOpenChange,
  onSuccess,
}: MfaEnrollDialogProps) {
  const [step, setStep] = useState<EnrollStep>('qr');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const enrollMfa = useEnrollMfa();
  const verifyMfa = useVerifyMfaEnrollment();

  // Start enrollment when dialog opens
  useEffect(() => {
    if (open && step === 'qr' && !factorId) {
      handleEnroll();
    }
  }, [open]);

  // Focus code input on verify step
  useEffect(() => {
    if (step === 'verify' && codeInputRef.current) {
      codeInputRef.current.focus();
    }
  }, [step]);

  const handleEnroll = async () => {
    setError(null);
    try {
      const result = await enrollMfa.mutateAsync({
        friendlyName: 'Authenticator App',
      });
      setFactorId(result.factorId);
      setQrCode(result.qrCode);
      setSecret(result.secret);
    } catch (err: any) {
      setError(err.message || 'Failed to start MFA enrollment');
    }
  };

  const handleVerify = async () => {
    if (!factorId || code.length !== 6) return;
    setError(null);

    try {
      await verifyMfa.mutateAsync({ factorId, code });
      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Invalid verification code. Please try again.');
      setCode('');
    }
  };

  const handleCopySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      // Reset state on close
      setStep('qr');
      setFactorId(null);
      setQrCode(null);
      setSecret(null);
      setCode('');
      setError(null);
      setCopied(false);

      if (step === 'success') {
        onSuccess();
      }
    }
    onOpenChange(isOpen);
  };

  const handleCodeChange = (value: string) => {
    // Only allow digits, max 6
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === 'success'
              ? 'Two-Factor Authentication Enabled'
              : 'Set Up Two-Factor Authentication'}
          </DialogTitle>
          <DialogDescription>
            {step === 'qr' &&
              'Scan the QR code with your authenticator app to get started.'}
            {step === 'verify' &&
              'Enter the 6-digit code from your authenticator app to verify.'}
            {step === 'success' &&
              'Your account is now protected with two-factor authentication.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="mt-2">
            {error}
          </Alert>
        )}

        {step === 'qr' && (
          <div className="space-y-4">
            {enrollMfa.isPending ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-gray-500">
                  Generating QR code...
                </p>
              </div>
            ) : qrCode ? (
              <>
                <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 p-3">
                  <Smartphone className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
                  <p className="text-sm text-blue-800">
                    Scan this QR code with an authenticator app such as Google
                    Authenticator, Authy, or 1Password.
                  </p>
                </div>

                <div className="flex justify-center rounded-md border bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrCode}
                    alt="QR Code for authenticator app"
                    className="h-48 w-48"
                  />
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500">
                    Or enter this key manually:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-md border bg-gray-50 px-3 py-2 font-mono text-sm tracking-wider text-gray-900">
                      {secret}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopySecret}
                      className="flex-shrink-0"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {step === 'verify' && (
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
              <p className="mt-1 text-xs text-gray-500">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <ShieldCheck className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-center text-sm text-gray-600">
              Two-factor authentication has been successfully enabled. You will
              be asked for a verification code when signing in.
            </p>
          </div>
        )}

        <DialogFooter>
          {step === 'qr' && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => setStep('verify')}
                disabled={!qrCode || enrollMfa.isPending}
              >
                Continue
              </Button>
            </>
          )}

          {step === 'verify' && (
            <>
              <Button variant="outline" onClick={() => setStep('qr')}>
                Back
              </Button>
              <Button
                onClick={handleVerify}
                disabled={code.length !== 6 || verifyMfa.isPending}
              >
                {verifyMfa.isPending ? 'Verifying...' : 'Verify & Enable'}
              </Button>
            </>
          )}

          {step === 'success' && (
            <Button onClick={() => handleClose(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
