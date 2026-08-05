'use client'

import * as React from 'react'
import { Apple } from 'lucide-react'
import { cn } from '../../utils/cn'

export const PORTAL_AUTH_TAGLINE = 'A workshop for interior designers, their clients, and the makers they trust.'

export type PortalLoginState =
  | 'email'
  | 'code'
  | 'qr'
  | 'qr-expired'
  | 'apple-pending'
  | 'password'
  | 'success'

export interface PortalOAuthAction {
  id: 'apple' | 'google' | 'microsoft' | (string & {})
  label: string
  onSelect: () => void
  pending?: boolean
  available?: boolean
}

export interface PortalAuthShellProps extends React.HTMLAttributes<HTMLDivElement> {
  eyebrow: string
  title: string
  description: string
  accent: string
  supportEmail: string
  children: React.ReactNode
  tagline?: string
}

/** A flat, material-led frame shared by Patina portal sign-in experiences. */
export function PortalAuthShell({
  eyebrow,
  title,
  description,
  accent,
  supportEmail,
  tagline = PORTAL_AUTH_TAGLINE,
  children,
  className,
  ...props
}: PortalAuthShellProps) {
  return (
    <main
      className={cn('min-h-screen bg-[#f5f2eb] px-4 py-5 text-[#252a25] sm:px-8 sm:py-8', className)}
      style={{ '--portal-auth-accent': accent } as React.CSSProperties}
      {...props}
    >
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-6xl border border-[#252a25]/15 bg-[#fbfaf6] lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,0.78fr)]">
        <section className="relative flex min-h-64 flex-col justify-between overflow-hidden border-b border-[#252a25]/15 p-7 sm:p-10 lg:min-h-full lg:border-b-0 lg:border-r lg:p-14">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[var(--portal-auth-accent)]" />
          <div>
            <div className="mb-16 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#252a25]/65">
              <span className="h-2 w-2 bg-[var(--portal-auth-accent)]" />
              Patina
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#252a25]/55">{eyebrow}</p>
            <h1 className="mt-4 max-w-md font-serif text-4xl leading-[1.03] tracking-[-0.04em] sm:text-5xl">{title}</h1>
            <p className="mt-5 max-w-sm text-sm leading-6 text-[#252a25]/70">{description}</p>
          </div>
          <div className="mt-10 border-t border-[#252a25]/15 pt-5">
            <p className="max-w-sm text-sm leading-6 text-[#252a25]/65">{tagline}</p>
            <a className="mt-4 inline-block text-sm underline decoration-[#252a25]/30 underline-offset-4 transition-colors hover:decoration-[#252a25] focus:outline-none focus:ring-2 focus:ring-[var(--portal-auth-accent)] focus:ring-offset-2" href={`mailto:${supportEmail}`}>
              Need a hand? {supportEmail}
            </a>
          </div>
        </section>
        <section className="flex items-center justify-center p-5 sm:p-10 lg:p-14">
          <div className="w-full max-w-sm">{children}</div>
        </section>
      </div>
    </main>
  )
}

export interface PortalAuthNoticeProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'error' | 'info' | 'success'
  title?: string
  children: React.ReactNode
}

export function PortalAuthNotice({ tone = 'info', title, children, className, ...props }: PortalAuthNoticeProps) {
  const toneClasses = {
    error: 'border-[#9c3d31]/35 bg-[#f8ece8] text-[#6d2921]',
    info: 'border-[#252a25]/20 bg-[#f3f0e8] text-[#252a25]',
    success: 'border-[#59715a]/35 bg-[#edf3eb] text-[#2e4a30]',
  }
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} aria-live="polite" className={cn('border px-4 py-3 text-sm leading-5', toneClasses[tone], className)} {...props}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? 'mt-1' : undefined}>{children}</div>
    </div>
  )
}

export interface PortalAuthSuccessProps {
  title?: string
  description?: string
  destinationLabel?: string
  /** A real destination for the no-script / redirect-delay fallback. */
  destinationHref?: string
  onContinue?: () => void
}

export function PortalAuthSuccess({
  title = 'You’re signed in.',
  description = 'We’re taking you to your portal now.',
  destinationLabel = 'Continue to your portal',
  destinationHref,
  onContinue,
}: PortalAuthSuccessProps) {
  return (
    <div className="border border-[#59715a]/35 bg-[#edf3eb] p-6" role="status" aria-live="polite">
      <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#59715a] text-white">✓</span>
      <h2 className="mt-4 font-serif text-3xl tracking-[-0.03em]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#2e4a30]">{description}</p>
      {destinationHref ? (
        <a href={destinationHref} onClick={onContinue} className="mt-5 inline-block text-sm font-semibold underline decoration-[#59715a]/45 underline-offset-4 focus:outline-none focus:ring-2 focus:ring-[#59715a] focus:ring-offset-2">{destinationLabel}</a>
      ) : onContinue ? <button type="button" onClick={onContinue} className="mt-5 text-sm font-semibold underline decoration-[#59715a]/45 underline-offset-4 focus:outline-none focus:ring-2 focus:ring-[#59715a] focus:ring-offset-2">{destinationLabel}</button> : null}
    </div>
  )
}

