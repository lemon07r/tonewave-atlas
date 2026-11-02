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
PEQ tests include notch avoidance and summed treble caps.

`pnpm test` currently passes 47 tests in five files, including the existing smoothing tests. This
establishes numerical behaviour for the exercised cases, not perceptual equivalence or real-data
recommendation quality. No real-source held-out result has been measured in this lane.

## Benchmarks

Run `pnpm bench` (plain Node TypeScript stripping, no build). Deterministic synthetic curves, one
warm-up for each path, one measured pass, top K=20. Ranking uses 30,000×120 float32 samples; taste
ranking uses the same candidates, three likes and two dislikes. PEQ uses the default five-filter
budget on a known shelf/peak/shelf target; the 50-curve workload adds deterministic broad variations.
Times include ranking result/explanation construction, but exclude initial synthetic dataset/model
construction. These are local wall-clock observations, not a performance guarantee or a distribution
of timings. Ops/s means candidates ranked or curves fitted, not entire 30,000-item requests.

Measured 2026-11-02, Linux, AMD Ryzen 7 9800X3D, Node v26.12.1:

| Workload                                                   |       ms |     ops/s |
| ---------------------------------------------------------- | -------: | --------: |
| Single-reference rank, 30,000 candidates                   |    12.48 | 2,402,986 |
| Packed taste rank, 30,000 candidates, 3 likes + 2 dislikes |    64.07 |   468,253 |
| PEQ fit, 1 curve                                           |    34.28 |        29 |
| PEQ fit, 50 curves                                         | 1,517.14 |        33 |

Checksum: 6.091697 (unchanged from the exhaustive scorer). Both packed ranking scans construct full
explanations only for the K winners. Packed taste ranking replaces the prior 798.24 ms exhaustive
explanation workload with a 64.07 ms scalar scan plus winner explanations (~12.5× faster here, below
the 100 ms target). Warm-up now runs a full packed taste scan, not 100 exhaustive candidates.
