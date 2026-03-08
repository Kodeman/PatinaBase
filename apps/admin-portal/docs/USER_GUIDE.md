# Admin Portal Catalog - User Guide

**Version 1.0** | **Last Updated: 2025-10-19**

A comprehensive guide for administrators to manage the Patina product catalog effectively.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Navigating the Catalog](#navigating-the-catalog)
3. [Creating Products](#creating-products)
4. [Editing Products](#editing-products)
5. [Managing Categories](#managing-categories)
6. [Bulk Operations](#bulk-operations)
7. [Filtering and Searching](#filtering-and-searching)
8. [Tips & Tricks](#tips--tricks)
9. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Overview

The Admin Portal Catalog is your central hub for managing all products in the Patina platform. Here you can:

- **Create** new products with detailed information
- **Edit** existing products including pricing, descriptions, and images
- **Publish** products to make them visible to designers and clients
- **Organize** products into categories for better discoverability
- **Bulk manage** multiple products simultaneously
- **Monitor** product validation issues and quality

### Accessing the Catalog

1. Sign in to the Admin Portal at `http://localhost:3001`
2. Navigate to **Catalog** in the main navigation menu
3. You'll see the catalog dashboard with your product listing

### Interface Overview

The catalog interface consists of several key areas:

```
┌─────────────────────────────────────────────┐
│  Header (Title + Create Product Button)    │
├─────────────────────────────────────────────┤
│  Bulk Action Toolbar (when items selected) │
├─────────────────────────────────────────────┤
│  Search Bar & View Mode Switcher           │
├─────────────────────────────────────────────┤
│                                             │
│           Product Grid/List/Table           │
│                                             │
└─────────────────────────────────────────────┘
```

**Key Components:**

- **Header**: Contains the page title and "Create Product" button
- **Bulk Action Toolbar**: Appears when products are selected, offers bulk operations
- **Search Bar**: Quick search across product names, brands, and descriptions
- **Filter Panel**: Advanced filtering options (accessible via filter button)
- **View Modes**: Grid, List, or Table view (choose your preference)
- **Product Display**: Shows products based on current filters and view mode

---

## Navigating the Catalog

### View Modes

The catalog supports three display modes to suit different workflows:

#### Grid View

**Best for:** Visual browsing, product discovery

- Large product images
- Card-based layout (2-5 columns)
- Quick visual scanning
- Ideal for reviewing product photography

**How to use:**
- Click the grid icon (⊞) in the toolbar
- Products display as cards with images, name, price, and status
- Hover over cards for additional information

#### List View

**Best for:** Scanning product details, compact view

- Smaller thumbnails with horizontal layout
- Shows more products on screen
- Displays key metadata inline
- Better for text-heavy reviews

**How to use:**
- Click the list icon (☰) in the toolbar
- Products display in rows with thumbnail and details side-by-side

#### Table View

**Best for:** Data analysis, bulk selection, detailed comparison

- Spreadsheet-like layout
- Sortable columns
- Bulk selection checkboxes
- Displays all key fields simultaneously

**How to use:**
- Click the table icon (▤) in the toolbar
- Click column headers to sort
- Use checkboxes for bulk selection

### Pagination

Navigate through large product catalogs efficiently:

- **Page Numbers**: Click specific page numbers at the bottom
- **Next/Previous**: Use arrow buttons to move sequentially
- **Page Size**: Choose 10, 20, 50, or 100 products per page
- **Keyboard**: Use `←` and `→` arrow keys to navigate pages

**Page Information:**
```
Showing 1-20 of 247 products
[< Previous] [1] [2] [3] ... [13] [Next >]
```

---

## Creating Products

### Quick Start: Creating Your First Product

1. Click **"Create Product"** button in the top-right corner
2. Fill in the required fields (marked with *)
3. Add optional attributes to enhance discoverability
4. Click **"Create Product"** to save
5. Product is created in "Draft" status

### The Create Product Dialog

The product creation form is organized into four sections:

#### 1. Basic Information

**Product Name*** (Required)
- Minimum 3 characters, maximum 255
- Use descriptive, searchable names
- Include key features when appropriate
- Example: "Modern Sectional Sofa with Chaise"

**Brand*** (Required)
- Minimum 2 characters, maximum 100
- Use consistent brand names for filtering
- Example: "Herman Miller", "West Elm"

**Short Description*** (Required)
- Minimum 10 characters, maximum 500
- Brief, compelling product summary
- Focus on key selling points
- Example: "Luxurious 3-seater sofa with modular chaise, upholstered in premium Italian leather. Features adjustable headrests and built-in USB charging ports."

#### 2. Pricing

**Price (USD)*** (Required)
- Current selling price
- Must be greater than $0
- Maximum $1,000,000
- Use decimal format: `1299.99`
- Example: `2495.00`

**MSRP (USD)** (Optional)
- Manufacturer's suggested retail price
- Used to calculate discounts
- Should be equal to or higher than Price
- Example: `3199.00`

**Discount Calculation:**
If MSRP is provided, the system automatically calculates and displays the discount percentage:
```
Price: $2,495
MSRP: $3,199
Discount: 22% OFF
```

#### 3. Categorization

**Category*** (Required)
- Select from dropdown list
- Categories are hierarchical (e.g., Furniture > Seating > Sofas)
- Affects product discovery and navigation
- Can be changed later

**Status*** (Required)
- **Draft**: Product not visible to customers (default)
- **In Review**: Submitted for approval
- Use "Draft" for work-in-progress products

#### 4. Product Attributes

These multi-value fields help with filtering and search:

**Tags** (Optional)
- Freeform keywords for search
- Press Enter or comma to add each tag
- Example tags: `bestseller`, `new-arrival`, `sustainable`

**How to add:**
1. Type tag name
2. Press Enter or comma
3. Tag appears as a chip
4. Click × to remove
5. Backspace removes last tag

**Materials** (Optional)
- Physical materials used
- Helps with material-based filtering
- Examples: `Leather`, `Oak`, `Steel`, `Velvet`

**Colors** (Optional)
- Available color options
- Include both general and specific colors
- Examples: `Navy`, `Charcoal Gray`, `Walnut Brown`

**Style Tags** (Optional)
- Design styles and aesthetics
- Used for style-based recommendations
- Examples: `Modern`, `Scandinavian`, `Industrial`, `Mid-Century`

### Best Practices for Creating Products

✅ **Do:**
- Use clear, descriptive product names
- Include accurate pricing information
- Select the most specific category available
- Add relevant materials and colors
- Use style tags consistently
- Create products in "Draft" status initially
- Review before publishing

❌ **Don't:**
- Use ALL CAPS in product names
- Leave required fields empty
- Use vague or generic descriptions
- Duplicate products without reason
- Skip categorization
- Publish immediately without review

### After Creation

Once created, the product:
1. Appears in the catalog with "Draft" status
2. Can be edited immediately via the edit page
3. Won't be visible to customers until published
4. Can be found using filters (status: draft)

**Next Steps:**
1. Click on the product to open the edit page
2. Add detailed description, images, and variants
3. Review validation issues (if any)
4. Publish when ready

---

## Editing Products

### Opening the Product Editor

**From Catalog Page:**
1. Find your product (use search/filters)
2. Click on the product card/row
3. Product editor opens in a new view

**From Quick Actions:**
- Hover over product card
- Click the edit icon (✎)

### Product Editor Overview

The product editor is organized into **5 tabs**:

```
[Details] [Variants] [Media] [SEO] [Advanced]
```

Each tab handles specific aspects of the product. Changes are saved automatically.

### Tab 1: Details

**What's included:**
- Product name, brand, category
- Short and long descriptions
- Pricing (price, MSRP, currency)
- Dimensions (width, height, depth)
- Weight
- Materials, colors, tags
- Style tags
- Customization options

**How to edit:**
1. Click into any field
2. Make your changes
3. Click "Save Changes" or press `Cmd/Ctrl + S`
4. Success toast confirms save

**Validation:**
- Required fields show red border if empty
- Numeric fields validate ranges
- Errors appear below fields

### Tab 2: Variants

**What are variants?**
Variants are different versions of the same product, such as:
- Size variations (Small, Medium, Large)
- Color options (Blue, Red, Green)
- Material choices (Leather, Fabric)
- Configuration combinations (Chaise Left, Chaise Right)

**Viewing Variants:**
- Table shows all variants
- Columns: SKU, Name, Price, Inventory, Status
- Click row to edit
- Use checkboxes for bulk operations

**Creating a Variant:**
1. Click "Add Variant" button
2. Fill in variant details:
   - **SKU**: Unique identifier (required)
   - **Name**: Descriptive name (e.g., "Navy Blue, Large")
   - **Price**: Variant-specific price (optional, inherits from product)
   - **Attributes**: Key-value pairs (e.g., `color: Navy`, `size: Large`)
3. Click "Create Variant"

**Editing Variants:**
1. Click on variant row
2. Update fields in the drawer/modal
3. Save changes

**Deleting Variants:**
1. Select variant checkbox(es)
2. Click "Delete Selected"
3. Confirm deletion

**Best Practices:**
- Use consistent SKU format (e.g., `PROD-001-NVY-LG`)
- Name variants descriptively
- Set variant-specific pricing only if different from base price
- Include all relevant attributes for filtering

### Tab 3: Media

**Supported Media Types:**
- **Images**: JPEG, PNG, WebP (up to 10MB)
- **Videos**: MP4, WebM (up to 100MB)
- **3D Models**: GLB, GLTF (up to 50MB)

**Uploading Images:**
1. Click "Upload Images" or drag and drop
2. Select one or more files
3. Images upload with progress indicator
4. Thumbnails appear once uploaded

**Managing Images:**
- **Reorder**: Drag thumbnails to reorder
- **Set Cover**: Click star icon to set as primary image
- **Edit Alt Text**: Click edit icon, add descriptive text for accessibility
- **Delete**: Click trash icon to remove

**Image Requirements:**
- Minimum resolution: 800x800px
- Recommended: 2000x2000px for zoom functionality
- Aspect ratio: Square (1:1) preferred
- Format: JPEG or PNG
- File size: Under 5MB per image

**Video Guidelines:**
- Length: 15-60 seconds recommended
- Resolution: 1080p (1920x1080) minimum
- Format: MP4 with H.264 encoding
- Include captions for accessibility

**3D Models:**
- Format: GLB (recommended) or GLTF
- Triangle count: Under 100K for optimal performance
- Texture size: 2048x2048 maximum
- Must include textures and materials

**Best Practices:**
- Upload at least 5 high-quality images
- First image is the cover (most important)
- Show product from multiple angles
- Include lifestyle shots
- Add descriptive alt text for all images
- Use consistent lighting and backgrounds

### Tab 4: SEO

Optimize your product for search engines and internal search.

**Meta Title** (Recommended: 50-60 characters)
- Appears in search engine results
- Should include product name and key features
- Example: "Modern Sectional Sofa - Italian Leather | Patina"

**Meta Description** (Recommended: 150-160 characters)
- Brief summary for search results
- Include key benefits and call-to-action
- Example: "Discover our luxurious 3-seater sectional sofa with modular chaise. Premium Italian leather, adjustable headrests, USB charging. Free shipping."

**Search Keywords**
- Comma-separated keywords
- Include synonyms and alternate names
- Example: `sofa, couch, sectional, leather sofa, modular seating`

**URL Slug** (Optional)
- Auto-generated from product name
- Can be customized for SEO
- Use lowercase, hyphens between words
- Example: `modern-sectional-sofa-italian-leather`

**Best Practices:**
- Include target keywords naturally
- Don't keyword stuff
- Write for humans first, search engines second
- Keep meta title under 60 characters
- Make meta description compelling and actionable

### Tab 5: Advanced

Advanced product configuration for power users.

**Product Settings:**
- **Availability Status**: In Stock, Low Stock, Out of Stock, Discontinued
- **Lead Time**: Manufacturing/shipping time (in days)
- **Min/Max Order Quantity**: Limits per order
- **Is Featured**: Appears in featured collections
- **Is Customizable**: Enables customization workflow

**Technical Details:**
- **Has 3D Model**: Indicates 3D asset availability
- **AR Supported**: Enables AR preview
- **Virtual Try-On**: Enables virtual staging

**Vendor Information:**
- **Vendor ID**: Link to vendor/manufacturer
- **Vendor SKU**: Vendor's product identifier
- **Cost**: Wholesale/cost price (admin only)

**Internal Notes:**
- Private notes for admins
- Not visible to customers
- Use for inventory notes, sourcing info, etc.

**Publishing:**
- **Published**: Makes product visible to customers
- **Published At**: Timestamp of publication
- **Unpublish**: Removes from customer view

### Saving Changes

**Auto-Save:**
- Some fields auto-save on blur
- Indicated by "Saved" checkmark

**Manual Save:**
- Click "Save Changes" button
- Keyboard shortcut: `Cmd/Ctrl + S`
- Confirmation toast appears

**Unsaved Changes:**
- Warning appears if you try to leave with unsaved changes
- Click "Save" or "Discard" in the warning dialog

### Validation Issues

Products may have validation issues that prevent publishing:

**Viewing Issues:**
1. Look for validation badge in product card
2. Open product editor
3. Issues appear in a banner at the top
4. Each issue shows:
   - Severity (Error, Warning, Info)
   - Field affected
   - Description
   - Suggested fix

**Resolving Issues:**
1. Read the issue description
2. Navigate to the affected field
3. Make the required changes
4. Save changes
5. Issue disappears once resolved

**Common Issues:**
- Missing required fields (e.g., no images)
- Invalid data format (e.g., negative price)
- Missing category
- Poor SEO (missing meta description)
- Image quality too low

---

## Managing Categories

### Viewing Categories

**From Main Navigation:**
1. Click "Catalog" > "Categories"
2. See hierarchical category tree

**Category Hierarchy:**
```
Furniture
├── Seating
│   ├── Sofas
│   ├── Chairs
│   └── Benches
├── Tables
│   ├── Dining Tables
│   ├── Coffee Tables
│   └── Side Tables
└── Storage
    ├── Cabinets
    ├── Shelving
    └── Wardrobes
```

### Creating Categories

1. Click "Create Category" button
2. Fill in category details:
   - **Name**: Category name (required)
   - **Slug**: URL-friendly identifier
   - **Description**: Category description
   - **Parent Category**: Select to create subcategory
   - **Image**: Category thumbnail
3. Click "Create"

**Best Practices:**
- Use clear, standard naming
- Maintain logical hierarchy (max 4 levels deep)
- Add category descriptions for SEO
- Upload category images for visual navigation

### Editing Categories

1. Click on category in the tree
2. Edit details in the side panel
3. Save changes

**You can:**
- Rename categories
- Change parent (moves in hierarchy)
- Update description and image
- Reorder within parent

### Deleting Categories

**Before deleting:**
- Reassign products to another category
- Cannot delete categories with products

**To delete:**
1. Select category
2. Click "Delete" button
3. Confirm deletion

---

## Bulk Operations

Bulk operations allow you to perform actions on multiple products simultaneously.

### Selecting Products

**Individual Selection:**
- Click checkbox on product card/row
- Click again to deselect
- Selected count appears in toolbar

**Select All on Page:**
- Click checkbox in table header
- Selects all visible products on current page
- Useful for quick operations

**Select All (All Pages):**
- Click "Select all on page"
- Banner appears: "All 20 products on this page are selected"
- Click "Select all X products matching filters"
- Includes products across all pages

**Clear Selection:**
- Click "Clear" in the bulk action toolbar
- Or press `Escape` key

### Bulk Publish

**Purpose:** Make multiple draft products visible to customers

**Steps:**
1. Select products to publish
2. Click "Publish" in bulk action toolbar
3. Review product list in confirmation modal
4. Click "Publish Products"
5. Progress indicator shows operation status
6. Toast notification confirms completion

**Result:**
- Products status changes to "Published"
- Products become visible on storefront
- Search index updated
- Notification sent (if configured)

**Requirements:**
- Products must have no blocking validation errors
- Products must have at least one image
- Products must have valid pricing

**What if some fail?**
- Operation continues for valid products
- Failed products shown in error report
- Specific error message for each failure
- Partial success is acceptable

### Bulk Unpublish

**Purpose:** Remove products from customer view

**Steps:**
1. Select published products
2. Click "Unpublish" in bulk action toolbar
3. **Optional:** Enter unpublish reason
4. Click "Unpublish Products"
5. Confirmation toast appears

**Use Cases:**
- Seasonal products going out of season
- Products needing updates
- Inventory issues
- Quality concerns

**Reason Field:**
The reason helps track why products were unpublished:
- "Out of stock"
- "Seasonal - Summer only"
- "Needs updated images"
- "Price update required"

**Result:**
- Products status changes to "Draft"
- Products removed from storefront
- Search index updated
- Reason logged in audit trail

### Bulk Delete

**⚠️ Warning:** Deletion is permanent and cannot be undone.

**Steps:**
1. Select products to delete
2. Click "Delete" in bulk action toolbar
3. Review the warning message
4. Type "DELETE" to confirm
5. Click "Delete Products"

**What gets deleted:**
- Product record
- All variants
- All images (from storage)
- All metadata
- Search index entries

**What's preserved:**
- Audit logs (deletion is tracked)
- Order history (if product was purchased)

**Best Practices:**
- Use unpublish instead of delete when possible
- Double-check selection before confirming
- Export data before deleting (if needed)
- Consider archiving instead

### Bulk Status Update

**Purpose:** Change product status in bulk

**Available Statuses:**
- Draft
- In Review
- Published
- Archived

**Steps:**
1. Select products
2. Click "Update Status" in bulk action toolbar
3. Choose new status from dropdown
4. Click "Update"

**Use Cases:**
- Move draft products to "In Review" for approval
- Archive old products
- Batch status changes for workflow

### Bulk Operations Limits

**Rate Limits:**
- Maximum 100 products per operation
- Maximum 10 operations per minute
- Cooldown period after large operations

**If limit exceeded:**
- Error message appears
- Operation is blocked
- Wait time shown in seconds
- Retry after cooldown

**Performance Tips:**
- Process in batches of 50 or less
- Allow operations to complete
- Monitor progress in the UI

---

## Filtering and Searching

### Quick Search

**Search Bar:**
- Type to search across:
  - Product names
  - Brand names
  - Descriptions
  - SKUs
  - Tags

**Features:**
- **Auto-complete**: Suggests products as you type
- **Debounced**: Waits 300ms after typing stops
- **Highlights**: Search terms highlighted in results
- **Clear**: Click × to clear search

**Search Syntax:**
```
modern sofa          → Finds products with both words
"modern sofa"        → Exact phrase match
navy OR blue         → Products with either word
sofa -leather        → Sofas excluding leather
brand:herman miller  → Search specific field
```

### Advanced Filters

**Opening Filter Panel:**
- Click "Filters" button in toolbar
- Or press `Cmd/Ctrl + F`
- Drawer slides in from right

**Available Filters:**

#### Status Filter
- Draft
- In Review
- Published
- Archived

Select multiple statuses for OR logic.

#### Category Filter
- Hierarchical tree view
- Select specific categories
- Includes subcategories

#### Brand Filter
- Dropdown of all brands
- Searchable
- Multi-select available

#### Price Range
- Min price slider
- Max price slider
- Input fields for precise values

#### Features
- ☑ Has 3D Model
- ☑ AR Supported
- ☑ Customizable
- ☑ Has Variants

#### Validation
- ☑ Has Validation Issues
- ☑ Errors Only
- ☑ Warnings Only

#### Date Filters
- Created After
- Created Before
- Updated After
- Updated Before
- Published After
- Published Before

**Applying Filters:**
1. Select desired filters
2. Click "Apply Filters"
3. Panel closes
4. Results update
5. Active filters shown as chips

**Filter Chips:**
- Appear below search bar
- Show active filters
- Click × to remove individual filter
- Click "Clear All" to reset

**Saved Filters:**
- Click "Save Filter" after applying
- Name your filter preset
- Access from "Saved Filters" dropdown
- Reuse common filter combinations

**Filter Presets:**
- **Needs Review**: Draft products with validation issues
- **Recently Added**: Products created in last 7 days
- **Low Stock**: Products with inventory below threshold
- **No Images**: Products missing images
- **Unpublished Changes**: Published products with unsaved edits

### Sorting

**Available Sort Fields:**
- Name (A-Z, Z-A)
- Price (Low to High, High to Low)
- Created Date (Newest, Oldest)
- Updated Date (Recent, Oldest)
- Published Date
- Status

**How to Sort:**
1. Click column header (in table view)
2. Or use sort dropdown (in grid/list view)
3. Click again to reverse order
4. Sort direction indicated by arrow

**Default Sort:**
- Created Date (Newest First)
- Customizable in user preferences

---

## Tips & Tricks

### Keyboard Shortcuts

Master these shortcuts for faster catalog management:

**Navigation:**
- `Cmd/Ctrl + K` - Focus search bar
- `Cmd/Ctrl + F` - Open filters
- `Escape` - Close modals/panels
- `←` / `→` - Previous/Next page
- `G + H` - Go to catalog home

**Selection:**
- `Cmd/Ctrl + A` - Select all on page
- `Cmd/Ctrl + D` - Deselect all
- `Shift + Click` - Range select (in table view)

**Actions:**
- `Cmd/Ctrl + S` - Save changes
- `Cmd/Ctrl + N` - Create new product
- `Delete` - Delete selected (with confirmation)

**View:**
- `1` - Grid view
- `2` - List view
- `3` - Table view
- `Cmd/Ctrl + +` - Increase grid size
- `Cmd/Ctrl + -` - Decrease grid size

### Productivity Tips

**1. Use Saved Filters**
- Create filters for common tasks
- Name them descriptively
- Share with team members

**2. Batch Similar Changes**
- Group similar products
- Use bulk operations
- Reduces repetitive work

**3. Template Products**
- Create a "template" product
- Duplicate for similar items
- Pre-fill common fields

**4. Keyboard-First Workflow**
- Learn essential shortcuts
- Tab through form fields
- Use Enter to submit

**5. Customize View Settings**
- Set preferred view mode
- Adjust page size for your screen
- Save sort preferences

**6. Regular Validation Checks**
- Filter by "Has Validation Issues"
- Resolve issues in batches
- Maintains catalog quality

**7. Use Tags Strategically**
- Create tag standards
- Use consistently
- Enables powerful filtering

### Common Workflows

**Weekly Product Upload:**
```
1. Prepare product data in CSV
2. Use bulk import feature
3. Review imported products
4. Fix validation issues
5. Batch publish when ready
```

**Seasonal Updates:**
```
1. Filter by season tag
2. Bulk select seasonal products
3. Update status to Published/Unpublished
4. Update pricing if needed
5. Add seasonal tags
```

**Quality Assurance:**
```
1. Filter: Needs Review
2. Check each product
3. Fix validation issues
4. Verify images and descriptions
5. Publish or send back for edits
```

---

## Troubleshooting

### Common Issues

#### "Failed to load products"

**Possible Causes:**
- Backend service down
- Network connectivity issue
- Authentication expired

**Solutions:**
1. Refresh the page
2. Check network connection
3. Sign out and sign back in
4. Contact support if persists

#### Products not appearing after creation

**Cause:** Products created in "Draft" status

**Solution:**
1. Use filter: Status = Draft
2. Find your product
3. Publish when ready

#### Images not uploading

**Possible Causes:**
- File size too large (>10MB)
- Unsupported format
- Network timeout

**Solutions:**
1. Compress images before upload
2. Use JPEG or PNG format
3. Upload in smaller batches
4. Check file permissions

#### Bulk operation failed

**Possible Causes:**
- Rate limit exceeded
- Some products have validation errors
- Network timeout

**Solutions:**
1. Wait for rate limit cooldown
2. Check error report for specific issues
3. Reduce batch size
4. Fix validation errors first
5. Retry failed items

#### Search not finding product

**Possible Causes:**
- Product is unpublished (draft)
- Search index not updated
- Filters excluding results

**Solutions:**
1. Clear all filters
2. Check product status
3. Wait 60s for index update
4. Use exact product name
5. Try searching by SKU

#### Changes not saving

**Possible Causes:**
- Validation errors
- Network issue
- Session expired

**Solutions:**
1. Check for error messages
2. Fix validation errors
3. Ensure stable network
4. Refresh and try again
5. Copy changes before refreshing

### Getting Help

**Documentation:**
- User Guide (this document)
- API Reference
- FAQ

**Support Channels:**
- Email: support@patina.com
- Slack: #admin-portal
- Help Desk: https://help.patina.com

**Reporting Bugs:**
1. Note what you were trying to do
2. Screenshot any error messages
3. Note browser and OS version
4. Email details to support@patina.com

---

## Appendix

### Product Statuses

| Status | Description | Visible to Customers |
|--------|-------------|---------------------|
| Draft | Work in progress | No |
| In Review | Submitted for approval | No |
| Published | Live on storefront | Yes |
| Archived | Old/discontinued | No |

### Validation Severity Levels

| Level | Icon | Meaning | Blocks Publishing |
|-------|------|---------|-------------------|
| Error | 🔴 | Must be fixed | Yes |
| Warning | 🟡 | Should be fixed | No |
| Info | 🔵 | Informational | No |

### File Size Limits

| Media Type | Maximum Size | Recommended |
|------------|--------------|-------------|
| Images (JPEG/PNG) | 10 MB | 2-5 MB |
| Videos (MP4) | 100 MB | 20-50 MB |
| 3D Models (GLB) | 50 MB | 10-20 MB |

### Best Image Specifications

| Property | Minimum | Recommended | Maximum |
|----------|---------|-------------|---------|
| Resolution | 800x800px | 2000x2000px | 4000x4000px |
| Aspect Ratio | Any | 1:1 (Square) | Any |
| Format | JPEG, PNG | JPEG | JPEG, PNG, WebP |
| DPI | 72 | 150 | 300 |
| Color Space | sRGB | sRGB | sRGB |

---

## Changelog

**Version 1.0** (2025-10-19)
- Initial user guide release
- Complete catalog features documentation
- Comprehensive troubleshooting section

---

**Questions or feedback?** Contact the Platform team at platform@patina.com
