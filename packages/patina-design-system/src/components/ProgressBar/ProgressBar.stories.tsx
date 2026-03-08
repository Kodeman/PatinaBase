import type { Meta, StoryObj } from '@storybook/react'
import { useState, useEffect } from 'react'
import { ProgressBar } from './ProgressBar'

const meta = {
  title: 'Components/Feedback/ProgressBar',
  component: ProgressBar,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    value: {
      control: { type: 'range', min: 0, max: 100, step: 1 },
    },
    max: {
      control: { type: 'number' },
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg', 'xl'],
    },
    variant: {
      control: { type: 'select' },
      options: ['default', 'success', 'warning', 'error', 'info'],
    },
  },
} satisfies Meta<typeof ProgressBar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    value: 60,
  },
  render: (args) => (
    <div className="w-[400px]">
      <ProgressBar {...args} />
    </div>
  ),
}

export const WithLabel: Story = {
  args: {
    value: 75,
    showLabel: true,
  },
  render: (args) => (
    <div className="w-[400px]">
      <ProgressBar {...args} />
    </div>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div className="w-[400px] space-y-6">
      <div>
        <p className="text-sm mb-2">Small</p>
        <ProgressBar value={60} size="sm" />
      </div>
      <div>
        <p className="text-sm mb-2">Medium (Default)</p>
        <ProgressBar value={60} size="md" />
      </div>
      <div>
        <p className="text-sm mb-2">Large</p>
        <ProgressBar value={60} size="lg" />
      </div>
      <div>
        <p className="text-sm mb-2">Extra Large</p>
        <ProgressBar value={60} size="xl" />
      </div>
    </div>
  ),
}

export const Variants: Story = {
  render: () => (
    <div className="w-[400px] space-y-6">
      <div>
        <p className="text-sm mb-2">Default</p>
        <ProgressBar value={60} variant="default" showLabel />
      </div>
      <div>
        <p className="text-sm mb-2">Success</p>
        <ProgressBar value={100} variant="success" showLabel />
      </div>
      <div>
        <p className="text-sm mb-2">Warning</p>
        <ProgressBar value={65} variant="warning" showLabel />
      </div>
      <div>
        <p className="text-sm mb-2">Error</p>
        <ProgressBar value={30} variant="error" showLabel />
      </div>
      <div>
        <p className="text-sm mb-2">Info</p>
        <ProgressBar value={45} variant="info" showLabel />
      </div>
    </div>
  ),
}

export const Indeterminate: Story = {
  render: () => (
    <div className="w-[400px] space-y-4">
      <div>
        <p className="text-sm mb-2">Loading...</p>
        <ProgressBar indeterminate />
      </div>
      <div>
        <p className="text-sm mb-2">Processing...</p>
        <ProgressBar indeterminate variant="info" />
      </div>
    </div>
  ),
}

export const Animated: Story = {
  render: () => {
    const [progress, setProgress] = useState(0)

    useEffect(() => {
      const timer = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) return 0
          return prev + 1
        })
      }, 100)

      return () => clearInterval(timer)
    }, [])

    return (
      <div className="w-[400px] space-y-4">
        <div>
          <p className="text-sm mb-2">Uploading file...</p>
          <ProgressBar value={progress} showLabel />
        </div>
      </div>
    )
  },
}

export const FileUpload: Story = {
  render: () => {
    const [progress, setProgress] = useState(0)

    useEffect(() => {
      const timer = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) return 100
          return prev + 2
        })
      }, 100)

      return () => clearInterval(timer)
    }, [])

    const getVariant = () => {
      if (progress === 100) return 'success'
      if (progress > 75) return 'warning'
      return 'default'
    }

    return (
      <div className="w-[400px] space-y-2">
        <div className="flex justify-between text-sm">
          <span>document.pdf</span>
          <span className="text-muted-foreground">2.4 MB</span>
        </div>
        <ProgressBar value={progress} variant={getVariant()} showLabel />
        {progress === 100 && (
          <p className="text-sm text-green-600">Upload complete!</p>
        )}
      </div>
    )
  },
}

export const CustomMax: Story = {
  render: () => (
    <div className="w-[400px] space-y-4">
      <div>
        <p className="text-sm mb-2">Tasks completed: 7 out of 20</p>
        <ProgressBar value={7} max={20} showLabel />
      </div>
      <div>
        <p className="text-sm mb-2">Downloads: 150 out of 500</p>
        <ProgressBar value={150} max={500} showLabel variant="info" />
      </div>
    </div>
  ),
}
