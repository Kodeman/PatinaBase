// PLY → SPZ **format version 3**, for a viewer that cannot read version 4.
//
// Niantic's own `cli_tools/src/ply_to_spz.cpp` constructs a default
// `spz::PackOptions`, whose `version` field is `LATEST_SPZ_HEADER_VERSION` — 4
// at the pinned v3.0.0 tag. `@sparkjsdev/spark` 2.1.0, the portal's reader,
// rejects anything outside 1–3 and opens every file through a gunzip reader.
// Those two facts are incompatible, and 2.1.0 is the newest published Spark, so
// the pipeline is the side that has to move. See W2-EVIDENCE.md §10b fault 2.
//
// Version 3 is not a downgrade in fidelity: `MIN_SMALLEST_THREE_QUATERNIONS_VERSION`
// is 3, so v3 carries the same smallest-three rotation encoding v4 does. What
// changes is only the container — `saveSpz` takes its `o.version < MIN_ZSTD_SPZ_HEADER_VERSION`
// branch, writing the 16-byte legacy header plus one gzip stream instead of the
// 32-byte NGSP header plus ZSTD streams.
//
// Kept as a separate binary rather than a patch to the vendored file: the spz
// checkout is pinned by commit and asserted by SHA in `_SPLAT_IMAGE`, and
// "we built these bytes" should stay true of everything under /opt/spz-src.

#include <iostream>

#include "cc/load-spz.h"

int main(int argc, char *argv[]) {
  if (argc < 3) {
    std::cerr << "Usage: ply_to_spz_v3 <input.ply> <output.spz>" << std::endl;
    return 1;
  }

  try {
    spz::UnpackOptions unpack_options;
    spz::GaussianCloud splat = spz::loadSplatFromPly(argv[1], unpack_options);

    spz::PackOptions pack_options;
    pack_options.version = 3;

    // `saveSpz` reports failure by return value, not by throwing; the stock CLI
    // ignores it and exits 0 over a file it never wrote.
    if (!spz::saveSpz(splat, pack_options, std::string(argv[2]))) {
      std::cerr << "Error: saveSpz failed writing " << argv[2] << std::endl;
      return 1;
    }
    return 0;
  } catch (const std::exception &e) {
    std::cerr << "Error: " << e.what() << std::endl;
    return 1;
  }
}
