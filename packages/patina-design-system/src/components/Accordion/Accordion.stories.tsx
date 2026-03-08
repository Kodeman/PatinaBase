import type { Meta, StoryObj } from '@storybook/react'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './Accordion'

const meta: Meta<typeof Accordion> = {
  title: 'Data Display/Accordion',
  component: Accordion,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Accordion>

export const Single: Story = {
  render: () => (
    <Accordion type="single" collapsible className="w-full max-w-md">
      <AccordionItem value="item-1">
        <AccordionTrigger>Is it accessible?</AccordionTrigger>
        <AccordionContent>
          Yes. It adheres to the WAI-ARIA design pattern.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Is it styled?</AccordionTrigger>
        <AccordionContent>
          Yes. It comes with default styles that match the other components.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Is it animated?</AccordionTrigger>
        <AccordionContent>
          Yes. It's animated by default with smooth transitions.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
}

export const Multiple: Story = {
  render: () => (
    <Accordion type="multiple" className="w-full max-w-md">
      <AccordionItem value="item-1">
        <AccordionTrigger>Section 1</AccordionTrigger>
        <AccordionContent>Content for section 1</AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Section 2</AccordionTrigger>
        <AccordionContent>Content for section 2</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
}

export const Bordered: Story = {
  render: () => (
    <Accordion type="single" collapsible variant="bordered" className="w-full max-w-md">
      <AccordionItem value="item-1" variant="bordered">
        <AccordionTrigger>Bordered Item</AccordionTrigger>
        <AccordionContent>This accordion has borders.</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
}

export const Separated: Story = {
  render: () => (
    <Accordion type="single" collapsible variant="separated" className="w-full max-w-md">
      <AccordionItem value="item-1" variant="separated">
        <AccordionTrigger className="px-4">Item 1</AccordionTrigger>
        <AccordionContent className="px-4">Separated content 1</AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2" variant="separated">
        <AccordionTrigger className="px-4">Item 2</AccordionTrigger>
        <AccordionContent className="px-4">Separated content 2</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
}
