import type { Meta, StoryObj } from '@storybook/react'
import { PinInput } from './PinInput'
import { useState } from 'react'

const meta = {
  title: 'Form/PinInput',
  component: PinInput,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['outline', 'filled'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    state: {
      control: 'select',
      options: ['default', 'error', 'success'],
    },
    type: {
      control: 'select',
      options: ['number', 'text'],
    },
  },
} satisfies Meta<typeof PinInput>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    length: 4,
  },
}

export const SixDigit: Story = {
  args: {
    length: 6,
    type: 'number',
  },
}

export const WithAutoFocus: Story = {
  args: {
    length: 4,
    autoFocus: true,
  },
}

export const Masked: Story = {
  args: {
    length: 4,
    mask: true,
    type: 'number',
  },
}

export const Variants: Story = {
  render: () => (
    <div className="space-y-8">
      <div>
        <p className="text-sm mb-2">Outline (default)</p>
        <PinInput length={4} variant="outline" />
      </div>
      <div>
        <p className="text-sm mb-2">Filled</p>
        <PinInput length={4} variant="filled" />
      </div>
    </div>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div className="space-y-8">
      <div>
        <p className="text-sm mb-2">Small</p>
        <PinInput length={4} size="sm" />
      </div>
      <div>
        <p className="text-sm mb-2">Medium (default)</p>
        <PinInput length={4} size="md" />
      </div>
      <div>
        <p className="text-sm mb-2">Large</p>
        <PinInput length={4} size="lg" />
      </div>
    </div>
  ),
}

export const States: Story = {
  render: () => (
    <div className="space-y-8">
      <div>
        <p className="text-sm mb-2">Default</p>
        <PinInput length={4} state="default" />
      </div>
      <div>
        <p className="text-sm mb-2">Error</p>
        <PinInput length={4} state="error" />
      </div>
      <div>
        <p className="text-sm mb-2">Success</p>
        <PinInput length={4} state="success" />
      </div>
    </div>
  ),
}

export const TextType: Story = {
  args: {
    length: 4,
    type: 'text',
  },
}

export const Disabled: Story = {
  args: {
    length: 4,
    disabled: true,
  },
}

export const WithPlaceholder: Story = {
  args: {
    length: 4,
    placeholder: '0',
  },
}

export const Controlled: Story = {
  render: () => {
    const [value, setValue] = useState('')
    return (
      <div className="space-y-4">
        <PinInput
          length={4}
          type="number"
          value={value}
          onChange={setValue}
          onComplete={(pin) => alert(`PIN entered: ${pin}`)}
        />
        <div className="text-sm text-muted-foreground">
          Current value: {value || 'None'}
        </div>
        <button
          onClick={() => setValue('')}
          className="px-4 py-2 text-sm rounded bg-secondary"
        >
          Clear
        </button>
      </div>
    )
  },
}

export const OTPExample: Story = {
  render: () => {
    const [otp, setOtp] = useState('')
    const [verified, setVerified] = useState(false)

    const handleComplete = (value: string) => {
      // Simulate verification
      setTimeout(() => {
        if (value === '123456') {
          setVerified(true)
        } else {
          alert('Invalid OTP')
          setOtp('')
        }
      }, 500)
    }

    return (
      <div className="max-w-md p-6 border rounded-lg space-y-4">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Verify your email</h3>
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code sent to your email
          </p>
        </div>

        {!verified ? (
          <>
            <PinInput
              length={6}
              type="number"
              value={otp}
              onChange={setOtp}
              onComplete={handleComplete}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Hint: Try 123456
            </p>
          </>
        ) : (
          <div className="p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-green-800 font-medium">
              ✓ Email verified successfully!
            </p>
          </div>
        )}
      </div>
    )
  },
}

export const WithPaste: Story = {
  render: () => (
    <div className="max-w-md p-6 border rounded-lg space-y-4">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">PIN Input with Paste</h3>
        <p className="text-sm text-muted-foreground">
          Try pasting: 1234
        </p>
      </div>
      <PinInput
        length={4}
        type="number"
        allowPaste
        onComplete={(pin) => alert(`PIN: ${pin}`)}
      />
    </div>
  ),
}
