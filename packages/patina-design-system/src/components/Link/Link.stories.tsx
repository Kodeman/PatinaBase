import type { Meta, StoryObj } from '@storybook/react'
import { Link } from './Link'

const meta: Meta<typeof Link> = {
  title: 'Typography/Link',
  component: Link,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'subtle', 'ghost', 'underline', 'unstyled'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
  },
}

export default meta
type Story = StoryObj<typeof Link>

export const Default: Story = {
  args: {
    href: '/about',
    children: 'About Us',
  },
}

export const Subtle: Story = {
  args: {
    variant: 'subtle',
    href: '/contact',
    children: 'Contact Us',
  },
}

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    href: '/settings',
    children: 'Settings',
  },
}

export const Underline: Story = {
  args: {
    variant: 'underline',
    href: '/terms',
    children: 'Terms and Conditions',
  },
}

export const Unstyled: Story = {
  args: {
    variant: 'unstyled',
    href: '/privacy',
    children: 'Privacy Policy',
  },
}

export const External: Story = {
  args: {
    href: 'https://example.com',
    children: 'Visit Example.com',
  },
}

export const ExternalWithIcon: Story = {
  args: {
    href: 'https://github.com',
    showExternalIcon: true,
    children: 'View on GitHub',
  },
}

export const Small: Story = {
  args: {
    size: 'sm',
    href: '/help',
    children: 'Help Center',
  },
}

export const Large: Story = {
  args: {
    size: 'lg',
    href: '/featured',
    children: 'Featured Content',
  },
}

export const InParagraph: Story = {
  render: () => (
    <p className="text-base">
      This is a paragraph with an{' '}
      <Link href="/inline">inline link</Link>
      {' '}and another{' '}
      <Link href="https://example.com" showExternalIcon>
        external link
      </Link>
      {' '}in the text.
    </p>
  ),
}

export const NavigationLinks: Story = {
  render: () => (
    <nav className="flex gap-4">
      <Link variant="ghost" href="/">Home</Link>
      <Link variant="ghost" href="/products">Products</Link>
      <Link variant="ghost" href="/about">About</Link>
      <Link variant="ghost" href="/contact">Contact</Link>
    </nav>
  ),
}

export const FooterLinks: Story = {
  render: () => (
    <footer className="flex flex-col gap-2">
      <Link variant="subtle" size="sm" href="/terms">Terms of Service</Link>
      <Link variant="subtle" size="sm" href="/privacy">Privacy Policy</Link>
      <Link variant="subtle" size="sm" href="/cookies">Cookie Policy</Link>
      <Link variant="subtle" size="sm" href="https://github.com" showExternalIcon>
        GitHub
      </Link>
    </footer>
  ),
}
