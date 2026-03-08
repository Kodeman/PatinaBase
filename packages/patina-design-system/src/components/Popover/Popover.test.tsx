import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Popover, PopoverContent, PopoverTrigger } from './Popover'

describe('Popover', () => {
  it('opens popover on click', async () => {
    const user = userEvent.setup()

    render(
      <Popover>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>Popover content</PopoverContent>
      </Popover>
    )

    await user.click(screen.getByText('Open'))
    expect(await screen.findByText('Popover content')).toBeInTheDocument()
  })
})
