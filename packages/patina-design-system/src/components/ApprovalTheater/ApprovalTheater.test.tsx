import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApprovalTheater, ApprovalItem } from './ApprovalTheater'
import { describe, it, expect, vi } from 'vitest'

const mockApproval: ApprovalItem = {
  id: 'test-approval',
  title: 'Test Approval',
  description: 'Test description',
  type: 'design',
  status: 'pending',
  costImpact: {
    amount: 5000,
    currency: '$',
  },
  designerNote: 'Test designer note',
}

describe('ApprovalTheater', () => {
  it('renders when open', () => {
    render(
      <ApprovalTheater
        open={true}
        onOpenChange={() => {}}
        approval={mockApproval}
      />
    )

    expect(screen.getByText('Test Approval')).toBeInTheDocument()
    expect(screen.getByText('Test description')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    const { container } = render(
      <ApprovalTheater
        open={false}
        onOpenChange={() => {}}
        approval={mockApproval}
      />
    )

    expect(container.firstChild).toBeNull()
  })

  it('calls onApprove when approve button is clicked', async () => {
    const onApprove = vi.fn()

    render(
      <ApprovalTheater
        open={true}
        onOpenChange={() => {}}
        approval={mockApproval}
        onApprove={onApprove}
      />
    )

    const approveButton = screen.getByRole('button', { name: /approve/i })
    fireEvent.click(approveButton)

    await waitFor(() => {
      expect(screen.getByText(/confirm & sign/i)).toBeInTheDocument()
    })
  })

  it('shows designer note when provided', () => {
    render(
      <ApprovalTheater
        open={true}
        onOpenChange={() => {}}
        approval={mockApproval}
      />
    )

    expect(screen.getByText("Designer's Note")).toBeInTheDocument()
    expect(screen.getByText('Test designer note')).toBeInTheDocument()
  })

  it('displays cost impact', () => {
    render(
      <ApprovalTheater
        open={true}
        onOpenChange={() => {}}
        approval={mockApproval}
      />
    )

    expect(screen.getByText('Cost Impact')).toBeInTheDocument()
    expect(screen.getByText('$5,000')).toBeInTheDocument()
  })

  it('calls onStartDiscussion when discussion button is clicked', () => {
    const onStartDiscussion = vi.fn()

    render(
      <ApprovalTheater
        open={true}
        onOpenChange={() => {}}
        approval={mockApproval}
        onStartDiscussion={onStartDiscussion}
      />
    )

    const discussionButton = screen.getByRole('button', { name: /start discussion/i })
    fireEvent.click(discussionButton)

    expect(onStartDiscussion).toHaveBeenCalledWith(mockApproval.id)
  })

  it('shows recommended action indicator', () => {
    render(
      <ApprovalTheater
        open={true}
        onOpenChange={() => {}}
        approval={{
          ...mockApproval,
          recommendedAction: 'approve',
        }}
      />
    )

    expect(screen.getByText(/recommended/i)).toBeInTheDocument()
  })

  it('switches between view tabs', () => {
    render(
      <ApprovalTheater
        open={true}
        onOpenChange={() => {}}
        approval={mockApproval}
      />
    )

    const costTab = screen.getByRole('button', { name: /cost impact/i })
    fireEvent.click(costTab)

    // Should show cost impact view
    expect(screen.getByText('Cost Impact')).toBeInTheDocument()
  })
})
