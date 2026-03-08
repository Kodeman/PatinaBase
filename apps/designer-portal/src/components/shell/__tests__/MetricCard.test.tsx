import { render, screen } from '@testing-library/react'

import { MetricCard } from '../MetricCard'

describe('MetricCard', () => {
  it('renders label and value', () => {
    render(<MetricCard label="Contracts" value={4} />)

    expect(screen.getByText('Contracts')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })
})
