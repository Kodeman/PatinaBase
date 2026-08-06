import type { Meta, StoryObj } from '@storybook/react'
import { PortalAuthShell, PortalLogin } from './PortalAuth'

const meta: Meta<typeof PortalLogin> = {
  title: 'Authentication/Portal login',
  component: PortalLogin,
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<typeof PortalLogin>

/** The three portal identities. Only the accent, eyebrow, and copy change — the room is one room. */
const BRANDS = {
  designer: {
    eyebrow: 'The studio',
    title: 'Welcome back to the studio.',
    description: 'Your projects, proposals, and workshop records are waiting.',
    accent: '#c4a57b',
    supportEmail: 'support@patina.com',
  },
  client: {
    eyebrow: 'Your home',
    title: 'Welcome home.',
    description: 'Your rooms, selections, and approvals are waiting.',
    accent: '#8a9a7b',
    supportEmail: 'support@patina.com',
  },
  admin: {
    eyebrow: 'Patina operations',
    title: 'Operations sign in.',
    description: 'Studios, orders, and the makers behind them.',
    accent: '#7b8a9a',
    supportEmail: 'support@patina.com',
  },
} as const

const render = (state: Parameters<typeof PortalLogin>[0]['state'], brand: keyof typeof BRANDS = 'designer'): Story['render'] => () => (
  <PortalAuthShell {...BRANDS[brand]}>
    <PortalLogin state={state} destinationHref="/desk" email="me@example.com" code="123" onEmailChange={() => undefined} onSendCode={() => undefined} onCodeChange={() => undefined} onVerifyCode={() => undefined} onOpenQr={() => undefined} onCloseQr={() => undefined} onRefreshQr={() => undefined} onPasswordChange={() => undefined} onPasswordSignIn={() => undefined} onForgotPassword={() => undefined} onPasswordExpandedChange={() => undefined} oauthActions={[{ id: 'apple', label: 'Continue with Apple', onSelect: () => undefined }]} qrCode={<div className="grid h-32 w-32 grid-cols-4 gap-1" aria-label="Example QR code">{Array.from({ length: 16 }, (_, index) => <span key={index} className={index % 3 ? 'bg-[#2C2926]' : 'bg-white'} />)}</div>} />
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
    <PortalAuthShell {...BRANDS.designer}>
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
    <PortalAuthShell {...BRANDS.designer}>
      <PortalLogin {...loginPropsForStory} state="email" oauthActions={[{ id: 'apple', label: 'Continue with Apple', onSelect: () => undefined }, { id: 'google', label: 'Continue with Google', available: true, onSelect: () => undefined }]} />
    </PortalAuthShell>
  ),
}

/** Client portal identity — sage seam, same room. */
export const ClientBrand: Story = { render: render('email', 'client') }

/** Admin portal identity — dusty-blue seam, same room. */
export const AdminBrand: Story = { render: render('email', 'admin') }
