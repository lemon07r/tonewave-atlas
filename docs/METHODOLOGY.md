# Methodology

## Scope and representation

This engine compares **measured frequency-response shape**, not perceived similarity, overall sound
quality, individual preference probability, distortion, spatial presentation, fit or comfort. A smaller
distance is not a percentage match. Ratings inform hypotheses about measured tonal preferences, not a
diagnosis of hearing or a claim that response determines preference. No Olive/Harman preference score
is implemented: published group-preference regressions are not validated similarity measures.

Inputs are dB curves on `GRID` (240 samples, 20·2^(k/24) Hz, k=0…239) or `RANK_GRID`
(every second sample, 120 samples). The last GRID sample is about 19.9 kHz, not an exact 20 kHz endpoint.
Missing values are `NaN`; non-finite values do not contribute. All accumulations and derived curves use
float64, even when input packs are float32. There is no DOM, Node or framework dependency in the engine.
Custom frequency arrays in distance/statistical functions must use the same uniform log spacing as
their curves for smoothing and equal-per-sample regional means to represent equal-per-octave means.
PEQ and target building require GRID. Inputs are never mutated.

Only compare measurements **inside the same rig/form-factor partition**. IEC 60318-4/711-family
couplers and B&K 5128 must not be pooled or converted using a purported exact transform. Seal can
dominate bass and insertion depth can dominate upper-frequency differences. The 711 standard's
nominal operating range is roughly 100 Hz–10 kHz; response above 8 kHz is always flagged as uncertain.
Equal response on a coupler does not establish equal response at a particular person's eardrum.

## Response distance and explanations

### Product references and ranking candidates

Inside each partition, the atlas service gives a product one reference: the per-frequency median of
its **default-variant** rank measurements across available sources. Each measurement is aligned to
an order-invariant overlap medoid by a uniform-weight LS level offset before taking the median.
Among adequately self-covered measurements, choose the anchor with the most adequately overlapping
partners, then the smallest median pairwise shape distance, then the most self-covered bins, then
stable measurement id. Align the anchor first and other eligible measurements in id order, making
input permutations bit-identical. Pairwise anchor selection costs O(M²·bins) for M measurements of
one product; it is cached in the partition index. This is an overlap-first medoid, not an iterative
fit or a guarantee against every outlier configuration. Missing frequencies remain
missing unless another aligned measurement covers them; measurements with insufficient overlap with
the anchor do not contribute, and their ids are not claimed as contributors. When requested and
available, estimated source-offset curves are subtracted before alignment/median pooling. Missing
source offsets leave that source unchanged; absent statistics do not become zeros or fitted offsets.
The result records contributing measurement ids and source attribution. This median is a robust
description of the available measurements, not a physical ground truth or an independent-sample
estimate. A product with no usable default reference is not given a fabricated consensus.

`filters.sources` has two explicit semantics, echoed as `sourceMode` in similar/taste/compare results:

- `sourceMode: 'coverage'` (default): candidates must have a contributing source in the selected set;
  references and candidate scores still pool all available sources. No selected sources means no
  source eligibility restriction.
- `sourceMode: 'only'`: requires a nonempty `sources` list (otherwise `RangeError`). Filter individual
  rank-pack measurements before building both reference and candidate consensuses, preserving rig,
  default/variant and overlap rules. An explicit measurement from an unselected source is unavailable,
  never replaced. Uploaded references have no source identity and stay unchanged/unharmonised.
  Result caveats identify excluded reference/candidate measurements. Reliability, population curves
  and reviewer offsets remain the published **partition-wide** estimates; they are not re-estimated
  on the selected subset. Selected source sets are deduplicated, sorted and filtered to sources
  present in that partition for derived-index caching. Source-specific indexes share a four-entry
  LRU; eviction retains raw rank packs and ordinary, unfiltered indexes. An all-unknown selection
  remains an empty source-only pool, never an unfiltered fallback.

Rank packs already contain individual measurement ids/channel-averaged curves, so source-only pooling
requires no dataset schema change or detail fetch. Product detail is unaffected by ranking filters.

Ranking results expose their exact basis: `rankFrequencies` is RANK_GRID, every second bin of the
smoothed GRID curves; `reference.rankCurve`/compare reference curves and candidate `rankCurve` contain the scored
float32 values copied to float64 (harmonised iff reported), with the candidate's `offsetDb` subtracted.
Charts can display this basis rather than a different detail curve. Taste `centre` is the derived,
corrected rank-basis centre; candidates align to their `tasteId` with ordinary `rankWeights`. Returned
`rankWeights`, per-taste `fitWeights` and effective `treblePenalty` (similar/compare) reproduce D by
the LS formula below, refitting the offset for each weighting/reference. Compare overlays align to
the first reference with adequate query-weight overlap, named by each row's `alignedTo` index;
other objectives refit independently. Per-reference LS offsets are retained in `tradeoff.offsets`
from that scoring pass and reused for overlay alignment. If none overlaps adequately, `alignedTo` is null, `offsetDb`
is zero and `rankCurve` is unaligned: the UI must not overlay it as aligned. NaNs remain gaps.
Each taste winner also returns `nearestLiked` with the exact scored liked-member curve and an offset
aligning the **already returned candidate rankCurve** to that member. Its ordinary `rankWeights`
reproduce `fit.nearestLiked.distanceDb`, even after centre corrections; member curves are not corrected.
Detail curves remain uncorrected and higher resolution, not the basis of ranking scores.

