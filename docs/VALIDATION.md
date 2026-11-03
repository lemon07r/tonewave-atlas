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

Phase-1 `pnpm verify` passed **517 tests in 52 files**, plus format, lint, types and unused-code checks
(2026-11-02; accepted history now ends at `71fd16b`), including numerical, service, worker and component tests.
This establishes numerical behaviour for the exercised cases, not perceptual equivalence or real-data
recommendation quality. Published real-source held-out validation is described below; no listener
validation is claimed.

Phase-1 regression tests independently accumulate weighted LS moments from returned similar/taste/
compare curves, effective weights and treble penalties, with and without source harmonisation,
nonuniform spread, missing bins, corrections and explicit tuning references. They verify the scored
float32 basis, offsets, array-copy isolation, usable-item/product-count/id rig selection, missing-rig
alternatives, legacy compare callers, reference-product exclusion, filters, sorting and pre-limit counts.
`peq-export.test.ts` parses every APO line and evaluates separately computed RBJ cookbook coefficients
through complex H(z), including Q shelves, serialized headroom, huge boost requests, NaN regions and
flat targets. Wavelet tests compare all 127 frequencies with a literal fixture of the pinned AutoEq
grid and parse back gains including preamp exactly once. This checks documented APO syntax and
numerical semantics, not an execution on Windows or a Wavelet listening test.
`multi-reference.test.ts` compares sweep membership against the original exhaustive dominance
definition on seeded 2/3/4-objective sets, ties, duplicates, NaN/null/infinite objectives and 3,000
all-nondominated adversarial points for every supported objective count.

## Benchmarks

Run `pnpm bench` (plain Node TypeScript stripping, no build). Deterministic synthetic curves, one
warm-up for each path, one measured pass, top K=20. Ranking uses 30,000×120 float32 samples; taste
ranking uses the same candidates, three likes and two dislikes. PEQ uses the default five-filter
budget on a known shelf/peak/shelf target; the 50-curve workload adds deterministic broad variations.
All 50 target arrays are prepared before timing. Multi-reference workloads use 8,000 catalog-like
synthetic candidates with 2/3/4 references, plus 3,000 candidates trading between two endpoints with
every candidate non-dominated (2 references, then a third at the midpoint). Each workload receives
a full warm-up. Timings include all distance/explanation construction and Pareto membership.
Times include ranking result/explanation construction, but exclude initial synthetic dataset/model
construction. These are local wall-clock observations, not a performance guarantee or a distribution
of timings. Ops/s means candidates ranked or curves fitted, not entire 30,000-item requests.

Measured 2026-11-02, Linux, AMD Ryzen 7 9800X3D, Node v26.12.1:

| Workload                                                     | Phase 1 ms | Phase 2 ms | Phase 2 ops/s |
| ------------------------------------------------------------ | ---------: | ---------: | ------------: |
| Single-reference rank, 30,000 candidates                     |      13.13 |      17.17 |     1,746,900 |
| Packed taste rank, 30,000 candidates, 3 likes + 2 dislikes   |      64.00 |      68.09 |       440,582 |
| Multi-reference, 3,000 candidates, 2 refs, all non-dominated |      26.55 |       9.23 |       324,950 |
| Multi-reference, 3,000 candidates, 3 refs, all non-dominated |      33.38 |       8.58 |       349,700 |
| Multi-reference, 8,000 candidates, 2 refs                    |      60.55 |      18.05 |       443,196 |
| Multi-reference, 8,000 candidates, 3 refs                    |      87.63 |      26.76 |       298,959 |
| Multi-reference, 8,000 candidates, 4 refs                    |     130.41 |      49.71 |       160,926 |
| PEQ fit, 1 curve                                             |      53.90 |      54.62 |            18 |
| PEQ fit, 50 curves                                           |   2,148.69 |   2,127.32 |            24 |

