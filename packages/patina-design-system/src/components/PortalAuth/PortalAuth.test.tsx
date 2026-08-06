import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { describe, expect, it, vi } from 'vitest'
import { PORTAL_AUTH_A11Y_COLORS, PORTAL_AUTH_A11Y_COLORS_BRAND, PortalAuthShell, PortalLogin } from './PortalAuth'

const loginProps = {
  email: 'person@example.com',
  onEmailChange: vi.fn(),
  onSendCode: vi.fn(),
  destinationHref: '/desk',
}

/** A live badge, so the shell's a11y is asserted with the QR actually mounted. */
const liveQr = {
  url: 'patina://auth?session=0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0',
  secondsRemaining: 272,
  totalSeconds: 300,
  phase: 'live' as const,
}

function contrastRatio(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const channels = hex.slice(1).match(/.{2}/g)!.map((channel) => parseInt(channel, 16) / 255)
    const [red, green, blue] = channels.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    return red * 0.2126 + green * 0.7152 + blue * 0.0722
  }
  const first = luminance(foreground)
  const second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

describe('Portal auth components', () => {
  it('keeps the approved sign-in methods in their required order', () => {
    const { rerender } = render(<PortalLogin {...loginProps} state="email" oauthActions={[{ id: 'apple', label: 'Continue with Apple', onSelect: vi.fn() }, { id: 'google', label: 'Continue with Google', onSelect: vi.fn() }]} />)
    const content = document.body.textContent ?? ''
    // The QR left this pane for the brand-side badge: email → Apple → password.
    expect(content).not.toContain('Use a QR code')
    expect(content.indexOf('Email me a one-time code')).toBeLessThan(content.indexOf('Continue with Apple'))
    expect(content.indexOf('Continue with Apple')).toBeLessThan(content.indexOf('Use email and password instead'))
    expect(screen.queryByText('Continue with Google')).not.toBeInTheDocument()

    rerender(<PortalLogin {...loginProps} state="email" oauthActions={[{ id: 'apple', label: 'Continue with Apple', onSelect: vi.fn() }, { id: 'google', label: 'Continue with Google', available: true, onSelect: vi.fn() }]} />)
    const extendedContent = document.body.textContent ?? ''
    expect(extendedContent.indexOf('Continue with Apple')).toBeLessThan(extendedContent.indexOf('Continue with Google'))
    expect(extendedContent.indexOf('Continue with Google')).toBeLessThan(extendedContent.indexOf('Use email and password instead'))
  })

  it('accepts a pasted six-digit code through its single semantic input', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    const onCodeChange = vi.fn()
    const { rerender } = render(<PortalLogin {...loginProps} state="code" code="" onCodeChange={onCodeChange} onVerifyCode={onComplete} />)
    expect(screen.getByLabelText('Six-digit code')).toHaveFocus()
    await user.click(screen.getByLabelText('Six-digit code'))
    await user.paste('123456')
    expect(onCodeChange).toHaveBeenCalledTimes(1)
    expect(onCodeChange).toHaveBeenCalledWith('123456')
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith('123456')
    rerender(<PortalLogin {...loginProps} state="code" code="123456" onCodeChange={onCodeChange} onVerifyCode={onComplete} />)
    await user.keyboard('{Enter}')
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('renders the success fallback as a real destination link', () => {
    render(<PortalLogin {...loginProps} state="success" destinationHref="/projects" onContinue={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Continue to your portal' })).toHaveAttribute('href', '/projects')
  })

  it('submits email and password entry with Enter', async () => {
    const user = userEvent.setup()
    const onSendCode = vi.fn()
    const onPasswordSignIn = vi.fn()
    const { rerender } = render(<PortalLogin {...loginProps} onSendCode={onSendCode} state="email" />)
    await user.click(screen.getByLabelText('Email address'))
    await user.keyboard('{Enter}')
    expect(onSendCode).toHaveBeenCalledTimes(1)

    rerender(<PortalLogin {...loginProps} state="password" password="secret" onPasswordSignIn={onPasswordSignIn} />)
    await user.click(screen.getByLabelText('Password'))
    await user.keyboard('{Enter}')
    expect(onPasswordSignIn).toHaveBeenCalledTimes(1)
  })

  it('treats password expansion as controlled state', async () => {
    const user = userEvent.setup()
    const onExpandedChange = vi.fn()
    const { rerender } = render(<PortalLogin {...loginProps} state="password" password="secret" onPasswordExpandedChange={onExpandedChange} />)
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    rerender(<PortalLogin {...loginProps} state="email" password="secret" onPasswordExpandedChange={onExpandedChange} />)
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Use email and password instead' }))
    expect(onExpandedChange).toHaveBeenCalledWith(true)
  })

  it('derives the Apple pending and disabled state from login state', () => {
    render(<PortalLogin {...loginProps} state="apple-pending" oauthActions={[{ id: 'apple', label: 'Continue with Apple', onSelect: vi.fn() }]} />)
    const appleAction = screen.getByRole('button', { name: 'Connecting to Apple…' })
    expect(appleAction).toBeDisabled()
    expect(appleAction).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByLabelText('Email address')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Use email and password instead' })).toBeDisabled()
  })

  it('locks competing disclosures while an authentication method is finishing', () => {
    const { rerender } = render(<PortalLogin {...loginProps} state="email" isSubmitting />)
    expect(screen.getByRole('button', { name: 'Use email and password instead' })).toBeDisabled()
    rerender(<PortalLogin {...loginProps} state="password" password="secret" isSubmitting />)
    expect(screen.getByLabelText('Password')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeDisabled()
  })

  it('associates friendly errors with the active credential input', () => {
    const { rerender } = render(<PortalLogin {...loginProps} state="email" error="Enter a valid email address." />)
    expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-describedby', 'portal-auth-email-error')
    rerender(<PortalLogin {...loginProps} state="code" code="" error="That code did not match." />)
    expect(screen.getByLabelText('Six-digit code')).toHaveAttribute('aria-describedby', 'portal-auth-code-error')
    rerender(<PortalLogin {...loginProps} state="password" password="wrong" error="That password did not match." />)
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-describedby', 'portal-auth-password-error')
  })

  it('preserves caller styles while keeping the configured accent authoritative', () => {
    render(<PortalAuthShell eyebrow="The studio" title="Welcome back." description="Your work is waiting." accent="#c4a57b" supportEmail="support@patina.cloud" style={{ backgroundColor: 'rgb(1, 2, 3)', '--portal-auth-accent': '#000000' } as React.CSSProperties}><div /></PortalAuthShell>)
    const shell = screen.getByRole('main')
    expect(shell).toHaveStyle({ backgroundColor: 'rgb(1, 2, 3)' })
    expect(shell.style.getPropertyValue('--portal-auth-accent')).toBe('#c4a57b')
  })

  it('keeps canonical text and focus tokens above WCAG contrast minimums', () => {
    expect(contrastRatio(PORTAL_AUTH_A11Y_COLORS.mutedInk, PORTAL_AUTH_A11Y_COLORS.surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(PORTAL_AUTH_A11Y_COLORS.placeholder, PORTAL_AUTH_A11Y_COLORS.surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(PORTAL_AUTH_A11Y_COLORS.border, PORTAL_AUTH_A11Y_COLORS.surface)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(PORTAL_AUTH_A11Y_COLORS.focus, PORTAL_AUTH_A11Y_COLORS.surface)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(PORTAL_AUTH_A11Y_COLORS_BRAND.text, PORTAL_AUTH_A11Y_COLORS_BRAND.surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(PORTAL_AUTH_A11Y_COLORS_BRAND.mutedText, PORTAL_AUTH_A11Y_COLORS_BRAND.surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(PORTAL_AUTH_A11Y_COLORS_BRAND.focus, PORTAL_AUTH_A11Y_COLORS_BRAND.surface)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(PORTAL_AUTH_A11Y_COLORS.surface, PORTAL_AUTH_A11Y_COLORS_BRAND.surface)).toBeGreaterThanOrEqual(4.5)
  })

  it('has no basic accessibility violations', async () => {
    const { container } = render(<PortalAuthShell eyebrow="The studio" title="Welcome back." description="Your work is waiting." accent="#c4a57b" supportEmail="support@patina.cloud" qr={liveQr}><PortalLogin {...loginProps} state="email" /></PortalAuthShell>)
    expect(screen.getByTestId('portal-auth-qr')).toBeInTheDocument()
    // Tailwind utilities are not loaded in Vitest/JSDOM, so contrast is asserted deterministically above.
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})