interface OtpInputProps {
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  disabled?: boolean
  error?: boolean
}

function OtpInput({ value, onChange, onComplete, disabled, error }: OtpInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const digits = value.padEnd(6, ' ').slice(0, 6).split('')
  const update = (nextValue: string) => {
    const normalized = nextValue.replace(/\D/g, '').slice(0, 6)
    onChange(normalized)
    if (normalized.length === 6) onComplete?.(normalized)
  }
  return (
    <div>
      <label className="text-sm font-medium" htmlFor="portal-auth-code">Six-digit code</label>
      <div className="relative mt-2 grid grid-cols-6 gap-2" onClick={() => inputRef.current?.focus()}>
        {digits.map((digit, index) => <span key={index} aria-hidden="true" className={cn('flex h-12 items-center justify-center border bg-white font-mono text-lg tabular-nums', error ? 'border-[#9c3d31]' : 'border-[#252a25]/25', index === value.length && 'border-[var(--portal-auth-accent)] ring-1 ring-[var(--portal-auth-accent)]')}>{digit.trim()}</span>)}
        <input
          ref={inputRef}
          id="portal-auth-code"
          aria-label="Six-digit code"
          aria-invalid={error || undefined}
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={(event) => update(event.target.value)}
          onPaste={(event) => update(event.clipboardData.getData('text'))}
          disabled={disabled}
          className="absolute inset-0 h-full w-full cursor-text opacity-0 focus:outline-none"
        />
      </div>
    </div>
  )
}

export interface PortalLoginProps {
  state: PortalLoginState
  email: string
  onEmailChange: (email: string) => void
  onSendCode: () => void
  onVerifyCode?: (code: string) => void
  code?: string
  onCodeChange?: (code: string) => void
  resendInSeconds?: number
  onResendCode?: () => void
  error?: string | null
  qrCode?: React.ReactNode
  qrDescription?: string
  onOpenQr?: () => void
  onCloseQr?: () => void
  onRefreshQr?: () => void
  oauthActions?: PortalOAuthAction[]
  password?: string
  onPasswordChange?: (password: string) => void
  onPasswordSignIn?: () => void
  onForgotPassword?: () => void
  onChangeMethod?: () => void
  onContinue?: () => void
  destinationHref?: string
  isSubmitting?: boolean
}

