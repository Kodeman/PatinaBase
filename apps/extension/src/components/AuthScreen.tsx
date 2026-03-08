import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useQRAuth } from '../hooks/use-qr-auth';
import { supabase } from '../lib/supabase';

export function AuthScreen() {
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState('');

  const qr = useQRAuth();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSigningIn(true);
    setAuthError('');

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to sign in');
    } finally {
      setIsSigningIn(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Email/password form (fallback)
  if (showEmailForm) {
    return (
      <div className="w-full min-w-[320px] max-w-[600px] h-screen p-4 bg-patina-off-white font-body">
        <header className="mb-4">
          <h1 className="text-xl font-display font-medium text-patina-mocha-brown">Patina</h1>
          <p className="text-sm text-patina-charcoal/70">Sign in to capture products</p>
        </header>

        <button
          onClick={() => setShowEmailForm(false)}
          className="mb-4 flex items-center gap-1 text-sm text-patina-mocha-brown hover:text-patina-charcoal transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Back to QR code
        </button>

        {authError && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-600">{authError}</p>
          </div>
        )}

        <form onSubmit={handleSignIn} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full px-3 py-2 text-sm rounded-lg border border-patina-clay-beige/50
                     focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-full px-3 py-2 text-sm rounded-lg border border-patina-clay-beige/50
                     focus:border-patina-mocha-brown focus:ring-1 focus:ring-patina-mocha-brown outline-none"
          />
          <button
            type="submit"
            disabled={isSigningIn}
            className="w-full py-2 px-4 bg-patina-mocha-brown text-white text-sm font-medium rounded-lg
                     hover:bg-patina-charcoal transition-all shadow-patina-md hover:shadow-patina-lg disabled:opacity-50 disabled:shadow-none"
          >
            {isSigningIn ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    );
  }

  // QR code screen (primary)
  return (
    <div className="w-full min-w-[320px] max-w-[600px] h-screen p-4 bg-patina-off-white font-body">
      <header className="mb-6">
        <h1 className="text-xl font-display font-medium text-patina-mocha-brown">Patina</h1>
        <p className="text-sm text-patina-charcoal/70">Sign in to capture products</p>
      </header>

      <div className="flex flex-col items-center">
        {/* Loading skeleton */}
        {qr.state === 'loading' && (
          <div className="w-[172px] h-[172px] rounded-lg bg-patina-clay-beige/20 animate-pulse" />
        )}

        {/* QR code */}
        {qr.state === 'pending' && qr.qrUrl && (
          <div className="p-3 bg-white rounded-lg shadow-patina-sm">
            <QRCodeSVG
              value={qr.qrUrl}
              size={172}
              level="M"
              bgColor="#FFFFFF"
              fgColor="#3D2B1F"
            />
          </div>
        )}

        {/* Approved checkmark */}
        {qr.state === 'approved' && (
          <div className="w-[172px] h-[172px] rounded-lg bg-green-50 flex items-center justify-center">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
        )}

        {/* Expired */}
        {qr.state === 'expired' && (
          <div className="w-[172px] h-[172px] rounded-lg bg-patina-clay-beige/10 flex flex-col items-center justify-center gap-3">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <p className="text-sm text-patina-charcoal/60">Code expired</p>
            <button
              onClick={qr.regenerate}
              className="text-sm font-medium text-patina-mocha-brown hover:text-patina-charcoal transition-colors"
            >
              Generate new code
            </button>
          </div>
        )}

        {/* Error */}
        {qr.state === 'error' && (
          <div className="w-[172px] h-[172px] rounded-lg bg-red-50 flex flex-col items-center justify-center gap-3 p-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <p className="text-xs text-red-600 text-center">{qr.error}</p>
            <button
              onClick={qr.regenerate}
              className="text-sm font-medium text-patina-mocha-brown hover:text-patina-charcoal transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {/* Status text */}
        {qr.state === 'pending' && (
          <div className="mt-4 text-center">
            <p className="text-sm text-patina-charcoal/70">Scan with the Patina iOS app</p>
            <p className="text-xs text-patina-charcoal/50 mt-1">
              Expires in {formatTime(qr.secondsRemaining)}
            </p>
          </div>
        )}

        {qr.state === 'approved' && (
          <p className="mt-4 text-sm font-medium text-green-600">Signed in!</p>
        )}

        {/* Divider + email fallback */}
        {(qr.state === 'pending' || qr.state === 'expired' || qr.state === 'error') && (
          <>
            <div className="flex items-center gap-3 w-full mt-6 mb-4">
              <div className="flex-1 h-px bg-patina-clay-beige/30" />
              <span className="text-xs text-patina-charcoal/40">or</span>
              <div className="flex-1 h-px bg-patina-clay-beige/30" />
            </div>

            <button
              onClick={() => setShowEmailForm(true)}
              className="w-full py-2 px-4 text-sm font-medium text-patina-mocha-brown border border-patina-clay-beige/50 rounded-lg
                       hover:bg-patina-clay-beige/10 transition-all"
            >
              Sign in with email
            </button>
          </>
        )}
      </div>
    </div>
  );
}
