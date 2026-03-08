import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs'

describe('Tabs', () => {
  const TabsExample = () => (
    <Tabs defaultValue="tab1">
      <TabsList>
        <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        <TabsTrigger value="tab3" disabled>
          Tab 3
        </TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">Content 1</TabsContent>
      <TabsContent value="tab2">Content 2</TabsContent>
      <TabsContent value="tab3">Content 3</TabsContent>
    </Tabs>
  )

  it('renders tabs correctly', () => {
    render(<TabsExample />)
    expect(screen.getByRole('tab', { name: 'Tab 1' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tab 2' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tab 3' })).toBeInTheDocument()
  })

  it('shows default tab content', () => {
    render(<TabsExample />)
    expect(screen.getByText('Content 1')).toBeVisible()
    expect(screen.queryByText('Content 2')).not.toBeVisible()
  })

  it('switches tabs on click', async () => {
    const user = userEvent.setup()
    render(<TabsExample />)

    await user.click(screen.getByRole('tab', { name: 'Tab 2' }))
    expect(screen.getByText('Content 2')).toBeVisible()
    expect(screen.queryByText('Content 1')).not.toBeVisible()
  })

  it('supports keyboard navigation', async () => {
    const user = userEvent.setup()
    render(<TabsExample />)

    const firstTab = screen.getByRole('tab', { name: 'Tab 1' })
    firstTab.focus()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Tab 2' })).toHaveFocus()
  })

  it('disables tabs when disabled prop is set', () => {
    render(<TabsExample />)
    const disabledTab = screen.getByRole('tab', { name: 'Tab 3' })
    expect(disabledTab).toBeDisabled()
  })

  it('applies variant styles correctly', () => {
    const { container } = render(
      <Tabs defaultValue="tab1" variant="enclosed">
        <TabsList variant="enclosed">
          <TabsTrigger value="tab1" variant="enclosed">
            Tab 1
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tab1" variant="enclosed">
          Content
        </TabsContent>
      </Tabs>
    )
    expect(container.firstChild).toHaveClass('border')
  })

  it('supports icons in triggers', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1" icon={<span data-testid="icon">🏠</span>}>
            Home
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content</TabsContent>
      </Tabs>
    )
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('supports lazy loading of content', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2" lazy>
          Content 2
        </TabsContent>
      </Tabs>
    )

    // Lazy content should not be in DOM initially
    expect(screen.queryByText('Content 2')).not.toBeInTheDocument()
  })

  it('supports vertical orientation', () => {
    const { container } = render(
      <Tabs defaultValue="tab1" orientation="vertical">
        <TabsList orientation="vertical">
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content</TabsContent>
      </Tabs>
    )
    expect(container.querySelector('[role="tablist"]')).toHaveClass('flex-col')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<TabsExample />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
