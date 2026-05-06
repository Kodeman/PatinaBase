import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaintColorPicker, type PaintColorOption } from './PaintColorPicker'

const SAMPLE: PaintColorOption[] = [
  { id: '1', brand: 'sherwin_williams', code: 'SW7008', name: 'Alabaster',     hex: '#EDEAE0' },
  { id: '2', brand: 'benjamin_moore',   code: 'OC-17',  name: 'White Dove',    hex: '#EDE8DA' },
]

describe('PaintColorPicker', () => {
  it('renders the placeholder when no value is selected', () => {
    render(
      <PaintColorPicker
        value={null}
        onChange={vi.fn()}
        onSearch={async () => SAMPLE}
        placeholder="Pick paint"
      />
    )
    expect(screen.getByText('Pick paint')).toBeInTheDocument()
  })

  it('renders the selected color', () => {
    render(
      <PaintColorPicker
        value={SAMPLE[0]}
        onChange={vi.fn()}
        onSearch={async () => SAMPLE}
      />
    )
    expect(screen.getByText('Alabaster')).toBeInTheDocument()
    expect(screen.getByText(/Sherwin-Williams.*SW7008/)).toBeInTheDocument()
  })

  it('opens the popover and runs the search callback', async () => {
    const user = userEvent.setup()
    const onSearch = vi.fn().mockResolvedValue(SAMPLE)
    render(
      <PaintColorPicker
        value={null}
        onChange={vi.fn()}
        onSearch={onSearch}
      />
    )

    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(onSearch).toHaveBeenCalled()
    }, { timeout: 1000 })
  })

  it('limits brand chips when a brands prop is provided', async () => {
    const user = userEvent.setup()
    render(
      <PaintColorPicker
        value={null}
        onChange={vi.fn()}
        onSearch={async () => SAMPLE}
        brands={['sherwin_williams']}
      />
    )

    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      // "All" + only one brand chip — the other three should be absent.
      expect(screen.getByRole('button', { name: 'Sherwin-Williams' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Benjamin Moore' })).toBeNull()
    })
  })
})
