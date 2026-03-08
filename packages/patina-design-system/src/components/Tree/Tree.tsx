'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'

export interface TreeNode {
  id: string
  label: string
  icon?: React.ReactNode
  children?: TreeNode[]
  disabled?: boolean
}

export interface TreeProps extends React.ComponentPropsWithoutRef<'div'> {
  data: TreeNode[]
  onNodeClick?: (node: TreeNode) => void
  defaultExpanded?: string[]
}

/**
 * Tree component for displaying hierarchical data
 *
 * @example
 * ```tsx
 * const data = [
 *   {
 *     id: '1',
 *     label: 'Documents',
 *     children: [
 *       { id: '1-1', label: 'Work' },
 *       { id: '1-2', label: 'Personal' },
 *     ],
 *   },
 * ]
 *
 * <Tree data={data} onNodeClick={(node) => console.log(node)} />
 * ```
 */
const Tree = React.forwardRef<HTMLDivElement, TreeProps>(
  ({ className, data, onNodeClick, defaultExpanded = [], ...props }, ref) => {
    const [expanded, setExpanded] = React.useState<Set<string>>(
      new Set(defaultExpanded)
    )

    const toggleNode = (nodeId: string) => {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(nodeId)) {
          next.delete(nodeId)
        } else {
          next.add(nodeId)
        }
        return next
      })
    }

    const renderNode = (node: TreeNode, level: number = 0) => {
      const hasChildren = node.children && node.children.length > 0
      const isExpanded = expanded.has(node.id)

      return (
        <div key={node.id} className="select-none">
          <div
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer transition-colors',
              node.disabled && 'opacity-50 cursor-not-allowed'
            )}
            style={{ paddingLeft: `${level * 1.5 + 0.5}rem` }}
            onClick={() => {
              if (!node.disabled) {
                if (hasChildren) {
                  toggleNode(node.id)
                }
                onNodeClick?.(node)
              }
            }}
          >
            {hasChildren && (
              <span className="inline-flex shrink-0 transition-transform">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={cn(
                    'transition-transform',
                    isExpanded && 'rotate-90'
                  )}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
            )}
            {!hasChildren && <span className="w-4" />}
            {node.icon && (
              <span className="inline-flex shrink-0">{node.icon}</span>
            )}
            <span className="text-sm">{node.label}</span>
          </div>
          {hasChildren && isExpanded && (
            <div>
              {node.children?.map((child) => renderNode(child, level + 1))}
            </div>
          )}
        </div>
      )
    }

    return (
      <div ref={ref} className={cn('py-2', className)} {...props}>
        {data.map((node) => renderNode(node))}
      </div>
    )
  }
)
Tree.displayName = 'Tree'

export { Tree }
