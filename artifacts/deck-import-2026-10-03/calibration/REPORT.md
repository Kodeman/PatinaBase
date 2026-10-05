# Deck import look-tier calibration (SQ-362)

Run on 2026-10-05 against main 3ca3f8af8. Everything ran locally: local Supabase and the local inference service (nomic-v1.5-onnx-int8-r1). The query set is retailer gallery pairs, not real decks; the SQ-350 pilot will re-check on real decks. No images, product names, or retailer copy are in the repo. Only retailer domains and counts appear here.

## Headline

| Threshold | Placeholder | Chosen | Measured at chosen |
|---|---:|---:|---|
| τ_exact (T1 image-only cosine) | 0.95 | **0.985** | 80/80 strong rows right (Wilson 95% low 0.954). 9% of positives reach strong. At 0.95 only 71% of strong rows were right. |
| τ_hamming (T1 dHash) | ≤6 | **0** (identical hash only) | At ≤6, only 32% of hash hits were right. Only 0 bits meets 0.98, and that rests on just 2 rows. |
| τ_likely / τ_margin (T2 image-only) | 0.85 / 0.03 | **0.90 / 0.025** | Precision 0.896 (95% low 0.857), 275 right of 307 fired. The placeholder gave 0.869 (low 0.827). |
| fused cap | possible | **possible (kept)** | Fused scores sit about 0.1 below image-only and never reach τ_likely. |
| τ_pair / τ_pair_margin | 0.80 / 0.05 | **0.71 / 0.02** | Precision 0.988 (95% low 0.980). Recall 78.6%, up from 68.9%. |
| τ_look (og:image check) | 0.80 | 0.80 (unchanged) | Not in this ticket's scope. Only true pairs were measured (finding 5). |

Version labels: threshold_version goes from deck-look-v1-placeholder to deck-look-v2-sq362. THRESHOLD_VERSION goes from deck-resolve-v0-placeholder to deck-resolve-v1-sq362, because the pairing thresholds changed. THRESHOLDS.words is still a placeholder.

Cascade at the chosen values:
- Strong: 81/81 right on positives, 0 strong rows on negatives.
- Likely: precision 0.968 on positives, 0.896 with negatives included.
- Negatives that abstain: 89.8%, up from 72.0%.

Cascade at the placeholders: 37% of strong rows were wrong, and 68 strong rows went to products that are not in the catalog.

## Method

1. **Catalog** (crawl.ts):
   - Source: products.json from 7 public Shopify home retailers. Each page was read with the _shared/product-page readProductPage extractor (JSON-LD and og).
   - A product was kept only if its gallery has a shot that is not among the extractor's first 3 pictures.
   - Colourway families (same first two title words or the same hero picture) were kept once.
   - Result: 476 kept. Every 6th product per retailer was held out as a negative (75 in total).
2. **Embedding** (calibrate.ts seed|embed):
   - 401 catalog-layer products were inserted into the local DB, tagged so cleanup could remove them.
   - The aesthete-embed-worker's own runEmbedBatch drained them through local inference. This filled aesthete_vector (fused 0.65/0.35) and product_image_vectors (up to 3 pictures), the same way production does.
   - No product had DNA, so captions were category plus name.
   - 16 products could not be indexed because the worker refused every picture (decoded-pixel limits). Their 37 queries are excluded from scoring.
3. **Queries** (queries.py):
   - Crops mimic deck crops: WebP q0.9, long edge ≤2048 px (crop.ts).
   - Studio shots were trimmed 0–20% per side.
   - Room scenes were cut to 45–80% of each side around the centre.
   - Kinds: alt_studio and alt_scene (a gallery shot the catalog did not embed), same_picture (the catalog hero, re-cropped), and negative_* (pictures of held-out products).
   - Vectors were computed in-process with the service's decoder and ONNX engine (batches of 16). The HTTP worker refuses loopback URLs by design, so it could not fetch local crops.
4. **Ranking** (calibrate.ts measure):
   - Used the real board_deck_import_match_image_knn RPC (00681/00684) and board_deck_import_match_knn RPC (00679/00683).
   - The calibration import has created_by NULL, so only catalog-layer products are visible.
   - dHash used crop_signature.ts on the WebP bytes.
   - Only designer_confirmed rows carry a phash. To stand in for kept crops, each same_picture query also got a second, independent crop of the same photo (133 kept crops). Every query was compared against all of them.
   - Pairing used pairing.ts pairByLook on 400 simulated slides:
     - Each slide has 2–6 linked pieces.
     - 50% of slides have an extra unlinked crop.
     - 30% have an extra link with no crop.
     - The page photo is the product's first picture vector.
