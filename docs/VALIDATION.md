# Engine validation

## Test methodology

Unit tests run in Node with Vitest. Expectations use hand-computed weighted moments, analytic RBJ
identities, an independent complex transfer-function evaluation, known synthetic filter recovery,
and generated symmetry/offset-invariance properties (fast-check). Controlled taste cases cover
similar vs dissimilar likes, directional dislike plateaus, fit-only exclusion, conflicts, corrections,
uncertainty and support. Cross-source tests exercise robust pooling, level removal, shrinkage and
held-out-fold leakage prevention, stable hash assignment, unequal-fold aggregation and median
pair improvements. Randomised packed taste rankings match exhaustive full explanations across all
dislike reasons, multiple tastes, corrected centres, missing data, zero weights and input-order ties.
Regression tests also cover custom-frequency packed winner statistics, frequency-local source counts
(with independently derived LS/smoothing expectations), and high-band-only shelf fitting with and
without missing transition samples. PEQ tests include notch avoidance and summed treble caps.
Additional edge tests cover sparse alignment anchors, unobservable singleton fit sensitivity,
invalid options and filter types, NaN-frequency eligibility, missing target pivots, grouped notches,
and negative-shelf overshoot requiring the treble cap's verified feasible fallback.

`pnpm test` currently passes 63 tests in five files, including the existing smoothing tests. This
establishes numerical behaviour for the exercised cases, not perceptual equivalence or real-data
recommendation quality. No real-source held-out result has been measured in this lane.

## Benchmarks

Run `pnpm bench` (plain Node TypeScript stripping, no build). Deterministic synthetic curves, one
warm-up for each path, one measured pass, top K=20. Ranking uses 30,000×120 float32 samples; taste
ranking uses the same candidates, three likes and two dislikes. PEQ uses the default five-filter
budget on a known shelf/peak/shelf target; the 50-curve workload adds deterministic broad variations.
All 50 target arrays are prepared before timing. The multi-reference workload uses 3,000 candidates
on a trade-off between two references, with every candidate non-dominated: a deliberate worst case
for the current quadratic dominance scan. Its timing includes distance/explanation construction.
Times include ranking result/explanation construction, but exclude initial synthetic dataset/model
construction. These are local wall-clock observations, not a performance guarantee or a distribution
of timings. Ops/s means candidates ranked or curves fitted, not entire 30,000-item requests.

Measured 2026-11-02, Linux, AMD Ryzen 7 9800X3D, Node v26.12.1:

| Workload                                                            |       ms |     ops/s |
| ------------------------------------------------------------------- | -------: | --------: |
| Single-reference rank, 30,000 candidates                            |    13.11 | 2,288,523 |
| Packed taste rank, 30,000 candidates, 3 likes + 2 dislikes          |    64.13 |   467,775 |
| Multi-reference Pareto, 3,000 candidates, 2 refs, all non-dominated |   154.56 |    19,410 |
| PEQ fit, 1 curve                                                    |    46.67 |        21 |
| PEQ fit, 50 curves                                                  | 2,024.29 |        25 |

Checksum: 3006.111729 (includes the 3,000 Pareto flags). Both packed ranking scans construct full
explanations only for the K winners. Packed taste ranking replaces the prior 798.24 ms exhaustive
explanation workload with a 64.13 ms scalar scan plus winner explanations (~12.4× faster here, below
the 100 ms target). Warm-up now runs a full packed taste scan, not 100 exhaustive candidates.

The high-band-average shelf seed and pre-acceptance cap checks increased PEQ from the previous
34.28 ms/curve and 1,517.14 ms/50 curves. The changed PEQ search also changes the checksum from
6.091697 before adding the new Pareto checksum component. NaN frequencies are now consistently
ineligible in all distance passes; ordinary finite-grid ranking semantics are unchanged. The Pareto
benchmark documents O(N²) behaviour; it does not establish acceptable latency at 30,000 candidates.
Timings remain single-pass observations, not a controlled performance study.

## Atlas service validation (2026-11-02)

Service tests use the real TWFR encoder and a synthetic in-memory fetch
dataset. Independent cases cover exact +3 dB offset equivalence, aligned default medians, separate
tunings, no rig mixing, no default substitution from fit variants, observed-price/source filters,
per-source ranges and query-specific coverage, unused taste ratings, corrections, Pareto objectives,
detail channel means and variant spread, LRU eviction, concurrent-load deduplication, gzip, failed-load
retry, private uploads and PEQ exports. A real `static/data` smoke test checks result structure and
detail curves when the dataset exists, skipping only when the manifest is absent. A Node worker-thread
test runs the actual Comlink worker entry and verifies typed-array upload/PEQ round trips without
detaching cached curves. A standalone Vite production build of the client also bundles the ES worker
successfully (48.87 kB worker, 6.01 kB client before gzip); scratch build output was removed.

`pnpm format`, `pnpm lint`, `pnpm check` and `pnpm test` pass. Knip is not clean before UI integration:
it reports the unreferenced client/standalone atlas benchmark and exported public types
`PartitionSummary`, `SimilarMatch`, `TasteItem`, `DetailMeasurement`, alongside existing engine/dataset
exports and UI/test dependencies (`uplot`, `@axe-core/playwright`, `vitest-browser-svelte`).

Run `node benchmarks/atlas.ts` after `pnpm data:pull`. Same machine/Node as the engine timings above;
dataset `3c9d923462f8b79c98aa4ef9`, 2,082 IEM products (2,102 products across both forms), 4,293 iem-711
measurements, top K=20. One cold request, one resident request, then one taste request with three
likes; no synthetic curve generation in the timed paths. Disk-backed fetch is included, browser
network latency and worker startup/message serialization are not. The cold service has not loaded its
manifest or catalogs; benchmark reference-id selection outside the timer can warm the OS file cache.

| Service workload                                                  |     ms | Budget ms |
| ----------------------------------------------------------------- | -----: | --------: |
| First similar: manifest + catalog + rank decode + consensus index | 267.66 |     1,500 |
| Resident similar, including top-K source ranges                   |   1.95 |        50 |
| Resident taste, including model and winner explanations           |   8.18 |       150 |

All three budgets pass in this local observation. Null partition statistics remain null: no
on-demand cross-source estimation, invented confidence, held-out real-source improvement or listener
validation is claimed. These timings are not a latency guarantee or a statistical distribution.
