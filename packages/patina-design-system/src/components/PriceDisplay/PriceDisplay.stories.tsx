import type { Meta, StoryObj } from '@storybook/react'
import { PriceDisplay } from './PriceDisplay'

const meta: Meta<typeof PriceDisplay> = {
  title: 'Designer Portal/PriceDisplay',
  component: PriceDisplay,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    amount: {
      control: 'number',
      description: 'Price in cents',
    },
    currency: {
      control: 'text',
      description: 'Currency code (ISO 4217)',
    },
    locale: {
      control: 'text',
      description: 'Locale for formatting',
    },
  },
}

export default meta
type Story = StoryObj<typeof PriceDisplay>

export const Default: Story = {
  args: {
    amount: 9999,
  },
}

export const Large: Story = {
  args: {
    amount: 9999,
    size: '2xl',
  },
}

export const Small: Story = {
  args: {
    amount: 9999,
    size: 'sm',
  },
}

export const SalePrice: Story = {
  args: {
    amount: 5999,
    originalPrice: 9999,
    showSale: true,
  },
}

export const Euro: Story = {
  args: {
    amount: 9999,
    currency: 'EUR',
    locale: 'de-DE',
  },
}

export const GBP: Story = {
  args: {
    amount: 9999,
    currency: 'GBP',
    locale: 'en-GB',
  },
}

export const NoCurrency: Story = {
  args: {
    amount: 9999,
    showCurrency: false,
  },
}

export const NoDecimals: Story = {
  args: {
    amount: 9999,
    showDecimals: false,
  },
}

export const PrimaryVariant: Story = {
  args: {
    amount: 9999,
    variant: 'primary',
    size: 'lg',
  },
}

export const SuccessVariant: Story = {
  args: {
    amount: 9999,
    variant: 'success',
    size: 'lg',
  },
}

export const PriceExamples: Story = {
  render: () => (
    <div className="space-y-4">
      <div>
        <div className="text-sm text-muted-foreground mb-1">Standard Price</div>
        <PriceDisplay amount={29999} size="lg" />
      </div>

      <div>
        <div className="text-sm text-muted-foreground mb-1">Sale Price</div>
        <PriceDisplay amount={19999} originalPrice={29999} showSale size="lg" />
      </div>

      <div>
        <div className="text-sm text-muted-foreground mb-1">Free</div>
        <PriceDisplay amount={0} size="lg" variant="success" />
      </div>

      <div>
        <div className="text-sm text-muted-foreground mb-1">High-end Furniture</div>
        <PriceDisplay amount={549900} size="xl" />
      </div>

      <div>
        <div className="text-sm text-muted-foreground mb-1">Accessories</div>
        <PriceDisplay amount={2999} size="md" />
      </div>
    </div>
  ),
}

export const MultiCurrency: Story = {
  render: () => (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm">US Dollar:</span>
        <PriceDisplay amount={9999} currency="USD" locale="en-US" />
      </div>
      <div className="flex justify-between items-center">
        <span className="text-sm">Euro:</span>
        <PriceDisplay amount={9999} currency="EUR" locale="de-DE" />
      </div>
      <div className="flex justify-between items-center">
        <span className="text-sm">British Pound:</span>
        <PriceDisplay amount={9999} currency="GBP" locale="en-GB" />
      </div>
      <div className="flex justify-between items-center">
        <span className="text-sm">Japanese Yen:</span>
        <PriceDisplay amount={999900} currency="JPY" locale="ja-JP" />
      </div>
      <div className="flex justify-between items-center">
        <span className="text-sm">Canadian Dollar:</span>
        <PriceDisplay amount={9999} currency="CAD" locale="en-CA" />
      </div>
    </div>
  ),
}
