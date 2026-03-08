# Variant Management - Quick Start Guide

## 5-Minute Setup

### 1. Access the Feature

Navigate to any product in the catalog:
```
Admin Portal → Catalog → [Select Product] → Variants Tab
```

### 2. Add Your First Variant

**Method 1: Manual Entry**
1. Click **"Add Variant"** button
2. Fill in the required fields:
   - **SKU**: `PROD-001-RED` (required)
   - **Name**: `Red Large Variant` (optional)
   - **Price**: `99.99` (optional)
   - **Stock**: `10` (optional)
   - **Options**: `{"color": "Red", "size": "Large"}` (required)
3. Click **Save** or press `Cmd+Enter`

**Method 2: CSV Import**
1. Click **"Import CSV"** button
2. Upload a CSV file with this format:
   ```csv
   SKU,Name,Price,Quantity,Availability Status,Options
   PROD-001-RED,Red Large,99.99,10,in_stock,"{""color"":""Red""}"
   PROD-001-BLUE,Blue Large,99.99,15,in_stock,"{""color"":""Blue""}"
   ```
3. Click **"Import"**

### 3. Edit a Variant

1. Hover over any variant row
2. Click the **Edit** icon
3. Modify any field
4. Click **Save** or press `Cmd+Enter`

### 4. Delete a Variant

1. Hover over any variant row
2. Click the **Delete** icon
3. Confirm deletion

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Save | `Cmd+Enter` (Mac) / `Ctrl+Enter` (Windows) |
| Cancel | `Escape` |

---

## Field Reference

| Field | Type | Required | Validation | Example |
|-------|------|----------|------------|---------|
| **SKU** | Text | ✅ Yes | Max 100 chars, must be unique | `PROD-001-RED-L` |
| **Name** | Text | No | — | `Red Large Variant` |
| **Barcode** | Text | No | — | `123456789012` |
| **Price** | Number | No | ≥ 0 | `99.99` |
| **Quantity** | Integer | No | ≥ 0 | `10` |
| **Availability** | Select | No | Predefined values | `in_stock` |
| **Options** | JSON | ✅ Yes | Valid JSON object | `{"color": "Red"}` |

---

## Availability Status Options

- `in_stock` - Available now
- `out_of_stock` - Temporarily unavailable
- `preorder` - Available for pre-order
- `backorder` - Available on backorder
- `discontinued` - No longer available

---

## CSV Format Cheat Sheet

### Minimal CSV
```csv
SKU,Options
PROD-001,"{""color"":""Red""}"
```

### Complete CSV
```csv
SKU,Name,Barcode,Price,Quantity,Availability Status,Options
PROD-001-RED,Red Variant,123456789,99.99,10,in_stock,"{""color"":""Red"",""size"":""L""}"
```

### JSON Options Formatting

**Correct**:
```csv
"{""color"":""Red"",""size"":""Large""}"
```

**Incorrect**:
```csv
{"color":"Red","size":"Large"}  ❌ Missing quotes
'{color: Red}'                   ❌ Single quotes
```

---

## Common Workflows

### Workflow 1: Add Multiple Variants

**Best for**: Creating 5+ variants at once

1. Click **"Export CSV"** to get template (if existing variants)
2. Open in Excel/Google Sheets
3. Add new rows
4. Save as CSV (UTF-8 encoding)
5. Click **"Import CSV"**
6. Select file and import

**Time**: ~2 minutes for 20 variants

### Workflow 2: Quick Single Variant

**Best for**: Adding 1-4 variants

1. Click **"Add Variant"**
2. Enter SKU and options
3. `Cmd+Enter` to save
4. Repeat as needed

**Time**: ~30 seconds per variant

### Workflow 3: Update Pricing

**Best for**: Updating prices across variants

1. Click **"Export CSV"**
2. Update Price column in spreadsheet
3. **Delete all rows except those you want to update**
4. Change SKUs to existing SKUs
5. Import (will update existing variants)

**Time**: ~1 minute for 50 variants

---

## Validation Quick Reference

### ✅ Valid Examples

```json
// SKU
"PROD-001"
"SKU-ABC-123"
"variant_red_large"

// Price
99.99
0
1000.50

// Quantity
0
10
9999

// Options
{"color": "Red"}
{"color": "Red", "size": "Large", "material": "Cotton"}
{}
```

### ❌ Invalid Examples

```json
// SKU
""                  // Empty
[too long > 100]    // Exceeds max length

// Price
-10                 // Negative
"99.99"             // String instead of number

// Quantity
-5                  // Negative
3.5                 // Not an integer

// Options
{color: Red}        // Invalid JSON (missing quotes)
"color: Red"        // Not an object
```

---

## Troubleshooting

### Issue: "SKU is required" error
**Fix**: Enter a SKU value before saving

### Issue: "SKU already exists"
**Fix**: Use a unique SKU or edit the existing variant

### Issue: CSV import shows "0 variants imported"
**Fix**:
- Check CSV has correct headers
- Ensure at least SKU column is filled
- Verify file is .csv format (not .xlsx)

### Issue: Changes revert after saving
**Fix**:
- Check browser console for errors
- Verify backend service is running
- Try again (may be network issue)

### Issue: Can't see Edit/Delete buttons
**Fix**: Hover over the variant row to reveal buttons

---

## Pro Tips

1. **SKU Naming Convention**: Use a consistent pattern like `PRODUCT-OPTION1-OPTION2`
   ```
   SOFA-RED-L
   SOFA-RED-M
   SOFA-BLUE-L
   ```

2. **Options Organization**: Keep option keys consistent across all variants
   ```json
   // Good
   {"color": "Red", "size": "L"}
   {"color": "Blue", "size": "L"}

   // Avoid
   {"colour": "Red", "Size": "L"}  // Inconsistent capitalization
   ```

3. **Batch Operations**: For bulk updates, export → modify → import is faster than inline editing

4. **Price Strategy**: Leave price empty to inherit from base product price

5. **Stock Management**: Set quantity to 0 instead of deleting variants to maintain history

---

## Next Steps

After mastering the basics:

1. Read the [Full Guide](./VARIANT_MANAGEMENT_GUIDE.md) for advanced features
2. Explore keyboard shortcuts for faster editing
3. Set up variant templates (coming soon)
4. Integrate with inventory management (coming soon)

---

**Need Help?** Check the [Complete Guide](./VARIANT_MANAGEMENT_GUIDE.md) or review the [Test Suite](./src/components/catalog/__tests__/variant-editor.test.tsx) for examples.