5. **Choice** (analyze.ts):
   - Strong precision is counted per shown strong row. Likely is judged on the top hit.
   - A chosen value must hold at every stricter value on the grid.
   - Likely and pairing must meet the target on the Wilson 95% lower bound, not just the point estimate.
   - T1 has too few strong rows for the bound to reach 0.98 (that would take about 190 straight hits), so T1 uses point precision.

## Findings

1. **Margin decides "likely"; the score barely does.**
   - Wrong top hits score 0.84–0.96 (p5–p95), and the median top score on negatives is 0.906. Score alone cannot separate them.
   - Margin can: wrong top hits have a margin of at most 0.029 at p95, while correct ones have a median margin of 0.045.
2. **dHash is close to useless as a strong signal.**
   - Re-cropping the same photo moves its hash by a median of 9 bits.
   - 5% of queries find a wrong kept crop within 5 bits, because plain-background photos collide.
   - At τ=0 the tier is safe, but its value can't be measured.
   - A crop-tolerant signature, or a rule requiring dHash and cosine to agree, would need a change to look.ts, which is outside this ticket's scope.
3. **Room scenes are the hard case.** Image-only R@1 is 36% for alt_scene, 72% for alt_studio, and 95% for same_picture. Most room-scene crops abstain, which is what they should do.
4. **Fused is weaker than image-only in every slice.**
   - R@1 is 52.8% fused against 59.6% image-only, and fused scores sit lower.
   - A fused "likely" band would need its own τ; about 0.82 / 0.01 reaches 0.85 here. The cap is kept.
5. **τ_look 0.8 downgrades too many true pairs.** It downgrades 24% of true room-scene pairs and 5% of true studio pairs. False pairs were not measured, so the threshold is unchanged. This needs a follow-up.

## Set
Catalog: 401 seeded, 75 held out. Embed worker: claimed 909, done 820, failed 89 (this includes 27 local pending jobs from other work; the worker claims globally). 385 of 401 products got both fused and picture vectors.

Queries: 1123 scored (898 positive, 225 negative), plus 37 unindexed. Kept crops for dHash: 133. Slides: 400.

| Domain | Catalog | Held out | Queries |
|---|---:|---:|---:|
| floydhome.com | 47 | 9 | 126 |
| mcgeeandco.com | 59 | 11 | 169 |
| www.burrow.com | 59 | 11 | 170 |
| www.luluandgeorgia.com | 59 | 11 | 171 |
| www.parachutehome.com | 59 | 11 | 152 |
| www.schoolhouse.com | 59 | 11 | 165 |
| www.sixpenny.com | 59 | 11 | 170 |

Kinds: alt_scene 393, alt_studio 377, same_picture 128, negative_hero 75, negative_scene 80, negative_studio 70.

## Recall (positives)
| Tier | Kind | n | R@1 | R@5 |
|---|---|---:|---:|---:|
| T2 image-only | all | 898 | 59.6% | 74.6% |
| T2 image-only | alt_scene | 393 | 36.1% | 54.7% |
| T2 image-only | alt_studio | 377 | 71.9% | 86.7% |
| T2 image-only | same_picture | 128 | 95.3% | 100.0% |
| T2 fused | all | 898 | 52.8% | 71.0% |
| T2 fused | alt_scene | 393 | 31.3% | 50.9% |
| T2 fused | alt_studio | 377 | 65.3% | 83.3% |
| T2 fused | same_picture | 128 | 82.0% | 96.9% |
| T1 dHash nearest kept crop | product has a kept crop | 384 | 34.9% | 50.3% |
| T1 dHash | same_picture only | 128 | 61.7% | 83.6% |

## Distributions (p5 / p25 / p50 / p75 / p95)
| Tier | Population | top-1 score | margin |
|---|---|---|---|
| image-only | top-1 correct (535) | .876/.937/.965/.980/.990 | .004/.019/.045/.074/.139 |
| image-only | top-1 wrong, positives (363) | .835/.876/.902/.923/.955 | .001/.003/.007/.014/.029 |
| image-only | negatives (225) | .820/.870/.906/.933/.961 | .001/.005/.010/.020/.050 |
| fused | top-1 correct (474) | .758/.817/.847/.865/.876 | .002/.014/.037/.067/.127 |
| fused | top-1 wrong, positives (424) | .728/.771/.792/.814/.841 | .000/.003/.005/.012/.028 |
| fused | negatives (225) | .723/.767/.800/.821/.848 | .001/.003/.007/.017/.050 |
| dHash | true pair distance (128) | 2/5/9/15/64 | — |
| dHash | nearest wrong kept crop (1123) | 5/10/15/20/23 | — |

