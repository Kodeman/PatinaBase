import type { Meta, StoryObj } from '@storybook/react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './Card'
import { Button } from '../Button'

const meta = {
  title: 'Data Display/Card',
  component: Card,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card Description</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Card Content goes here.</p>
      </CardContent>
      <CardFooter>
        <Button>Action</Button>
      </CardFooter>
    </Card>
  ),
}

export const Variants: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-4">
      <Card variant="default">
        <CardHeader>
          <CardTitle>Default</CardTitle>
        </CardHeader>
      </Card>
      <Card variant="outlined">
        <CardHeader>
          <CardTitle>Outlined</CardTitle>
        </CardHeader>
      </Card>
      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Elevated</CardTitle>
        </CardHeader>
      </Card>
    </div>
  ),
}

export const Interactive: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      <Card hoverable className="w-[300px]">
        <CardHeader>
          <CardTitle>Hoverable Card</CardTitle>
          <CardDescription>Hover to see effect</CardDescription>
        </CardHeader>
      </Card>
      <Card clickable className="w-[300px]">
        <CardHeader>
          <CardTitle>Clickable Card</CardTitle>
          <CardDescription>Click me</CardDescription>
        </CardHeader>
      </Card>
    </div>
  ),
}
