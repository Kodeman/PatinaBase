import type { Meta, StoryObj } from '@storybook/react'
import { PortalAuthShell, PortalLogin } from './PortalAuth'

const meta: Meta<typeof PortalLogin> = {
  title: 'Authentication/Portal login',
  component: PortalLogin,
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<typeof PortalLogin>

const render = (state: Parameters<typeof PortalLogin>[0]['state']): Story['render'] => () => (
  <PortalAuthShell eyebrow="The studio" title="Welcome back to the studio." description="Your projects, proposals, and workshop records are waiting." accent="#c4a57b" supportEmail="support@patina.com">
    <PortalLogin state={state} destinationHref="/desk" email="me@example.com" code="123" onEmailChange={() => undefined} onSendCode={() => undefined} onCodeChange={() => undefined} onVerifyCode={() => undefined} onOpenQr={() => undefined} onCloseQr={() => undefined} onRefreshQr={() => undefined} onPasswordChange={() => undefined} onPasswordSignIn={() => undefined} onForgotPassword={() => undefined} onPasswordExpandedChange={() => undefined} oauthActions={[{ id: 'apple', label: 'Continue with Apple', onSelect: () => undefined }]} qrCode={<div className="grid h-32 w-32 grid-cols-4 gap-1" aria-label="Example QR code">{Array.from({ length: 16 }, (_, index) => <span key={index} className={index % 3 ? 'bg-[#252a25]' : 'bg-white'} />)}</div>} />
  </PortalAuthShell>
)

export const Email: Story = { render: render('email') }
export const Code: Story = { render: render('code') }
export const QrActive: Story = { render: render('qr') }
export const QrExpired: Story = { render: render('qr-expired') }
export const ApplePending: Story = { render: render('apple-pending') }
export const Password: Story = { render: render('password') }
export const Success: Story = { render: render('success') }

export const FriendlyError: Story = {
  render: () => (
    <PortalAuthShell eyebrow="The studio" title="Welcome back to the studio." description="Your projects, proposals, and workshop records are waiting." accent="#c4a57b" supportEmail="support@patina.com">
      <PortalLogin {...loginPropsForStory} state="email" error="We couldn’t find an account for that email. Check the address or ask Patina for help." />
    </PortalAuthShell>
  ),
}

const loginPropsForStory = {
  destinationHref: '/desk',
  email: 'me@example.com',
  onEmailChange: () => undefined,
  onSendCode: () => undefined,
}

export const FutureProviderEnabled: Story = {
  render: () => (
    <PortalAuthShell eyebrow="The studio" title="Welcome back to the studio." description="Your projects, proposals, and workshop records are waiting." accent="#c4a57b" supportEmail="support@patina.com">
      <PortalLogin {...loginPropsForStory} state="email" oauthActions={[{ id: 'apple', label: 'Continue with Apple', onSelect: () => undefined }, { id: 'google', label: 'Continue with Google', available: true, onSelect: () => undefined }]} />
    </PortalAuthShell>
  ),
}