Ranking indexes contain one default consensus per product and one separate, single-source candidate
per `tuning` measurement, preserving the verbatim variant label. Tunings are opt-in at query time.
Fit, setup, unit and unknown variants are not ranking candidates. Product detail retains all channels
and variants. It reports GRID-resolution aligned default min/max bands with finite-bin support, and
a **separate** variation band including defaults plus fit/setup/unit/unknown measurements. The latter
mixes available observational variation, not solely reviewer disagreement. A single contributing
measurement's zero-width band is not evidence of certainty. Detail averages repetitions within each
channel and then L/R in dB; its full-resolution consensus is not an upsampled rank curve.

For the top-K similarity winners only, compute D from each contributing reviewer's default curve to
the selected reference, using exactly the query's weights and directional penalty. If a reviewer has
several defaults, first take its aligned median. Report the min/max of valid per-source distances
when at least two are available, otherwise null; the result's source count counts those with adequate
overlap for this query (the candidate separately retains all contributing source attribution).
For a tuning, use only that tuning's source, not the product's default-source pool. Thus a displayed
“1.1–1.9 dB across 4 sources” is an observed reviewer range against the chosen reference, **not** a
confidence interval and not all pairwise distances among reference and candidate measurements.

### Distance calculation

For eligible overlapping finite samples, let eᵢ=aᵢ−bᵢ, W=Σwᵢ, with finite positive weights:

```
c = Σwᵢeᵢ / W
D(a,b) = sqrt(Σwᵢ(eᵢ−c)² / W)    [dB response distance]
```

The offset c is subtracted from the candidate to align it to the reference. This is weighted
least-squares level alignment, not alignment at one frequency. With fixed symmetric weights, D is
symmetric and invariant to either input's constant level offset. It is a distance on shape modulo
level when support is fixed; varying missing-data support prevents treating all pairwise results as
one metric space. Tilt is the weighted regression slope of e−c against log₂(f), in dB/octave, with a
free intercept. The distance SSE uses a centred two-pass calculation to avoid subtracting nearly
equal raw second moments; tilt uses the usual weighted raw regression moments.

Defaults: inclusive comparison range 20 Hz–20 kHz, at least 12 finite overlapping points and at least
50% coverage. Frequencies must be finite to be eligible in every distance/statistics pass. Coverage
is overlapping **bin count / eligible bin count**, not weight mass and not the
union of measured support. Zero-weight bins are ineligible. Insufficient comparisons return `null`.
These are data-adequacy safeguards, not confidence intervals; range and adequacy limits are options.
Distance itself defaults to uniform weights; callers opt into `makeWeights` explicitly.
The service checks explicit reference and compare-rig support using the actual query weights, so a
measurement confined to a sufficiently covered, nonzero-weight focus region is not rejected merely
for missing zero-weight regions. Product consensus construction still uses uniform full-grid coverage.

Band boundaries (lower inclusive, upper exclusive) are sub-bass 20–60, bass 60–250, low-mid 250–800,
mid 800–2500, presence 2500–5000, treble 5000–10000 and air 10000–20000 Hz. Band explanations use the
same global c: signed weighted mean, unpenalised RMS, bin coverage and share of total squared-distance
energy. Missing bands have null means/RMS, not zero error. Energy shares sum to one when D>0 on the
canonical grids, and are zero for identical shapes. Positive means mean the candidate is louder.

`rankPacked` scans an N×120 float32 matrix using two passes per row and a size-K max-heap: O(N·120 +
N log K), with no row objects/views allocated inside the scan. Only winners receive full band stats.
It reports evaluated and insufficient row counts; equal scores have deterministic input-order handling.

## Focus, reliability and narrow peaks

```
rᵢ = 1 / (σ₀² + σᵢ²),  σ₀ = 1 dB
wᵢ = focusᵢ × rᵢ / mean(r over eligible frequencies)
```

The 1 dB floor prevents tiny estimated spreads from acquiring effectively infinite influence. It is
a regularisation choice, **not** a measured universal just-noticeable difference. σᵢ comes from the
partition statistics. Absent, negative or non-finite estimates use a conservative placeholder:

| Frequency    | Default σ (dB)             |
| ------------ | -------------------------- |
| <100 Hz      | 1.5                        |
| 100 Hz–4 kHz | 1                          |
| 4–8 kHz      | 1 + 2 log₂(f/4000)         |
| >8 kHz       | min(6, 3 + 3 log₂(f/8000)) |