Both phases use prefix-min Pareto sweeps and the same expanded workloads. Phase 2 replaces per-pair
full band-explanation construction with scalar distance/alignment (`distanceSummary`); Pareto
membership is unchanged. The recorded phase-2 checksum is **7479.111729**, including both
all-nondominated fronts and all catalog-like front counts; no phase-1 checksum comparison is claimed.
Packed single-reference/taste scans construct full explanations only
for top-K winners; multi-reference computes all scalar objectives before sorting/top-K, and the
service constructs only returned overlays. No 30,000-candidate multi-reference latency bound is claimed.
PEQ fitting is unchanged. The single/taste differences in these one-pass observations are not a
controlled regression measurement; both remain below their synthetic interactive budgets.
These are single-pass local observations, not a controlled performance study or a timing distribution.

## Reviewer sensitivity and candidate safeguards (2026-11-03)

`pnpm verify` passes **1,168 tests in 79 files**, plus format, lint, types and knip.

Service regressions independently derive the omission medians, score intervals and rank bounds
from alternating ±a curves: 20 equally weighted sub-bass bins give D(a,b)=|a−b|. They cover
one-reviewer unassessed sides, exact-measurement references, source-only pools, published source
correction, removal of every measurement from one reviewer, all 57 omissions without sampling,
touching endpoints, non-transitive overlap, cutoff margins, unchanged actual ranking scores, and
compare's mean/minimax objectives. A separate weighted-moment oracle checks focus and directional
treble settings. Candidate tests cover explicit/fallback modified identities, inclusion, permitted
modified references/ratings, related-reference flags, distinct-reviewer minima and source-only
interactions in all three ranking routes.

### Performance

Same Linux/Ryzen 7 9800X3D/Node v26.12.1; dataset **4199d08ffc44cf0977b5bae0**.
`pnpm bench` before/after: single-reference 30,000 candidates **18.62 / 13.06 ms**;
four-reference 8,000 candidates **45.06 / 57.22 ms**; checksum **7479.111729** both times.
These unchanged lower-level scorers do **not** invoke service stability, so their run-to-run
differences do not measure its overhead. The benchmark file was not changed.

`node benchmarks/atlas.ts` exercises the real service, including stability after this change.
Each workload has one cold service call and five resident calls; topK=20, explicit iem-711,
default correction, disk fetch included, network/worker/message costs excluded:

| Request               | Before cold ms | Before warm median / max ms | After cold ms | After warm median / max ms |
| --------------------- | -------------: | --------------------------: | ------------: | -------------------------: |
| Similar               |        1169.45 |                 7.67 / 8.92 |       1268.74 |               8.25 / 10.23 |
| Taste, 3 likes        |        1199.23 |               11.86 / 16.07 |       1270.54 |              12.33 / 17.61 |
| Compare, 2 references |        1225.33 |               27.19 / 30.61 |       1288.38 |              27.94 / 29.53 |
| Compare, 3 references |        1198.93 |               37.38 / 41.23 |       1253.83 |              37.68 / 40.44 |
| Compare, 4 references |        1235.07 |               62.31 / 64.14 |       1292.68 |              63.45 / 64.67 |

These are local observations, not controlled latency estimates. The existing harness's fixed
references are not a high-reviewer stress test. A separate iem-711 audit timed every omission for
**Hexa's 57 reviewers: 57 consensus reconstructions in 61.17 ms**, and CrinEar Reference's 32 in
**16.48 ms**, excluding index building. No subsampling was needed. Once reference variants were
cached, the first topK=20 stability pass over 30 rows took **31.71 / 32.31 ms** for Hexa/CrinEar,
including construction of those candidates' variants; repeat stability scoring took **2.59 /
1.62 ms**. Corresponding actual top-30 rank scans took **5.24 / 4.30 ms**. These are component
timings, not complete request latencies. Separate topK=10 service calls measured cold **1379.73 /
1462.01 ms**, warm medians **10.72 / 12.11 ms** and maxima **13.82 / 32.88 ms** respectively.

