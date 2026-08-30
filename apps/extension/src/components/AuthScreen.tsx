import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useQRAuth } from '../hooks/use-qr-auth';
import { supabase, PORTAL_URL } from '../lib/supabase';
import { LoadingStrata } from './LoadingStrata';
import { StrataMark } from './StrataMark';

export function AuthScreen() {
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState('');

  const qr = useQRAuth();

  const openPortalTab = (url: string) => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  };

  const handleOpenPortalSignin = () => openPortalTab(`${PORTAL_URL}/auth/signin?source=ext`);
  const handleOpenPortalSignup = () => openPortalTab(`${PORTAL_URL}/auth/signup?source=ext`);

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
      <div className="w-full min-w-[320px] max-w-[600px] h-screen p-4 bg-paper font-body">
        <header className="mb-4">
          <h1 className="font-display font-normal text-[1.8rem] text-ink">Patina</h1>
          <p className="text-sm text-ink">Sign in to capture products</p>
        </header>

        <button
          onClick={() => setShowEmailForm(false)}
          className="mb-4 flex items-center gap-1 text-sm text-ink-soft hover:text-ink transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Back to QR code
        </button>

        {authError && (
          <div className="mb-3 p-2 bg-rust/15 border border-rust/30 rounded-md">
            <p className="text-xs text-rust">{authError}</p>
          </div>
        )}

        <form onSubmit={handleSignIn} className="space-y-3">
          <div>
            <label className="font-mono text-[0.65rem] uppercase tracking-[0.06em] text-ink-soft">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full px-3 py-2 text-sm rounded-md border border-line
                       focus:border-verdigris focus:ring-1 focus:ring-verdigris outline-none"
            />
          </div>
          <div>
            <label className="font-mono text-[0.65rem] uppercase tracking-[0.06em] text-ink-soft">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="w-full px-3 py-2 text-sm rounded-md border border-line
                       focus:border-verdigris focus:ring-1 focus:ring-verdigris outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={isSigningIn}
            className="w-full py-2 px-4 bg-ink text-paper text-sm font-medium rounded-[3px]
                     hover:bg-ink-2 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:shadow-none"
          >
            {isSigningIn ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    );
  }

  // QR code screen (primary)
  return (
    <div className="w-full min-w-[320px] max-w-[600px] h-screen p-4 bg-paper font-body">
      <header className="mb-6">
        <h1 className="font-display font-normal text-[1.8rem] text-ink">Patina</h1>
        <p className="text-sm text-ink">Sign in to capture products</p>
      </header>

      {/* Primary path — public installer, no account assumed yet. Hidden once
          pairing has resolved (approved) or is still resolving (loading). */}
      {(qr.state === 'pending' || qr.state === 'expired' || qr.state === 'error') && (
        <>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleOpenPortalSignin}
              data-testid="auth.openPortalSignin"
              className="w-full py-2.5 px-4 bg-verdigris-ink text-paper text-sm font-medium rounded-[3px]
                       hover:brightness-110 transition-all shadow-md hover:shadow-lg"
            >
              Sign in on patina.cloud
            </button>
            <button
              onClick={handleOpenPortalSignup}
              data-testid="auth.openPortalSignup"
              className="w-full py-2 px-4 text-sm font-medium text-ink border border-line rounded-[3px]
                       hover:bg-[var(--bg-hover)] transition-all"
            >
              Create an account
            </button>
            <p className="mt-1 text-[0.65rem] text-ink-soft/70 text-center">
              After you sign in, this extension will pick up your session automatically.
            </p>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 w-full mt-6 mb-4">
            <div className="flex-1 h-px bg-line" />
            <StrataMark variant="micro" />
            <div className="flex-1 h-px bg-line" />
          </div>
        </>
      )}

      <div className="flex flex-col items-center">
        {/* Loading */}
        {qr.state === 'loading' && (
          <div className="w-[172px] h-[172px] rounded-md flex items-center justify-center">
            <LoadingStrata />
          </div>
        )}

        {/* QR code */}
        {qr.state === 'pending' && qr.qrUrl && (
          <div className="p-3 bg-paper-3 rounded-md shadow-md">
            <QRCodeSVG
              value={qr.qrUrl}
              size={172}
              level="M"
              bgColor="#F1EFE7"
              fgColor="#211E18"
            />
          </div>
        )}

        {/* Approved checkmark */}
        {qr.state === 'approved' && (
          <div className="w-[172px] h-[172px] rounded-md bg-verdigris/15 border border-verdigris/30 flex items-center justify-center">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-verdigris">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
        )}

        {/* Expired */}
        {qr.state === 'expired' && (
          <div className="w-[172px] h-[172px] rounded-md bg-paper-2 flex flex-col items-center justify-center gap-3">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-soft">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <p className="text-sm text-ink-soft">Code expired</p>
            <button
              onClick={qr.regenerate}
              className="text-sm font-medium text-ink hover:text-ink-2 transition-colors"
            >
              Generate new code
            </button>
          </div>
        )}

        {/* Error */}
        {qr.state === 'error' && (
          <div className="w-[172px] h-[172px] rounded-md bg-rust/15 border border-rust/30 flex flex-col items-center justify-center gap-3 p-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rust">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <p className="text-xs text-rust text-center">{qr.error}</p>
            <button
              onClick={qr.regenerate}
              className="text-sm font-medium text-ink hover:text-ink-2 transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {/* Status text */}
        {qr.state === 'pending' && (
          <div className="mt-4 text-center">
            <p className="text-sm text-ink-soft">Scan with the Patina iOS app</p>
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.06em] text-ink-soft mt-1">
              Expires in {formatTime(qr.secondsRemaining)}
            </p>
          </div>
        )}

        {qr.state === 'approved' && (
          <p className="mt-4 text-sm font-medium text-verdigris">Signed in!</p>
        )}

        {/* Email/password fallback */}
        {(qr.state === 'pending' || qr.state === 'expired' || qr.state === 'error') && (
          <button
            onClick={() => setShowEmailForm(true)}
            className="mt-4 w-full py-2 px-4 text-sm font-medium text-ink border border-line rounded-[3px]
                     hover:bg-[var(--bg-hover)] transition-all"
          >
            Sign in with email
          </button>
        )}
      </div>
    </div>
  );
}
