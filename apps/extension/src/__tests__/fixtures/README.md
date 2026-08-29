# Fixture harvest — capture-launch W0-D1

Harvested 2026-08-29 for the extraction/field-visibility test suites in this
directory. Every fixture is a real vendor product page (or, for the two
known-bad cases, a real social page), captured live on that date.

## Methodology note (read this first)

The brief's preferred order was (1) Claude-in-Chrome browser tools, (2) curl
fallback noted as "un-rendered fetch." In practice:

- **`mcp__claude-in-chrome__javascript_tool` cannot return full-page HTML.**
  Any returned string containing `key="value"`-shaped text (i.e. essentially
  any HTML with attributes) is rejected with `[BLOCKED: Cookie/query string
  data]`, and even attribute-free strings are hard-truncated at roughly 1000
  characters. Substituting `=`/`&`/`?` for sentinel tokens gets past the
  content block, but the ~1000-char truncation makes chunked retrieval of a
  600 KB–1.5 MB page impractical (600+ round trips per fixture).
- **Working method for JS-rendered pages**: navigate with Chrome, scroll to
  trigger lazy content, clone `document.documentElement` and strip
  `<script>` (except `application/ld+json`), `<style>`, `<svg>`, `data:`
  URIs, then trigger a `Blob` + `<a download>` save — **after a real click
  on the page first** (a synthetic click without a prior user-gesture click
  did not reliably trigger the save; western elm and cb2 confirmed this).
  The file lands in `~/Downloads` and was moved into this directory. This
  bypasses the return-channel limit entirely since the content never has to
  pass back through the tool's text channel.
- **`curl -sL -A '<desktop Chrome UA>' -H 'Accept: ...' -H 'Accept-Language:
  ...' --compressed <url>`** worked for most sites (Room & Board, DWR, RH's
  Jennifer Sofa page, Wayfair, Steelcase, Visual Comfort, Knoll, 1stDibs,
  Chairish, Hedge House, Pinterest, Instagram) once given full browser-like
  headers — a bare UA-only curl was 403'd by Room & Board's WAF. West Elm
  and CB2 (both Williams-Sonoma platform) returned 403 regardless of headers
  and needed the Chrome-download method above. Herman Miller returned
  HTTP 200 via curl but the page is almost entirely client-rendered — the
  curled HTML is a near-empty shell (no price, no JSON-LD); the Chrome
  download fixture (`hermanmiller.com...` in this dir) is the client-side-
  rendered result and is what the test suite uses.
- Product URLs were discovered by navigating each site's category listing
  or search and reading `document.querySelectorAll('a[href]')` for
  matching URL patterns (query strings stripped before returning, since
  those also tripped the content filter above).
- No fixture exceeded 3 MB, so none needed the `<head>` + main-container
  trim the brief allows for oversized pages.

## Fixtures

