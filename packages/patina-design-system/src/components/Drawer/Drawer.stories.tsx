import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '../Button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from './Drawer'

const meta = {
  title: 'Components/Overlay/Drawer',
  component: Drawer,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof Drawer>

export default meta
type Story = StoryObj<typeof meta>

export const Right: Story = {
  render: () => (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline">Open Right Drawer</Button>
      </DrawerTrigger>
      <DrawerContent side="right">
        <DrawerHeader>
          <DrawerTitle>Navigation Menu</DrawerTitle>
          <DrawerDescription>Access your account settings and preferences.</DrawerDescription>
        </DrawerHeader>
        <div className="py-4">
          <nav className="space-y-2">
            <a href="#" className="block px-4 py-2 hover:bg-accent rounded-md">
              Profile
            </a>
            <a href="#" className="block px-4 py-2 hover:bg-accent rounded-md">
              Settings
            </a>
            <a href="#" className="block px-4 py-2 hover:bg-accent rounded-md">
              Billing
            </a>
            <a href="#" className="block px-4 py-2 hover:bg-accent rounded-md">
              Notifications
            </a>
          </nav>
        </div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  ),
}

export const Left: Story = {
  render: () => (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline">Open Left Drawer</Button>
      </DrawerTrigger>
      <DrawerContent side="left">
        <DrawerHeader>
          <DrawerTitle>Filters</DrawerTitle>
          <DrawerDescription>Filter and sort your results</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-4 py-4">
          <div>
            <h4 className="mb-2 font-medium">Category</h4>
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input type="checkbox" />
                <span>Electronics</span>
              </label>
              <label className="flex items-center space-x-2">
                <input type="checkbox" />
                <span>Clothing</span>
              </label>
              <label className="flex items-center space-x-2">
                <input type="checkbox" />
                <span>Books</span>
              </label>
            </div>
          </div>
          <div>
            <h4 className="mb-2 font-medium">Price Range</h4>
            <input type="range" className="w-full" />
          </div>
        </div>
        <DrawerFooter>
          <Button>Apply Filters</Button>
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  ),
}

export const Top: Story = {
  render: () => (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline">Open Top Drawer</Button>
      </DrawerTrigger>
      <DrawerContent side="top">
        <DrawerHeader>
          <DrawerTitle>Announcement</DrawerTitle>
          <DrawerDescription>Important updates and notifications</DrawerDescription>
        </DrawerHeader>
        <div className="py-4">
          <p className="text-sm">
            We have released a new version of our application with exciting features and
            improvements.
          </p>
        </div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button>Got it</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  ),
}

export const Bottom: Story = {
  render: () => (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline">Open Bottom Drawer</Button>
      </DrawerTrigger>
      <DrawerContent side="bottom">
        <DrawerHeader>
          <DrawerTitle>Cookie Settings</DrawerTitle>
          <DrawerDescription>Manage your cookie preferences</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-4 py-4">
          <label className="flex items-center justify-between">
            <span>Essential Cookies</span>
            <input type="checkbox" checked disabled />
          </label>
          <label className="flex items-center justify-between">
            <span>Analytics Cookies</span>
            <input type="checkbox" />
          </label>
          <label className="flex items-center justify-between">
            <span>Marketing Cookies</span>
            <input type="checkbox" />
          </label>
        </div>
        <DrawerFooter>
          <Button>Save Preferences</Button>
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  ),
}

export const WithForm: Story = {
  render: () => (
    <Drawer>
      <DrawerTrigger asChild>
        <Button>Add Item</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add New Item</DrawerTitle>
          <DrawerDescription>Fill out the form to add a new item to your inventory.</DrawerDescription>
        </DrawerHeader>
        <form className="space-y-4 py-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1">
              Name
            </label>
            <input
              id="name"
              type="text"
              className="w-full px-3 py-2 border rounded-md"
              placeholder="Item name"
            />
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium mb-1">
              Description
            </label>
            <textarea
              id="description"
              className="w-full px-3 py-2 border rounded-md"
              rows={3}
              placeholder="Item description"
            />
          </div>
          <div>
            <label htmlFor="price" className="block text-sm font-medium mb-1">
              Price
            </label>
            <input
              id="price"
              type="number"
              className="w-full px-3 py-2 border rounded-md"
              placeholder="0.00"
            />
          </div>
        </form>
        <DrawerFooter>
          <Button type="submit">Add Item</Button>
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  ),
}
