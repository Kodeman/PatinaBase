import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '../button'

describe('Button', () => {
  it('exposes its children as the accessible name', () => {
    render(<Button>Save product</Button>)
    expect(screen.getByRole('button', { name: 'Save product' })).toBeInTheDocument()
  })

  it('preserves disabled behavior and does not call the handler', async () => {
    const user = userEvent.setup()
    const onClick = jest.fn()
    render(<Button disabled onClick={onClick}>Unavailable</Button>)

    const button = screen.getByRole('button', { name: 'Unavailable' })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('calls its handler for each activation', async () => {
    const user = userEvent.setup()
    const onClick = jest.fn()
    render(<Button onClick={onClick}>Refresh</Button>)

    const button = screen.getByRole('button', { name: 'Refresh' })
    await user.click(button)
    await user.click(button)
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('forwards native form and accessible-label attributes', () => {
    render(<Button type="submit" aria-label="Create item">Create</Button>)
    const button = screen.getByRole('button', { name: 'Create item' })
    expect(button).toHaveAttribute('type', 'submit')
  })

  it('forwards its ref to the native button', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<Button ref={ref}>Button</Button>)
    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
  })

  it('renders composed children inside the same button', () => {
    render(<Button><span>Icon</span><span>Open catalog</span></Button>)
    const button = screen.getByRole('button', { name: 'Icon Open catalog' })
    expect(button).toContainElement(screen.getByText('Icon'))
    expect(button).toContainElement(screen.getByText('Open catalog'))
  })
})
