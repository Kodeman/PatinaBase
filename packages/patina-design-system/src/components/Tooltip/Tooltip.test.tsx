import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './Tooltip'

describe('Tooltip', () => {
  it('shows tooltip on hover', async () => {
    const user = userEvent.setup()

    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Tooltip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    const trigger = screen.getByText('Hover me')
    await user.hover(trigger)

    expect(await screen.findByText('Tooltip text')).toBeInTheDocument()
  })
})