A four-reference stress query used reviewer counts **57/32/5/10**, with reference ids
`p-19d1654fcb150bf1aa2f`, `p-437de4e3e3402077cdc3`, `p-0001388837f2a6d2eb8e`,
`p-000d6749a69b2861ce4f`. Over 7,397 candidates, mean-score ranking took **52.57 ms**;
first-use stability over the best 30 rows took **140.66 ms**, versus **249.88 ms** before adding
pairwise-medoid distance reuse. Five resident stability passes had median/max **4.57 / 4.76 ms**.
First use with uncached high-reviewer products can therefore exceed a 150 ms request budget even
with a resident partition index; no universal first-query latency guarantee is claimed. The reuse
changes neither anchor selection nor alignment/median arithmetic. Tests compare all 57 memoized
variants against full independent reconstructions; live top-10 scores, intervals and ranks for
both named references remained exactly identical before/after this optimisation.

Consensus variants are cached weakly with each partition/source/correction-specific candidate,
so source-index eviction can release them. For E evaluated rows and R references, scoring costs
`E × sum(reference reviewer omissions) + R × sum(candidate reviewer omissions)` extra scalar
distances (unassessed sides contribute zero), not a full-catalog rerank per omission. A changed
reference objective reuses the other actual objectives. Rebuilding consensus still uses its actual
medoid/median algorithm; there is no simplified median-of-reviewer-medians approximation.

### Real-engine top-10 stability

Queries: `similar({productId, partition: 'iem-711', topK: 10})`, balanced focus, default validated
source correction **on**, default reliability, treble penalty 1, no tunings/modified identities.
Ranks therefore use **20 evaluated rows**, not only the ten shown. Scores/ranges below are rounded
to three decimals for numerical inspection, not claimed perceptual precision. Reviewer counts
are contributing candidate sources; all ten rows in each table have an assessed reference side.
Candidate-side sensitivity is unassessed for counts 1–2, even where a range looks narrow.

**Truthear Hexa**, `p-19d1654fcb150bf1aa2f`, 57 reference reviewers:

| #   | Candidate (catalog spelling)        | Score dB | Score range dB | Rank range | Reviewers |
| --- | ----------------------------------- | -------: | -------------- | ---------- | --------: |
| 1   | Truthears Hexa                      |    0.484 | 0.474–0.493    | 1–2        |         1 |
| 2   | I/O Audio Cielo                     |    0.491 | 0.486–0.498    | 1–2        |         1 |
| 3   | I/O Cielo                           |    0.558 | 0.554–0.564    | 3–3        |         2 |
| 4   | Binary Acoustics EP321 MEMS         |    0.618 | 0.601–0.639    | 4–5        |        20 |
| 5   | Tangzu Xuan NV                      |    0.646 | 0.621–0.705    | 4–9        |        10 |
| 6   | 7th Acoustics STARGAZER 3 PROTOTYPE |    0.656 | 0.651–0.661    | 5–6        |         1 |
| 7   | NiceHCK Rockies                     |    0.695 | 0.684–0.725    | 6–11       |        12 |
| 8   | SLIIVO SL224                        |    0.708 | 0.702–0.711    | 6–9        |         1 |
| 9   | Kiwi Ears KE4 II                    |    0.717 | 0.699–0.805    | 6–20       |         4 |
| 10  | 7Hz x Crinacle Divine               |    0.734 | 0.714–0.762    | 8–17       |        10 |

**CrinEar Reference**, `p-437de4e3e3402077cdc3`, 32 reference reviewers:

| #   | Candidate (catalog spelling)    | Score dB | Score range dB | Rank range | Reviewers |
| --- | ------------------------------- | -------: | -------------- | ---------- | --------: |
| 1   | EPZ 550                         |    0.492 | 0.475–0.548    | 1–2        |         8 |
| 2   | EPZ 550 Purple Phoenix          |    0.520 | 0.506–0.536    | 1–2        |         2 |
| 3   | Softears Studio 4               |    0.740 | 0.729–0.754    | 3–4        |        26 |
| 4   | PROJECT RED V3.0                |    0.815 | 0.801–0.831    | 4–9        |         1 |
| 5   | Apple AirPods Pro               |    0.817 | 0.801–1.325    | 4–20       |         4 |
| 6   | Tanchjim Bunny DSP Default      |    0.832 | 0.821–0.849    | 4–9        |         1 |
| 7   | Dunu PRS6                       |    0.836 | 0.824–0.908    | 4–11       |         5 |
| 8   | Oriveti O400                    |    0.837 | 0.824–0.849    | 4–9        |         1 |
| 9   | Moondrop Space Travel Reference |    0.902 | 0.886–0.918    | 7–12       |         1 |
| 10  | Prisma Lumen                    |    0.918 | 0.858–0.995    | 7–20       |         3 |

