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
free intercept. A two-pass calculation avoids subtracting nearly equal raw second moments.

Defaults: inclusive comparison range 20 Hz–20 kHz, at least 12 finite overlapping points and at least
50% coverage. Coverage is overlapping **bin count / eligible bin count**, not weight mass and not the
union of measured support. Zero-weight bins are ineligible. Insufficient comparisons return `null`.
These are data-adequacy safeguards, not confidence intervals; range and adequacy limits are options.
Distance itself defaults to uniform weights; callers opt into `makeWeights` explicitly.

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

The ingestion caller supplies one curve per product/source within a partition, after choosing
appropriate default/tuning variants. Duplicate product/source rows are rejected. Fit variants remain
separate evidence of sensitivity, never extra independent reviewers or extra population votes.

1. Within each product, align sources by LS offset to the first source; take a finite-point median
   consensus, and align sources to that consensus. For nᵢ≥2 finite source values, estimate spread as
   `1.4826 × median(|x−median(x)|) × sqrt(nᵢ/(nᵢ−1))`. The partition σᵢ is the median of these
   product estimates. The 1.4826 factor is Gaussian asymptotic MAD scaling; the finite-consensus
   factor compensates variance loss. **Neither makes small-n MAD an unbiased SD estimator.**
   `spreadSupport` counts contributing products, and no overlap yields NaN rather than invented zero.
2. For each source, compute its level-aligned residual against the leave-one-source-out product
   consensus. Multiply by (m−1)/m for m source curves in that product, pool residual curves by median
   across products, smooth 1/3 octave, then shrink each frequency by n/(n+k), k=10, using its finite
   product support. The conversion is exact for a two-source contrast against their centre; for a
   larger robust-median consensus it is a conservative normalisation, not an unbiased physical
   calibration. Without it, two unshrunk offsets would swap the two source responses rather than
   harmonise them. Subtract the resulting offset curve when harmonisation is enabled. Shrinkage
   requires about ten overlapping products for half-strength correction and limits sparse-overlap
   overfitting; k is configurable. Unobserved offsets remain NaN and are not applied.
3. Give each product one consensus curve, align those product curves to a common anchor by LS offset,
   and take the per-frequency median to obtain the population curve. This describes the dataset's
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
   describe sensitivity within the available measurements, not a model of any user's fit.

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
data; it is configurable. Disconnected support is infinite linkage, not a forced merge.

Each cluster is a taste. Members are LS-aligned to its first member; the centre is a per-frequency
weighted median. Dissimilar clusters are never blended into one target. Member spread sᵢ is 1.4826
times the weighted median absolute deviation from that centre. Tolerance is
`tᵢ=sqrt(σᵢ²+sᵢ²+p²)`, with p=2 dB for a singleton and 1 dB otherwise. Agreement keeps relative
frequency weights tight; disagreement loosens them. Fit to a taste is D with weights wᵢ/tᵢ². Because D
normalises weights, a frequency-independent tolerance factor alone cannot change D; tolerance changes
relative regional influence, not a global fit probability. Also report ordinary weighted D to the
centre and D to the nearest liked item across tastes.

Reasoned dislikes do **not** form a negative-average target. Traits are regional dB level relative
to the 500 Hz–2 kHz mean (uniform log-bin weights):

| Reason                          | Trait; disliked direction                                                  |
| ------------------------------- | -------------------------------------------------------------------------- |
| too-much-bass / too-little-bass | 20–250 Hz; higher / lower                                                  |
| bass-lacks-punch                | 20–60 minus 80–250 Hz; lower                                               |
| too-much-midbass-warmth         | 80–250 Hz; higher                                                          |
| muddy-lower-mids                | 250–800 Hz; higher                                                         |
| thin-or-recessed-vocals         | 800–2500 Hz; lower                                                         |
| shouty-upper-mids               | 2–5 kHz; higher                                                            |
| sharp-fatiguing-treble          | 2–10 kHz; higher                                                           |
| dull-treble                     | 5–10 kHz; lower                                                            |
| sibilance                       | RMS positive narrow residual (curve minus 1/3-oct smooth), 5–9 kHz; higher |

