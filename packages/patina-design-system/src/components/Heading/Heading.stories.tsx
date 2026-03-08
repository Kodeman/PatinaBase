import type { Meta, StoryObj } from '@storybook/react'
import { Heading } from './Heading'

const meta: Meta<typeof Heading> = {
  title: 'Typography/Heading',
  component: Heading,
  tags: ['autodocs'],
  argTypes: {
    as: {
      control: 'select',
      options: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    },
    variant: {
      control: 'select',
      options: ['display', 'headline', 'title', 'subtitle'],
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl'],
    },
    weight: {
      control: 'select',
      options: ['normal', 'medium', 'semibold', 'bold', 'extrabold', 'black'],
    },
    align: {
      control: 'select',
      options: ['left', 'center', 'right', 'justify'],
    },
  },
}

export default meta
type Story = StoryObj<typeof Heading>

export const H1: Story = {
  args: {
    as: 'h1',
    children: 'Welcome to Patina Design System',
  },
}

export const H2: Story = {
  args: {
    as: 'h2',
    children: 'Features and Components',
  },
}

export const H3: Story = {
  args: {
    as: 'h3',
    children: 'Getting Started',
  },
}

export const H4: Story = {
  args: {
    as: 'h4',
    children: 'Installation Steps',
  },
}

export const H5: Story = {
  args: {
    as: 'h5',
    children: 'Additional Information',
  },
}

export const H6: Story = {
  args: {
    as: 'h6',
    children: 'Small Details',
  },
}

export const Display: Story = {
  args: {
    variant: 'display',
    size: '6xl',
    children: 'Display Heading',
  },
}

export const Headline: Story = {
  args: {
    variant: 'headline',
    size: '4xl',
    children: 'Headline Heading',
  },
}

export const Title: Story = {
  args: {
    variant: 'title',
    size: '2xl',
    children: 'Title Heading',
  },
}

export const Subtitle: Story = {
  args: {
    variant: 'subtitle',
    size: 'xl',
    children: 'Subtitle Heading',
  },
}

export const CenterAligned: Story = {
  args: {
    as: 'h2',
    align: 'center',
    size: '3xl',
    children: 'Centered Heading',
  },
}

export const RightAligned: Story = {
  args: {
    as: 'h2',
    align: 'right',
    size: '2xl',
    children: 'Right Aligned Heading',
  },
}

export const CustomWeight: Story = {
  args: {
    as: 'h2',
    weight: 'extrabold',
    size: '4xl',
    children: 'Extra Bold Heading',
  },
}

export const AllSizes: Story = {
  render: () => (
    <div className="space-y-4">
      <Heading size="xs">Extra Small Heading</Heading>
      <Heading size="sm">Small Heading</Heading>
      <Heading size="md">Medium Heading</Heading>
      <Heading size="lg">Large Heading</Heading>
      <Heading size="xl">Extra Large Heading</Heading>
      <Heading size="2xl">2XL Heading</Heading>
      <Heading size="3xl">3XL Heading</Heading>
      <Heading size="4xl">4XL Heading</Heading>
      <Heading size="5xl">5XL Heading</Heading>
      <Heading size="6xl">6XL Heading</Heading>
    </div>
  ),
}

export const HierarchyExample: Story = {
  render: () => (
    <div className="space-y-6">
      <Heading as="h1" variant="display" size="5xl">
        Main Page Title
      </Heading>
      <Heading as="h2" variant="headline" size="3xl">
        Section Heading
      </Heading>
      <p className="text-muted-foreground">
        This is some body text that goes under the section heading.
      </p>
      <Heading as="h3" variant="title" size="2xl">
        Subsection Heading
      </Heading>
      <p className="text-muted-foreground">
        More content explaining the subsection.
      </p>
      <Heading as="h4" variant="subtitle" size="xl">
        Minor Heading
      </Heading>
      <p className="text-muted-foreground">
        Additional details and information.
      </p>
    </div>
  ),
}

export const LandingPageHero: Story = {
  render: () => (
    <div className="text-center space-y-4 py-12">
      <Heading as="h1" variant="display" size="7xl">
        Build Better Products
      </Heading>
      <Heading as="h2" variant="subtitle" size="xl" className="text-muted-foreground">
        Create beautiful, accessible interfaces with our design system
      </Heading>
    </div>
  ),
}

export const ArticleHeadings: Story = {
  render: () => (
    <article className="max-w-3xl space-y-6">
      <Heading as="h1" variant="headline" size="4xl">
        Understanding Design Systems
      </Heading>
      <p className="text-muted-foreground">
        A design system is a collection of reusable components, guided by clear standards,
        that can be assembled together to build any number of applications.
      </p>
      <Heading as="h2" variant="title" size="2xl">
        Why Use a Design System?
      </Heading>
      <p className="text-muted-foreground">
        Design systems help teams build better products faster by making design reusable.
      </p>
      <Heading as="h3" variant="subtitle" size="xl">
        Consistency
      </Heading>
      <p className="text-muted-foreground">
        Ensure a consistent look and feel across all your products.
      </p>
      <Heading as="h3" variant="subtitle" size="xl">
        Efficiency
      </Heading>
      <p className="text-muted-foreground">
        Speed up development by reusing pre-built components.
      </p>
    </article>
  ),
}

export const CardTitle: Story = {
  render: () => (
    <div className="max-w-md border rounded-lg p-6">
      <Heading as="h3" variant="title" size="xl">
        Product Card Title
      </Heading>
      <p className="text-muted-foreground mt-2">
        This is a description of the product that provides additional context and information.
      </p>
      <button className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">
        Learn More
      </button>
    </div>
  ),
}

export const DashboardHeadings: Story = {
  render: () => (
    <div className="space-y-8">
      <div>
        <Heading as="h1" variant="headline" size="3xl">
          Dashboard
        </Heading>
        <p className="text-muted-foreground mt-1">
          Welcome back! Here's what's happening today.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="border rounded-lg p-6">
          <Heading as="h3" variant="subtitle" size="sm" className="text-muted-foreground uppercase">
            Total Revenue
          </Heading>
          <Heading as="p" variant="title" size="3xl" className="mt-2">
            $45,231
          </Heading>
        </div>
        <div className="border rounded-lg p-6">
          <Heading as="h3" variant="subtitle" size="sm" className="text-muted-foreground uppercase">
            Active Users
          </Heading>
          <Heading as="p" variant="title" size="3xl" className="mt-2">
            2,345
          </Heading>
        </div>
        <div className="border rounded-lg p-6">
          <Heading as="h3" variant="subtitle" size="sm" className="text-muted-foreground uppercase">
            Conversion Rate
          </Heading>
          <Heading as="p" variant="title" size="3xl" className="mt-2">
            3.2%
          </Heading>
        </div>
      </div>
    </div>
  ),
}
