# W0 spike: browser PPTX parse at 100 MB (SQ-351)

**Verdict: GO.** A 95 MB deck goes from file to all crops encoded in **10.7–11.1 s**, with a peak tab (renderer) RSS of **637–681 MiB**. A 143.5 MB deck takes **13.3–13.8 s** and peaks at **772–776 MiB**. The bar is ≤ 60 s and ≤ 1.5 GB for 100 MB, so both decks pass with a lot of headroom. The browser path in Slice 1 stands. The container fallback is not needed, and none was built.

## What ran

- `gen_decks.py` uses python-pptx to build four decks into `$TMPDIR/deck-spike/decks`:
  - Images are high-res JPEGs (1600–3600 px) plus RGBA PNG cut-outs (every sixth image).
  - **Plain pictures** with `srcRect` crops and links on the picture.
  - **Picture-filled shapes** (`p:sp/p:spPr/a:blipFill`, oval and rounded-rect) with crops and links.
  - **Groups scaled to 50 %**, so `chOff/chExt` differ from `off/ext`.
  - **Speaker notes** with URLs, and media reused across slides.
  - A **shuffled `sldIdLst`**, so display order differs from the `slideN.xml` numbering.
  - Each deck writes a ground-truth JSON alongside it.
- `harness/parse.js` is the minimal browser parser:
  - fflate unzip in two passes, filtered:
    1. `presentation.xml`, its rels, the slides and slide rels, and `notesSlides`.
    2. Only the `ppt/media` parts the slides reference.
  - `sldIdLst` walk with `DOMParser`.
  - Extracts pictures and picture-filled shapes, with group transforms, `srcRect`, link and notes.
  - Crops with `createImageBitmap` and OffscreenCanvas, then encodes webp at quality 0.9.
  - Long edge is capped at 2400 to match `BOARD_IMAGE_DISPLAY_MAX_EDGE`. Concurrency is 4.
- `bench.mjs` drives the harness:
  - Headless Chromium through playwright-core 1.58.2, the repo's Playwright version. A fresh browser per run, and the deck is attached with `setInputFiles`.
  - Samples CDP `Runtime.getHeapUsage` (`usedSize` and `backingStorageSize`, which is ArrayBuffers) at ~10 Hz.
  - Samples Chromium process-tree RSS from `ps` at ~7 Hz.
  - Checks every manifest against the ground truth: slide order, picture count, kind, link, crop and bbox (±2 EMU) for every picture, and the notes URL.
- To reproduce, run `bash run.sh` (about 6 minutes). `bash run.sh quick` checks only the 10 MB deck.
  - Chromium cannot start inside the Claude Code Bash sandbox (Mach port `bootstrap_check_in` is denied), so run it unsandboxed.
- Machine and versions: Apple M4 Pro (14 cores, 48 GiB), macOS 27.0, Node 24.12, fflate 0.8.3 (latest), Chromium headless shell 1208.

## Numbers

"manifest s" means the manifest plus all referenced media inflated. "crops done s" means every crop is webp-encoded. Both are timed from the start of the parse, with the `File` already selected. RSS Δ is measured against the idle page, which sits at about 97 MiB.

