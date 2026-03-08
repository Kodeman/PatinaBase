import type { Meta, StoryObj } from '@storybook/react'
import { Navbar, NavbarContent, NavbarActions, NavbarLink, NavbarBrand } from './Navbar'
import { Button } from '../Button'

const meta: Meta<typeof Navbar> = {
  title: 'Navigation/Navbar',
  component: Navbar,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'A responsive navbar component for main navigation.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof Navbar>

export const Default: Story = {
  render: () => (
    <Navbar logo={<NavbarBrand>Patina</NavbarBrand>}>
      <NavbarContent>
        <NavbarLink href="/" active>
          Home
        </NavbarLink>
        <NavbarLink href="/products">Products</NavbarLink>
        <NavbarLink href="/about">About</NavbarLink>
      </NavbarContent>
      <NavbarActions>
        <Button variant="ghost" size="sm">
          Sign In
        </Button>
        <Button size="sm">Sign Up</Button>
      </NavbarActions>
    </Navbar>
  ),
}

export const Sticky: Story = {
  render: () => (
    <>
      <Navbar logo={<NavbarBrand>Patina</NavbarBrand>} sticky>
        <NavbarContent>
          <NavbarLink href="/" active>
            Home
          </NavbarLink>
          <NavbarLink href="/products">Products</NavbarLink>
        </NavbarContent>
      </Navbar>
      <div className="p-8">
        <p>Scroll down to see the sticky behavior...</p>
        {Array.from({ length: 50 }).map((_, i) => (
          <p key={i}>Content line {i + 1}</p>
        ))}
      </div>
    </>
  ),
}

export const Solid: Story = {
  render: () => (
    <Navbar variant="solid" logo={<NavbarBrand>Patina</NavbarBrand>}>
      <NavbarContent>
        <NavbarLink href="/" active>
          Home
        </NavbarLink>
        <NavbarLink href="/products">Products</NavbarLink>
      </NavbarContent>
      <NavbarActions>
        <Button variant="secondary" size="sm">
          Get Started
        </Button>
      </NavbarActions>
    </Navbar>
  ),
}

export const Large: Story = {
  render: () => (
    <Navbar size="lg" logo={<NavbarBrand>Patina</NavbarBrand>}>
      <NavbarContent>
        <NavbarLink href="/">Home</NavbarLink>
        <NavbarLink href="/products">Products</NavbarLink>
      </NavbarContent>
    </Navbar>
  ),
}
