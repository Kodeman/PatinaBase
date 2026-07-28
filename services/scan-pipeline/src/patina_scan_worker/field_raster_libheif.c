/* Field raster helper — HEIC to canonical P6, at a DECLARED raster profile.
 *
 * Protocol (v3):
 *
 *   field-raster-libheif INPUT.heic OUTPUT.ppm DECLARED_WIDTH DECLARED_HEIGHT
 *
 * The encoded raster size is a parameter of the protocol, not a constant of
 * this program.  Before R118 it was two #defines pinned to the 360x640 debug
 * fixture, which meant production Field keyframes (1440x1920) were refused at
 * the first frame.  The dimensions now arrive on argv, are parsed with the
 * same suspicion as any other untrusted input, are bounded per axis and in
 * product, and are echoed back on stdout as ``declared_width``/
 * ``declared_height`` so the parent can prove the helper was told the same
 * profile the parent declared rather than inferring one from the file.
 *
 * Editing this file changes QUALIFIED_HELPER_SOURCE_SHA256 in
 * field_raster_materializer.py, install.sh, and install-path-guard.py, and by
 * construction invalidates the I92 physical-device receipt.
 */

#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <fcntl.h>
#include <libheif/heif.h>
#include <libheif/heif_properties.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#ifndef O_CLOEXEC
#define O_CLOEXEC 0
#endif
#ifndef O_NOFOLLOW
#define O_NOFOLLOW 0
#endif

/* Per-axis ceiling on any dimension this helper will accept or decode.  This
 * is the same 4096 the Python side already applies to every dimension the
 * helper reports (_metadata_positive_int), so a declaration can never describe
 * a raster the parent would refuse to read back.  It clears the shipped
 * capture profile (1440x1920) on both axes with better than 2x headroom. */
#define MAX_DIMENSION 4096
#define MAX_HEVC_DECODERS 32
#define MAX_HEIC_BYTES (32U * 1024U * 1024U)
/* Ceiling on the P6 payload a declared profile may imply.  128 MiB is the same
 * number twice over in this program: RefineMaterializationLimits
 * .max_raster_bytes, which _preflight_raster_sizes enforces per frame before
 * any decode, and NATIVE_CHILD_MAX_PINNED_FILE_BYTES, which the frozen child
 * enforces per pinned file.  A raster above it cannot survive either seam, so
 * decoding one would only buy an allocation nothing downstream can use. */
#define MAX_PPM_BYTES (128U * 1024U * 1024U)

struct rgb_raster {
  int width;
  int height;
  size_t size;
  uint8_t *pixels;
};

/* Parse one declared raster dimension out of argv.
 *
 * The declaration is a protocol parameter supplied by the caller, so it is
 * validated exactly: bare ASCII decimal digits, no sign, no leading zero, no
 * whitespace, no trailing text, and inside [1, MAX_DIMENSION].  strtol is
 * deliberately not used — it accepts leading whitespace and a sign, which
 * would let "  +360" and "360" describe the same profile under two spellings.
 */
static int parse_declared_dimension(const char *text, const char *label,
                                    int *value) {
  if (text == NULL) {
    fprintf(stderr, "declared %s is missing\n", label);
    return 1;
  }
  const size_t length = strlen(text);
  if (length < 1 || length > 4 || text[0] == '0') {
    fprintf(stderr, "declared %s is not a bounded decimal literal\n", label);
    return 1;
  }
  long parsed = 0;
  for (size_t index = 0; index < length; ++index) {
    if (text[index] < '0' || text[index] > '9') {
      fprintf(stderr, "declared %s is not a bounded decimal literal\n", label);
      return 1;
    }
    parsed = parsed * 10 + (text[index] - '0');
  }
  if (parsed < 1 || parsed > MAX_DIMENSION) {
    fprintf(stderr, "declared %s %ld is outside [1, %d]\n", label, parsed,
            MAX_DIMENSION);
    return 1;
  }
  *value = (int)parsed;
  return 0;
}

static int report_heif_error(const char *operation, struct heif_error error) {
  fprintf(stderr, "%s failed (code=%d subcode=%d): %s\n", operation,
          error.code, error.subcode,
          error.message == NULL ? "unknown libheif error" : error.message);
  return 1;
}

