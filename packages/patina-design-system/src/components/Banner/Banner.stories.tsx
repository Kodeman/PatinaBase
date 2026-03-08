import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '../Button'
import { Banner, BannerDescription, BannerTitle } from './Banner'

const meta = {
  title: 'Components/Feedback/Banner',
  component: Banner,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Banner>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    title: 'Information',
    description: 'This is an informational banner message.',
  },
}

export const Variants: Story = {
  render: () => (
    <div className="space-y-4">
      <Banner
        variant="info"
        title="Information"
        description="This is an informational message for the user."
      />
      <Banner
        variant="success"
        title="Success"
        description="Your changes have been successfully saved."
      />
      <Banner
        variant="warning"
        title="Warning"
        description="Your session will expire in 5 minutes. Please save your work."
      />
      <Banner
        variant="error"
        title="Error"
        description="An error occurred while processing your request. Please try again."
      />
    </div>
  ),
}

export const Closable: Story = {
  render: () => (
    <div className="space-y-4">
      <Banner
        variant="info"
        title="Closable Banner"
        description="Click the X button to dismiss this banner."
        closable
      />
      <Banner
        variant="success"
        title="Operation Complete"
        description="The task completed successfully."
        closable
      />
    </div>
  ),
}

export const WithAction: Story = {
  render: () => (
    <div className="space-y-4">
      <Banner
        variant="info"
        title="New features available"
        description="Check out the latest updates to our platform."
        action={
          <Button variant="outline" size="sm">
            Learn More
          </Button>
        }
      />
      <Banner
        variant="warning"
        title="Update Required"
        description="A new version is available."
        closable
        action={
          <Button size="sm">
            Update Now
          </Button>
        }
      />
    </div>
  ),
}

export const Positions: Story = {
  render: () => (
    <div className="space-y-4 p-4">
      <div>
        <p className="text-sm mb-2">Top Fixed Position:</p>
        <Banner
          variant="info"
          position="top"
          title="Top Banner"
          description="This banner is fixed at the top of the viewport."
          closable
        />
      </div>
      <div className="mt-20">
        <p className="text-sm mb-2">Static Position (Default):</p>
        <Banner
          variant="success"
          position="static"
          title="Static Banner"
          description="This banner flows with the content."
        />
      </div>
      <div className="mt-4">
        <p className="text-sm mb-2">Bottom Fixed Position:</p>
        <Banner
          variant="warning"
          position="bottom"
          title="Bottom Banner"
          description="This banner is fixed at the bottom of the viewport."
          closable
        />
      </div>
    </div>
  ),
}

export const CustomContent: Story = {
  render: () => (
    <Banner variant="info" closable>
      <BannerTitle>Custom Content Banner</BannerTitle>
      <BannerDescription>
        <p className="mb-2">
          You can use custom components to build more complex banner layouts.
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>Feature one is now available</li>
          <li>Improved performance by 50%</li>
          <li>Bug fixes and stability improvements</li>
        </ul>
      </BannerDescription>
    </Banner>
  ),
}

export const CookieConsent: Story = {
  render: () => (
    <Banner
      variant="info"
      position="bottom"
      action={
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            Decline
          </Button>
          <Button size="sm">
            Accept All
          </Button>
        </div>
      }
    >
      <BannerTitle>Cookie Consent</BannerTitle>
      <BannerDescription>
        We use cookies to improve your experience. By continuing to use this site, you agree to
        our use of cookies.
      </BannerDescription>
    </Banner>
  ),
}

export const MaintenanceNotice: Story = {
  render: () => (
    <Banner
      variant="warning"
      position="top"
      closable
      action={
        <Button variant="outline" size="sm">
          View Schedule
        </Button>
      }
    >
      <BannerTitle>Scheduled Maintenance</BannerTitle>
      <BannerDescription>
        Our services will be undergoing maintenance on Sunday, December 10th from 2:00 AM to 6:00
        AM EST. Some features may be temporarily unavailable.
      </BannerDescription>
    </Banner>
  ),
}

export const PromotionalBanner: Story = {
  render: () => (
    <Banner
      variant="success"
      position="top"
      closable
      action={
        <Button size="sm">
          Shop Now
        </Button>
      }
    >
      <BannerTitle>Special Offer - 30% Off!</BannerTitle>
      <BannerDescription>
        Limited time offer on all premium plans. Use code SAVE30 at checkout.
      </BannerDescription>
    </Banner>
  ),
}

export const ErrorNotification: Story = {
  render: () => (
    <Banner
      variant="error"
      closable
      action={
        <Button variant="outline" size="sm">
          Retry
        </Button>
      }
    >
      <BannerTitle>Connection Error</BannerTitle>
      <BannerDescription>
        Unable to connect to the server. Please check your internet connection and try again.
      </BannerDescription>
    </Banner>
  ),
}