This profile is a heuristic expressing seal/insertion and high-frequency caution, not empirical rig
calibration. Reliability is normalised before focus; multiplying every final weight by one constant
does not affect D. Balanced focus is 1 through 8 kHz, a half-cosine down to 0.25 at 12 kHz, another
half-cosine to 0.1 at 16 kHz, then 0.1. Other presets multiply balanced focus by 3 in bass (<250 Hz),
vocals (250 Hz–5 kHz), or treble (2–10 kHz). Custom nonnegative band multipliers compose with these.

Optional treble sensitivity multiplies **squared positive** aligned residuals in 2–10 kHz by α; use
`treblePenalty: 2` for the default sensitive setting (otherwise 1; values below 1 are clamped to 1).
The atlas service boundary accepts only finite multipliers ≥1 and throws `RangeError` otherwise;
the lower-level engine retains its clamping behavior. No finite upper cap is specified.
c remains the symmetric LS alignment. This directional score is explicitly **not symmetric**; its
penalty energy is included in band contribution shares, while band RMS stays in ordinary dB. Peak
audibility exceeding dip audibility has qualitative support (Bücklein, 1981), but no universal α is
established. Users can adjust it; it is not a psychoacoustic calibration.

`detectNarrowPeaks` subtracts a 1/3-octave Gaussian-smoothed error to separate narrow excess from broad
excess. Local positive maxima of at least 1 dB are reported with frequency, height above the smooth
curve, and approximate Q=f/(upper−lower half-height crossing). Crossings are sampled-bin estimates,
not fitted resonator parameters. Peaks above 8 kHz carry a low-reliability flag. Smoothing is in dB on
log frequency, with Gaussian σ=(points/octave)/(fraction·√(2π)), giving equivalent rectangular
bandwidth 1/fraction octave; kernels truncate at 3σ and renormalise around missing values. A missing
centre stays missing; smoothing does not extend measured coverage.

## Cross-source statistics and validation

### Partition statistics support

Ingestion defines `MIN_STATISTICS_PRODUCTS = 20`: a partition is labelled `support.status =
"sufficient"` only with at least 20 products having default rank curves from two or more distinct
sources **and** at least one valid held-out source pair. Otherwise support is `"low"` with a reason.
This is a provisional engineering/reporting guard, not a confidence level, power calculation or
validated perceptual threshold. Twenty products allow nominally four held-out and sixteen training
products per fold in five-fold validation, rather than presenting a handful of products as a
supported partition estimate. Hash folds are unequal, so these are not guaranteed per-fold counts.
Per-source/per-bin counts and actual fold pair counts remain essential; the partition label does not
establish adequate support for every correction bin or source. Low-support estimates are exploratory,
unsupported bins remain missing (JSON `null`), and this label never enables harmonisation by itself.

Similar/taste/compare requests omitting `harmonise` enable correction only when support is sufficient and
pooled mean improvement is finite and positive both overall and in every reported fold (with a
complete, nonempty fold list). Otherwise correction defaults off. Explicit `false` disables it;
explicit `true` without sufficient support returns `AtlasError` (`insufficient-data`). Results report
`harmonised` only when finite published offsets were applied. Detail charts and PEQ remain uncorrected.
In local dataset `4faef5c62875b2b41735c95e` (frozen source snapshot 2026-11-03), five-fold iem-711
validation reduces held-out same-product pair distance **1.763 → 1.575 dB (−10.7%)**, with fold
improvements **0.178–0.195 dB** over **89,586 pairs** from **2,430 multi-source products**.
Every fold improves, so its correction defaults on. iem-5128 has sufficient support (21 products,
27 pairs) and pooled means **1.666 → 1.638 dB**, but fold 3 worsens by **0.001716 dB**; correction
therefore defaults **off**. Headphone-5128 also has sufficient support (20 products, 20 pairs),
with means **1.549 → 1.532 dB**, but fold 0 worsens by **0.022837 dB**, so correction defaults off.
These small-partition results rest on little evidence. Product-ID rekeys can change hash-fold
assignment without changing any measured curve. This is observational dataset validation,
not physical calibration or listener preference.

### Estimation and held-out validation

The ingestion caller supplies one curve per product/source within a partition, after choosing
appropriate default/tuning variants. Duplicate product/source rows are rejected. Fit variants remain
separate evidence of sensitivity, never extra independent reviewers or extra population votes.

1. Within each product, align sources by LS offset to the source with the most finite points in
   20 Hz–20 kHz (input-order ties); a sparse first source cannot discard otherwise well-covered
   sources. Curves without sufficient anchor overlap remain missing. Take a finite-point median
   consensus, and align sources to that consensus. For nᵢ≥2 finite source values, estimate spread as
   `1.4826 × median(|x−median(x)|) × sqrt(nᵢ/(nᵢ−1))`. The partition σᵢ is the median of these
   product estimates. The 1.4826 factor is Gaussian asymptotic MAD scaling; the finite-consensus
   factor compensates variance loss. **Neither makes small-n MAD an unbiased SD estimator.**
   `spreadSupport` counts contributing products, and no overlap yields NaN rather than invented zero.