The weighted, corrected engine is not the earlier unweighted, uncorrected RMS approximation:
Hexa's first two rows overlap here. Catalog identity defects remain visible: “Truthears Hexa” is
currently separate from the reference. An unflagged name containing only “PROTOTYPE” also remains
eligible: the specified compatibility rule recognises `[modified:`, not every possible name.
No identity or classification fixes were made in this engine workstream. The marked modified
CrinEar prototype is absent under the default candidate filter.

### Full-score cache and dataset-update regressions

Follow-up `pnpm verify` passed **1,190 tests in 81 files** (86.88 s), plus format, lint, types and knip.

Follow-up service tests compare cached view changes against fresh uncached services, with spies on
full scoring, scalar distances, Pareto computation and taste-model construction:

- `reuses full compare scores and Pareto membership for sort, Pareto and topK changes` includes a
  different minimax winner outside the previously displayed mean top one, actual Pareto exclusion,
  larger K and zero K.
- `invalidates compare scores for score-affecting settings and evicts the previous computation`
  covers references/exact measurements, focus, treble, filters and source mode/selection; key tests
  additionally cover partition, dataset version, harmonisation, custom bands, ratings and corrections.
- `reuses full similar scores when topK grows rather than caching only displayed rows`,
  `reuses taste scores and model for topK changes but invalidates corrections`,
  `isolates cached score computations from mutation of returned results`, and
  `refreshes stability over the new topK margin without rescoring similar candidates` cover the other
  cache paths and changing bounded-set rank ranges. Cache tests cover concurrent sharing and failed
  computation retries.
- `raises a sticky typed update error for a removed versioned %s file without mixing versions`
  covers catalog/detail/rank/targets. Further fake-fetch cases cover network/503, one shared no-store
  refresh for concurrent failures, unchanged/offline refresh preserving the original error and retry,
  and continued use of retained pinned-version files. `preserves the typed dataset-update signal
through the existing Comlink error transport` verifies reconstruction from a real round trip.

The randomised packed-taste/full-explanation oracle now checks **all** cached scalar scores and
ordering, including corrections, every dislike reason, missing data and ties. A hand-derived distance
case uses zero-mean alternating amplitudes `[2,2,0,1,NaN]`, expecting indices `[2,3,0,1]` and distances
`[0,1,2,2]` at every K cutoff. This exposed an existing heap tie bug retaining row 1 over row 0 at
K=3; equal-score heap ordering now consistently treats the later index as worse. Distances did not
change. Both named live top-10 outputs above remain exactly identical to the pre-cache run, including
ids, scores, intervals, ranks, source counts and assessed-side booleans.

Sort-only timing uses the same four references (**57/32/5/10 reviewers**) and dataset/machine as above,
topK=20, explicit iem-711, default correction/filters. Warm both mean/minimax twice; for five trials,
call mean, then time only the change to minimax. Before/after median **69.20 / 8.28 ms**, maximum
**74.31 / 10.21 ms**. This includes stability, result construction and copying; the index, scorer and
reviewer variants are already warm. Local disk fetch harness; network/worker transport excluded.
These are local observations, not latency guarantees or first-query timings. New scoring settings
still require the full calculation; no reviewer omissions or candidates are subsampled.

### Single-reviewer investigation

On iem-711 the engine builds **7,550** default consensuses; the new default candidate filter leaves
**7,401** after excluding modified identities. With the same corrected, balanced weighted distance
as the tables, **4,943 / 7,401 (66.8%)** eligible products have one contributing reviewer. Among
**974** eligible products with ≥5 reviewers, sort product ids and select 300 at indices
`floor(i × 974 / 300)`, i=0…299. For each, exclude itself and rank the same candidate pool. The
top 20 contain **3,035 / 6,000 (50.6%)** single-reviewer rows. This is one deterministic reference
sample, not a random-sampling interval or a universal exposure rate.

For every eligible product, exclude itself and measure its nearest neighbour in that pool:

