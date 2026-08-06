import type { Meta, StoryObj } from '@storybook/react'
import { PortalAuthShell, PortalLogin } from './PortalAuth'
import type { PortalAuthQrProps } from './PortalAuthAmbientQr'

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
    supportEmail: 'support@patina.cloud',
  },
  client: {
    eyebrow: 'Your home',
    title: 'Welcome home.',
    description: 'Your rooms, selections, and approvals are waiting.',
    accent: '#8a9a7b',
    supportEmail: 'support@patina.cloud',
  },
  admin: {
    eyebrow: 'Patina operations',
    title: 'Operations sign in.',
    description: 'Studios, orders, and the makers behind them.',
    accent: '#7b8a9a',
    supportEmail: 'support@patina.cloud',
  },
} as const

/** A fixed payload, so the dot field is identical in every snapshot of these stories. */
const FIXED_QR_URL = 'patina://auth?session=0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0'

const render = (state: Parameters<typeof PortalLogin>[0]['state'], brand: keyof typeof BRANDS = 'designer'): Story['render'] => () => (
  <PortalAuthShell {...BRANDS[brand]}>
    <PortalLogin state={state} destinationHref="/desk" email="me@example.com" code="123" onEmailChange={() => undefined} onSendCode={() => undefined} onCodeChange={() => undefined} onVerifyCode={() => undefined} onPasswordChange={() => undefined} onPasswordSignIn={() => undefined} onForgotPassword={() => undefined} onPasswordExpandedChange={() => undefined} oauthActions={[{ id: 'apple', label: 'Continue with Apple', onSelect: () => undefined }]} />
  </PortalAuthShell>
)

const renderWithQr = (qr: PortalAuthQrProps, brand: keyof typeof BRANDS = 'designer'): Story['render'] => () => (
  <PortalAuthShell {...BRANDS[brand]} qr={qr}>
    <PortalLogin state="email" destinationHref="/desk" email="me@example.com" onEmailChange={() => undefined} onSendCode={() => undefined} onPasswordExpandedChange={() => undefined} oauthActions={[{ id: 'apple', label: 'Continue with Apple', onSelect: () => undefined }]} />
  </PortalAuthShell>
)

export const Email: Story = { render: render('email') }
export const Code: Story = { render: render('code') }
export const ApplePending: Story = { render: render('apple-pending') }
export const Password: Story = { render: render('password') }
export const Success: Story = { render: render('success') }

/** The badge at rest in its normal life: full ring, pearl modules, ticking caption. */
export const AmbientQrLive: Story = {
  render: renderWithQr({ url: FIXED_QR_URL, secondsRemaining: 272, totalSeconds: 300, phase: 'live' }),
}

/** Mid-renewal — modules dim while the next code is minted. Sage accent, same room. */
export const AmbientQrRefreshing: Story = {
  render: renderWithQr({ url: FIXED_QR_URL, secondsRemaining: 0, totalSeconds: 300, phase: 'refreshing' }, 'client'),
}

/** Two renewals spent: the ring is empty and the whole badge is a button. */
export const AmbientQrResting: Story = {
  render: renderWithQr({ url: FIXED_QR_URL, secondsRemaining: 0, totalSeconds: 300, phase: 'resting', onWake: () => undefined }),
}

/** The quiet failure — rate limited or offline. Dusty-blue accent. */
export const AmbientQrError: Story = {
  render: renderWithQr({ url: FIXED_QR_URL, secondsRemaining: 0, totalSeconds: 300, phase: 'error', onWake: () => undefined }, 'admin'),
}

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