| deck | MB | slides | pics | strategy | caps | edge | manifest s | crops done s | peak JS heap MiB | peak heap+ArrayBuffers MiB | peak renderer RSS MiB (Δ) | peak Chrome tree RSS MiB | verify |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| deck-10 | 9.5 | 40 | 75 | unzipSync | on | 2400 | 0.1 | 1.7 | 4 | 32 | 354 (+257) | 546 | ok |
| deck-10 | 9.5 | 40 | 75 | unzip | on | 2400 | 0.1 | 1.7 | 4 | 32 | 358 (+261) | 550 | ok |
| deck-10 | 9.5 | 40 | 75 | stream | on | 2400 | 0.1 | 1.7 | 3 | 41 | 374 (+277) | 566 | ok |
| deck-50 | 47.4 | 60 | 113 | unzipSync | on | 2400 | 0.4 | 6.5 | 2 | 99 | 481 (+384) | 680 | ok |
| deck-50 | 47.4 | 60 | 113 | unzip | on | 2400 | 0.4 | 7.5 | 2 | 100 | 501 (+404) | 701 | ok |
| deck-50 | 47.4 | 60 | 113 | stream | on | 2400 | 0.5 | 6.4 | 3 | 101 | 524 (+427) | 723 | ok |
| **deck-100** | **95.0** | 90 | 170 | unzipSync | on | 2400 | 0.7 | **10.8** | 3 | 196 | **637 (+540)** | 829 | ok |
| **deck-100** | **95.0** | 90 | 170 | unzip | on | 2400 | 0.8 | **11.1** | 3 | 197 | **666 (+569)** | 863 | ok |
| **deck-100** | **95.0** | 90 | 170 | stream | on | 2400 | 0.9 | **10.7** | 4 | 201 | **681 (+584)** | 873 | ok |
| deck-150 | 143.5 | 120 | 227 | unzipSync | on | 2400 | 1.1 | 13.6 | 4 | 306 | 776 (+679) | 977 | ok |
| deck-150 | 143.5 | 120 | 227 | unzip | on | 2400 | 1.1 | 13.3 | 3 | 303 | 772 (+675) | 967 | ok |
| deck-150 | 143.5 | 120 | 227 | stream | on | 2400 | 1.3 | 13.8 | 4 | 267 | 776 (+679) | 977 | ok |
| deck-100 | 95.0 | 90 | 170 | unzip | on | **full** | 0.7 | 16.8 | 3 | 197 | 700 (+604) | 899 | ok |
| deck-100-z64 | 95.0 | 90 | 170 | unzipSync | off | 2400 | 0.8 | 11.8 | 3 | 197 | 637 (+540) | 829 | ok |
| deck-100-z64 | 95.0 | 90 | 170 | unzip | off | 2400 | 0.7 | 12.3 | 3 | 198 | 641 (+544) | 833 | ok |
| deck-100-z64 | 95.0 | 90 | 170 | stream | off | 2400 | 0.9 | 12.0 | 4 | 207 | 678 (+581) | 871 | ok |
| deck-100-z64-noloc | 95.0 | 90 | 170 | unzipSync | off | 2400 | — | FAIL: `slide83.xml did not parse` | 2 | 3 | 98 | 286 | fail |
| deck-100-z64-noloc | 95.0 | 90 | 170 | unzip | off | 2400 | — | FAIL: `slide83.xml did not parse` | 2 | 3 | 101 | 290 | fail |
| deck-100-z64-noloc | 95.0 | 90 | 170 | stream | off | 2400 | 0.9 | 10.5 | 4 | 207 | 651 (+554) | 842 | ok |
| deck-100-z64-noloc | 95.0 | 90 | 170 | unzipSync | on | 2400 | — | rejected by cap: `image6.png declares 4294967295` | 2 | 3 | 101 | 290 | refused |

The GPU process stayed flat at 61 MiB in every run. Full JSON is in `$TMPDIR/deck-spike/results.json`.

### What the numbers say

- **Crops dominate the time; parsing does not.** Pass 1 (XML only) takes 14–71 ms, even at 143 MB. The manifest plus media inflate takes ≤ 1.3 s. Decode plus webp encode takes about 60 ms per crop at four in flight.
  - Encoding at full resolution instead of 2400 px costs +52 % time (16.8 s vs 11.1 s) and doubles the webp bytes (33.7 MB vs 15.8 MB). Keep the 2400 cap and encode once at board size.
- **The tab memory is decoded bitmaps and the encoder, not JS.**
  - The JS heap stays at 2–4 MiB.
  - ArrayBuffers peak at about 2× the deck for unzipSync and unzip (archive plus inflated media) and 1× plus media for streaming.
  - Renderer RSS grows by about 4.7 MiB per MB of deck. Projected to 1.5 GB, the ceiling sits at roughly a 300 MB deck on this machine.
- **The three unzip strategies are a wash on time and memory at these sizes.**
  - Streaming holds no archive buffer, but the parser still keeps every referenced media part until it is cropped. Its ArrayBuffer peak is only lower at 150 MB (267 vs 306 MiB), and its renderer RSS is the same.
  - Async `unzip` spawns a worker per inflated file. That made it no faster, and 1 s slower at 50 MB.

## fflate ZIP64 issue #298