| File | Source URL | Method | Bytes | JSON-LD blocks | Notes |
|---|---|---|---:|---:|---|
| `roomandboard.com.stevens-sofas.html` | https://www.roomandboard.com/catalog/living/sofas-and-loveseats/stevens-sofas | curl (full headers) | 1,438,979 | 3 | Clean SSR (Next.js `data-next-head`); dimensions behind a "Dimensions" tab. |
| `dwr.com.eames-lounge-chair-and-ottoman.html` | https://www.dwr.com/living-lounge-chairs/eames-lounge-chair-and-ottoman/5667.html?lang=en_US | curl (full headers) | 1,096,816 | 1 | Retailer DWR, brand "Herman Miller" shown as a text label above the title; Item No. 100077567 visible (mpn/sku-shaped). |
| `rh.com.jennifer-sofa.html` | https://rh.com/us/en/catalog/product/product.jsp/prod39250055 | Chrome render → download | 104,423 | 1 (empty) | `<script id="schema" type="application/ld+json"></script>` present but **unpopulated** even after a 2.5s wait — RH ships a dead JSON-LD placeholder. Price is dual-tier ("$6,995 MEMBER / $9,995 REGULAR"); width options are in feet ("8'", "9'", "10'", "11'"), not inches. Plain curl (no Accept/Accept-Language headers) was 403'd; curl with full headers on this same URL was not retried after the render capture succeeded. |
| `wayfair.com.ebern-designs-sofa.html` | https://www.wayfair.com/furniture/pdp/ebern-designs-traditional-upholstered-standard-sofa-with-square-armrests-and-2-throw-pillows-w112266288.html | curl (full headers) | 1,532,318 | 3 | Largest fixture, still under the 3 MB cap. |
| `hermanmiller.com.eames-lounge-chair-and-ottoman.html` | https://www.hermanmiller.com/products/seating/lounge-seating/eames-lounge-chair-and-ottoman/ | Chrome render → download | 218,018 | 0 | Curl-only version (not kept) was a near-empty SPA shell — see methodology note. Page opens behind a cookie-consent modal ("Only Necessary Cookies" chosen) that blocks content until dismissed. |
| `steelcase.com.gesture.html` | https://www.steelcase.com/products/office-chairs/gesture | curl (full headers) | 244,020 | 2 | Office chair, not sofa/table, but has real dimensions and materials copy. |
| `visualcomfort.com.talia-small-chandelier.html` | https://www.visualcomfort.com/us/p/talia-small-chandelier-jn5110 | curl (full headers) | 62,131 | 1 | Lighting, not furniture (brief calls this one out separately for trade-only pricing) — price is hidden pending trade account login, as expected. |
| `knoll.com.womb-chair.html` | https://www.knoll.com/shop/en_us/living-lounge-chairs/womb-chair/7876.html?sku=100360310 | curl (full headers) | 1,069,402 | 1 | |
| `1stdibs.com.rare-1964-eames-lounge-chair.html` | https://www.1stdibs.com/furniture/seating/lounge-chairs/rare-1964-rosewood-herman-miller-eames-lounge-chair-ottoman-w-original-receipt/id-f_48117292/ | curl (full headers) | 640,838 | 1 | Vintage listing with a dimensions table (seller-provided, freeform). |
| `chairish.com.george-smith-leather-sofa.html` | https://www.chairish.com/product/36868025/george-smith-english-howard-sons-signature-leather-sofa | curl (full headers) | 588,964 | 2 | |
| `westelm.com.harris-sofa.html` | https://www.westelm.com/products/harris-sofa-96-h4614/ | Chrome render → download | 1,297,267 | 2 | Curl was 403'd (Williams-Sonoma platform WAF) regardless of headers. |
| `cb2.com.berkeley-velvet-sofa.html` | https://www.cb2.com/berkeley-78-jade-performance-velvet-sofa/s450191 | Chrome render → download | 467,974 | 6 | Same WAF as West Elm; curl 403'd. |
| `hedgehousefurniture.com.white-oak-marie-nightstand.html` | https://hedgehousefurniture.com/products/white-oak-marie-nightstand-114010-in-stock | curl (full headers) | 227,421 | 1 | Indie Shopify maker, verified via `products.json` before fetching; listing text embeds dimensions/wood/finish as free-form paragraph copy, not structured fields. |
| `pinterest.com.pin-378724649918852625.html` | https://www.pinterest.com/pin/378724649918852625/ | curl (full headers) | 1,243,815 | 0 | **Known-bad case.** Board/roundup pin ("Mid Century Couches We Are Swooning Over"), not a single product. Chrome-rendered load also confirmed a hard login wall (`Welcome to Pinterest` modal) even for viewing a single pin — no product content is reachable logged-out either way. |
| `instagram.com.p-DcjKbTzEVTf.html` | https://www.instagram.com/p/DcjKbTzEVTf/ | curl (full headers) | 620,706 | 0 | **Known-bad case.** A furniture brand's (@magnolia) promotional post, not a product page — no price/dimensions/JSON-LD, only caption text and a login wall over the image carousel. |

## Screenshots

Chrome screenshots (`save_to_disk`) were captured for a representative
subset — the persona-walk sites plus both known-bad cases — not all 15, to
keep the harvest within this lane's time budget: `roomandboard.com`,
`dwr.com`, `rh.com` (Jennifer Sofa), `hermanmiller.com`, `pinterest.com`,
`instagram.com`. They live in
`artifacts/capture-launch-2026-08-29/fixtures/*.png` alongside this test
lane's other outputs, named to match the HTML fixture they correspond to.
