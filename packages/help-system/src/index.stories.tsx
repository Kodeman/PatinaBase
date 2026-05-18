import type { Meta, StoryObj } from '@storybook/react'
import { HELP_SYSTEM_VERSION } from './index'

const meta = {
  title: 'help-system/Overview',
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The Patina Help & Guidance System ships in subsequent sprints. This package currently exposes only the version + surface-key registry; components arrive in Stream B (Ambient), C (Reactive), D (Proactive), E (Reference).',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const PackageVersion: Story = {
  render: () => (
    <div style={{ fontFamily: 'var(--font-inter, Inter, sans-serif)' }}>
      <p>@patina/help-system v{HELP_SYSTEM_VERSION}</p>
      <p style={{ fontSize: '0.75rem', opacity: 0.6 }}>
        Real component stories arrive in Sprint 1+ tasks B/C/D/E.
      </p>
    </div>
  ),
}