2. For each source, compute its level-aligned residual against the leave-one-source-out product
   consensus. At each frequency multiply by (mᵢ−1)/mᵢ, where mᵢ counts **finite contributing sources
   at that frequency**, not all measurements in the product. With fewer than two finite sources,
   or an absent observation for this source, leave the offset NaN. Pool residual curves by median
   across products, smooth 1/3 octave, then shrink each frequency by n/(n+k), k=10, using its finite
   product support. The conversion is exact for a two-source contrast against their centre; for a
   larger robust-median consensus it is a conservative normalisation, not an unbiased physical
   calibration. Without it, two unshrunk offsets would swap the two source responses rather than
   harmonise them. LS alignment and smoothing still affect isolated-bin corrections; the factor's
   exact centre interpretation is local before those operations, not a claim that every corrected
   single-bin value equals the raw median. Subtract the resulting offset curve when harmonisation is enabled. Shrinkage
   requires about ten overlapping products for half-strength correction and limits sparse-overlap
   overfitting; k is configurable. Unobserved offsets remain NaN and are not applied.
3. Give each product one consensus curve, align those product curves to a common anchor by LS offset,
   and take the per-frequency median to obtain the population curve. Its anchor is likewise the
   best-covered product curve. This describes the dataset's
   measured product distribution, not an ideal target or a population of listeners.
4. `validateSourceOffsets(products, frequencies?, shrinkage=10, foldCount=5)` uses deterministic
   **K-fold cross-validation by product** (K≥2). A product's fold is unsigned FNV-1a over its id's
   UTF-16 code units, modulo K (initial hash 2166136261, multiplier 16777619). Every product in the
   held-out fold is excluded from offset estimation, smoothing and shrinkage support. Input products
   are sorted by id for reproducible accumulation; equal ids always stay in the same fold. Hashing is
   stable but does not guarantee equally sized folds; empty folds are reported, not trained.
   Each fold and the overall result report mean pairwise same-product D before/after correction,
   pair count, mean and **median per-pair improvement** (D_before−D_after, positive is better), and
   whether mean distance improved. Folds also report training and held-out product counts. Overall
   summaries pool all valid pairs: they are not unweighted averages of fold means or fold medians.
   No pairs gives null summaries. Unseen source offsets leave measurements unchanged. It does not
   silently enable harmonisation: real held-out improvement is needed for that product decision.
   Training runs at most K times instead of P times; with K fixed, work no longer grows quadratically
   in product count (robust medians still require sorting). This remains a build-time operation.
5. Fit variants, when supplied, get their own aligned MAD spread and mean D to their median. These
   describe sensitivity within the available measurements, not a model of any user's fit. Fewer than
   two comparable variants yield null mean distance, not a claimed zero sensitivity.

Correlated reviewers, rig calibration, tips, units and measurement selection confound all estimates.
Robustness does not turn observational overlap into independent controlled replicates. Support arrays
must accompany σ; estimates with few sources/products require particular caution.

## Multiple tastes, dislikes and user corrections

Fit/comfort-only ratings (`soundRelated=false`), neutral items and strength-zero items are excluded
from the FR model. Positive strength is in [0,1]; love has twice like's centre weight. Named liked
aspects double member weight in bass <250 Hz, mids 250 Hz–5 kHz, or treble ≥5 kHz; they do not erase
other regions. `overall` keeps uniform aspect weight.

Positives use **average-linkage** clustering on symmetric D. Merge the closest clusters while mean
cross-cluster D≤`TASTE_CLUSTER_DISTANCE_DB=3 dB`. This is a provisional engineering threshold: three
times the regularisation floor and a visibly distinct broadband shape scale, **not an established
same-product/noise boundary**. It should be calibrated against the shipped partition's cross-source
data; it is configurable, but must be finite and nonnegative. Disconnected support is infinite
linkage, not a forced merge.

Each cluster is a taste. Members are LS-aligned to its first member; the centre is a per-frequency
weighted median. Dissimilar clusters are never blended into one target. Member spread sᵢ is 1.4826
times the weighted median absolute deviation from that centre. Tolerance is
`tᵢ=sqrt(σᵢ²+sᵢ²+p²)`, with p=2 dB for a singleton and 1 dB otherwise. Agreement keeps relative
frequency weights tight; disagreement loosens them. Fit to a taste is D with weights wᵢ/tᵢ². Because D
normalises weights, a frequency-independent tolerance factor alone cannot change D; tolerance changes
relative regional influence, not a global fit probability. Also report ordinary weighted D to the
centre and D to the nearest liked item across tastes.

Reasoned dislikes do **not** form a negative-average target. Most traits are regional dB level
relative to the 500 Hz–2 kHz mean (uniform log-bin weights). Exceptions are the sub-/mid-bass balance
for the legacy `bass-lacks-punch` id and the bounded narrow-residual RMS for `sibilance`, as defined below.
`DISLIKE_REASON_LABELS` exports measured-correlate labels for every stored id. In particular, the
recommended label for `bass-lacks-punch` is **“Lower 20–60 Hz level relative to 80–250 Hz”**. This is
not a measure of punch, transient behaviour or impact; the stored id remains for profile compatibility.