/** Controlled portal login form. Authentication, timers, navigation, and QR transport stay in portal adapters. */
export function PortalLogin({
  state,
  email,
  onEmailChange,
  onSendCode,
  onVerifyCode,
  code = '',
  onCodeChange,
  resendInSeconds = 0,
  onResendCode,
  error,
  qrCode,
  qrDescription = 'Use your signed-in phone to scan this code.',
  onOpenQr,
  onCloseQr,
  onRefreshQr,
  oauthActions = [],
  password = '',
  onPasswordChange,
  onPasswordSignIn,
  onForgotPassword,
  onChangeMethod,
  onContinue,
  destinationHref,
  isSubmitting = false,
}: PortalLoginProps) {
  const [passwordOpen, setPasswordOpen] = React.useState(state === 'password')
  React.useEffect(() => {
    if (state === 'password') setPasswordOpen(true)
  }, [state])
  const showQr = state === 'qr' || state === 'qr-expired'
  const apple = oauthActions.find((action) => action.id === 'apple' && action.available !== false)
  const friendlyError = error && <PortalAuthNotice tone="error" title="Let’s try that again.">{error}</PortalAuthNotice>

  if (state === 'success') return <PortalAuthSuccess destinationHref={destinationHref} onContinue={onContinue} />

  return (
    <div className="space-y-5">
      {state === 'apple-pending' && <PortalAuthNotice tone="info" title="Opening Apple sign in">Finish securely in the Apple window, then return here.</PortalAuthNotice>}
      {friendlyError}
      {state === 'code' ? (
        <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); if (code.length === 6) onVerifyCode?.(code) }}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#252a25]/55">Email passcode</p>
            <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">Check your inbox.</h2>
            <p className="mt-2 text-sm leading-6 text-[#252a25]/65">We sent a six-digit code to <strong className="font-semibold text-[#252a25]">{email}</strong>.</p>
          </div>
          <OtpInput value={code} onChange={onCodeChange ?? (() => undefined)} onComplete={onVerifyCode} disabled={isSubmitting} error={Boolean(error)} />
          <div className="flex items-center justify-between gap-4 text-sm">
            <button type="button" onClick={onChangeMethod} className="underline decoration-[#252a25]/30 underline-offset-4 focus:outline-none focus:ring-2 focus:ring-[var(--portal-auth-accent)]">Use a different email</button>
            <button type="button" disabled={resendInSeconds > 0 || isSubmitting} onClick={onResendCode} className="font-semibold underline decoration-[#252a25]/30 underline-offset-4 disabled:cursor-not-allowed disabled:opacity-45 focus:outline-none focus:ring-2 focus:ring-[var(--portal-auth-accent)]">{resendInSeconds > 0 ? `Resend in ${resendInSeconds}s` : 'Resend code'}</button>
          </div>
        </form>
      ) : (
        <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); onSendCode() }}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#252a25]/55">Sign in</p>
            <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">Start with your email.</h2>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="portal-auth-email">Email address</label>
            <input id="portal-auth-email" type="email" autoComplete="email" value={email} onChange={(event) => onEmailChange(event.target.value)} className="h-12 w-full border border-[#252a25]/25 bg-white px-3 text-base outline-none transition-colors placeholder:text-[#252a25]/40 focus:border-[var(--portal-auth-accent)] focus:ring-1 focus:ring-[var(--portal-auth-accent)]" placeholder="you@studio.com" disabled={isSubmitting} />
          </div>
          <button type="submit" disabled={!email || isSubmitting} className="h-12 w-full bg-[#252a25] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#252a25]/85 disabled:cursor-not-allowed disabled:opacity-45 focus:outline-none focus:ring-2 focus:ring-[var(--portal-auth-accent)] focus:ring-offset-2">{isSubmitting ? 'Sending code…' : 'Email me a one-time code'}</button>
        </form>
      )}

      {state !== 'code' && <>
        <div className="border-t border-[#252a25]/15" />
        <div>
          <button type="button" aria-expanded={showQr} onClick={showQr ? onCloseQr : onOpenQr} className="flex w-full items-center justify-between py-1 text-left text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--portal-auth-accent)] focus:ring-offset-2"><span>Use a QR code</span><span aria-hidden="true">{showQr ? '−' : '+'}</span></button>
          {showQr && <div className="mt-4 border border-[#252a25]/15 bg-[#f3f0e8] p-5 text-center">
            {state === 'qr-expired' ? <><p className="font-serif text-2xl">That code has expired.</p><p className="mt-2 text-sm text-[#252a25]/65">Refresh for a new one, then scan with your phone.</p><button type="button" onClick={onRefreshQr} className="mt-4 text-sm font-semibold underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-[var(--portal-auth-accent)]">Refresh QR code</button></> : <><div className="mx-auto flex min-h-40 max-w-40 items-center justify-center bg-white p-3">{qrCode ?? <span className="text-sm text-[#252a25]/55">Preparing QR code…</span>}</div><p className="mt-4 text-sm leading-6 text-[#252a25]/65">{qrDescription}</p></>}
          </div>}
        </div>
        {apple && <button type="button" onClick={apple.onSelect} disabled={apple.pending || isSubmitting} className="flex h-12 w-full items-center justify-center gap-2 border border-[#252a25]/25 bg-white px-4 text-sm font-semibold transition-colors hover:border-[#252a25]/70 disabled:cursor-not-allowed disabled:opacity-45 focus:outline-none focus:ring-2 focus:ring-[var(--portal-auth-accent)]"><Apple aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />{apple.pending ? 'Connecting to Apple…' : apple.label}</button>}
        <div>
          <button type="button" aria-expanded={passwordOpen} onClick={() => setPasswordOpen((open) => !open)} className="flex w-full items-center justify-between border-t border-[#252a25]/15 py-4 text-left text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--portal-auth-accent)] focus:ring-offset-2"><span>Use email and password instead</span><span aria-hidden="true">{passwordOpen ? '−' : '+'}</span></button>
          {passwordOpen && <form className="space-y-3 pb-1" onSubmit={(event) => { event.preventDefault(); onPasswordSignIn?.() }}><div className="space-y-2"><label className="text-sm font-medium" htmlFor="portal-auth-password">Password</label><input id="portal-auth-password" type="password" autoComplete="current-password" value={password} onChange={(event) => onPasswordChange?.(event.target.value)} className="h-12 w-full border border-[#252a25]/25 bg-white px-3 outline-none focus:border-[var(--portal-auth-accent)] focus:ring-1 focus:ring-[var(--portal-auth-accent)]" /></div><div className="flex items-center justify-between gap-3"><button type="button" onClick={onForgotPassword} className="text-sm underline decoration-[#252a25]/30 underline-offset-4 focus:outline-none focus:ring-2 focus:ring-[var(--portal-auth-accent)]">Forgot password?</button><button type="submit" disabled={!email || !password || isSubmitting} className="bg-[#252a25] px-4 py-2 text-sm font-semibold text-white disabled:opacity-45 focus:outline-none focus:ring-2 focus:ring-[var(--portal-auth-accent)] focus:ring-offset-2">Sign in</button></div></form>}
        </div>
      </>}
    </div>
  )
}
