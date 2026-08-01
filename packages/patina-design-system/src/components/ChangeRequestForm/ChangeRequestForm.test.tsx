import { fireEvent, render, screen } from '@testing-library/react'

import { ChangeRequestForm } from './ChangeRequestForm'

describe('ChangeRequestForm modes', () => {
  it('renders only persisted title and description inputs in basic mode', () => {
    const onSubmit = vi.fn()
    render(<ChangeRequestForm mode="basic" onSubmit={onSubmit} />)

    expect(screen.getByLabelText(/change title/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/detailed description/i)).toBeInTheDocument()
    expect(screen.queryByText('Change Category')).not.toBeInTheDocument()
    expect(screen.queryByText('Priority Level')).not.toBeInTheDocument()
    expect(screen.queryByText('Attachments (Optional)')).not.toBeInTheDocument()
    expect(screen.queryByText('Expected Response Time')).not.toBeInTheDocument()
    expect(screen.queryByText(/response within your requested timeframe/i)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/change title/i), {
      target: { value: 'Add a reading lamp' },
    })
    fireEvent.change(screen.getByLabelText(/detailed description/i), {
      target: { value: 'Please place it beside the lounge chair.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Change Request' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: 'Add a reading lamp',
      description: 'Please place it beside the lounge chair.',
    })
  })

  it('retains the advanced fields for demo and full-persistence consumers', () => {
    render(<ChangeRequestForm mode="advanced" onSubmit={vi.fn()} />)

    expect(screen.getByText('Change Category')).toBeInTheDocument()
    expect(screen.getByText('Priority Level')).toBeInTheDocument()
    expect(screen.getByText('Attachments (Optional)')).toBeInTheDocument()
    expect(screen.getByText('Expected Response Time')).toBeInTheDocument()
    expect(screen.getByText(/response within your requested timeframe/i)).toBeInTheDocument()
  })

  it('disables every basic interaction and exposes busy state while pending', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    const { container } = render(
      <ChangeRequestForm mode="basic" isSubmitting onSubmit={onSubmit} onCancel={onCancel} />,
    )

    expect(container.querySelector('form')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByLabelText(/change title/i)).toBeDisabled()
    expect(screen.getByLabelText(/detailed description/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

    fireEvent.submit(container.querySelector('form')!)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })
})