| Reason                          | Trait; disliked direction                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| too-much-bass / too-little-bass | 20–250 Hz; higher / lower                                                                              |
| bass-lacks-punch                | 20–60 minus 80–250 Hz; lower                                                                           |
| too-much-midbass-warmth         | 80–250 Hz; higher                                                                                      |
| muddy-lower-mids                | 250–800 Hz; higher                                                                                     |
| thin-or-recessed-vocals         | 800–2500 Hz; lower                                                                                     |
| shouty-upper-mids               | 2–5 kHz; higher                                                                                        |
| sharp-fatiguing-treble          | 2–10 kHz; higher                                                                                       |
| dull-treble                     | 5–10 kHz; lower                                                                                        |
| sibilance                       | RMS of positive narrow residuals clipped per bin to 2 dB (curve minus 1/3-oct smooth), 5–9 kHz; higher |

For trait difference in the disliked direction, let z=direction·(candidate−disliked)−0.5 dB. The
0.5 dB margin ignores tiny differences. Penalty is strength·h(z)², where h=0 for z≤0 and
`h(z)=0.5·[log(1+exp(2z))−log(2)]` otherwise (numerically stable softplus). Squaring gives zero slope
at the safe-side join. Thus safe moderate and very low bass receive **the same zero dislike penalty**;
there is no incentive to minimise bass without bound. Each supplied directional reason contributes
separately. Missing traits are reported unknown, not a violation. These reason-to-band mappings are
interpretable hypotheses, not validated diagnoses of muddiness, fatigue or sibilance.

For the narrow 5–9 kHz reason, cap each constraint's contribution at `0.5 × strength` score units,
and cap their **combined** contribution at 0.5 across all dislikes. The 2 dB residual clip and 0.5
budget are conservative engineering limits, not perceptual thresholds. Ordinary response distance
still counts broad excess (and the clipped narrow metric can also respond to band edges). A single
9 kHz spike cannot add more than this budget through the dislike heuristic; it can still affect
ordinary distance. This is not a universal top-five ranking guarantee. Published uncertainty weights
continue to downweight high-frequency distance; the narrow heuristic does not claim insertion immunity.

Without a directional reason (`other`/`tonal-balance-wrong` included), use only near-duplicate
repulsion `strength·exp(−(D/d₀)²)`, d₀=`DUPLICATE_DISTANCE_DB=1.5 dB`. This provisional noise-scale
neighbourhood has no global directional push. A dislike within 1.5 dB of a like, or a liked item's
trait beyond a disliked item's adverse threshold, creates a structured conflict, not suppressed data.

Final lower-is-better score = **best taste fit + sum of dislike penalties**. It is a ranking heuristic,
**not dB** or a calibrated liking probability. Fit, ordinary dB distances and every penalty stay
separate. Explanations include closest like, signed band matches/differences, constraint traits and
satisfaction/violation/unknown status, >8 kHz caution and bands with mean σ>2 dB. Each constraint's
`statement` describes measured relative band levels, bounded narrow RMS or shape proximity to its
disliked reference, never a perceptual diagnosis. Missing-band statements explicitly say coverage is
insufficient; machine-readable legacy reason ids are retained.

**Penalty scale is an explicit design choice.** Fit is a tolerance-weighted response distance in dB.
Directional penalties use the numerical dB value of h and contribute strength·h²: approximately
quadratic in the adverse dB excess beyond the margin, not another response distance. The implicit
scale is one added score unit per squared dB, so a penalty of 1 ranks like adding 1 dB to fit. This
is heuristic trade-off scaling, not a physical unit conversion or a listener-validated exchange rate.
Near-duplicate penalties are bounded by **strength dB-equivalent** on that same additive scale (at
most the score increment of adding strength dB to fit, reached at D=0). They do not grow quadratically.
For one constraint at strength=1:

| Violation beyond the 0.5 dB margin, z | Adverse trait excess over disliked item | Added score, h(z)² |
| ------------------------------------: | --------------------------------------: | -----------------: |
|                                  1 dB |                                  1.5 dB |              0.514 |
|                                  2 dB |                                  2.5 dB |              2.764 |
|                                  4 dB |                                  4.5 dB |             13.349 |

Multiply these increments by strength (e.g. half at strength=.5), and sum across constraints, except
for the narrow-reason caps above. At
or below the margin the increment is exactly zero. The UI should show fit in dB and penalties as
separate **score increments**, rather than label the final score “dB distance.”

