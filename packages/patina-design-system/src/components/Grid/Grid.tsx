import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const gridVariants = cva('grid', {
  variants: {
    columns: {
      1: 'grid-cols-1',
      2: 'grid-cols-2',
      3: 'grid-cols-3',
      4: 'grid-cols-4',
      5: 'grid-cols-5',
      6: 'grid-cols-6',
      7: 'grid-cols-7',
      8: 'grid-cols-8',
      9: 'grid-cols-9',
      10: 'grid-cols-10',
      11: 'grid-cols-11',
      12: 'grid-cols-12',
    },
    rows: {
      1: 'grid-rows-1',
      2: 'grid-rows-2',
      3: 'grid-rows-3',
      4: 'grid-rows-4',
      5: 'grid-rows-5',
      6: 'grid-rows-6',
    },
    gap: {
      none: 'gap-0',
      xs: 'gap-1',
      sm: 'gap-2',
      md: 'gap-4',
      lg: 'gap-6',
      xl: 'gap-8',
      '2xl': 'gap-12',
    },
    flow: {
      row: 'grid-flow-row',
      col: 'grid-flow-col',
      dense: 'grid-flow-dense',
      'row-dense': 'grid-flow-row-dense',
      'col-dense': 'grid-flow-col-dense',
    },
    autoFit: {
      true: 'grid-cols-[repeat(auto-fit,minmax(0,1fr))]',
    },
    autoFill: {
      true: 'grid-cols-[repeat(auto-fill,minmax(0,1fr))]',
    },
  },
  defaultVariants: {
    gap: 'md',
  },
})

export interface GridProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof gridVariants> {
  /**
   * Render as a different HTML element
   */
  as?: React.ElementType

  /**
   * Minimum width for auto-fit/auto-fill columns
   * @example '250px', '20rem'
   */
  minChildWidth?: string

  /**
   * Custom grid template columns
   * @example '1fr 2fr 1fr'
   */
  templateColumns?: string

  /**
   * Custom grid template rows
   * @example '100px 1fr auto'
   */
  templateRows?: string

  /**
   * Custom grid template areas
   * @example '"header header" "sidebar main" "footer footer"'
   */
  templateAreas?: string
}

/**
 * Grid component for creating CSS Grid layouts
 *
 * @example
 * ```tsx
 * // Basic grid
 * <Grid columns={3} gap="md">
 *   <div>Item 1</div>
 *   <div>Item 2</div>
 *   <div>Item 3</div>
 * </Grid>
 *
 * // Auto-fit responsive grid
 * <Grid autoFit minChildWidth="250px" gap="lg">
 *   {items.map(item => <Card key={item.id}>{item.name}</Card>)}
 * </Grid>
 *
 * // Custom template
 * <Grid templateColumns="1fr 2fr 1fr" gap="md">
 *   <Sidebar />
 *   <Main />
 *   <Aside />
 * </Grid>
 * ```
 */
const Grid = React.forwardRef<HTMLDivElement, GridProps>(
  (
    {
      className,
      columns,
      rows,
      gap,
      flow,
      autoFit,
      autoFill,
      minChildWidth,
      templateColumns,
      templateRows,
      templateAreas,
      as: Component = 'div',
      style,
      ...props
    },
    ref
  ) => {
    const customStyles: React.CSSProperties = {
      ...style,
    }

    // Handle auto-fit/auto-fill with minChildWidth
    if ((autoFit || autoFill) && minChildWidth) {
      customStyles.gridTemplateColumns = `repeat(${
        autoFit ? 'auto-fit' : 'auto-fill'
      }, minmax(${minChildWidth}, 1fr))`
    } else if (templateColumns) {
      customStyles.gridTemplateColumns = templateColumns
    }

    if (templateRows) {
      customStyles.gridTemplateRows = templateRows
    }

    if (templateAreas) {
      customStyles.gridTemplateAreas = templateAreas
    }

    return (
      <Component
        ref={ref}
        className={cn(
          gridVariants({ columns, rows, gap, flow, autoFit, autoFill, className })
        )}
        style={customStyles}
        {...props}
      />
    )
  }
)

Grid.displayName = 'Grid'

export { Grid, gridVariants }