## T1 exact cosine (strong rows)
| τ | rows | right | precision | Wilson low | recalled/898 |
|---:|---:|---:|---:|---:|---:|
| 0.90 | 1788 | 540 | 0.302 | 0.281 | 540 |
| 0.95 (placeholder) | 503 | 357 | 0.710 | 0.669 | 357 |
| 0.96 | 354 | 305 | 0.862 | 0.822 | 305 |
| 0.97 | 235 | 222 | 0.945 | 0.908 | 222 |
| 0.98 | 138 | 134 | 0.971 | 0.928 | 134 |
| **0.985** | 80 | 80 | 1.000 | 0.954 | 80 |
| 0.99 | 25 | 25 | 1.000 | 0.867 | 25 |

## T1 dHash (strong rows; recalled of 384)
| Hamming ≤ | rows | right | precision |
|---:|---:|---:|---:|
| **0** | 2 | 2 | 1.000 |
| 1 | 12 | 9 | 0.750 |
| 2 | 19 | 15 | 0.789 |
| 4 | 74 | 41 | 0.554 |
| 6 (placeholder) | 216 | 69 | 0.319 |
| 10 | 811 | 122 | 0.150 |

## T2 image-only likely (1042 queries with nothing strong)
| τ_likely | τ_margin | fired | right | precision | Wilson low |
|---:|---:|---:|---:|---:|---:|
| 0.85 (placeholder) | 0.03 | 313 | 272 | 0.869 | 0.827 |
| **0.90** | **0.025** | 307 | 275 | 0.896 | 0.857 |
| 0.85 | 0.05 | 201 | 185 | 0.920 | 0.875 |
| 0.90 | 0.02 | 358 | 298 | 0.832 | 0.790 |
| 0.90 | 0.05 | 181 | 173 | 0.956 | 0.915 |
| 0.80 | 0.02 | 422 | 320 | 0.758 | 0.715 |

Fused, judged on its own: 0 fired at the chosen thresholds. It reaches 0.85 only at τ 0.82 / margin 0.01 (355 fired, 306 right). Its best precision is 1.000 at τ 0.86 / margin 0.045 (99 fired).

## Pairing (400 slides)
| τ_pair | margin | assigned | right | precision | Wilson low | recall |
|---:|---:|---:|---:|---:|---:|---:|
| 0.80 (placeholder) | 0.05 | 1094 | 1090 | 0.996 | 0.991 | 68.9% |
| **0.71** | **0.02** | 1260 | 1245 | 0.988 | 0.980 | 78.6% |
| 0.60 | 0 | 1339 | 1314 | 0.981 | 0.973 | 83.0% |
| 0.85 | 0 | 1126 | 1118 | 0.993 | — | 70.6% |
| 0.90 | 0 | 869 | 869 | 1.000 | — | 54.9% |

## og:image look-check (true pairs only)
- alt_scene: p50 0.855; 24.4% below 0.8.
- alt_studio: p50 0.950; 5.4% below 0.8.
- same_picture: p50 0.975; 0% below 0.8.

## Cascade
| Set | Population | strong (right) | likely (right) | abstain |
|---|---|---:|---:|---:|
| placeholder | positives 898 | 576 (364) | 75 (62) | 46.8% |
| placeholder | negatives 225 | 68 (0) | 13 (0) | 72.0% |
| chosen | positives 898 | 81 (81) | 284 (275) | 59.4% |
| chosen | negatives 225 | 0 | 23 (0) | 89.8% |

## Reproduce
To rebuild the inputs, run crawl.ts, then queries.py (with services/aesthete-inference/.venv/bin/python). Both write to CAL_DIR, which defaults to ~/patina-deck-samples/calibration.

To re-measure against the database:
1. Take the /tmp/patina-local-supabase-db.lock.d lock.
2. Start inference.
3. Run calibrate.ts with the steps seed, then embed, then measure, then cleanup. Use `--config supabase/functions/deno.json` and set SUPABASE_SERVICE_ROLE_KEY, INFERENCE_URL, and INFERENCE_TOKEN.
4. Release the lock.
5. Run analyze.ts. It prints the full tables.