For an uncapped directional constraint, penalty is nonnegative and nondecreasing in adverse trait
excess, with a zero safe-side plateau and linear strength scaling. The narrow contribution saturates
at its budgets. Arbitrary constant measurement-level shifts do not change traits, fit or score.
Multiplying all response deviations by a positive scale is different: with a fixed reference,
weights and support, scaling candidate-minus-reference deviations scales response distance linearly.
This does not generally hold for fit after rebuilding a taste model: scaling positives changes
spread-based tolerance weights and can change clustering. The fixed 0.5 dB margin does not scale,
and uncapped penalties grow roughly quadratically. The mixture is
therefore **not scale homogeneous** and can reverse candidate order; no global monotonic preference
claim follows from a single constraint's monotonicity. Tests exercise such a reversal, missing traits,
one/two-positive limited support and separated conflicting tastes. Real-curve directional sanity
checks in `VALIDATION.md` use invented profiles, not labelled preference outcomes.

`rankTastePacked` scans an N×120 float32 matrix with scalar two-pass distances and a size-K max-heap.
`buildTasteModel` prepares taste eligibility, weights, disliked trait levels, regional sample indices
and the narrow-peak smoothing kernel once; the scan allocates no per-candidate curves, records or
explanations. Regional traits are evaluated directly on packed rows; sibilance smooths only the
required 5–9 kHz samples using the same finite-neighbour kernel as the full scorer. The scan computes
only best-taste fit and constraint penalties (plus the full scorer's ordinary-weight overlap check).
Only the K winners receive complete `TasteFit` explanations via `scoreTasteCandidate`. Ties retain
input order; missing comparisons are excluded under the same rules. Treat built models and rated
curves as immutable; use `correctTaste` for centre edits, which preserve prepared eligibility.

Confidence is qualitative. Moderate requires ≥3 positives in **every** taste, median within-taste
D≤1.5 dB, mean σ≤2 dB below 8 kHz, and no conflicts. Strong additionally requires ≥5 per taste, an
observed (not fallback) σ at every frequency through 8 kHz, and mean σ≤1.5 dB. Otherwise it is limited.
Reasons identify sparse examples, disagreement, defaults, high uncertainty, missing overlap or conflicts.
These labels express available support, not confidence percentages.

Inferred statements compare a taste centre to the partition population median after LS alignment.
Require ≥2 members, centre deviation ≥1.5 dB, mean member spread ≤1 dB, and **every member** supporting
the same direction by at least 1 dB. Do not infer air-band statements. Magnitude ranges are
`|deviation| ± max(0.5,mean spread)` (lower bounded by zero): descriptive ranges, **not statistical
confidence intervals**. The renderer says “measured” and “relative to the typical IEM in this dataset”;
the caller can supply another form factor. No population input means no inferred statements.
Per-band user corrections add dB to a copy of a taste centre; they do not rewrite learned evidence,
confidence or the original inferred summary.

## Plain-language wording and Discover presentation

Chart inspection shows frequency rounded to the nearest whole Hz, while compact axis labels use kHz
above 1 kHz. Levels are rounded to one decimal dB, with rounded zero always unsigned. Non-finite
samples or overflowing baseline differences remain gaps. Both lower and upper uncertainty envelopes
must be supplied together on the same 240-point display grid; invalid arrays are rejected rather
than silently shown without their bounds.

Discover describes signed, level-aligned candidate-minus-reference band means (candidate minus the
best-fitting taste centre in profile mode). Absolute means below 0.75 dB are omitted; 0.75 to below
2 dB uses “slightly”, 2 to below 4 dB uses unqualified “more”/“less”, and 4 dB or greater uses “much”.
These are editorial brevity thresholds, **not audibility or statistical significance thresholds**.
The omission threshold suppresses small numerical differences relative to the conservative default
spread (about 1–6 dB across frequency); even “much” does not prove a perceptual difference. Missing
bands are never described as equal. Treble/air wording carries the above-8-kHz reliability caveat.
The expanded table reports all available signed means, RMS values, regional coverage and contribution;
overall coverage is the engine's fraction of eligible rank samples. Distance and tilt are shown to one
decimal, in dB and dB/octave respectively. Lower response distance means closer measured shape, not
better sound. Reviewer ranges retain the service's participating-source count; endpoints that round
to the same one-decimal value are shown once, and absent ranges are not invented. A description that
mentions treble or air appends one plain-language reliability note for differences above 8 kHz, rather
than repeating it for each band. Listing amounts use only published USD values, attributed to their listing source and crawl
month/year; they are not current price or availability claims.

Profile inputs map love to strength 1, like to 0.6, dislike to 1, and neutral to 0 (excluded). The engine
also doubles love's positive centre weight, so a love has weight 2 versus a like's 0.6 before optional
liked-aspect weighting. Fit/comfort-only items remain stored but do not inform the sound model.
Taste results show ordinary response distance to the centre and nearest liked item separately from
the tolerance-weighted fit distance; the combined ranking score/constraint penalty is **not dB** and
is not presented as response distance. “Matched” bands means below the editorial 0.75 dB threshold,
not perceptual equivalence. Confidence and constraints retain the service's evidence; confidence reasons
use plain language without changing support counts, measured ranges or uncertainty.

Measured product detail displays use GRID detail curves/consensus. Detail-based Discover overlays remove arbitrary source levels
by weighted LS alignment of display curves to the first curve on GRID, using the active similar-mode
focus (balanced in profile mode) and default reliability weights. This display-only offset does not
change ranking or explanations, which use RANK_GRID and the service's weights. Missing samples stay
missing; display difference mode then subtracts the fixed baseline without further alignment.
“Taste N centre (derived)” is a model,
not a measurement: the returned corrected 120-point rank centre is mapped exactly to even GRID
indices, with odd indices linearly interpolated in log frequency between finite neighbours. Missing
neighbours remain gaps, and GRID index 239 is NaN (no extrapolation past the last rank point).
This adds no measured resolution. Corrections (−4…+4 dB per band in Discover) are already included
by the service and are not applied twice. At most five candidate curves may be overlaid, in addition
to reference/model curves. Difference display subtracts the chosen baseline without further alignment.

## Multiple references and adjustable targets

For 2–4 references return each D, arithmetic mean D and minimax D. A candidate is Pareto-optimal when
no other complete candidate is no worse for every reference and strictly better for at least one.
Tied objective vectors remain non-dominated. Missing any reference makes aggregates null and Pareto
false; comparisons never quietly drop a difficult reference.
The dominance pass sorts lexicographically, querying equal vectors together before inserting them.
Two objectives use a running minimum; three use a compressed prefix-min Fenwick tree; four use
nested compressed prefix-min trees. Time is O(N log N) for 2–3 and O(N log² N) for 4; auxiliary space
is O(N) and O(N log N), respectively, including all-non-dominated inputs. Non-finite objectives are
incomplete, never Pareto. Distance calculation remains O(N·references·120). Benchmarks include 8,000
candidates with 2/3/4 references and all-non-dominated 3,000-candidate fronts; no latency guarantee is claimed.

`compare` accepts `references: [{productId, measurementId?}, …]` (legacy `productIds` still works).
Explicit measurements select exact variants, never substitutes. Reference products, including all
their tunings, are excluded. Default rig selection maximises requested-item coverage with usable
defaults (or the explicit measurement); ties prefer more measured products, then partition id. A
missing reference returns `not-measured-on-rig`, names every missing reference, and lists `partitions`
where all requested references are usable. Candidate filters precede Pareto membership; `sort` is
`mean` (default) or `minimax`, missing aggregates sort last, then optional `paretoOnly` and `topK`
(default 20) limit returned rows. `counts` retain candidate/front totals before these output limits.
An explicitly chosen rig loads only its rank pack on a successful request. Alternative-rig checks
run only for missing-rig errors, first intersecting measurement metadata (including source-only and
exact-variant restrictions), then checking query-weight adequacy on those possible rigs.

Targets are edits of a supplied base, not universal prescriptions. Bass shelf defaults to 100 Hz,
Q=.707; warmth is a 200 Hz peak, Q=.7; treble shelf defaults to 6 kHz, Q=.707. Gains are caller inputs.
Tilt is t·log₂(f/1000) dB. Presence multiplies base ear gain relative to the 500–1000 Hz mean by a
log-frequency sin² shoulder on 1–6 kHz: add `(scale−1)·(base−midMean)·sin²(π log(f/1000)/log(6))`.
Outside that interval it is zero; scale=1 is identity. If no finite 500–1000 Hz pivot exists, presence
scaling is skipped rather than erasing finite base coverage. This preserves the shape of the supplied base
rather than inventing an ear-gain curve. Shelf and peak magnitudes use the same RBJ implementation as PEQ.

## Constrained parametric EQ

Use RBJ Audio EQ Cookbook peak/low-shelf/high-shelf filters at **48 kHz**, with A=10^(gain/40),
ω₀=2πf₀/fs and α=sin(ω₀)/(2Q). Shelves use **Q**, not RBJ shelf-slope S. Magnitude is calculated from
the coefficients using a closed-form |H|² polynomial in sin²(ω/2); tests independently evaluate the
complex numerator/denominator at exp(jω), plus centre gain, unity and reciprocal-gain identities.

The desired correction is target−measurement, level-aligned over 20 Hz–10 kHz. Smooth 1/12 octave
below 6 kHz and linearly blend to **2-octave** smoothing at 8 kHz (AutoEq-inspired). Above 10 kHz fit
only one average residual with total weight 0.1, not sample detail. For narrow positive corrective
requests >2 dB above the 1/3-oct smooth (measurement notches), interpolate across the request **before
smoothing**, exclude those locations from greedy seeds, and report one region per contiguous notch
run. This avoids the
smoothed shoulders of a notch creating a spurious boost target; it is not proof that any boost is safe.

Greedy initialisation tests peak seeds at the largest residual (Q=.7,1.5,3) and low/high shelves.
Independently, an averaged residual above 10 kHz of at least 0.15 dB seeds a high shelf centred at
10 kHz. This remains available when lower frequencies match or missing transition-band data prevents
smoothing from producing a lower-band seed; no individual >10 kHz peak is fitted.
Projected Levenberg–Marquardt with finite-difference Jacobians refines log₂ frequency, gain and log₂ Q
(18 iterations by default, up to 100; seed trials use up to 8). It minimises squared shape residuals,
refitting the free level at every evaluation. It is deterministic and bounded, **not guaranteed a global
optimum**. Stop when both the lower-band feature and high-band mean are <0.15 dB, or loss improves
by <0.005 summed dB². Every seed trial is accepted only if its full, low-band-plus-high-average loss
decreases after applying the treble safety cap. If further refinement followed by capping is worse
than that bounded seed trial, retain the trial instead.

Limits: default 5 filters, maximum 10; centre 20 Hz–10 kHz; peak Q .5–6, shelf Q .4–1; gain −12…+8 dB,
with centres >6 kHz and all high shelves limited to +4 dB. Safety projection reduces positive
gains if their **summed** response exceeds +4 dB from 6 kHz to Nyquist (513-point log sweep). This
conservative projection is applied before trial acceptance and again after final filter cleanup.
The returned residual reflects the bounded result, not an uncapped intermediate fit.
`capTrebleBoost` exposes that same projection. If reducing positive gains cannot satisfy the cap
(negative shelves can themselves overshoot positively), a 24-step bounded search scales **all** gains
towards zero while retaining a verified feasible result below 3.99 dB. This may relax cuts as well as
boosts. The guarantee is on the stated safety grid, not a proof over every continuous frequency.
Invalid fitter limits are rejected before coverage checks; unsupported RBJ filter types are rejected
instead of silently being interpreted as shelves.

Output includes filters, summed response, level-aligned corrected−target residual, D over 20 Hz–10 kHz,
notches, bands with residual RMS>3 dB, and >10 kHz uncertainty. Preamp is −max(0,summed boost)−0.2 dB,
using a 4097-point log sweep from 20 Hz to Nyquist to catch inter-GRID maxima. This is digital nominal
headroom at 48 kHz, not a guarantee against intersample peaks, driver limits or hearing damage.
Equalizer APO text uses `PK`, `LSC` and `HSC` with centre frequency and **Q**, not corner-frequency
`LS/HS 6dB/12dB` or a shelf-slope parameter. Q shelves require APO ≥1.2.1; see its
[configuration reference (Filter, Preamp, Channel)](https://sourceforge.net/p/equalizerapo/wiki/Configuration%20reference/).
`Channel: all` applies the same averaged-curve EQ to all channels, regardless of an enclosing channel
selection; this is not separate L/R correction. Export rounds filter parameters to 0.01 Hz/dB and
0.0001 Q, recomputes nominal headroom for those serialized filters, and rounds preamp down to 0.01 dB
so rounding cannot consume the 0.2 dB sweep margin. Other active filters/preamps still accumulate.

Wavelet GraphicEQ uses the fixed 127-frequency AutoEq grid, **20–19871 Hz**, not a rounded grid ending
at 20000 Hz. Source: AutoEq commit `7ae0f56d53074872b028649617a22bbb4232feb7`,
[`DEFAULT_GRAPHIC_EQ_STEP=1.0563`](https://github.com/jaakkopasanen/AutoEq/blob/7ae0f56d53074872b028649617a22bbb4232feb7/autoeq/constants.py#L64)
and [`eqapo_graphic_eq`](https://github.com/jaakkopasanen/AutoEq/blob/7ae0f56d53074872b028649617a22bbb4232feb7/autoeq/frequency_response.py#L121-L137):
floor `20·1.0563^i` for i=0…126, then unique/sort. Gains are the parametric response at those exact
integer frequencies **plus preamp once**, rounded to 0.01 dB; no separate preamp directive is emitted.
AutoEq's default normalisation subtracts the sampled maximum plus 0.2 dB (optional extra preamp defaults
to zero). We retain our conservative dense-sweep preamp instead: sampled gains stay ≤−0.2 dB but need
not peak at exactly −0.2 dB. This approximates the parametric response, not its exact transfer function.
JSON includes sample rate, filters and preamp. Different sample rates/implementations may differ;
none of these exports guarantees protection from intersample peaks or acoustic harm.

## References and validation status

- Robert Bristow-Johnson, [Audio EQ Cookbook](https://www.w3.org/TR/audio-eq-cookbook/).
- [AutoEq](https://github.com/jaakkopasanen/AutoEq): peak-seeded bounded fitting, cautious high-frequency
  smoothing and band-average treble fitting informed this implementation; it is not AutoEq's optimiser.
- Bücklein (1981), _The Audibility of Frequency Response Irregularities_: qualitative peak/dip
  asymmetry, not a universal weighting ratio.
- Olive et al. (2017), [AES e-library 19275](https://www.aes.org/e-lib/browse.cfm?elib=19275):
  group-preference modelling scope, **not implemented** as similarity or personal preference prediction.

See [VALIDATION.md](VALIDATION.md) for independent numerical tests and reproducible timings. Synthetic
correctness does not establish perceptual validity. The cluster/penalty/confidence thresholds, default
σ profile and reason mappings need evaluation against real within-partition overlaps and prospective
user feedback. Real-data validation covers measurement agreement only; no listener study is claimed.