| Contributing reviewers | Products | Median nearest-neighbour distance dB |
| ---------------------- | -------: | -----------------------------------: |
| 1                      |    4,943 |                                0.731 |
| 2                      |      812 |                                0.673 |
| 3–5                    |      833 |                                0.592 |
| ≥6                     |      813 |                                0.472 |

These engine figures differ from the supplied plain-RMS approximation (67.4% of all 7,550 defaults,
45.3% of sampled top-20 rows, medians 1.19/1.06/1.02/0.86 dB). Weighting, correction, modified-row
eligibility and the explicitly specified reference sample differ. Single-reviewer products have
larger observed nearest-neighbour distances and are less represented in these top-20 results than
in the eligible catalog. That is consistent with noisier single curves, but does not isolate noise
from catalog composition, identity duplication, selection or reviewer effects. **No reviewer-count
reweighting was applied.** The optional minimum-reviewer filter controls eligibility, while the
stability booleans disclose the unassessed side instead of inventing a noise/confidence adjustment.

## Phase-2 audits (2026-11-02)

Initial phase-2 `pnpm verify` passed **532 tests in 54 files**, plus format, lint, types and knip. The initial knip
run flagged the new standalone real-catalog harness as an unused file; it is now folded into the
existing `benchmarks/atlas.ts` entry, preserving its reference/winner guards rather than bypassing
unused-code checks. `pnpm bench` passes with checksum **7479.111729**.

### Deterministic consensus and reviewer regressions

PR #9 follow-up: automatic similar/compare rig selection now checks default consensus coverage using
query weights, not just index membership. Failing regressions covered a >80%-covered consensus with
no measured sub-bass bins and a usable alternate rig. Source-only cache regressions reproduced
unknown-id duplicate keys and missing eviction; canonical keys now retain only partition-present
sources and source-specific indexes use a four-entry LRU, preserving resident raw packs and ordinary
indexes. A failing assertion of scale-linear rebuilt fit gave **1.452719688**, not **1.870004921**,
after doubling deviations; the permanent analytic counterexample also checks fixed-weight linearity
and scaling-induced clustering changes. The methodology claim is qualified accordingly.

`a6b001e` follow-up `pnpm verify`: **537 tests in 54 files**, plus format, lint, types and knip; `pnpm bench`
passes with unchanged checksum **7479.111729**. On the same dataset/machine and harness scope below,
`node benchmarks/atlas.ts` measured cold / warm median / warm max ms: similar **1177.68 / 8.38 / 9.63**,
taste **1245.66 / 12.39 / 14.81**, compare 2 **1276.44 / 30.60 / 32.94**, compare 3
**1254.58 / 40.94 / 44.09**, compare 4 **1314.39 / 67.91 / 68.26**. This separate local run is not a
controlled before/after comparison; it confirms no observed warm call above 150 ms. The committed
harnesses are `benchmarks/run.ts` and `benchmarks/atlas.ts`; timings vary between runs.

Bot-review follow-up `pnpm verify`: **542 tests in 54 files**, plus format, lint, types and knip.
The automatic-rig regressions now also assert propagation of focus, custom bands and treble penalty
through every weighting call; missing-reference errors assert the complete list. New failing-first
cases cover compare alignment to a later adequate reference or explicitly no alignment, and named-band
spread-fallback caveats in similar/taste/compare (including valid zero spread). Existing seeded Pareto
and consensus tests pass after removing unnecessary allocations. Both committed audit commands below
reproduce their recorded outputs byte-for-byte on the named dataset. `pnpm bench` retains checksum
**7479.111729**. Another `node benchmarks/atlas.ts` run measured warm maxima of **10.09 / 16.12 /
32.14 / 43.39 / 69.22 ms** for similar, taste and compare 2/3/4 respectively, under the scope below;
these remain local observations, not a controlled comparison or a latency guarantee.

`consensus.test.ts` retains the old first-anchor algorithm as a regression oracle: the same full-range
outlier, two clean curves and a partial clean curve produce **10 dB versus 0 dB** at the first bin
under different orders. The overlap-medoid consensus is within **1e-9 dB** of the clean median.
One hundred seeded permutations are bit-identical, including contributor order; a separate bridge
case preserves incomplete-range gaps and excludes a sparse, inadequately overlapping source.
Detail spread expectations now use the deterministic, better-covered anchor's arbitrary level,
rather than assuming the first measurement is the anchor.

