import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Pagination } from './Pagination'

const meta: Meta<typeof Pagination> = {
  title: 'Navigation/Pagination',
  component: Pagination,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
}

export default meta
type Story = StoryObj<typeof Pagination>

export const Default: Story = {
  render: () => {
    const [page, setPage] = useState(1)
    return (
      <Pagination total={100} currentPage={page} pageSize={10} onPageChange={setPage} />
    )
  },
}

export const ManyPages: Story = {
  render: () => {
    const [page, setPage] = useState(5)
    return (
      <Pagination total={1000} currentPage={page} pageSize={10} onPageChange={setPage} />
    )
  },
}

export const FewPages: Story = {
  render: () => {
    const [page, setPage] = useState(1)
    return (
      <Pagination total={30} currentPage={page} pageSize={10} onPageChange={setPage} />
    )
  },
}

export const OutlineVariant: Story = {
  render: () => {
    const [page, setPage] = useState(3)
    return (
      <Pagination
        total={100}
        currentPage={page}
        pageSize={10}
        variant="outline"
        onPageChange={setPage}
      />
    )
  },
}

export const CompactMode: Story = {
  render: () => {
    const [page, setPage] = useState(5)
    return (
      <Pagination
        total={100}
        currentPage={page}
        pageSize={10}
        compact
        onPageChange={setPage}
      />
    )
  },
}

export const WithoutFirstLast: Story = {
  render: () => {
    const [page, setPage] = useState(5)
    return (
      <Pagination
        total={100}
        currentPage={page}
        pageSize={10}
        showFirstLast={false}
        onPageChange={setPage}
      />
    )
  },
}

export const SmallSize: Story = {
  render: () => {
    const [page, setPage] = useState(3)
    return (
      <Pagination
        total={100}
        currentPage={page}
        pageSize={10}
        size="sm"
        onPageChange={setPage}
      />
    )
  },
}

export const LargeSize: Story = {
  render: () => {
    const [page, setPage] = useState(3)
    return (
      <Pagination
        total={100}
        currentPage={page}
        pageSize={10}
        size="lg"
        onPageChange={setPage}
      />
    )
  },
}

export const MoreSiblings: Story = {
  render: () => {
    const [page, setPage] = useState(5)
    return (
      <Pagination
        total={100}
        currentPage={page}
        pageSize={10}
        siblings={2}
        onPageChange={setPage}
      />
    )
  },
}

export const FirstPage: Story = {
  render: () => {
    const [page, setPage] = useState(1)
    return (
      <Pagination total={100} currentPage={page} pageSize={10} onPageChange={setPage} />
    )
  },
}

export const LastPage: Story = {
  render: () => {
    const [page, setPage] = useState(10)
    return (
      <Pagination total={100} currentPage={page} pageSize={10} onPageChange={setPage} />
    )
  },
}
