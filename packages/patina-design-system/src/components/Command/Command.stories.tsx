import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandCheckboxItem,
  CommandSeparator,
  CommandShortcut,
  CommandDialog,
} from './Command'
import { Calendar, Smile, Calculator, User, Settings, CreditCard } from 'lucide-react'

const meta: Meta<typeof Command> = {
  title: 'Navigation/Command',
  component: Command,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof Command>

export const Default: Story = {
  render: () => (
    <Command className="rounded-lg border shadow-md max-w-md">
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem>
            <Calendar className="mr-2 h-4 w-4" />
            <span>Calendar</span>
          </CommandItem>
          <CommandItem>
            <Smile className="mr-2 h-4 w-4" />
            <span>Search Emoji</span>
          </CommandItem>
          <CommandItem>
            <Calculator className="mr-2 h-4 w-4" />
            <span>Calculator</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem>
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
            <CommandShortcut>⌘P</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <CreditCard className="mr-2 h-4 w-4" />
            <span>Billing</span>
            <CommandShortcut>⌘B</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
}

export const WithCheckboxItems: Story = {
  render: function WithCheckboxItemsStory() {
    const [selectedCategories, setSelectedCategories] = useState<string[]>(['electronics'])

    const toggleCategory = (category: string) => {
      setSelectedCategories((prev) =>
        prev.includes(category)
          ? prev.filter((c) => c !== category)
          : [...prev, category]
      )
    }

    return (
      <Command className="rounded-lg border shadow-md max-w-md">
        <CommandInput placeholder="Search categories..." />
        <CommandList>
          <CommandEmpty>No categories found.</CommandEmpty>
          <CommandGroup heading="Filter by Category">
            <CommandCheckboxItem
              checked={selectedCategories.includes('electronics')}
              onCheckedChange={() => toggleCategory('electronics')}
            >
              Electronics
            </CommandCheckboxItem>
            <CommandCheckboxItem
              checked={selectedCategories.includes('clothing')}
              onCheckedChange={() => toggleCategory('clothing')}
            >
              Clothing
            </CommandCheckboxItem>
            <CommandCheckboxItem
              checked={selectedCategories.includes('furniture')}
              onCheckedChange={() => toggleCategory('furniture')}
            >
              Furniture
            </CommandCheckboxItem>
            <CommandCheckboxItem
              checked={selectedCategories.includes('books')}
              onCheckedChange={() => toggleCategory('books')}
            >
              Books
            </CommandCheckboxItem>
            <CommandCheckboxItem
              checked={selectedCategories.includes('toys')}
              onCheckedChange={() => toggleCategory('toys')}
            >
              Toys
            </CommandCheckboxItem>
          </CommandGroup>
        </CommandList>
        <div className="border-t p-3 text-xs text-muted-foreground">
          Selected: {selectedCategories.join(', ') || 'None'}
        </div>
      </Command>
    )
  },
}

export const ProductFilters: Story = {
  name: 'Product Catalog Filters',
  render: function ProductFiltersStory() {
    const [selectedVendors, setSelectedVendors] = useState<string[]>([])

    const toggleVendor = (vendor: string) => {
      setSelectedVendors((prev) =>
        prev.includes(vendor) ? prev.filter((v) => v !== vendor) : [...prev, vendor]
      )
    }

    const vendors = [
      'Nike',
      'Adidas',
      'Puma',
      'Under Armour',
      'Reebok',
      'New Balance',
      'Asics',
      'Converse',
    ]

    return (
      <Command className="rounded-lg border shadow-md max-w-md">
        <CommandInput placeholder="Search vendors..." showIcon />
        <CommandList>
          <CommandEmpty>No vendors found.</CommandEmpty>
          <CommandGroup heading="Select Vendors">
            {vendors.map((vendor) => (
              <CommandCheckboxItem
                key={vendor}
                checked={selectedVendors.includes(vendor)}
                onCheckedChange={() => toggleVendor(vendor)}
              >
                {vendor}
              </CommandCheckboxItem>
            ))}
          </CommandGroup>
        </CommandList>
        {selectedVendors.length > 0 && (
          <div className="border-t p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {selectedVendors.length} vendor{selectedVendors.length !== 1 ? 's' : ''}{' '}
                selected
              </span>
              <button
                onClick={() => setSelectedVendors([])}
                className="text-xs text-primary hover:underline"
              >
                Clear all
              </button>
            </div>
          </div>
        )}
      </Command>
    )
  },
}

export const SimpleList: Story = {
  render: () => (
    <Command className="rounded-lg border shadow-md max-w-md">
      <CommandInput placeholder="Search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup>
          <CommandItem>Apple</CommandItem>
          <CommandItem>Banana</CommandItem>
          <CommandItem>Cherry</CommandItem>
          <CommandItem>Date</CommandItem>
          <CommandItem>Elderberry</CommandItem>
          <CommandItem>Fig</CommandItem>
          <CommandItem>Grape</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
}

export const WithoutBorder: Story = {
  render: () => (
    <Command variant="ghost">
      <CommandInput placeholder="Search..." showIcon={false} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Quick Actions">
          <CommandItem>New Document</CommandItem>
          <CommandItem>New Folder</CommandItem>
          <CommandItem>Upload File</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
}

export const WithSelectedState: Story = {
  render: function WithSelectedStateStory() {
    const [selected, setSelected] = useState('apple')

    const fruits = ['apple', 'banana', 'cherry', 'date', 'elderberry']

    return (
      <Command className="rounded-lg border shadow-md max-w-md">
        <CommandInput placeholder="Select a fruit..." />
        <CommandList>
          <CommandEmpty>No fruits found.</CommandEmpty>
          <CommandGroup heading="Fruits">
            {fruits.map((fruit) => (
              <CommandItem
                key={fruit}
                selected={selected === fruit}
                onSelect={() => setSelected(fruit)}
              >
                {fruit.charAt(0).toUpperCase() + fruit.slice(1)}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    )
  },
}

export const MultipleGroups: Story = {
  render: () => (
    <Command className="rounded-lg border shadow-md max-w-md">
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem icon={<Calendar className="h-4 w-4" />}>Calendar</CommandItem>
          <CommandItem icon={<Smile className="h-4 w-4" />}>Search Emoji</CommandItem>
          <CommandItem icon={<Calculator className="h-4 w-4" />}>Calculator</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Navigation">
          <CommandItem>Dashboard</CommandItem>
          <CommandItem>Products</CommandItem>
          <CommandItem>Orders</CommandItem>
          <CommandItem>Customers</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem icon={<User className="h-4 w-4" />}>
            Profile
            <CommandShortcut>⌘P</CommandShortcut>
          </CommandItem>
          <CommandItem icon={<Settings className="h-4 w-4" />}>
            Settings
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
}

export const DialogExample: Story = {
  render: function DialogExampleStory() {
    const [open, setOpen] = useState(false)

    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground mb-4">
          Press{' '}
          <kbd className="px-2 py-1.5 text-xs font-semibold text-foreground bg-muted border border-border rounded">
            ⌘K
          </kbd>{' '}
          to open the command palette
        </p>
        <button
          onClick={() => setOpen(true)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Open Command Dialog
        </button>
        <CommandDialog open={open} onOpenChange={setOpen}>
          <CommandInput placeholder="Type a command or search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Suggestions">
              <CommandItem>
                <Calendar className="mr-2 h-4 w-4" />
                <span>Calendar</span>
              </CommandItem>
              <CommandItem>
                <Smile className="mr-2 h-4 w-4" />
                <span>Search Emoji</span>
              </CommandItem>
              <CommandItem>
                <Calculator className="mr-2 h-4 w-4" />
                <span>Calculator</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Settings">
              <CommandItem>
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
                <CommandShortcut>⌘P</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
                <CommandShortcut>⌘S</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </div>
    )
  },
}