All three phase-1 reviewer findings were reproduced with failing tests before fixes:
`reviewer: accepts sparse explicit references under actual nonzero query weights in %s` (similar and
compare), `reviewer: a broken unrelated rig never fails a compare on an explicitly chosen rig`, and
`reviewer: reproduces nearest-liked distance independently from returned member rank curve`.
The fixes use query-weight adequacy, lazy metadata-prefiltered alternatives, and exact member curves
with relative offsets. The source-mode service test covers implicit/explicit coverage equivalence,
source-only re-pooling of references/candidates/tastes/compare, excluded-source caveats and refusal
to substitute an unselected explicit variant.

Dataset **`ef7ead8fc680aae919189e39`**, all rank packs and both form catalogs, default measurements,
**no source correction** (isolating anchor selection): **11,384 usable product/partition consensuses**,
**10,012 distinct products**, **2,540** consensuses with multiple measurements. Comparing phase-1
pack-order pooling against phase-2 medoid pooling, **0 products change by >0.5 dB level-aligned RMS**.
The largest common-finite-bin shape RMS is **0.132422719 dB** (Venture Electronics SIE, iem-711).
No finite-bin support or availability changes occurred. Without removing arbitrary level, **1,409
product/partition consensuses exceed 0.5 dB raw RMS**; this is not a 1,409-product shape change.
Uniform LS alignment removes the mean old-minus-new difference before calculating shape RMS.
The reproducible script is `benchmarks/consensus-audit.ts`, with full partition/largest-change output
in `benchmarks/consensus-audit.txt`. From the checkout with that dataset in `static/data`, run
`node benchmarks/atlas.ts --audit-consensus`. This audit checks rank consensuses, not every detail shard or dataset
classification, and does not change the published statistics-estimation algorithm.

### Taste correlates, bounds and scale

`taste-audit.test.ts` independently specifies 20–60/80–250 Hz balance direction, the exact clipped
9 kHz spike RMS on a uniform custom log grid, and a 31-candidate ranking where the spike remains in
the top five with/without the narrow dislike. Broad 5–9 kHz excess still contributes distance and
penalty; twenty repeated narrow constraints cannot exceed the **0.5 total score-unit budget**.
Other cases cover measured wording for every stored id, nonnegative monotone safe-side plateaus,
uncapped strength scaling, a demonstrated scale-induced rank reversal, arbitrary level invariance,
missing bands as unknown, limited one/two-positive support and separated conflicting tastes.
This supports the stated local properties, not a universal spike-ranking or monotonic preference claim.

Real-curve sanity uses fixed named profiles, strength 1, unharmonised float32 default rank curves,
published reliability, no tunings, and excludes both rated products. There are **8,067** usable
iem-711 defaults and **8,065** input candidates per profile. Every baseline and violator count uses
only the common candidate set returned by both positive-only and reason `rankTastePacked` calls;
the script asserts identical membership for all three rankings and reports input/common/excluded
counts. Re-running after this restriction retained **8,065** candidates in each profile (**0** excluded),
so the mean ranks, top-20 traits, violation and demotion counts below are unchanged. A separate
hand-accumulated weighted LS distance to the liked curve is the simple baseline; positive-only taste ranking isolates tolerance
weighting from the added dislike. Regional means are independently computed from measured bins.
“Violating” here means beyond the disliked trait by the **0.5 dB** margin in its adverse direction.
Ranks are one-based; a larger average rank means the group moved down, not that every member did.

