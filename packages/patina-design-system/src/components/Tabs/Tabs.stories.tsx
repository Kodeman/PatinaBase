import type { Meta, StoryObj } from '@storybook/react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs'

const meta: Meta<typeof Tabs> = {
  title: 'Navigation/Tabs',
  component: Tabs,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof Tabs>

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Account Settings</h3>
          <p className="text-sm text-muted-foreground">
            Make changes to your account here. Click save when you're done.
          </p>
        </div>
      </TabsContent>
      <TabsContent value="password">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Password Settings</h3>
          <p className="text-sm text-muted-foreground">
            Change your password here. After saving, you'll be logged out.
          </p>
        </div>
      </TabsContent>
      <TabsContent value="settings">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">General Settings</h3>
          <p className="text-sm text-muted-foreground">
            Manage your general settings and preferences.
          </p>
        </div>
      </TabsContent>
    </Tabs>
  ),
}

export const LineVariant: Story = {
  render: () => (
    <Tabs defaultValue="overview" variant="line" className="w-[500px]">
      <TabsList variant="line">
        <TabsTrigger value="overview" variant="line">
          Overview
        </TabsTrigger>
        <TabsTrigger value="analytics" variant="line">
          Analytics
        </TabsTrigger>
        <TabsTrigger value="reports" variant="line">
          Reports
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview" variant="line">
        Overview content
      </TabsContent>
      <TabsContent value="analytics" variant="line">
        Analytics content
      </TabsContent>
      <TabsContent value="reports" variant="line">
        Reports content
      </TabsContent>
    </Tabs>
  ),
}

export const EnclosedVariant: Story = {
  render: () => (
    <Tabs defaultValue="overview" variant="enclosed" className="w-[500px]">
      <TabsList variant="enclosed">
        <TabsTrigger value="overview" variant="enclosed">
          Overview
        </TabsTrigger>
        <TabsTrigger value="analytics" variant="enclosed">
          Analytics
        </TabsTrigger>
        <TabsTrigger value="reports" variant="enclosed">
          Reports
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview" variant="enclosed">
        Overview content
      </TabsContent>
      <TabsContent value="analytics" variant="enclosed">
        Analytics content
      </TabsContent>
      <TabsContent value="reports" variant="enclosed">
        Reports content
      </TabsContent>
    </Tabs>
  ),
}

export const SoftVariant: Story = {
  render: () => (
    <Tabs defaultValue="overview" variant="soft" className="w-[500px]">
      <TabsList variant="soft">
        <TabsTrigger value="overview" variant="soft">
          Overview
        </TabsTrigger>
        <TabsTrigger value="analytics" variant="soft">
          Analytics
        </TabsTrigger>
        <TabsTrigger value="reports" variant="soft">
          Reports
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview" variant="soft">
        Overview content
      </TabsContent>
      <TabsContent value="analytics" variant="soft">
        Analytics content
      </TabsContent>
      <TabsContent value="reports" variant="soft">
        Reports content
      </TabsContent>
    </Tabs>
  ),
}

export const WithIcons: Story = {
  render: () => (
    <Tabs defaultValue="home" className="w-[500px]">
      <TabsList>
        <TabsTrigger value="home" icon={<span>🏠</span>}>
          Home
        </TabsTrigger>
        <TabsTrigger value="profile" icon={<span>👤</span>}>
          Profile
        </TabsTrigger>
        <TabsTrigger value="settings" icon={<span>⚙️</span>}>
          Settings
        </TabsTrigger>
      </TabsList>
      <TabsContent value="home">Home content</TabsContent>
      <TabsContent value="profile">Profile content</TabsContent>
      <TabsContent value="settings">Settings content</TabsContent>
    </Tabs>
  ),
}

export const VerticalOrientation: Story = {
  render: () => (
    <Tabs defaultValue="account" orientation="vertical" className="flex gap-4">
      <TabsList orientation="vertical">
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <div className="flex-1">
        <TabsContent value="account">Account content</TabsContent>
        <TabsContent value="password">Password content</TabsContent>
        <TabsContent value="settings">Settings content</TabsContent>
      </div>
    </Tabs>
  ),
}

export const WithDisabledTab: Story = {
  render: () => (
    <Tabs defaultValue="tab1" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="tab1">Active Tab</TabsTrigger>
        <TabsTrigger value="tab2" disabled>
          Disabled Tab
        </TabsTrigger>
        <TabsTrigger value="tab3">Another Active</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">First tab content</TabsContent>
      <TabsContent value="tab2">Second tab content</TabsContent>
      <TabsContent value="tab3">Third tab content</TabsContent>
    </Tabs>
  ),
}

export const LazyLoading: Story = {
  render: () => (
    <Tabs defaultValue="tab1" className="w-[500px]">
      <TabsList>
        <TabsTrigger value="tab1">Eager Tab</TabsTrigger>
        <TabsTrigger value="tab2">Lazy Tab</TabsTrigger>
        <TabsTrigger value="tab3">Another Lazy Tab</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">
        This content loads immediately
      </TabsContent>
      <TabsContent value="tab2" lazy>
        This content only renders when the tab is first activated
      </TabsContent>
      <TabsContent value="tab3" lazy>
        This content also lazy loads
      </TabsContent>
    </Tabs>
  ),
}
