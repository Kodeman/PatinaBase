import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from './ContextMenu'

describe('ContextMenu', () => {
  it('renders trigger area', () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger>Right click me</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Item 1</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )

    expect(screen.getByText('Right click me')).toBeInTheDocument()
  })

  it('opens menu on right click', async () => {
    const user = userEvent.setup()

    render(
      <ContextMenu>
        <ContextMenuTrigger>Right click me</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Copy</ContextMenuItem>
          <ContextMenuItem>Paste</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByText('Right click me'),
    })

    expect(screen.getByText('Copy')).toBeInTheDocument()
    expect(screen.getByText('Paste')).toBeInTheDocument()
  })

  it('handles menu item clicks', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    render(
      <ContextMenu>
        <ContextMenuTrigger>Right click me</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={handleClick}>Action</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByText('Right click me'),
    })

    await user.click(screen.getByText('Action'))
    expect(handleClick).toHaveBeenCalled()
  })

  it('renders separator', async () => {
    const user = userEvent.setup()

    render(
      <ContextMenu>
        <ContextMenuTrigger>Right click me</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Item 1</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>Item 2</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByText('Right click me'),
    })

    const separator = screen.getByRole('separator')
    expect(separator).toBeInTheDocument()
  })

  it('supports checkbox items', async () => {
    const user = userEvent.setup()

    render(
      <ContextMenu>
        <ContextMenuTrigger>Right click me</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuCheckboxItem checked={false}>Option 1</ContextMenuCheckboxItem>
          <ContextMenuCheckboxItem checked={true}>Option 2</ContextMenuCheckboxItem>
        </ContextMenuContent>
      </ContextMenu>
    )

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByText('Right click me'),
    })

    expect(screen.getByText('Option 1')).toBeInTheDocument()
    expect(screen.getByText('Option 2')).toBeInTheDocument()
  })

  it('supports disabled items', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    render(
      <ContextMenu>
        <ContextMenuTrigger>Right click me</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem disabled onSelect={handleClick}>
            Disabled Item
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByText('Right click me'),
    })

    const disabledItem = screen.getByText('Disabled Item')
    expect(disabledItem).toHaveAttribute('data-disabled')

    await user.click(disabledItem)
    expect(handleClick).not.toHaveBeenCalled()
  })
})
