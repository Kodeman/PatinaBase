import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { describe, expect, it, vi } from 'vitest'
import { PortalAuthShell, PortalLogin } from './PortalAuth'

const loginProps = {
  email: 'person@example.com',
  onEmailChange: vi.fn(),
  onSendCode: vi.fn(),
}

describe('Portal auth components', () => {
  it('keeps the approved sign-in methods in their required order', () => {
    render(<PortalLogin {...loginProps} state="email" oauthActions={[{ id: 'apple', label: 'Continue with Apple', onSelect: vi.fn() }, { id: 'google', label: 'Google', onSelect: vi.fn() }]} />)
    const content = document.body.textContent ?? ''
    expect(content.indexOf('Email me a one-time code')).toBeLessThan(content.indexOf('Use a QR code'))
    expect(content.indexOf('Use a QR code')).toBeLessThan(content.indexOf('Continue with Apple'))
    expect(content.indexOf('Continue with Apple')).toBeLessThan(content.indexOf('Use email and password instead'))
    expect(screen.queryByText('Google')).not.toBeInTheDocument()
  })

  it('accepts a pasted six-digit code through its single semantic input', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<PortalLogin {...loginProps} state="code" code="" onCodeChange={vi.fn()} onVerifyCode={onComplete} />)
    await user.click(screen.getByLabelText('Six-digit code'))
    await user.paste('123456')
    expect(onComplete).toHaveBeenCalledWith('123456')
  })

  it('renders the QR expiry recovery and success fallback', () => {
    const refresh = vi.fn()
    const { rerender } = render(<PortalLogin {...loginProps} state="qr-expired" onRefreshQr={refresh} />)
    expect(screen.getByText('That code has expired.')).toBeInTheDocument()
    rerender(<PortalLogin {...loginProps} state="success" onContinue={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Continue to your portal' })).toBeInTheDocument()
  })

  it('has no basic accessibility violations', async () => {
    const { container } = render(<PortalAuthShell eyebrow="The studio" title="Welcome back." description="Your work is waiting." accent="#c4a57b" supportEmail="support@patina.com"><PortalLogin {...loginProps} state="email" /></PortalAuthShell>)
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})