| Like / dislike / reason                                  | Liked / disliked trait dB | Violating candidates | Mean violating rank: plain / positive-only / reason | Individually demoted vs positive-only |
| -------------------------------------------------------- | ------------------------: | -------------------: | --------------------------------------------------: | ------------------------------------: |
| 7Hz Legato / QKZ HBB Hades / higher 20–250 Hz            |            9.327 / 12.270 |                   48 |                         4951.35 / 4874.90 / 6145.52 |                                    46 |
| Moondrop Chu / Etymotic ER2SE / lower 20–250 Hz          |            2.087 / −3.068 |                  196 |                         7690.28 / 7683.52 / 7752.87 |                                   137 |
| 7Hz Legato / QKZ HBB Hades / lower 20–60 minus 80–250 Hz |             5.939 / 1.825 |                 1720 |                         6420.13 / 6400.95 / 6704.31 |                                  1049 |

All three violating groups move down against both baselines. Top-20 mean traits (plain → reason) are
**8.876 → 9.089**, **2.309 → 2.221**, and **5.822 → 5.951 dB**, respectively. Each top 20 contains
zero violating candidates under every ranking; adding the reason does **not** change positive-only
top-20 membership in these profiles. Thus these are directional tail-ranking checks, not evidence
of improved top recommendations. The script asserts real candidates reach each penalty path and
lose group rank; it does not tune to product/form classification defects. Fixed product ids and full
output are in `benchmarks/taste-sanity.ts` and `benchmarks/taste-sanity.txt`. From the checkout with
that dataset in `static/data`, run `node benchmarks/atlas.ts --audit-taste`.
These profiles are invented. **No user-labelled preference dataset or listener study is
available; no recommendation accuracy claim is made.**

### Real-catalog cold/warm performance

Run `node benchmarks/atlas.ts` from the checkout with `static/data` present. Same dataset,
Linux/Ryzen 7 9800X3D/Node v26.12.1 as above; **8,348 IEM-catalog products**. Each job gets a fresh
service for one cold call, then five resident calls (median/max below), explicit iem-711, default
harmonisation, top K=20. Taste uses three likes; compare uses 2/3/4 fixed default references selected
before timing. Every call must succeed and return winners. Cold includes manifest/catalog decode,
rank decode and index building; disk fetch is included, but reference selection can warm OS cache.
Browser network, worker startup and message/structured-clone costs are excluded.

| Request         | Before cold ms | Before warm median / max ms | After cold ms | After warm median / max ms | Hypothetical 4× warm median ms |
| --------------- | -------------: | --------------------------: | ------------: | -------------------------: | -----------------------------: |
| Similar         |        1377.47 |                 8.76 / 9.75 |       1377.71 |               9.81 / 10.48 |                          39.23 |
| Taste, 3 likes  |        1430.85 |               12.92 / 18.05 |       1452.98 |              12.72 / 17.99 |                          50.86 |
| Compare, 2 refs |        2514.55 |              82.22 / 108.25 |       1417.22 |              33.34 / 35.38 |                         133.35 |
| Compare, 3 refs |        2503.80 |             112.18 / 135.66 |       1362.77 |              44.08 / 51.88 |                         176.32 |
| Compare, 4 refs |        2546.20 |             185.61 / 188.55 |       2203.41 |              78.38 / 93.95 |                         313.51 |

The initial four-reference warm call exceeded the ~150 ms desktop target. Scalar-only compare
distances avoid allocating discarded band explanations; lazy alternative-rig discovery avoids
unrelated pack/index work on successful explicit-rig compares. Every observed after warm maximum is
below 150 ms. Four-reference cold time still exceeds two seconds in this run; resident indexes do
not solve first-load latency. The **4× column is only a scaled planning budget**, not a measured
phone or a defensible universal device ratio. Three/four-reference estimates exceed 150 ms, so no
mobile latency guarantee follows. The committed timing harness is `benchmarks/atlas.ts`; these short
local runs are not a controlled performance study.

## Atlas service validation (2026-11-02)

Service tests use the real TWFR encoder and a synthetic in-memory fetch
dataset. Independent cases cover exact +3 dB offset equivalence, aligned default medians, separate
tunings, no rig mixing, no default substitution from fit variants, observed-price/source filters,
per-source ranges and query-specific coverage, unused taste ratings, corrections, Pareto objectives,
detail channel means and variant spread, LRU eviction, concurrent-load deduplication, gzip, failed-load
retry, private uploads and PEQ exports. A real `static/data` smoke test checks result structure and
detail curves when the dataset exists, skipping only when the manifest is absent. A Node worker-thread
test runs the actual Comlink worker entry and verifies typed-array upload/PEQ round trips. It does not
exercise dataset-backed curve caching. A standalone Vite production build of the client also bundles
the ES worker
successfully (48.87 kB worker, 6.01 kB client before gzip); scratch build output was removed.