static int write_all(int descriptor, const uint8_t *payload, size_t size) {
  size_t offset = 0;
  while (offset < size) {
    ssize_t written = write(descriptor, payload + offset, size - offset);
    if (written < 0) {
      if (errno == EINTR) {
        continue;
      }
      return -1;
    }
    if (written == 0) {
      errno = EIO;
      return -1;
    }
    offset += (size_t)written;
  }
  return 0;
}

static int read_input_file(const char *path, uint8_t **payload, size_t *size) {
  int descriptor =
      open(path, O_RDONLY | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK);
  if (descriptor < 0) {
    fprintf(stderr, "could not open private HEIC input: %s\n", strerror(errno));
    return 1;
  }

  int failed = 0;
  struct stat metadata;
  if (fstat(descriptor, &metadata) != 0 || !S_ISREG(metadata.st_mode) ||
      metadata.st_size < 12 ||
      (uintmax_t)metadata.st_size > (uintmax_t)MAX_HEIC_BYTES) {
    fprintf(stderr, "private HEIC input is not a bounded regular file\n");
    failed = 1;
  }

  uint8_t *buffer = NULL;
  size_t expected_size = 0;
  if (!failed) {
    expected_size = (size_t)metadata.st_size;
    buffer = malloc(expected_size);
    if (buffer == NULL) {
      fprintf(stderr, "could not allocate private HEIC input buffer\n");
      failed = 1;
    }
  }

  size_t offset = 0;
  while (!failed && offset < expected_size) {
    const ssize_t count = read(descriptor, buffer + offset, expected_size - offset);
    if (count < 0 && errno == EINTR) {
      continue;
    }
    if (count <= 0) {
      fprintf(stderr, "could not read complete private HEIC input\n");
      failed = 1;
      break;
    }
    offset += (size_t)count;
  }
  uint8_t trailing_byte = 0;
  ssize_t trailing_count = 0;
  do {
    trailing_count = read(descriptor, &trailing_byte, 1);
  } while (!failed && trailing_count < 0 && errno == EINTR);
  if (!failed && trailing_count != 0) {
    fprintf(stderr, "private HEIC input changed while it was read\n");
    failed = 1;
  }
  if (close(descriptor) != 0) {
    fprintf(stderr, "could not close private HEIC input: %s\n", strerror(errno));
    failed = 1;
  }
  if (failed) {
    free(buffer);
    return 1;
  }
  *payload = buffer;
  *size = expected_size;
  return 0;
}

static int copy_interleaved_rgb(const struct heif_image *image,
                                struct rgb_raster *raster) {
  int stride = 0;
  const uint8_t *plane =
      heif_image_get_plane_readonly(image, heif_channel_interleaved, &stride);
  raster->width =
      heif_image_get_width(image, heif_channel_interleaved);
  raster->height =
      heif_image_get_height(image, heif_channel_interleaved);
  if (plane == NULL ||
      heif_image_get_colorspace(image) != heif_colorspace_RGB ||
      heif_image_get_chroma_format(image) != heif_chroma_interleaved_RGB ||
      heif_image_get_bits_per_pixel(image, heif_channel_interleaved) != 24 ||
      heif_image_get_bits_per_pixel_range(image, heif_channel_interleaved) != 8 ||
      raster->width <= 0 || raster->height <= 0 ||
      raster->width > MAX_DIMENSION || raster->height > MAX_DIMENSION ||
      stride < raster->width * 3) {
    fprintf(stderr, "libheif returned an invalid interleaved RGB plane\n");
    return 1;
  }
  if ((size_t)raster->width > SIZE_MAX / 3U ||
      (size_t)raster->height >
          SIZE_MAX / ((size_t)raster->width * 3U)) {
    fprintf(stderr, "libheif RGB dimensions overflow size_t\n");
    return 1;
  }
  raster->size = (size_t)raster->width * (size_t)raster->height * 3U;
  raster->pixels = malloc(raster->size);
  if (raster->pixels == NULL) {
    fprintf(stderr, "could not allocate RGB raster\n");
    return 1;
  }
  const size_t row_size = (size_t)raster->width * 3U;
  for (int y = 0; y < raster->height; ++y) {
    memcpy(raster->pixels + (size_t)y * row_size,
           plane + (size_t)y * (size_t)stride, row_size);
  }
  return 0;
}