- **The synthetic decks do not trigger #298.** The plain python-pptx decks, 150 MB included, have no ZIP64 records at all: 0 entries carry size or offset sentinels, and there is no ZIP64 EOCD. At these sizes a writer has no reason to emit ZIP64.
- **A valid ZIP64 re-pack works with all three strategies** (`deck-100-z64`: ZIP64 extras on every entry over 1 MiB, ZIP64 EOCD and locator present).
- **The #298 layout breaks `unzipSync` and `unzip`, and the failure is silent, not a 4 GiB allocation.**
  - The layout tested is `deck-100-z64-noloc`: `0xFFFFFFFF` sentinels plus ZIP64 extras, and no ZIP64 EOCD locator.
  - 341 of its 387 central-directory entries carry the **offset** sentinel. fflate ignores their ZIP64 extra, reads the local header at the wrong offset, and returns wrong bytes **without throwing**.
  - The first casualty was a slide XML, caught only by our XML parse check.
  - The 4 GiB `new Uint8Array(0xFFFFFFFF)` from the issue would follow in pass 2 for the 18 entries that carry **size** sentinels. Pass 1 failed first.
- **Streaming `Unzip` parses the same file correctly**, because it reads local headers. This matches the issue report.
- **The total-uncompressed cap catches the #298 layout before any inflate.** A sentinel size declares 4 GiB, so the cap rejected the file in 35 ms (last table row).
  - An archive that has only offset sentinels and small sizes would not trip a size cap. Wave 2 should therefore reject sentinels explicitly (see the caps below).
- **Open:** whether PowerPoint, Keynote or Google Slides ever write this layout for decks under 4 GiB is unverified. Check it on the real decks in spike 0(b).

## Recommended caps (Wave 2 `read-package.ts`)

Measured on these decks:
- at most 485 entries;
- declared uncompressed bytes of 1.03× the file size;
- a maximum per-entry ratio of 17.4:1, on slide XML;
- every media entry ≈ 1:1.

| cap | value | why |
|---|---|---|
| input file size | ≤ 250 MB (reject before reading) | 2.5× the target. Projected renderer RSS is ~1.25 GiB here. Matches the research doc's upload ceiling. |
| entry count | ≤ 10 000 | 20× the largest deck measured. A 300-slide deck with layouts is still about 2 000. |
| total declared uncompressed | ≤ 1 GiB, summed over **all** central-directory entries, checked in the `filter` before inflating | About 4× the input cap. It also rejects any `0xFFFFFFFF` size sentinel (#298). |
| per-entry ratio | ≤ 100:1 for entries ≥ 1 MiB | XML measured 12–17:1 and media ~1:1. Small XML parts are exempt because repeated markup compresses well. |
| ZIP64 sentinel | reject any entry whose `size` or `originalSize` is `0xFFFFFFFF`, and any archive whose central directory has ZIP64 extras without a ZIP64 EOCD locator | Closes #298, including the offset-only variant that size caps miss. Show the user a "re-save the deck" message, not a generic error. |
| decoded image | the existing 32 MP guard, read from the image header before `createImageBitmap` | Not exercised by this spike. The largest image was 8.6 MP. |

## Recommended unzip strategy for Wave 2

- **Unzip.** Use `unzipSync` with a `filter`, inside a dedicated Web Worker, in two passes: XML, then the referenced media.
  - It reads the central directory, which is authoritative. Streaming trusts local headers, which differ from the central directory in crafted zips, and cannot handle stored entries that use data descriptors.
  - It is the fastest or tied at every size, and the simplest code.
  - Running in a worker keeps the main thread free during the ~1 s inflate. Media bytes transfer to the crop stage.
- **Caps and #298.** Apply the caps above inside the filter, before anything inflates. The sentinel guard turns the #298 corruption into a clear refusal.
- **Fallback.** Add a streaming `Unzip` fallback only if real decks turn out to carry the #298 layout.
- **Memory headroom.** If needed, lower the peak by inflating and cropping one media part at a time instead of holding all media until crops start. That is not needed for the bar.

## Caveats

- **One fast desktop.** Expect a mid-range Windows laptop to take 2–4× longer on crops. That is still inside 60 s at 100 MB on this evidence, but measure it again on low-end hardware in the Slice 1 gate.
- **RSS on macOS** is resident pages and excludes compressed memory, so it is a floor for "tab memory". The CDP heap figures do not include decoded bitmaps.
- **Synthetic decks.** No EMF/WMF, tables, placeholders without `xfrm`, rotation or flip, `mc:AlternateContent`, or Keynote/Google exports. The parser skips or ignores those, as Slice 1 already plans. Negative `srcRect` (padding) is clamped to 0.
- **Uploads not measured.** The crops are encoded and then dropped. Uploading through `uploadFilesAsBoardItems` is not part of these numbers.