The integrated app passes `pnpm verify`, including format, lint, types, knip and tests, and
`pnpm build`. The production analysis worker is 54.30 kB before gzip. The unused ingestion-only
support-threshold export was made private; no test imported it.

Earlier partial-dataset baseline: `node benchmarks/atlas.ts` after `pnpm data:pull`, same machine/Node as the engine timings above;
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

### PR #4 review follow-up

After merging the engine/data/UI lanes, `pnpm format && pnpm lint && pnpm check && pnpm test` passes
**290 tests in 25 files**. Added independent regression cases for sparse anchors on both grids,
individually failing measurements, rankable-default rig counts, variant-only rigs, usable taste/compare
coverage, tuning-reference self-exclusion (including top K=1), finite treble penalties ≥1, and typed
reference identities. Product-only callers and optional product ownership checks for explicit
measurements remain valid. Client lifecycle tests control the pending RPC response to verify prompt
initialization rejection, root-release-before-termination ordering, no late child release, idempotent
disposal and replacement after a late response. Benchmark guard tests reject non-three-reference,
failed and zero-winner workloads; guards apply to cold, resident and taste requests.

With those fixes, `node benchmarks/atlas.ts` on the same dataset/machine measured **199.17 ms** cold
similar, **2.39 ms** resident similar and **8.97 ms** taste, each with 20 winners. All existing budgets
remain met; these are another single local observation under the timing scope above, not a controlled
comparison with the earlier run.

### Full-dataset app integration (2026-11-02)

Dataset **`208ae49722c1645d1b838cd4`** contains **7,952 products** (6,705 IEMs, 1,247 headphones),
with **24,458 iem-711 measurements**. `node benchmarks/atlas.ts`, on the same machine/Node and
with the timing scope above, measured:

| Service workload                                                  |     ms | Budget ms |
| ----------------------------------------------------------------- | -----: | --------: |
| First similar: manifest + catalog + rank decode + consensus index | 958.59 |     1,500 |
| Resident similar, including top-K source ranges                   |   6.46 |        50 |
| Resident taste, including model and winner explanations           |  17.01 |       150 |

Cold/resident similar and taste each returned 20 winners; all budgets pass. This historical run uses the new
validated correction default. Published iem-711 statistics report sufficient support and positive
pooled mean improvement overall and in every fold: **1.781 → 1.588 dB (−10.9%)**, fold improvements
**0.184–0.202 dB**, **50,823 held-out same-product pairs**. Low-support partitions remain uncorrected;
this is observational dataset validation, not physical calibration or evidence of listener preference.

Those figures belong to dataset `208ae49722c1645d1b838cd4`, not the current dataset. Current rebuilt
harmonisation figures and their dataset version are maintained in [METHODOLOGY.md](METHODOLOGY.md),
so this historical integration record is not a second current validation summary.

The 44 synthetic service tests include lazy target caching/provenance, bidirectional rig refusal,
an independently specified 3 dB shelf with reduced PEQ residual, default correction on/off, missing
and nonpositive validation, explicit unsupported requests, and uncorrected detail/PEQ behavior.

Full Playwright integration used the external config on isolated port **4189**, desktop Chromium
and Pixel 7: **26 scenarios passed**, including axe checks, product and reference EQ, attribution,
harmonisation notices, comparison, profile persistence and method/source pages. The initial run
passed 16 scenarios; ten passed after fixing stale full-data test fixtures, and the two other
scenarios affected by the shared selector change passed again. The canonical full-data model is
`TRUTHEAR NOVA`, not the separate “Nova (Azla Sedna Shorts)” product; selectors now match complete
option titles. The catalog-filter fixture uses “Truthear Hexa” because “Truthear” now exceeds the
40-row page size. No assertions were removed or weakened. Reference EQ ran in both themes on both
viewports; its result attribution and rig-filtered target list also passed axe checks.
