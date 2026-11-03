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

## Frozen-cache identity audit (2026-11-03)

Both builds start from `4199d08ffc44cf0977b5bae0` and the same frozen crawl. B0 is origin/main
`d031d7e`, dataset `25fd1290788e29311d0a9e01`; B1 is `a8958c8` plus eight reviewed maker aliases,
dataset `4faef5c62875b2b41735c95e`. B0/B1 contain **9,490 / 9,155 products**, respectively, with the
same **40,821 measurements / 138 databases / 118 publishers**. Scripted comparison keys measurements
by source and unordered original URL/channel pairs, retains multiplicity and decodes rank-pack int16
arrays: **zero unmatched measurements / zero changed rank curves**. All **234 / 231** manifest-listed
artifacts pass byte-count and SHA-256 checks. Every changed grouping component is within the approved
brand/plus/placeholder/CJK/alias categories; full grouping and redirect findings are recorded in
[DATA_SOURCES.md](DATA_SOURCES.md).

The frozen-input fingerprint is
`9a0f28798869e899e2c39f9e0ac24518716733765bf5f51ddad68816950e263c`, checked unchanged in the
read-only frozen cache and both build copies after all three builds. Local scripts and complete
outputs are retained under `~/.local/tmp/tw2`: `identity-rebuild-audit.py`, `identity-projections.ts`,
`identity-rebuild-audit.md`, `grouping-differences.json`, `identity-outliers.json`, `redirect-audit.json`,
`redirect-exceptions.json`, `upstream-drift.json`, `spot-checks.json`, `validation-b0-b1.json`,
`glued-brand-evidence.{py,json,md}` and `reviewed-alias-impact.json`.

LOCO is **37 scored / 37 correct / one insufficient-support / zero wrong** in both builds. The
following are pooled held-out mean pair distances in dB, not a mean of fold summaries:

| Partition      | Multi-source products B0 / B1 |   Pairs B0 / B1 | B0 before → after   | B1 before → after   | Default correction B0 / B1 |
| -------------- | ----------------------------: | --------------: | ------------------- | ------------------- | -------------------------- |
| iem-711        |                 2,450 / 2,430 | 85,266 / 89,586 | 1.763363 → 1.575243 | 1.763404 → 1.575473 | on / on                    |
| iem-5128       |                       21 / 21 |         27 / 27 | 1.666392 → 1.641151 | 1.666392 → 1.638392 | on / off                   |
| headphone-5128 |                       20 / 20 |         20 / 20 | 1.549378 → 1.533225 | 1.549378 → 1.531698 | off / off                  |

All three partitions meet the support guard. B1 iem-711 fold mean improvements range
**0.177737–0.194987 dB** (B0 **0.178207–0.194183**). B1 iem-5128 fold 3 is **−0.001716 dB**;
headphone-5128 fold 0 is **−0.022837 dB** in both builds. Positive pooled means alone do not enable
default correction. Rekeyed product IDs change hash-fold assignments, so unchanged measured curves
do not imply unchanged validation folds. The 160 yoshiultra measurements reclassified into iem-711
also affect that partition's population. Full per-partition support, spread and fold outputs are in
`validation-b0-b1.json`; these observations are not physical calibration or listener validation.

The independent B0/seed comparison isolates upstream drift: five products and 27 measurements added,
four products and eight measurements removed, one matched rank curve changed, no databases or
publishers added/removed. Six disappeared seed product IDs remain unmapped in B1 (four without any
surviving raw-file identity, one tied split and one duplicate-file ambiguity), so **universal
historical-product redirect coverage fails**; no arbitrary redirects were substituted to hide this.
The automated equality/grouping/spot checks pass; missing redirects are inspected separately, not
counted as an equality-test success.

### Redirect-only refinement

Dataset `f9ba2374a78706b8379bfed8` rebuilds from the same frozen cache and `4199d08` seed after
general redirect disambiguation rules. Versus audited `4faef5c`, **all 9,155 products / 40,821
measurements and every non-redirect catalog field are identical**. All **229 non-catalog artifacts**,
including **57 rank packs**, are byte-identical; the headphone catalog is byte-identical too.
Only the IEM catalog's redirects change, adding **two product / two measurement routes**, with no
removed or retargeted routes. Its compressed size rises **105 bytes**; version-prefixed manifest
paths and that catalog's size/hash change accordingly; `builtAt` stays identical because it derives
from cached fetch times, not the build clock. All **231 artifacts**
pass manifest size/SHA-256 checks. Build-report fields other than redirects and derived publication
metadata are unchanged, including all rig evidence, statistics, defaults and modified/base-link counts.

The PR #19 review fixes (accepted-source placeholder recovery, exact-measurement redirect priority,
collection brand keys, plus-sign boundaries, product-alias base links) rebuild the same frozen cache
to the same `f9ba2374a78706b8379bfed8`: all 231 artifacts are byte-identical. Only the identity audit
in the build report changes, because it now uses final published defaults (see `DATA_SOURCES.md`).

Coverage becomes **1,237 / 1,241 disappeared seed products**, leaving only the four accepted upstream
removals unmapped. NF ACOUS NM2+ follows its two-of-three overall measurement majority after a 1–1
former-default tie. Limited's variant kind/label disambiguates the source's explicit non-default
foam-tip reuse under Ultra; this is not a second stock default. Product resolution also handles
multiple eligible rows with one parent without inventing a measurement redirect. Still-tied cases
remain unmapped. Regression fixtures exercise default/count/identity priority, current brand/product
aliases and plus keys, duplicate-row vote inflation, metadata fallback and unresolved ties.

The rebuild's **182,761 read-only input files / 1,875,054,088 bytes** retain the frozen fingerprint
above. Focused scripts and outputs under `~/.local/tmp/tw2` are `redirects-refinement-scan.{ts,json}`,
`redirects-refinement-audit.{py,json,log}`, `redirects-source-reuse.json`, `build-b1-redirects.log`
and `verify-redirects-refinement.log`. The previous dataset and report are preserved locally in
`b1-before-redirects/`; the final dataset remains in `static/data/f9ba2374a78706b8379bfed8/`.

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