For trait difference in the disliked direction, let z=direction·(candidate−disliked)−0.5 dB. The
0.5 dB margin ignores tiny differences. Penalty is strength·h(z)², where h=0 for z≤0 and
`h(z)=0.5·[log(1+exp(2z))−log(2)]` otherwise (numerically stable softplus). Squaring gives zero slope
at the safe-side join. Thus safe moderate and very low bass receive **the same zero dislike penalty**;
there is no incentive to minimise bass without bound. Each supplied directional reason contributes
separately. Missing traits are reported unknown, not a violation. These reason-to-band mappings are
interpretable hypotheses, not validated diagnoses of muddiness, fatigue or sibilance.

Without a directional reason (`other`/`tonal-balance-wrong` included), use only near-duplicate
repulsion `strength·exp(−(D/d₀)²)`, d₀=`DUPLICATE_DISTANCE_DB=1.5 dB`. This provisional noise-scale
neighbourhood has no global directional push. A dislike within 1.5 dB of a like, or a liked item's
trait beyond a disliked item's adverse threshold, creates a structured conflict, not suppressed data.

Final lower-is-better score = **best taste fit + sum of dislike penalties**. It is a ranking heuristic,
**not dB** or a calibrated liking probability. Fit, ordinary dB distances and every penalty stay
separate. Explanations include closest like, signed band matches/differences, constraint traits and
satisfaction/violation/unknown status, >8 kHz caution and bands with mean σ>2 dB.

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

Multiply these increments by strength (e.g. half at strength=.5), and sum across constraints. At
or below the margin the increment is exactly zero. The UI should show fit in dB and penalties as
separate **score increments**, rather than label the final score “dB distance.”

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

## Multiple references and adjustable targets

For 2–4 references return each D, arithmetic mean D and minimax D. A candidate is Pareto-optimal when
no other complete candidate is no worse for every reference and strictly better for at least one.
Tied objective vectors remain non-dominated. Missing any reference makes aggregates null and Pareto
false; comparisons never quietly drop a difficult reference.

Targets are edits of a supplied base, not universal prescriptions. Bass shelf defaults to 100 Hz,
Q=.707; warmth is a 200 Hz peak, Q=.7; treble shelf defaults to 6 kHz, Q=.707. Gains are caller inputs.
Tilt is t·log₂(f/1000) dB. Presence multiplies base ear gain relative to the 500–1000 Hz mean by a
log-frequency sin² shoulder on 1–6 kHz: add `(scale−1)·(base−midMean)·sin²(π log(f/1000)/log(6))`.
Outside that interval it is zero; scale=1 is identity. This preserves the shape of the supplied base
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
smoothing**, exclude those locations from greedy seeds, and report the notch. This avoids the
smoothed shoulders of a notch creating a spurious boost target; it is not proof that any boost is safe.

Greedy initialisation tests peak seeds at the largest residual (Q=.7,1.5,3) and low/high shelves.
Projected Levenberg–Marquardt with finite-difference Jacobians refines log₂ frequency, gain and log₂ Q
(18 iterations by default, up to 100; seed trials use up to 8). It minimises squared shape residuals,
refitting the free level at every evaluation. It is deterministic and bounded, **not guaranteed a global
optimum**. Stop when the best feature is <0.15 dB or loss improves by <0.005 summed dB².

Limits: default 5 filters, maximum 10; centre 20 Hz–10 kHz; peak Q .5–6, shelf Q .4–1; gain −12…+8 dB,
with centres >6 kHz and all high shelves limited to +4 dB. A final safety projection reduces positive
gains if their **summed** response exceeds +4 dB from 6 kHz to Nyquist (513-point log sweep). This
conservative projection may increase residual distance; the returned residual reflects that change.

Output includes filters, summed response, level-aligned corrected−target residual, D over 20 Hz–10 kHz,
notches, bands with residual RMS>3 dB, and >10 kHz uncertainty. Preamp is −max(0,summed boost)−0.2 dB,
using a 4097-point log sweep from 20 Hz to Nyquist to catch inter-GRID maxima. This is digital nominal
headroom at 48 kHz, not a guarantee against intersample peaks, driver limits or hearing damage.
APO/AutoEq ParametricEQ text retains shelf Q; Wavelet exports 127 log-spaced 20 Hz–20 kHz GraphicEQ
points **including preamp**; JSON includes sample rate, filters and preamp. Different EQ implementations
or sample rates may produce different results; the Wavelet curve approximates the parametric response.

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
user feedback. No real-data validation or listener study is claimed here.
