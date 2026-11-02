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
