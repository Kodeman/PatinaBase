import type { Meta, StoryObj } from '@storybook/react'
import { Textarea } from './Textarea'

const meta = {
  title: 'Forms/Textarea',
  component: Textarea,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['outline', 'filled', 'flushed'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    resize: {
      control: 'select',
      options: ['none', 'vertical', 'horizontal', 'both'],
    },
    state: {
      control: 'select',
      options: ['default', 'error', 'success'],
    },
  },
} satisfies Meta<typeof Textarea>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    placeholder: 'Enter your message...',
  },
}

export const Variants: Story = {
  render: () => (
    <div className="space-y-4 w-96">
      <Textarea variant="outline" placeholder="Outline variant" />
      <Textarea variant="filled" placeholder="Filled variant" />
      <Textarea variant="flushed" placeholder="Flushed variant" />
    </div>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div className="space-y-4 w-96">
      <Textarea size="sm" placeholder="Small textarea" />
      <Textarea size="md" placeholder="Medium textarea" />
      <Textarea size="lg" placeholder="Large textarea" />
    </div>
  ),
}

export const ResizeModes: Story = {
  render: () => (
    <div className="space-y-4 w-96">
      <div>
        <label className="block text-sm font-medium mb-2">None (resize disabled)</label>
        <Textarea resize="none" placeholder="Cannot be resized" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Vertical (default)</label>
        <Textarea resize="vertical" placeholder="Resize vertically" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Horizontal</label>
        <Textarea resize="horizontal" placeholder="Resize horizontally" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Both</label>
        <Textarea resize="both" placeholder="Resize both directions" />
      </div>
    </div>
  ),
}

export const States: Story = {
  render: () => (
    <div className="space-y-4 w-96">
      <Textarea state="default" placeholder="Default state" />
      <Textarea
        state="error"
        placeholder="Error state"
        defaultValue="This message contains errors"
      />
      <Textarea
        state="success"
        placeholder="Success state"
        defaultValue="This message looks good!"
      />
    </div>
  ),
}

export const AutoResize: Story = {
  render: () => (
    <div className="space-y-4 w-96">
      <div>
        <label className="block text-sm font-medium mb-2">Auto-resize (type to expand)</label>
        <Textarea
          autoResize
          placeholder="Type multiple lines to see auto-resize in action..."
          defaultValue="Line 1"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Fixed height</label>
        <Textarea placeholder="This textarea has fixed height" />
      </div>
    </div>
  ),
}

export const WithCharacterCounter: Story = {
  render: () => (
    <div className="space-y-4 w-96">
      <Textarea showCount maxLength={200} placeholder="Enter your message (max 200 chars)" />
      <Textarea
        showCount
        maxLength={500}
        placeholder="Bio"
        defaultValue="Tell us about yourself..."
      />
    </div>
  ),
}

export const DisabledAndReadOnly: Story = {
  render: () => (
    <div className="space-y-4 w-96">
      <Textarea disabled placeholder="Disabled textarea" />
      <Textarea disabled defaultValue="Disabled with content" />
      <Textarea readOnly defaultValue="Read-only textarea with content" />
    </div>
  ),
}

export const ComplexExample: Story = {
  render: () => (
    <div className="space-y-6 w-[500px]">
      <div>
        <label className="block text-sm font-medium mb-2">
          Product Description <span className="text-destructive">*</span>
        </label>
        <Textarea
          placeholder="Describe your product in detail..."
          showCount
          maxLength={1000}
          variant="outline"
          rows={6}
        />
        <p className="mt-1 text-sm text-muted-foreground">
          Provide a detailed description of your product
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Feedback</label>
        <Textarea
          autoResize
          variant="filled"
          placeholder="Your feedback helps us improve..."
          defaultValue="I really like the new features, especially the dark mode!"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Quick Note</label>
        <Textarea
          variant="flushed"
          placeholder="Type your note here..."
          size="sm"
          resize="none"
          rows={3}
        />
      </div>
    </div>
  ),
}

export const AllFeaturesCombined: Story = {
  render: () => (
    <div className="w-96">
      <Textarea
        autoResize
        showCount
        maxLength={300}
        placeholder="Type your message here..."
        variant="filled"
        defaultValue="This textarea has auto-resize and character counter!"
      />
    </div>
  ),
}
