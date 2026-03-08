# E2E Test Fixtures

This directory contains test files for end-to-end tests.

## Required Test Images

For the media upload E2E tests, you need the following test images:

### 1. test-image.jpg
- **Size**: ~100KB
- **Dimensions**: 1200x1200px
- **Format**: JPEG
- **Purpose**: Basic upload test

### 2. image1.jpg, image2.jpg, image3.jpg
- **Size**: ~100-200KB each
- **Dimensions**: 1200x1200px or similar
- **Format**: JPEG
- **Purpose**: Batch upload test

### 3. test.txt
- **Size**: Any
- **Format**: Plain text
- **Purpose**: Test invalid file type rejection

## Creating Test Images

You can create test images using:

1. **ImageMagick**:
```bash
# Create a test JPEG image
convert -size 1200x1200 xc:blue test-image.jpg

# Create batch test images
convert -size 1200x1200 xc:red image1.jpg
convert -size 1200x1200 xc:green image2.jpg
convert -size 1200x1200 xc:yellow image3.jpg
```

2. **Online Tools**:
- Use https://placeholder.com/ to generate test images
- Download and save to this directory

3. **Manual**:
- Create simple images in any image editor
- Save as JPEG with dimensions around 1200x1200px
- Keep file size under 1MB for test performance

## Text File for Negative Test

```bash
echo "This is a test text file" > test.txt
```

## Directory Structure

```
e2e/fixtures/
├── README.md           # This file
├── test-image.jpg      # Single upload test
├── image1.jpg          # Batch upload test
├── image2.jpg          # Batch upload test
├── image3.jpg          # Batch upload test
└── test.txt            # Invalid file type test
```

## Notes

- Test images should be small for fast test execution
- Images are not committed to git (add to .gitignore if needed)
- Each developer should generate their own test images
- Tests will skip if fixtures are missing