static int write_ppm(const char *path, const struct rgb_raster *raster) {
  int descriptor = open(path, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC |
                                  O_NOFOLLOW,
                        S_IRUSR | S_IWUSR);
  if (descriptor < 0) {
    fprintf(stderr, "could not create scratch PPM: %s\n", strerror(errno));
    return 1;
  }

  char header[64];
  int header_size = snprintf(header, sizeof(header), "P6\n%d %d\n255\n",
                             raster->width, raster->height);
  int failed = 0;
  if (header_size <= 0 || (size_t)header_size >= sizeof(header) ||
      write_all(descriptor, (const uint8_t *)header, (size_t)header_size) != 0 ||
      write_all(descriptor, raster->pixels, raster->size) != 0 ||
      fsync(descriptor) != 0) {
    fprintf(stderr, "could not write scratch PPM: %s\n", strerror(errno));
    failed = 1;
  }
  if (close(descriptor) != 0) {
    fprintf(stderr, "could not close scratch PPM: %s\n", strerror(errno));
    failed = 1;
  }
  if (failed) {
    (void)unlink(path);
  }
  return failed;
}

int main(int argc, char **argv) {
  if (argc != 5) {
    fprintf(stderr,
            "usage: field-raster-libheif INPUT.heic OUTPUT.ppm WIDTH HEIGHT\n");
    return 2;
  }

  int declared_width = 0;
  int declared_height = 0;
  if (parse_declared_dimension(argv[3], "width", &declared_width) != 0 ||
      parse_declared_dimension(argv[4], "height", &declared_height) != 0) {
    return 2;
  }
  /* Bound the product as well as each axis.  MAX_DIMENSION alone already caps
   * the P6 payload at 4096*4096*3 = 48 MiB, comfortably inside MAX_PPM_BYTES,
   * so today this check never fires — it is what keeps the byte guarantee true
   * if the per-axis ceiling is ever raised, and it names the real downstream
   * limit rather than leaving it implied by an axis count. */
  if ((uint64_t)declared_width * (uint64_t)declared_height * 3U >
      (uint64_t)MAX_PPM_BYTES) {
    fprintf(stderr, "declared %dx%d raster exceeds the %u-byte P6 ceiling\n",
            declared_width, declared_height, MAX_PPM_BYTES);
    return 2;
  }

  int status = 1;
  int libheif_initialized = 0;
  struct heif_context *context = NULL;
  struct heif_image_handle *handle = NULL;
  struct heif_decoding_options *raw_options = NULL;
  struct heif_decoding_options *default_options = NULL;
  struct heif_image *raw_image = NULL;
  struct heif_image *default_image = NULL;
  uint8_t *encoded_bytes = NULL;
  size_t encoded_size = 0;
  struct rgb_raster raw = {0, 0, 0, NULL};
  struct rgb_raster transformed = {0, 0, 0, NULL};

  if (read_input_file(argv[1], &encoded_bytes, &encoded_size) != 0) {
    goto cleanup;
  }
  const char *input_mime_type =
      heif_get_file_mime_type(encoded_bytes, (int)encoded_size);
  if (input_mime_type == NULL || strcmp(input_mime_type, "image/heic") != 0) {
    fprintf(stderr, "Field fixture input must be HEIF using HEVC compression\n");
    goto cleanup;
  }

  struct heif_error error = heif_init(NULL);
  if (error.code != heif_error_Ok) {
    status = report_heif_error("heif_init", error);
    goto cleanup;
  }
  libheif_initialized = 1;
  const int decoder_descriptor_count =
      heif_get_decoder_descriptors(heif_compression_HEVC, NULL, 0);
  if (decoder_descriptor_count <= 0 ||
      decoder_descriptor_count > MAX_HEVC_DECODERS) {
    fprintf(stderr, "libheif reported an invalid HEVC decoder count: %d\n",
            decoder_descriptor_count);
    goto cleanup;
  }
  const struct heif_decoder_descriptor
      *decoder_descriptors[MAX_HEVC_DECODERS] = {NULL};
  const int returned_decoder_descriptors = heif_get_decoder_descriptors(
      heif_compression_HEVC, decoder_descriptors, decoder_descriptor_count);
  if (returned_decoder_descriptors != decoder_descriptor_count) {
    fprintf(stderr, "libheif HEVC decoder enumeration changed during probe\n");
    goto cleanup;
  }
  const char *selected_decoder_id = NULL;
  const char *selected_decoder_name = NULL;
  int matching_decoder_descriptor_count = 0;
  for (int index = 0; index < returned_decoder_descriptors; ++index) {
    const char *candidate_id =
        heif_decoder_descriptor_get_id_name(decoder_descriptors[index]);
    if (candidate_id != NULL && strcmp(candidate_id, "libde265") == 0) {
      selected_decoder_id = candidate_id;
      selected_decoder_name =
          heif_decoder_descriptor_get_name(decoder_descriptors[index]);
      ++matching_decoder_descriptor_count;
    }
  }
  if (matching_decoder_descriptor_count != 1 || selected_decoder_id == NULL ||
      selected_decoder_name == NULL ||
      strchr(selected_decoder_name, '\n') != NULL ||
      strchr(selected_decoder_name, '\r') != NULL) {
    fprintf(stderr,
            "exactly one available HEVC decoder descriptor must be libde265\n");
    goto cleanup;
  }
  context = heif_context_alloc();
  if (context == NULL) {
    fprintf(stderr, "could not allocate libheif context\n");
    goto cleanup;
  }
  error = heif_context_read_from_memory_without_copy(
      context, encoded_bytes, encoded_size, NULL);
  if (error.code != heif_error_Ok) {
    status = report_heif_error("heif_context_read_from_memory_without_copy", error);
    goto cleanup;
  }
  if (heif_context_get_number_of_top_level_images(context) != 1) {
    fprintf(stderr, "Field fixture HEIC must contain exactly one top-level image\n");
    goto cleanup;
  }
  error = heif_context_get_primary_image_handle(context, &handle);
  if (error.code != heif_error_Ok) {
    status = report_heif_error("heif_context_get_primary_image_handle", error);
    goto cleanup;
  }
  const int metadata_blocks =
      heif_image_handle_get_number_of_metadata_blocks(handle, NULL);
  if (metadata_blocks != 0) {
    fprintf(stderr,
            "Field fixture HEIC contains %d unqualified metadata blocks\n",
            metadata_blocks);
    goto cleanup;
  }

  const int ispe_width = heif_image_handle_get_ispe_width(handle);
  const int ispe_height = heif_image_handle_get_ispe_height(handle);
  const int presented_width = heif_image_handle_get_width(handle);
  const int presented_height = heif_image_handle_get_height(handle);
  if (ispe_width != declared_width || ispe_height != declared_height ||
      presented_width != declared_width ||
      presented_height != declared_height || ispe_width > MAX_DIMENSION ||
      ispe_height > MAX_DIMENSION) {
    fprintf(stderr,
            "libheif handle/ispe dimensions do not match the declared %dx%d "
            "profile\n",
            declared_width, declared_height);
    goto cleanup;
  }
  const int transformation_properties =
      heif_item_get_transformation_properties(
          context, heif_image_handle_get_item_id(handle), NULL, 0);
  if (transformation_properties != 1) {
    fprintf(stderr,
            "HEIC must contain exactly one identity irot property; found %d "
            "crop/rotation/mirror properties\n",
            transformation_properties);
    goto cleanup;
  }
  heif_property_id transformation_property_id = 0;
  const int returned_transformation_properties =
      heif_item_get_transformation_properties(
          context, heif_image_handle_get_item_id(handle),
          &transformation_property_id, 1);
  if (returned_transformation_properties != 1 ||
      transformation_property_id == 0) {
    fprintf(stderr,
            "libheif transformation-property enumeration changed during "
            "probe\n");
    goto cleanup;
  }
  const enum heif_item_property_type transformation_property_type =
      heif_item_get_property_type(
          context, heif_image_handle_get_item_id(handle),
          transformation_property_id);
  if (transformation_property_type !=
      heif_item_property_type_transform_rotation) {
    fprintf(stderr,
            "HEIC transform property must be exactly one identity irot\n");
    goto cleanup;
  }
  const int transformation_rotation_ccw =
      heif_item_get_property_transform_rotation_ccw(
          context, heif_image_handle_get_item_id(handle),
          transformation_property_id);
  if (transformation_rotation_ccw != 0) {
    fprintf(stderr,
            "HEIC irot property must be identity; rotation_ccw=%d\n",
            transformation_rotation_ccw);
    goto cleanup;
  }

  raw_options = heif_decoding_options_alloc();
  default_options = heif_decoding_options_alloc();
  if (raw_options == NULL || default_options == NULL ||
      raw_options->version < 4 || default_options->version < 4) {
    fprintf(stderr,
            "libheif decoding options do not expose strict no-transform decode\n");
    goto cleanup;
  }
  raw_options->ignore_transformations = 1;
  raw_options->strict_decoding = 1;
  raw_options->decoder_id = selected_decoder_id;
  default_options->strict_decoding = 1;
  default_options->decoder_id = selected_decoder_id;
  error = heif_decode_image(handle, &raw_image, heif_colorspace_RGB,
                            heif_chroma_interleaved_RGB, raw_options);
  if (error.code != heif_error_Ok) {
    status = report_heif_error("raw heif_decode_image", error);
    goto cleanup;
  }
  error = heif_decode_image(handle, &default_image, heif_colorspace_RGB,
                            heif_chroma_interleaved_RGB, default_options);
  if (error.code != heif_error_Ok) {
    status = report_heif_error("default heif_decode_image", error);
    goto cleanup;
  }
  if (copy_interleaved_rgb(raw_image, &raw) != 0 ||
      copy_interleaved_rgb(default_image, &transformed) != 0) {
    goto cleanup;
  }
  if (raw.width != ispe_width || raw.height != ispe_height) {
    fprintf(stderr, "raw decode dimensions do not match the ispe dimensions\n");
    goto cleanup;
  }
  if (transformed.width != raw.width || transformed.height != raw.height ||
      transformed.size != raw.size ||
      memcmp(transformed.pixels, raw.pixels, raw.size) != 0) {
    fprintf(stderr,
            "HEIC contains a hidden crop/rotation/mirror transformation\n");
    goto cleanup;
  }
  if (write_ppm(argv[2], &raw) != 0) {
    goto cleanup;
  }

  printf("schema=patina-field-raster-libheif-helper-v3\n");
  printf("libheif_version=%s\n", heif_get_version());
  printf("decoder_id=%s\n", selected_decoder_id);
  printf("decoder_name=%s\n", selected_decoder_name);
  printf("decoder_descriptor_count=%d\n", decoder_descriptor_count);
  printf("matching_decoder_descriptor_count=%d\n",
         matching_decoder_descriptor_count);
  printf("input_mime_type=%s\n", input_mime_type);
  printf("top_level_images=1\n");
  printf("metadata_blocks=0\n");
  printf("transformation_properties=1\n");
  printf("transformation_property_type=irot\n");
  printf("transformation_rotation_ccw=%d\n", transformation_rotation_ccw);
  /* Echo the declaration back so the parent binds the profile it asked for to
   * the profile this run actually enforced, instead of trusting argv silently
   * reached a helper that still had a size compiled into it. */
  printf("declared_width=%d\n", declared_width);
  printf("declared_height=%d\n", declared_height);
  printf("ispe_width=%d\n", ispe_width);
  printf("ispe_height=%d\n", ispe_height);
  printf("presented_width=%d\n", presented_width);
  printf("presented_height=%d\n", presented_height);
  printf("raw_width=%d\n", raw.width);
  printf("raw_height=%d\n", raw.height);
  printf("default_width=%d\n", transformed.width);
  printf("default_height=%d\n", transformed.height);
  printf("raw_default_rgb_identical=1\n");
  status = 0;

cleanup:
  free(transformed.pixels);
  free(raw.pixels);
  if (default_image != NULL) {
    heif_image_release(default_image);
  }
  if (raw_image != NULL) {
    heif_image_release(raw_image);
  }
  if (raw_options != NULL) {
    heif_decoding_options_free(raw_options);
  }
  if (default_options != NULL) {
    heif_decoding_options_free(default_options);
  }
  if (handle != NULL) {
    heif_image_handle_release(handle);
  }
  if (context != NULL) {
    heif_context_free(context);
  }
  free(encoded_bytes);
  if (libheif_initialized) {
    heif_deinit();
  }
  return status;
}
