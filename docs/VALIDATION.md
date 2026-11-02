# Engine validation

## Test methodology

Unit tests run in Node with Vitest. Expectations use hand-computed weighted moments, analytic RBJ
identities, an independent complex transfer-function evaluation, known synthetic filter recovery,
and generated symmetry/offset-invariance properties (fast-check). Controlled taste cases cover
similar vs dissimilar likes, directional dislike plateaus, fit-only exclusion, conflicts, corrections,
uncertainty and support. Cross-source tests exercise robust pooling, level removal, shrinkage and
leave-product-out leakage prevention. PEQ tests include notch avoidance and summed treble caps.

`pnpm test` currently passes 41 tests in five files, including the existing smoothing tests. This
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

| Workload                                            |       ms |     ops/s |
| --------------------------------------------------- | -------: | --------: |
| Single-reference rank, 30,000 candidates            |    12.49 | 2,401,531 |
| Taste rank, 30,000 candidates, 3 likes + 2 dislikes |   798.24 |    37,583 |
| PEQ fit, 1 curve                                    |    34.80 |        29 |
| PEQ fit, 50 curves                                  | 1,467.16 |        34 |

Checksum: 6.091697. The packed single-reference scan allocates only for the K winners; full taste
ranking currently constructs explanations for every candidate, a known optimisation opportunity.
