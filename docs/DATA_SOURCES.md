# Measurement sources

Tonewave Atlas discovers reviewer databases from the public [squig.link directory](https://squig.link/squigsites.json).
Each database supplies its configuration (`config.js` at the database root, or the config script
that its page references), brand/model index (`data/phone_book.json`), and channel text
files. The manifest and catalogs attribute every included database; each measurement records its
original file URLs, database link, REW date when present, HTTP Last-Modified, and processing steps.
Reviewer-listed prices are retained verbatim; only explicit dollar/USD forms are parsed, with no
currency conversion. Dollar signs follow the source indexes' USD convention, not independently
verified current retail prices. Review links point to the source review.

## Rights and removal

Measurements are **public, not explicitly licensed**, unless a source grants permission. Public
availability is not a redistribution licence, and the squig graph software's licence does not grant
rights to reviewers' measurements. We publish resampled curves, not the raw text files. Attribution
and links are retained; they are not a substitute for permission.

The site is non-commercial and credits every database it uses. Every openly served IEM and headphone
database in the directory is crawled unless `data/exclusions.json` lists it (earbud databases are not
supported), including reviewers on the network's `optedOut` list
in `squigsites.js` (squig.link uses that list to hide shop links; we do not read it as a data
opt-out). The maintainer contacts reviewers for consent where possible. Crinacle's hangout.audio is
never crawled: it serves encrypted files behind an access check, and we do not bypass access
controls. Earbuds are not supported yet. For exclusion, correction, or takedown, open a
[GitHub issue on lemon07r/tonewave-atlas](https://github.com/lemon07r/tonewave-atlas/issues). We
honour source-owner removal requests by adding an exclusion and rebuilding; raw cache entries are
local ingestion state, never part of the published dataset. Discovery must succeed before a crawl.

## Rigs and processing

- IEMs on 711-family couplers and B&K 5128 are separate partitions. Source `rigEvidence` is `verified`
  (recognised config hardware, directory database type 5128, or a rationale-bearing override),
  `evidenced` (the product-overlap test below), or `unknown`. Unknown IEM rigs use `iem-source-<id>`:
  measurements remain visible, but never silently join a shared ranking partition. `rigInferred`
  remains for older readers; evidence is not independent hardware certification.
- Headphones never share an IEM partition, including databases labelled “5128” under `/headphones/`.
  Maker/model form rules audit every source index, including explicit `[IEMs]` categories in headphone
  databases. Reclassifications keep all channels and original URLs. Mixed-source `forms`/`partitions`
  list actual membership; a source can appear in both form catalogs. Explicit 5128, 4128 and miniDSP EARS families can share their own headphone partition (EARS Pro
  remains separate); other headphone rigs remain source-specific. `data/sources.json` owns overrides.
- The parser ignores phase, drops nonfinite rows, averages duplicate Hz in dB, sorts and validates.
  Curves are linearly interpolated in log Hz on the canonical 240-bin 1/24-octave grid, never
  extrapolated. Flat raw curves (<0.05 dB range), >100 dB ranges, calibrated values outside ±200 dB,
  and calibrated curves with fewer than 16 finite bins are rejected. Targets, calibration curves,
  delta-symbol (∆/Δ) curves, averages and explicit post-hoc EQ curves are non-products. EQ matching uses tokens,
  not substrings: Fatfreq, bleqk, SuperEQ and Tequila are retained, as is the genuine Ecoustic EQ-100.
  Explicit no/default/blank/zero/flat-EQ labels, and `EQ: Neutral/Normal/Original` states
  (including `EQ: None` and `PEQ - no gain`)
  are retained; these are source labels, not independently verified zero processing. Only explicit
  user/third-party processing (`+ EQ`, EQ'd/EQed, user/custom EQ, Oratory1990/h0llow EQ, EQ to a target,
  AutoEQ, PEQ without an explicit zero/off/default state, “with EQ”, or evident gain/filter settings) is excluded. Zero-gain PEQ/custom
  slots remain. Factory app/DSP/ANC/ambient/transparency and voicing presets are retained as tuning
  alternatives. Uncertain labels, including EQ1/EQ2 and Qudelix's “Sunrise Neutral EQ”, are non-default
  tuning, listed under `quality.ambiguousEqLabelsKeptAsTuning` (“ambiguous EQ labels kept as tuning”).
  `+ HiFi EQ` is not the explicit `+ EQ` operation. The word “Delta” alone is not an exclusion.
  Tone-control/knob values such as “K7 EQ (+12 Bass, +6 Treble)” do not establish post-hoc processing
  without further evidence; they and a named “EQ: custom - MRS” slot stay ambiguous non-default tuning.
  Explicit numeric EQ band lists and declared user/third-party operations remain excluded.
- Detail packs retain each available channel and numbered repetition. Ranking uses finite dB means
  within repeated channels, then the L/R dB mean (or available channel), 1/12-octave smoothing and
  every second canonical bin. Missing data stays missing. Channel contribution masks and paired-bin
  counts qualify imbalance RMS (L−R, 100 Hz–10 kHz). With repetitions this is the imbalance of the
  per-channel repetition means, not individual fits.
- `measurement_calibration_file` is a **subtracted** dB curve in the live squig.link graphtool's
  `applyMeasurementCalibrationToChannels`, not a target or an already-applied raw-file correction.
  The pipeline fetches it, subtracts it over its measured range, records its URL, and excludes a
  configured source if that calibration is unavailable. This newer code was absent from the public
  [squiglink/lab](https://github.com/squiglink/lab) `main` and `master` files inspected November 2026;
  confirmed implementation: [live graphtool.js](https://squig.link/graphtool.js).
- Binary TWFR v1 uses little-endian int16 at 0.02 dB steps with a NaN sentinel. Each pack's
  curve-major versus frequency-major layout is selected by measured gzip size and recorded in its
  header; `.cache/ingest/report.json` records both sizes. The catalog partitions and binary packs
  contain rank-grid `statistics` from the analysis engine: robust inter-source spread, aligned
  population median and shrunk source offsets. Unsupported bins are JSON `null`, never invented zeros;
  TWFR remains v1 (additive JSON metadata, unchanged binary samples).

## Evidence and validation

### Rig evidence

The signed rig projection uses one stable-ID default per product/source and the engine's log-grid
consensus and least-squares level alignment, with uniform weights on the full rank grid. Its direction
is the binwise median of (verified-5128 consensus − verified-711 consensus) over shared products.
Only bins with a 95% product-bootstrap median interval excluding zero and at least 50% product support
are used. Each source's binwise median residual against at least three **other** verified-711 sources
is projected onto that direction: dot(residual, direction) / dot(direction, direction). Zero is
711-like; one is 5128-like. Source intervals use 500 product-bootstrap replicates, conditional on the
learned direction; seeds and ordering are deterministic. Controls leave themselves out of both the
reference and direction. Total response distance is retained for comparison, not classification.

The threshold bisects the nearest control interval bounds. Controls must have disjoint intervals and
a score gap exceeding three times their median interval width (at least three 711 and two 5128 controls).
Minimum overlap is selected from 4/8/12/16/20/24/32 products: 200 subsamples without replacement must
classify correctly in at least 99% of trials for **every** eligible control, including at least two
5128 controls. An unverified source needs that overlap and an interval wholly on one side of the
threshold; otherwise it stays unknown. Insufficiently separated/stable controls stop the real build.
`report.json` records the direction, bin support, control scores, intervals, stability trials and every
source decision. No unverified source trains this test; evidenced sources do not certify hardware.

### Partition statistics

Statistics use only products with at least two distinct sources. Each product/source contributes one
default rank curve (lowest stable measurement ID breaks ties); non-default tuning/fit/unit variants
never gain population weight. Products without a default from two sources do not train statistics.
The engine aligns overall level, so the population median's absolute SPL is not a calibration.
`support` records product/source counts, per-bin spread support and each source offset's product/bin
support. The [methodology's partition support rule](METHODOLOGY.md#partition-statistics-support)
defines the sufficiency threshold and rationale. Low-support estimates remain explicitly exploratory,
not a recommendation to enable harmonisation. Empty support yields null bins and empty offsets.

Every partition runs deterministic **five-fold product-held-out validation**, shrinkage 10. Its
`harmonisation` includes each fold's training/held-out product counts, valid pair counts, mean
before/after distances and mean/median improvements, plus a pooled (not average-of-folds) summary.
The baseline includes `meanBefore` and `medianBefore` over all valid uncorrected held-out pair
distances, not medians of fold means. Each product is held out once; finite corrections preserve the
same missing-data support, and ingestion checks that baseline and validation pair counts agree.
Positive improvement means reduced same-product response distance in dB, not improved perceptual
accuracy. Full statistics and median spread per methodology frequency band are written to
`report.json`; the build log prints a per-partition summary of support, band spread and harmonisation.

## Updating and limitations

### Reference targets

`<version>/targets.json.gz` is manifest-listed and contains two attributed reference curves on GRID:
Harman in-ear 2019 for `iem-711`, and diffuse field 5128 for `iem-5128`. Inputs are copied unchanged
from AutoEq commit `7ae0f56d53074872b028649617a22bbb4232feb7` into `data/targets/`; its README records
the research citations and rights status: published research curves, redistributed with attribution,
remove on request. Processing is log-Hz interpolation only, no smoothing/normalization; references
are not individual preference or calibration guarantees. Harman over-ear 2018 is deliberately absent
because its GRAS basis does not match our headphone rigs. Targets never train partition statistics.
Each target's provenance and the build report retain the input file/hash, upstream revision,
processing steps and every successful parse warning (including dropped rows or merged frequencies).

### Commands and reports

Manual updates use `pnpm data:crawl`, then `pnpm data:build`. The Deploy workflow also re-crawls weekly
on Monday at 06:17 UTC (`17 6 * * 1`) before rebuilding and deploying.
Use `--sites superreview,elrics --limit 10` for a partial crawl (limit is filename stems per database).
The crawler uses an identifying User-Agent, four global request slots (never more than six),
conditional ETag/Last-Modified requests, persistent content-addressed cache, and exponential backoff.
Failed revalidations retain the last successful body and record the failure separately; sources
without a successful configuration are excluded rather than silently losing calibration or rig data.
Retained discovery, configuration, calibration and measurement failures are listed with their URL/status
in the build report; the crawl summary also records retained fetch failures. A retained body is not
counted as a fresh successful retrieval.
Remote configuration paths must stay on the database's HTTP(S) origin. Hand-maintained inputs are
strictly validated; missing keys, unknown keys (except `_note`), or wrong value types stop the command.
Persistent rate limiting or blocking stops the crawl. Interrupted crawls resume from cached files.
`pnpm data:pull` retrieves the published manifest/files and verifies SHA-256; `DATASET_URL` overrides
the default `https://tonewave.lr7.dev/data/`.

Builds are deterministic for unchanged cache/inputs; build time is the newest relevant cached content
fetch time, not the current wall clock. Output versions hash the artifacts and source attribution.
Verified existing versions stay in place on repeat publication; repairs use a recoverable backup and
commit the manifest last. Generated old versions are removed only after successful local publication.
Serial publication sweeps abandoned build/pull/interrupted staging on success and failure. Every
backup survives a failed publication; backup and old-version sweeping requires a committed manifest
whose current version and live files are reverified. Cleanup errors are warnings after a committed
manifest, not failed publications.
Reports count missing channel HTTP responses and distinguish uncached
variants in partial crawls from rejected measurements, and list parsing failures, unaliased
brands, duplicate index rows, normalised identity collisions, and suspicious adjacent near-names. Exact
duplicate index rows are removed; duplicate measurement identities retain the first accepted entry
with a report entry. Fuzzy names are never
automatically merged. Abbreviations may remain separate products. Variant kinds retain the original
label: explicit replacement samples (sample/unit 2) take precedence as `unit`; tips, foam,
insertion and pads are `fit`; switches, filters, impedance, nozzles and DSP are `tuning`; cables and
adapters are `setup`. Classification uses descriptors rather than the stock model's words. Default
selection prefers explicit default/stock, neutral EQ/normal/standard/original, then ANC-off states;
ties use source order. Without an obvious stock state, the first non-excluded, non-ambiguous file
remains the fallback, including mode-only products such as CMF Buds Pro. Other modes are non-default
tuning unless required by the final coverage fallback below. Explicit sample 1 is initially eligible;
replacement samples are initially excluded. `S1`–`S9` shorthand requires explicit sample/unit wording
elsewhere in the source's phone book or other S-number measurements of the same maker/product at that
source. Otherwise it is model text, not a sample claim. B&W generation labels such as Pi7 S2, Px7 S3
and Px8 S2 are not replacement-sample labels. Parenthesized/bracketed `(by person)`, `(measured by person)`
and similar credits are neutral attribution: stripped from variant labels/descriptors, retained verbatim
in original filenames. `quality.defaultSelections` and
`quality.tuningModes` retain the selection and accepted mode audit.

Recognized terminal switch-state suffixes (high/low impedance, including “impedence”/“imp”, DU or
binary switch positions, explicit named modes), cable/termination suffixes and recognized tip
suffixes are folded into an
**already accepted exact parent** of the same maker/form. Normal identity spelling rules apply;
no new fuzzy, Roman/Arabic, revision or bare “Balanced” model equivalence is inferred. The suffix
becomes part of the original variant label, with the identity move retained in processing provenance.
2.5/3.5/4.4 mm, named cables, balanced connections and single-ended terminations use the existing
`setup` kind, not a new core kind. A source's sole cable option stays default; multiple split cable
options retain one default (explicit standard/stock/default first, then source order). DSP cables
still carry their tuning meaning, and impedance plugs are not treated as neutral terminations.
Tip suffixes include Stock Tip, branded tips, foam, wide/narrow/standard bore, CP100/CP145 and named
tip families. They become `fit` only when every token is a recognized tip term; a source's sole
neutral tip option stays default, while additional split tip defaults prefer stock/standard/default
then source order. Other tokens (including `02`/`12` in Hisenior T4's foam labels) stay in the variant
label and make it `tuning` (initially non-default), without guessing their meaning. Model designators such as
Pro/Max/II/2/S/Ultra/Plus, T4/X2, revisions, samples and mods prevent that suffix from being folded.
Existing unit or tuning meaning wins over neutral tip metadata. Ambiguous tip suffixes are retained
in `switchIdentity.tipAmbiguities`, with their tokens in each move and the default protection in
processing provenance; ordinary switch reconciliation cannot promote them, but final default coverage
can select a default while retaining the original descriptive label and previous kind in provenance.
Recognized tip vocabulary includes stock/standard/original, silicone/foam, ear/tip/bore descriptors,
CP codes and ABP-T; SpinFit W1/Omni, Azla/Sedna Short/Light/Crystal/Origin, Divinus Velvet, Baroque,
Moondrop Spring, Final E, JVC Spiral Dot, Sennheiser foam, TENNMAK SoFoam and KZ tips. Other names,
colors and codes are not assumed neutral merely because the same suffix also contains “tip”.

Before rig evidence and statistics, labelled switch defaults are reconciled **per product**, with
one vote per source's unambiguous existing default state. A unique plurality selects the common
state. Each source with an eligible explicitly labelled curve in that state selects it; other
explicit states are non-default tuning. Existing defaults break within-source ties, then source
index order. Replacement units, ambiguous EQ and impedance-adapter loads cannot become the bare
switch-state default. A different switch state wins over incidental tip/fit metadata; same-state tip
changes remain `fit`. CP100/CP145, ABP-T and wide-bore labels are recognized as tips. Unlabelled
defaults are preserved, not acoustically assigned.
Tied pluralities remain unresolved. DU and 00, or named modes and impedance positions, are **not**
equated without evidence. Multiple defaults without an eligible selected labelled state remain unchanged
and are listed as unresolved. The reports `switchIdentity`,
`switchDefaults`, `variantReview` and `unknownVariants` retain moves, votes, per-source choices,
every state/cable variant and residual unknown labels for audit.

After final rig/partition assignment, **every measured (product, partition) must have a default**.
Every (product, source, partition) must also have one except when a selected labelled switch state is
absent at that source and another source supplies defaults for that product in the **same partition**.
Singleton unit/fit/unknown groups always become default. Otherwise missing defaults use the lowest
numbered sample (or first unit), stock/neutral fit first, or the existing tuning/default tie-break and
source order. Every selected default has **`kind: 'default'` and `isDefault: true`**, retaining its
original label and recording the previous kind in processing provenance. A sample or ambiguous setting
can represent an otherwise unusable product without a claim that the measurement is stock. The build
enforces `isDefault === (kind === 'default')` for every published measurement; coverage counts use
`kind`, which is the field consumed by the engine, UI and rig evidence. Statistics uses the equivalent
`isDefault` flag.
Multiple defaults are reduced only when the selected labelled state is present; no encoding is guessed.
`defaultCoverage` records counts before/after finalisation, selections, justified exceptions and every
unresolved multiple-default group with filenames. A fatal assertion runs before statistics/publication
if kind/flag consistency, product coverage or the source exception rule is violated. Rig evidence sees
kind-correct provisional defaults first; those choices are restored before final selection so final
partition assignment, not provisional isolation, determines the published fallback. `rigDefaultCoverage`
records the evidence input. The artifact audit builds the app's real `buildPartitionIndex` for every
partition, in raw and harmonised modes, and requires a product candidate for every measured product in
that partition. Counts against the previous published catalog are recorded separately in the audit
below, not confused with pre-finalisation counts.
Newer index schemas without `file` lists are reported as
unsupported, not silently guessed. Source hardware, raw calibration, insertion, tips, seal and prices
are not independently verified. 711/5128 data is not converted between rigs; high-frequency response
and inter-source differences require caution.

Blank/placeholder identities and unresolved leading markers are quarantined. Numeric models such as
Binary 1900 are legitimate when their maker is named; wholly symbolic/numeric identities are not.
Explicit fake/replica/counterfeit names or file descriptors, clone/copy product names, and unidentified
one-character custom names are non-products. Clone accessories alone do not make the product fake.
Earphones Archive's `*` is a mixed index category, not a uniform fake flag (its index, config and page
do not define a stronger meaning). Named mods/DIY/prototypes remain separate, source-attributed custom
products; an explicitly modified file grouped under stock gets its own full descriptor in the identity.
No mod label is stripped to merge it into stock. Near-identical defaults from the same source and
normalized product identity retain the first accepted curve only when coverage matches, aligned RMS
is ≤0.01 dB and every aligned bin differs by ≤0.02 dB. Separately labelled units/fits/tunings are not
deduplicated by shape. Quarantine reasons, marker changes, variant corrections and per-database form
counts are written to the report. The build stops if this removes >3% of legitimate defaults from a
partition of at least 200 measurements; non-product exclusions and data-preserving moves are exempt.

Product identity removes complete leading raw or canonical brand names using the same case, accent,
spacing and punctuation normalization as identity, with a nonempty remainder; partial words remain
untouched. Display labels are separate from identity: every accepted measurement contributes one vote
for its source-index brand and its model after complete leading-brand removal, before product aliasing.
Rejected/duplicate measurements do not vote; multiple files from a source each vote once, not once per
channel. Models vote within the merged product; brands vote across the entire catalog (both forms) for
each canonical normalized brand key. Highest frequency wins, then a spelling containing both uppercase
and lowercase Unicode letters, then lexicographic UTF-16 order. Only observed spellings are eligible;
singleton all-caps labels stay all-caps, and alias-table casing never supplies a display vote. IDs,
variant labels and original URLs are unaffected by display voting.

`data/products.json` contains explicit, terminal `brands` (optional) and brand/model `aliases` maps;
string `_note` entries are permitted at the top level and inside either map. Its maker aliases are
validated together with `data/aliases.json`, and product alias keys/targets are checked after maker
normalization, so cross-table conflicts and brand-hidden product chains are rejected. Malformed,
duplicate, cyclic or chained mappings stop ingestion. Initial Roman/Arabic numeral aliases were
verified against catalog/file names in dataset `3c9d923462f8b79c98aa4ef9` (evidence in the input note).
Two explicit collaboration-spelling aliases were verified in dataset `82c0a5df23cc64e5d7268caa`
against model/file names and nearby cross-source response shapes (evidence in the nested alias note).
Only the recognized switch/cable/tip suffixes above are folded; sample/revision labels remain separate.
`identityMerges.productsBefore` counts globally unique
original keys; `productsAfter` is the final count and `merged` is their net difference. Separately,
`groupwiseMerges` lists each many-to-one group's original keys and reduction plus their total; this
can differ from net reduction when an original key also splits across final products. The report also
records remaining suspicious near-name pairs for manual review, never fuzzy auto-merging.
Near-name audit candidates are separated by form, and known forms are labelled in collision groups.
The complete `remainingCollisionGroups` list is retained, not just the first twenty. These adjacent-name
heuristics are not an exhaustive duplicate detector, particularly across unrelated brand keys.

### Identity audit (November 2026)

The baseline was dataset `208ae49722c1645d1b838cd4`, 7,952 products. Its 858 adjacent-name pairs form
**585** disjoint connected groups, rather than the approximate 315 initially expected. Only exact,
reviewed alias entries change identity; distances are corroboration, not automatic merge thresholds.

The [maker's own Binary site](https://binary.audio/) is titled “Binary Acoustics Official”, welcomes
visitors to “Binary”, and lists Binary 1900, Dynaquattro and Gizaudio × Binary Chopin (also “Chopin”
in its product navigation). This establishes the long/short maker names and Chopin collaboration
spelling. The singular source spelling “Binary Acoustic” shares the same named models and nearby
curves. The [EP321 product page](https://binary.audio/products/binary-ep321-mems-2dd-3ba-1-mems-driver-in-ear-monitors)
and [maker announcement](https://binary.audio/blogs/news/breaking-the-mold-introducing-the-ep321-worlds-first-direct-drive-mems-iem)
call the same 2DD+3BA+MEMS product both EP321 and EP321 MEMS: MEMS is not stripped generically.

Distances below are dB RMS using the analysis engine's `responseDistance` on the baseline's decoded,
0.02 dB-quantized default rank curves, 20 Hz–20 kHz, least-squares constant-level alignment, common
finite bins only. Every compared pair shares `iem-711` (a rig family, not proof of identical hardware).
Each cross-product measurement pair contributes once; “median” is over all such pairs, not a
perceptual bound or claim that every source agrees. All listed closest pairs are cross-source;
there are no within-database pairs for these merges. Focal has no shared rig partition, so no
cross-rig distance was fabricated. Original filenames, source links and measurement variants remain.

| Merge / maker evidence                                                                           | Pairs | Minimum / median dB | Closest source IDs (directory usernames) and original filenames                                               |
| ------------------------------------------------------------------------------------------------ | ----: | ------------------: | ------------------------------------------------------------------------------------------------------------- |
| Binary Acoustics ↔ Binary, 1900                                                                  |    65 | 0.447697 / 1.159805 | tonedeafmonk / breampike: both `Binary 1900`                                                                  |
| Binary Acoustic ↔ Binary, 1900                                                                   |    10 | 0.560647 / 0.996723 | breampike `Binary 1900` / boizoff `1900 (stock silicone tips)`                                                |
| Binary Acoustics ↔ Binary, Dynaquattro                                                           |    48 | 0.917373 / 1.974563 | pw `Binary Dynaquattro` / aftersound `BINARYACOUSTIC DYNAQUATTRO`                                             |
| Binary Acoustics ↔ Binary, EP321                                                                 |    12 | 0.792045 / 1.584451 | jaytiss `BinaryEP321` / lumerion `Binary Acoustics EP321`                                                     |
| Binary Acoustics ↔ Binary, EP321 MEMS                                                            |     9 | 0.625162 / 1.268355 | bassaudio `Binary Acoustics EP321 MEMS` / elrics `Binary Acoustics EP321 MEMS Sample 1`                       |
| Binary Acoustic ↔ Binary Acoustics, EP321 MEMS                                                   |     9 | 0.746351 / 1.798084 | aftersound `BINARYACOUSTICS EP321 MEMS` / boizoff `EP321-MEMS (TENNMAK SoFoam tips) ✓`                        |
| Binary Acoustics ↔ Binary, x Gizaudio Chopin                                                     |    56 | 0.511124 / 1.208575 | gadgetrytech `Binary Chopin` / jaytiss `Gizaudio × Binary Chopin`                                             |
| Binary EP321 ↔ EP321 MEMS                                                                        |     3 | 0.657514 / 1.281976 | jaytiss `BinaryEP321` / bassaudio `Binary Acoustics EP321 MEMS`                                               |
| Binary Chopin ↔ x Gizaudio Chopin                                                                |    21 | 0.654797 / 1.216321 | iemocean `Binary Acoustics Chopin` / fahryst `Binary x Gizaudio Chopin`                                       |
| Kiwi Ears Halycon → [Halcyon](https://kiwiears.com/products/kiwi-ears-halcyon)                   |    13 | 0.912881 / 2.043505 | hobbytalk / practiphile: both `Kiwi Ears Halcyon`                                                             |
| Kiwi Ears Haylcon → Halcyon (same maker page)                                                    |    13 | 0.851655 / 1.323996 | soundcheck39 `Kiwi Ears Halcyon` / jaytiss `KiwiHalycon`                                                      |
| Kiwi Ears Fortenza → [Forteza](https://kiwiears.com/products/kiwi-ears-forteza)                  |    22 | 0.725555 / 1.374885 | vortexreviews `Kiwi Ears Forteza` / tonedeafmonk `KIWIEARS FORTENZA`                                          |
| Kiwi Ears Airioso → [Airoso](https://kiwiears.com/products/kiwi-ears-airoso)                     |    16 | 0.596324 / 2.696680 | jaytiss `Airoso` / audioamigo `Kiwi Ears Airioso`                                                             |
| MOONDROP Solis II → [Solis 2](https://moondroplab.com/en/products/solis-ii) (maker uses both)    |     2 | 1.169798 / 1.189029 | precog `Moondrop Solis 2` / boizoff `Solis II (TENNMAK SoFoam tips) ✓`                                        |
| MOONDROP Variation → [Variations](https://moondroplab.com/en/products/variations)                |    75 | 0.911864 / 2.028026 | bukanaudiophile `Variations` / dl `Variation white`                                                           |
| KZ LINLONG → [Ling Long](https://kz-audio.com/kz-ling-long.html)                                 |    27 | 0.878127 / 1.851431 | aftersound `KZ LINLONG` / dl `KZ LingLong`                                                                    |
| Symphonium Crimsom → [Crimson](https://www.symphoniumaudio.com/products/crimson)                 |     8 | 0.000000 / 1.266468 | treblewellxtended / theaudiostore: both `Symphonium Crimsom` (duplicated response, not independent agreement) |
| Juzear Dragonly 81T → [Dragonfly 81T](https://juzearaudio.com/products/juzear-81t)               |     3 | 1.114915 / 1.294263 | tonedeafmonk / soundcheck39: both `Juzear Dragonfly 81T`                                                      |
| Focal Azuyrs → [Azurys](https://www.focal.com/products/azurys) (plain transposition, same maker) |     0 |      Not comparable | No shared headphone rig partition                                                                             |

This audit does not fold separately indexed samples, resistor loads, tips, switch settings or revisions
into defaults. For example, Airoso 10ohm stays separate (3.542617 dB from standard Airoso on the same
source), as do Crimson tip suffixes and Chopin S1/S2 entries. Punch Martilo/Martillo stays separate:
0.754084 dB minimum alone is insufficient without maker-name evidence. Campfire Honeydrew/Honeydew
also stays separate pending a same-rig response check; the maker's history confirms Honeydew but
the curve comparison was not completed in this audit.

#### Rebuilt result and remaining groups

Dataset `ba2578bd5a41b28acce7e040` has **7,933 products**, down 19 from the live baseline:
seven reductions from maker aliases, nine spelling-error corrections, one Roman/Arabic numeral
alias (Solis II/2), one explicitly verified MEMS naming alias (EP321), and one collaboration-name
alias (Chopin). These are incremental reductions from 7,952, not the total historical merge count.
The build's `originalKey` is recorded after maker canonicalization, so its 7,984 → 7,933 (51) audit
excludes the seven maker-alias reductions; the comparable original-key baseline was 7,991 → 7,952
(39). All 29,977 measurements remain. Display examples are `TRUTHEAR NOVA` → `Truthear Nova`,
`MOONDROP Kato` → `Moondrop Kato`, and `MOONDROP Variations` → `Moondrop Variations`.
Verification checked all 121 artifact byte lengths and SHA-256 hashes, decoded all 118 binary packs
(29,977 rank curves and 54,095 detail-channel curves), and checked catalog/pack references. Removing
only identity-dependent IDs and shard paths, the measurement metadata is identical to the baseline.

There are **576 connected near-name groups / 848 pairs** after the rebuild (585 / 858 before).
Labels can change the order among equally sized groups but do not authorize additional merges.
Below are the first twenty groups in the rebuilt report, ordered by size (ties in report order).
Each row covers the whole connected group, not a promise that every pair is a genuine duplicate.
Switch encodings are retained as supplied: no unverified DD ↔ 00 correspondence is assumed.

| Rank | Group (form; products)                   | Why left separate                                                                                                                     |
| ---: | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | Joyodio VZ10 (IEM; 9)                    | Distinct eight-switch D/U configurations, not spelling differences.                                                                   |
|    2 | Yanyin Canon Pro (IEM; 9)                | Default plus DD/DU/UD/UU and 00/01/10/11 states; default state and cross-source switch encoding are not established.                  |
|    3 | Arpegear Hane (IEM; 7)                   | Distinct four-switch configurations, including all-down/all-up.                                                                       |
|    4 | Kiwi Ears Quartet (IEM; 7)               | Default plus numbered and DD/DU switch-state entries; no verified mapping to one default.                                             |
|    5 | Mystery Collab (IEM; 7)                  | V1/V2/V4–V8 version designations; no evidence these are interchangeable names.                                                        |
|    6 | Night Oblivion Butastur (IEM; 7)         | Default, 00/02/10/12/UD settings and an s2 sample; neither settings nor sample are stripped.                                          |
|    7 | Audio Technica ATH family (headphone; 6) | M20x/M40x/M50x/R30x/R50x are different models; R50x (S2) is separately sample-labelled.                                               |
|    8 | ivipQ Conch (IEM; 6)                     | V12 and V13 revisions, plus V13's 00/01/10/11 switch states.                                                                          |
|    9 | KZ AS24 (IEM; 6)                         | Different eight-switch states, including parenthesized all-down.                                                                      |
|   10 | KZ ZS10 Pro 2 (IEM; 6)                   | 0000/0001/1000/1100/1110/1111 switch states, not aliases of the default.                                                              |
|   11 | Unique Melody MEST (IEM; 6)              | Mk1/II/III and CF edition labels. Possible numeral-spelling pairs lack a completed maker/curve check, so the whole group is retained. |
|   12 | NAN-Z NAN-7 (headphone; 5)               | 1/5–5/5 numbered sample/measurement labels; no proof of identical unit/setup.                                                         |
|   13 | Sony 1000XM family (headphone; 5)        | WH XM3/XM4C/XM5/XM6 generations are different. The source-indexed WF entry is also not silently changed or folded into a WH model.    |
|   14 | CCA Trio (IEM; 5)                        | 0000/0001/0100/1001/1101 switch settings.                                                                                             |
|   15 | CVJ Konoka (IEM; 5)                      | Default plus DD/DU/UD/UU settings; default's switch state is not established.                                                         |
|   16 | Hisenior Okavango (IEM; 5)               | Default plus DD/DU/UD/UU settings; default's switch state is not established.                                                         |
|   17 | KZ Castor Black (IEM; 5)                 | DDDD/DDDU/DDUD/DUDD/DUDU settings; these are tuning differences.                                                                      |
|   18 | KZ Castor Pro Black (IEM; 5)             | DDDD/DDDU/DDUD/DUDD/UDDD settings; Pro is also not stripped.                                                                          |
|   19 | KZ Krilla (IEM; 5)                       | DDDD/DDDU/DDUD/DUDD/UDDD settings.                                                                                                    |
|   20 | Night Oblivion W20 (IEM; 5)              | DDD/DDU/DUD/UDD/UUU settings.                                                                                                         |

### Catalog-quality audit (November 2026)

The corrected offline rebuild from `ef7ead8fc680aae919189e39` to `6417dab7343144186a57d2d9` changes
**10,013 → 10,065 products** and **41,064 → 40,814 measurements**, retaining all **138 databases /
118 publishers**. Product totals include distinct modified-product identities, not just exclusions.
The earlier `abae8ab46fc2d5afd215c344` build incorrectly excluded factory EQ presets. This correction
restores **1,016 measurements / 64 products** relative to that build, with **no further removals**.
Of its 1,205 EQ quarantines, 1,016 now publish, 94 remain explicit post-hoc EQ exclusions, and 95
remain unpublished for other existing reasons (missing/invalid channels or local exclusions).

The **250 previously published exclusions** are 86 explicit post-hoc EQ curves, 70 fake/replica/
counterfeit/clone/copy entries, 84 placeholder identities, two unidentified one-character customs,
two population averages and six target/calibration/delta/sandbox entries. There are **zero legitimate
removals in every partition**, including zero duplicate-default removals. All 20 requested filename
examples survive in their real source groups; Sunrise Neutral EQ is non-default tuning, ANC-off
stock states are selected deterministically, and the sole CMF Buds Pro mode retains its fallback default.

#### Exclusions by original partition

Each cell is **raw quarantine candidates / previously published removals**. Identity includes
placeholder/marker failures and unidentified customs; fake includes clone/copy product identities.
Raw candidates also include uncached or previously rejected entries. All unlisted partitions have
zero exclusions. Source-specific headphone rows use the source username; their exact partition IDs
are retained in `quarantineSummary`. The legitimate-removal numerator is zero in every row.

| Original partition         | Post-hoc EQ |        Fake |     Identity | Target/calibration/delta/sandbox |   Average |         Total |
| -------------------------- | ----------: | ----------: | -----------: | -------------------------------: | --------: | ------------: |
| iem-711                    |     48 / 41 |     40 / 40 |      96 / 82 |                           22 / 5 |     0 / 0 |     206 / 168 |
| iem-5128                   |     16 / 16 |     13 / 12 |        2 / 2 |                            1 / 0 |     2 / 2 |       34 / 32 |
| headphone-5128             |       5 / 5 |     11 / 11 |        0 / 0 |                            0 / 0 |     0 / 0 |       16 / 16 |
| headphone-minidsp-ears-pro |       4 / 4 |       0 / 0 |        0 / 0 |                            0 / 0 |     0 / 0 |         4 / 4 |
| boizoff                    |       5 / 5 |       3 / 2 |        0 / 0 |                            0 / 0 |     0 / 0 |         8 / 7 |
| capraaudio                 |       0 / 0 |       1 / 1 |        0 / 0 |                            0 / 0 |     0 / 0 |         1 / 1 |
| elrics                     |       3 / 3 |       0 / 0 |        0 / 0 |                            0 / 0 |     0 / 0 |         3 / 3 |
| filk                       |       1 / 1 |       0 / 0 |        0 / 0 |                            1 / 1 |     0 / 0 |         2 / 2 |
| gadgetrytech               |       1 / 1 |       0 / 0 |        0 / 0 |                            0 / 0 |     0 / 0 |         1 / 1 |
| kuulokenurkka              |       3 / 3 |       3 / 3 |        0 / 0 |                            0 / 0 |     0 / 0 |         6 / 6 |
| sai                        |       6 / 6 |       1 / 1 |        2 / 2 |                            0 / 0 |     0 / 0 |         9 / 9 |
| silicagel                  |       2 / 0 |       0 / 0 |        0 / 0 |                            0 / 0 |     0 / 0 |         2 / 0 |
| superreview                |       1 / 1 |       0 / 0 |        0 / 0 |                            0 / 0 |     0 / 0 |         1 / 1 |
| **Total**                  | **95 / 86** | **72 / 70** | **100 / 86** |                       **24 / 6** | **2 / 2** | **293 / 250** |

#### Tuning and ambiguous EQ audit

Relative to the incorrect build, **695 previously accepted measurements become tuning**, including
164 formerly default curves. The 1,016 restored measurements are 901 tuning, 91 deterministically
selected defaults and 24 separately labelled units. Explicit DSP presets take precedence over incidental
stock-tip metadata; unrelated tip/fit and replacement-unit protections remain. Across all quality rules,
the report records 4,393 corrections against the historical classifier, not just this EQ follow-up.

**479 ambiguous EQ labels are kept as non-default tuning**, with IDs/labels/source filenames in
`quality.ambiguousEqLabelsKeptAsTuning`. Fifteen examples (not claims about their origin):

| Source                      | Filename or original label                                                             |
| --------------------------- | -------------------------------------------------------------------------------------- |
| achoreviews                 | Sony Linkbuds S (Foam Tips, ANC OFF, EQ1)                                              |
| aden                        | AME T71 (Aden), label “Aden EQ”                                                        |
| aftersound                  | ANKER LIBERTY 4NC EQ                                                                   |
| arn                         | Enco X2 EQ Real                                                                        |
| atechreviews                | Moondrop Rays EQ Equalized                                                             |
| audioamigo (headphones)     | Noble Audio Artemis Wireless Bluetooth Audio Amigo EQ                                  |
| audioamigo (IEMs)           | Hidizs x DucBloke MK12 Turris Sparkle EQ                                               |
| boizoff (headphones)        | Headphone Pro (2025 sample, fresh stock pads, ANC max, EQ electro, bass 0, ideal seal) |
| boizoff (IEMs)              | G30 (DSP cable, EQ pure, TENNMAK SoFoam tips)                                          |
| bukanaudiophile             | Variations (EQ)                                                                        |
| csi-zone                    | JCALLY Space G Gam, label “EQ: Game”                                                   |
| dchpgall                    | T71 IEM S1 (by s_g, EQ AME 1, CP100+ Tip)                                              |
| dentreviews                 | ER4S Foam EQ                                                                           |
| dhrme                       | BeoPlayEx NeutralOptimal, label “EQ: Optimal”                                          |
| earphonesarchive (IEM 5128) | Qudelix QX Over (Sunrise Neutral EQ)                                                   |

All 142 available source indexes were audited (four have no accepted curves). Data-preserving form
corrections move **656 measurements across 30 databases**, including five newly restored modes.
[Listener's protected 5128 database](https://listener.squig.link/5128/) retains
its measurements: 47 headphone measurements / 38 prior product identities move to `headphone-5128`.
The preliminary 45/36 count missed the case variants HD660s2 and HD800s. Maker/model rules also catch
headphones in HBB, Hu-Fi and Regancipher, and IEMs in Sai's explicit `[IEMs]` group and Auriculares
Argentina. There are 120 category/marker corrections; named mods
retain distinct identities and their original file URLs. KZ Unknown (`Kz Un`) and CVJ Unknown
(`Cvj Un`) came directly from HBB's index: the parser previously validated strings without a semantic
placeholder check. Both are now quarantined, not assigned invented models.

Rig evidence uses 241 direction products and 116/120 rank bins. The nearest leave-source-out control
interval bounds are **0.379746 / 0.846510**, giving threshold **0.613128**. At four products the least
stable control classifies correctly in 196/200 trials; at **eight products all 37 eligible controls
achieve 200/200**, so eight is the minimum. Larger 24/32-product trials lack two eligible 5128 controls
and cannot establish sufficiency. Among databases with accepted IEMs: 35 are config-verified 711,
three directory-verified 5128, 72 evidenced 711, and 13 unknown. The latter retain 288 IEM
measurements in source-specific partitions. No unverified source becomes a 5128 control.

| Partition      | Multi-source products before → after | Held-out pairs before → after | Current mean before → after dB | Current fold mean-improvement range dB |
| -------------- | -----------------------------------: | ----------------------------: | -----------------------------: | -------------------------------------: |
| IEM 711        |                        2,500 → 2,442 |               83,575 → 82,018 |            1.766370 → 1.577893 |                    0.178694 … 0.194419 |
| IEM 5128       |                              22 → 22 |                       28 → 28 |            1.641486 → 1.634150 |                   −0.004896 … 0.101559 |
| Headphone 5128 |                               3 → 20 |                        3 → 20 |            1.549378 → 1.533225 |                   −0.022837 … 0.053253 |

IEM 711 has 107 contributing sources, per-bin product support 1,971–2,442, pooled mean/median
improvements 0.188477 / 0.170002 dB. IEM 5128 has three sources, per-bin support 20–22, and pooled
mean/median improvements 0.007337 / 0.007767 dB. All three partitions meet the support rule, but
headphone 5128 is exactly at its 20-product threshold, and negative individual 5128 folds do not
justify claiming universal benefit from harmonisation. The full support, fold and band-spread arrays
remain in the report. All 232 artifact sizes/hashes and 229 binary packs were checked: 40,814 rank
curves and 80,349 detail-channel curves, with catalog references intact. Retained measurements preserve channel
metadata, dates, prices, review URLs and original/calibration URLs.

Remaining cross-form names are reported, not merged: 1MORE Triple Driver genuinely names both forms;
QKZ MDR, Yuin PK1 and TrueFree O1 are embedded earbud/open-ear candidates in mixed databases. Directory
earbud databases remain excluded, but such mixed-index entries still need a supported form policy;
the audit preserves them rather than inventing a third core `Form`. Per-source rig scores/config text,
every scanned database's form counts, all quarantine reasons and remaining conflicts are recorded in
`.cache/ingest/report.json` (`rigEvidence`, `sourceEvidence`, `quality`, `quarantineSummary`,
`remainingFormConflicts`).

### Switch, accessory and residual-variant audit (November 2026)

The switch/accessory round's cached rebuild was **`c103d7e36980d1b60a2e4bc5`**: **9,610 products / 40,821 measurements /
138 databases / 118 publishers**, compared with `6417dab7343144186a57d2d9`'s 10,065 / 40,814.
All existing measurement IDs survive; there are **zero removals in every partition** and seven
restored ambiguous settings: Obodio's `vsk6+6`, `vsk6-6`, `vsk12+12`, `vsk12-12`, K7 max/min values,
and Superreview's `Sony WH1000XM6 MRS V4`. All seven are non-default tuning, not claimed factory
presets or confirmed user EQ. Explicit numeric EQ band lists and third-party processing stay excluded.
The counts through the artifact-check subsection describe that round; the default-coverage correction
below supersedes its default availability and harmonisation figures. The worked source listings reflect
the corrected dataset.

The state pass changes **128 product/source default sets across 50 products and 50 databases**.
It reviews 237 products: 170 have a unique labelled-source plurality; 67 have tied or absent votes.
Among the former, 55 have at least one source without an eligible curve in the selected encoding/state.
Those sources are reported, not acoustically assigned or excluded. Volume S changes eight source
default sets; its problematic Obodio, Digaoreviews, Hu-Fi and The Audio Store curves now select low.

Identity folding moves **276 switch-suffixed identities / 337 measurements**, **30 cable/plug/
termination identities / 53 measurements**, and **149 tip-suffixed identities / 285 measurements**
into existing exact parents. Current-cache near-name groups are **749 before / 687 after**, not the
old smaller catalog's 576. Of the original connected groups, **71 resolve fully and six partially**:
68 fully resolved groups involve switch suffixes, one cable suffixes and two tip suffixes. These are
membership audits, not subtraction of two
recomputed heuristic group counts. Fully resolved examples include Volume S's High/Low Imp entries,
Joyodio VZ10's grouped eight-switch entries and the Quartet switch-suffixed identities. Default
alignment is a separate result: Quartet's cross-encoding vote remains tied despite identity folding.

The six partial groups retain: Butastur `02`/`12`/`s2`; ivipQ Conch V12 versus V13; QDC Anole VX's
`1 ON`/`2 ON`/`3 ON`; Canon Pro `1on`; TSMR X `003`/`020`; and CCA `Rhapsody(0000)` (no token
boundary). There are 134 recognized suffix candidates without an accepted unsuffixed exact parent.
Remaining groups also include real families such as Westone MACH, Mystery Collab revisions, Sony
WH-1000XM generations and NAN-Z numbered samples. These counts do not claim every near-name group
is a switch collision or a duplicate. Full moves, original/remaining groups and unresolved candidates
are retained in `switchIdentity` and `remainingCollisionGroups`.

Cable examples include Joyce's `Monarch MKIV (Standard 4.4mm)` and `(Rumble 4.4mm)` → `Monarch MKIV`,
`Monarch MKII with IMR Cable` → `Monarch MKII`, `Hidizs MP145 4.4mm` → `MP145`, `Intime Sora 1
(3.5mm)` → `Sora 1`, and KZ EDC Pro's OFC/Silver Cable entries → `EDC Pro`. Ten product/source
groups need duplicate cable defaults reduced to one. Neutral sole-source options remain default.
The artifact audit caught five explicit ZERO RED PLUG impedance loads being overwritten as setup;
they now retain non-default tuning. Bass plugs/DSP options cannot become bare cable defaults, and
`Moondrop MAY S2 CABLE` stays separate rather than consuming its sample marker. Existing fit and unit
meaning is preserved when a generic cable/plug identity is folded.

Tip examples include `Softears Studio 4 Stock Tip` → `Studio 4`, `7th Acoustics RYUSEI BAROQUE`
→ `RYUSEI`, `ZiiGaat Crescent Foam` → `Crescent`, and Monarch MK3's Azla Sedna Short/Crystal entries
→ `Monarch MK3`. All **149 identities / 285 measurements** are preserved in their parents. Of these,
**32 mixed suffix identities / 80 measurements** contain unrecognized tokens and stay non-default
tuning; the remaining 117 identities / 205 measurements have tip-only suffixes (fit or an eligible
default, with any stronger original unit/tuning meaning retained). All 80 ambiguous measurements
were checked to remain tuning and non-default. T4 `02 Foam`/`12 Foam` join T4 with their codes in the
labels, not a guessed switch mapping. Twenty-eight product/source groups need duplicate neutral
tip defaults reduced to one; no sole-tip fallback promotions were needed in this cache. Model
designators remain separate, and tests cover Pro/Max/II/2/S/Ultra/Plus and letter+digit cases.

Residual `unknown` kinds fall **4,608 → 2,993**. For this audit, patterns remove the final maker/model,
lowercase descriptors, collapse punctuation and replace numeric runs with `#`; counts are measurements,
not products. No interpretation is invented for opaque colors, positions or multi-position codes.

| Residual pattern       | Count |
| ---------------------- | ----: |
| front                  |   121 |
| up                     |   120 |
| down                   |   116 |
| back                   |    97 |
| no distinct descriptor |    82 |
| numeric (`#`)          |    57 |
| red                    |    48 |
| black                  |    47 |
| gold                   |    47 |
| passive                |    39 |
| centre                 |    27 |
| rear                   |    27 |
| silver                 |    27 |
| velvet                 |    20 |
| Linsoul                |    18 |

Examples include Earphones Archive's `Focal Hadenys (front)`, Achoreviews's `Tanchjim 4U (up)`, DL's
`TSMR X 003`, and Aden's `Ziigaat Lush LS` (“Linsoul”). JVC Spiral Dot labels now classify as fit.
The complete residual labels,
filenames and sources remain in `unknownVariants`; `variantReview` covers 2,799 products with
recognized state/accessory descriptors, including every source variant.

#### IEM harmonisation and artifact checks

These are the existing engine's held-out within-partition comparisons, not 711-to-5128 conversion.

| Partition | Multi-source products | Sources | Held-out pairs | Mean before → after dB | Mean / median improvement dB | Fold mean-improvement range dB |
| --------- | --------------------: | ------: | -------------: | ---------------------: | ---------------------------: | -----------------------------: |
| iem-711   |                 2,407 |     107 |         83,066 |    1.764786 → 1.576253 |          0.188533 / 0.170218 |            0.178289 … 0.195317 |
| iem-5128  |                    21 |       3 |             27 |    1.628695 → 1.611542 |          0.017153 / 0.021444 |            0.000576 … 0.110390 |

Both meet the existing support rule; per-bin product support is 1,938–2,407 and 19–21 respectively.
All five folds improve in each partition, but 5128's 21-product/three-source evidence is small and
does not establish universal benefit. Full fold/support and band-spread arrays remain in the report.
All **232 artifact byte lengths/SHA-256 hashes and 229 binary packs** pass: **40,821 rank curves /
80,361 detail-channel curves**, with catalog/pack references intact. Retained channel metadata,
dates, prices, review URLs and original/calibration URLs match the baseline. The five-product source
lists below were also mechanically compared against the final catalogs: all **130 source listings**
match. Before integrating the engine branch, `pnpm verify` passes **54 files / 727 tests**, with zero
type errors or warnings. The rebuild used the complete local cache; no crawl was run.

#### Default-coverage correction (November 2026)

The corrected offline build is **`88d703e027619a6d562891fc`**, retaining **9,610 products / 40,821
measurements / 138 databases / 118 publishers**. The previous flag-only build
`8e9325862f3449439a431f18` was not app-compatible: its 584 `(non-default kind, isDefault: true)` rows
left 526 product/partitions without engine consensus. Every selected default now has `kind: 'default'`
and `isDefault: true`; labels are unchanged and previous kinds are recorded in processing provenance.
Against that build there are **zero removals, zero additions and zero product/source identity changes**.
Retained channel metadata, dates, prices, review URLs and original/calibration URLs also match.

**Default coverage by `kind === 'default'`**, counted directly from the two catalogs
(`8e93258…` → `88d703e…`):

| Form      | Measured product/partitions | Product/partitions without default | Product/source groups without default | Product/source groups with multiple defaults |
| --------- | --------------------------: | ---------------------------------: | ------------------------------------: | -------------------------------------------: |
| IEM       |                       8,315 |                        318 → **0** |                          433 → **57** |                                  93 → **93** |
| Headphone |                       2,840 |                        208 → **0** |                           208 → **0** |                                    0 → **0** |
| Total     |                      11,155 |                        526 → **0** |                          641 → **57** |                                  93 → **93** |

There are 20,645 IEM and 2,860 headphone product/source groups. Product/source/partition counts are
identical here. All 57 remaining source exceptions lack the selected labelled state and have defaults
from another source in the same partition. None represents a product/partition without a default.
After parsing/reconciliation, before final coverage, 526 product/partitions and 641 source groups lack
defaults. Finalisation makes 584 selections (583 deterministic fallbacks and one matching labelled
state), leaving zero and 57 respectively. Kind/flag invariant violations fall **376 → 0 IEM** and
**208 → 0 headphone**. The fatal assertion passes; tests reach both invariant-mismatch directions as
well as missing product coverage and unjustified missing source coverage. Rig evidence is recomputed
using kind-correct provisional defaults, then published defaults are selected again in final partitions.

The 93 multiple-default groups remain unresolved: no selected labelled state is available to resolve
them. This is unresolved metadata, not 93 successful reconciliations. All groups across 61 products
are listed below; their full measurement IDs, filenames and suffixes are in
`defaultCoverage.unresolvedMultipleDefaults`.

Requested examples now have defaults: dchpgall's Infinity Ultra, QCY T1 and Aroma Audio Core are not
units merely because of `(by …)`; Nymz's Olina Sample 2, Animagus's Odin Sample 3, TGX78's KR5 Sample 2
Silver ATOM, Ankramutt's Hola S2 and Enemyspider's modified Q1 PRO are now `kind: 'default'`, preserving
their sample/mod descriptions in names and labels. Aftersound's CADENZA 12 S2 has no supporting source
sample context, so S2 remains model text. Hore's D-Fi Switch 1011 covers its isolated partition.
Eighteen mixed-tip curves need coverage defaults; their labels and previous tuning kind remain
traceable, without claiming a stock configuration or switch equivalence.

All **232 sizes/SHA-256 hashes**, **229 decoded binary packs**, **40,821 rank curves** and **80,361
detail-channel curves** pass references/coverage checks. All **121,182 decoded curve payloads** and all
**229 binary artifacts** are unchanged from `8e93258…`. The seven protected K7/MRS curves remain
non-default tuning. All 130 worked source listings match the corrected catalogs. Counting by kind,
Reference/Hobbytalk now has its `CrinEar Reference S2` default; its 75-ohm adapter remains tuning.

The audit runs the app's actual **`buildPartitionIndex`** on every published catalog/rank pack, in both
raw and harmonised modes. It verifies the exact product-ID set, not just aggregate candidate counts:

| Form      | Partitions | Measured product/partitions | Raw product candidates | Harmonised product candidates |
| --------- | ---------: | --------------------------: | ---------------------: | ----------------------------: |
| IEM       |         15 |                       8,315 |                  8,315 |                         8,315 |
| Headphone |         42 |                       2,840 |                  2,840 |                         2,840 |
| Total     |         57 |                  **11,155** |             **11,155** |                    **11,155** |

There are zero missing product candidates. A cached-build integration test also reaches the real
engine index with selected sample/fit/tuning defaults, without mocking engine behavior.

Updated held-out IEM harmonisation, using the unchanged engine and support rules:

These recomputed figures are unchanged from `8e93258…`: `statisticsProducts` already selected
`isDefault` rows, unlike the app index and rig-evidence code. The repaired invariant now makes kind
and flag selection equivalent. Rig projections are recomputed with the additional defaults; final
partition membership is unchanged. No artificial statistical change is introduced.

| Partition | Multi-source products | Sources | Held-out pairs | Mean before → after dB | Mean / median improvement dB | Fold mean-improvement range dB |
| --------- | --------------------: | ------: | -------------: | ---------------------: | ---------------------------: | -----------------------------: |
| iem-711   |                 2,448 |     107 |         84,793 |    1.765982 → 1.577772 |          0.188211 / 0.169648 |            0.178707 … 0.194769 |
| iem-5128  |                    21 |       3 |             27 |    1.628695 → 1.611542 |          0.017153 / 0.021444 |            0.000576 … 0.110390 |

All five folds improve in each partition. Per-bin product support is 1,954–2,448 and 19–21;
5128 evidence remains small and no cross-rig conversion is implied.

SHA-256: manifest `8cbeba033c20744e2a12b83fa644f93391a8b3f7702823929b545acffaee3561`;
IEM catalog `c29496a739bab519045be24efedc0f707cafa7984949bc1b54ef98b7aa7de418`;
headphone catalog `dc5ad18dd335ae21441bfba18bbe089610f86b5884b9705e3bba17a68264927b`.

`pnpm verify` passes **58 files / 793 tests**, with zero Svelte/type errors or warnings. `origin/main`
remains `0b6ff4a37d411d7d9781aebef3c2b740bd90aa48`; no further rebase is needed. No crawl or push is run.

##### Unresolved multiple-default groups

Counts in parentheses are defaults, not measurement totals. Source IDs omit only their trailing hash.
No listed group has an available curve in its product's selected labelled state.

| Product                                     | Unresolved source groups (default count)                                                                                                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 64 Audio Ocean (Reference Nozzle +2dB Bass) | bloomaudio-iems (2)                                                                                                                                                                      |
| ALPHA OMEGA OMEGA                           | hbb-iems (3)                                                                                                                                                                             |
| Aroma Thunder                               | tgx78-iems (2)                                                                                                                                                                           |
| Ashidavox EA-HF1                            | earphonesarchive-5128 (2)                                                                                                                                                                |
| CCA CRA                                     | aden-iems (2); aftersound-iems (2); hbb-iems (2); hore-iems (2); jacstone-iems (2); melatonin-iems (2); nymz-iems (2); precog-iems (2); pw-iems (2); rg-iems (2); vortexreviews-iems (2) |
| CCA Polaris                                 | aftersound-iems (7)                                                                                                                                                                      |
| CCA Rhapsody                                | melatonin-iems (3)                                                                                                                                                                       |
| CCA Trio                                    | mmagtech-iems (4)                                                                                                                                                                        |
| CVJ Freedom                                 | ianfann-iems (4); isaiahse-iems (4)                                                                                                                                                      |
| CVJ Konoka                                  | ianfann-iems (4)                                                                                                                                                                         |
| CVJ KUMO                                    | ianfann-iems (3)                                                                                                                                                                         |
| CVJ Mei                                     | aftersound-iems (4); ianfann-iems (4); isaiahse-iems (4)                                                                                                                                 |
| CVJ Nami                                    | isaiahse-iems (4)                                                                                                                                                                        |
| CVJ TXS                                     | aftersound-iems (4); ianfann-iems (4)                                                                                                                                                    |
| Earfun Air Pro 4                            | dhrme-iems (2); fernandagunsan-iems (2); regancipher-iems (2)                                                                                                                            |
| Hisenior Okavango                           | aftersound-iems (4)                                                                                                                                                                      |
| Joyodio VZ10                                | aftersound-iems (9)                                                                                                                                                                      |
| KBEAR Chrono                                | kuping-sensi-iems (2)                                                                                                                                                                    |
| Kiwi Ears Quartet                           | cqtek-iems (4); harpo-iems (4); ianfann-iems (4); joshtbvo-iems (4)                                                                                                                      |
| KZ AS24 Pro                                 | melatonin-iems (4)                                                                                                                                                                       |
| KZ Castor Bass                              | mmagtech-iems (2)                                                                                                                                                                        |
| KZ Castor Black                             | aftersound-iems (7)                                                                                                                                                                      |
| KZ D-Fi                                     | aftersound-iems (6); ianfann-iems (15)                                                                                                                                                   |
| KZ Duonic                                   | theaudiostore-iems (5)                                                                                                                                                                   |
| KZ Krila                                    | hore-iems (2)                                                                                                                                                                            |
| KZ Krilla                                   | aftersound-iems (5)                                                                                                                                                                      |
| KZ Pisces                                   | theaudiostore-iems (5)                                                                                                                                                                   |
| KZ Vader Pro                                | theaudiostore-iems (4)                                                                                                                                                                   |
| KZ ZA12                                     | cqtek-iems (6)                                                                                                                                                                           |
| KZ ZAT                                      | melatonin-iems (4)                                                                                                                                                                       |
| KZ Zenith                                   | aftersound-iems (5)                                                                                                                                                                      |
| KZ ZS10 Pro 2                               | cqtek-iems (6)                                                                                                                                                                           |
| KZ ZS12 Pro X                               | aftersound-iems (6); theaudiostore-iems (5)                                                                                                                                              |
| Moondrop Kadenz Bass+                       | arn-iems (2); atechreviews-iems (2); vortexreviews-iems (2)                                                                                                                              |
| NF ACOUS NM2+                               | pw-iems (2)                                                                                                                                                                              |
| NF Audio NA2+                               | cqtek-iems (2)                                                                                                                                                                           |
| NF Audio NM2                                | cqtek-iems (2); vortexreviews-iems (2)                                                                                                                                                   |
| NFAudio (NFAcous) NA2                       | soundignity-iems (2)                                                                                                                                                                     |
| Night Oblivion Butastur                     | tgx78-iems (2)                                                                                                                                                                           |
| Nightjar Duality switch+                    | eliseaudio-iems (2)                                                                                                                                                                      |
| Plexsonic Strato                            | audioamigo-iems (2)                                                                                                                                                                      |
| QDC Anole V14                               | eliseaudio-iems (3)                                                                                                                                                                      |
| QDC Anole VX                                | eliseaudio-iems (6)                                                                                                                                                                      |
| Sample Qb                                   | hbb-iems (2)                                                                                                                                                                             |
| Samsung Galaxy Buds                         | aden-iems (2); precog-iems (2)                                                                                                                                                           |
| Samsung Galaxy Buds (TWS)                   | lown-fi-iems (2)                                                                                                                                                                         |
| Simgot ET142 Stainless Steel                | cqtek-iems (2)                                                                                                                                                                           |
| Smabat X1                                   | cqtek-iems (2)                                                                                                                                                                           |
| Snowy A8                                    | iemocean-iems (2)                                                                                                                                                                        |
| Snowy88 A8                                  | soundcheck39-iems (2)                                                                                                                                                                    |
| Sonicast Dirac+ mk2                         | dchpgall-iems (2)                                                                                                                                                                        |
| Soundpeats Air5 Pro TWS                     | pw-iems (2)                                                                                                                                                                              |
| Soundpeats Capsule3 Pro+                    | hobbytalk-iems (2); vortexreviews-iems (2)                                                                                                                                               |
| Tansio Mirai X                              | tgx78-iems (4)                                                                                                                                                                           |
| TinHiFi P1                                  | koi-iems (2)                                                                                                                                                                             |
| TinHiFi T4                                  | hbb-iems (2); timmyv-iems (2)                                                                                                                                                            |
| TRI Star River                              | isaiahse-iems (4)                                                                                                                                                                        |
| TRN VX Pro                                  | eplv-iems (2); pw-iems (2); vortexreviews-iems (2)                                                                                                                                       |
| Yanyin Canon 2                              | arn-iems (4); hbb-iems (4); ianfann-iems (4)                                                                                                                                             |
| Yanyin Canon Pro                            | aftersound-iems (4); hbb-iems (3)                                                                                                                                                        |
| Ys Sword                                    | soundignity-iems (2)                                                                                                                                                                     |

#### Worked-example source listings

The source listings below retain original filenames; a different original suffix follows in
parentheses. Source IDs omit only their trailing hash. `none` means no eligible default or no tuning
variant, not a missing measurement. Non-default fit, unit, setup and unknown variants are retained but
not enumerated here; defaults are listed by `kind === 'default'`. `variantReview` contains all
kinds and full source IDs.
Unlabelled defaults are not evidence of a particular switch state. These results supersede the
earlier switch-group examples above, not the historical artifact/removal counts.

#### Softears Volume S

Selected state: `impedance:low`; source votes `{"impedance:low":20,"impedance:high":4,"mode:classical":1}`.
All explicitly selected defaults are low impedance. Animagus's Classical/Pop encoding is not equated
with impedance labels. Hobbytalk and Sai retain unlabelled defaults; their labelled high states
remain tuning. Same-low-state tip changes remain fit rather than extra tuning states.

- **aden-iems** (iem-711): default `Softears Volume S (L)` ((Low Impedance)); tuning `Softears Volume S (H)` ((High Impedance)).
- **aftersound-iems** (iem-711): default `SOFTEARS VOLUME S LOW IMP` (Low Impedance); tuning `SOFTEARS VOLUME S HIGH IMP` (High Impedance).
- **animagus-iems** (iem-711): default **none**; tuning `Softears Volume S (Classical Mode)`; `Softears Volume S (Pop Mode)`.
- **atechreviews-iems** (iem-711): default `Softears Volume S (low impedance)` ((low impedance)); tuning `Softears Volume S (high impedance)` ((high impedance)).
- **audioamigo-iems** (iem-711): default `Softears Volume S LowΩ` ((Impedance Dial: Low, Impedance: <1 Ohm)); tuning `Softears Volume S HighΩ + 15 Ohm` ((Impedance Dial: High, Impedance: 15 Ohms)); `Softears Volume S LowΩ + 15 Ohm` ((Impedance Dial: Low, Impedance: 15 Ohms)); `Softears Volume S HighΩ` ((Impedance Dial: High, Impedance: <1 Ohm)).
- **boizoff-iems** (iem-711): default `Volume S (TENNMAK SoFoam tips, low impedance) ✓`; tuning `Volume S (stock silicone tips, high impedance)`; `Volume S (TENNMAK SoFoam tips, high impedance) ✓`.
- **digaoreviews-iems** (iem-711): default `Volume S Low Impedance` (Low Impedance); tuning `Volume S High Impedance` (High Impedance).
- **ducbloke-iems** (iem-711): default `Softears Volume S`; tuning none.
- **dvewlsh-iems** (iem-711): default `Softears Vol S Low` ((switch: low impedance)); tuning `Softears Volume S high` ((switch: high impedance)).
- **earphonesarchive-5128** (iem-5128): default `Softears Volume S (Low Impedance Mode)`; tuning `Softears Volume S (High Impedance Mode)`.
- **eliseaudio-iems** (iem-711): default `Softears Volume S`; tuning none.
- **flare-iems** (iem-711): default `Softears Volume S` ((Low Impedance)); tuning none.
- **gadgetgenerations-iems** (iem-711): default `Softears VolumeS LowImp` (Low Impedance); tuning `Softears VolumeS Hi Imp` (High Impedance).
- **gadgetrytech-iems** (iem-711): default `Softears Volume S Low-Impedance` (Switch - Low Impedance)); tuning `Softears Volume S High-Impedance` ((Switch - High Impedance)).
- **hbb-iems** (iem-711): default `Soft Volu S`; tuning none.
- **hobbytalk-iems** (iem-711): default `Softears Volume S`; tuning `Softears Volume S 75` ((High Impedance Mode)).
- **hu-fi-iems** (iem-711): default `Volume S (Low Impedance)`; tuning `Volume S (High Impedance)`.
- **iemocean-iems** (iem-711): default `Sofears Volume S low impedance`; tuning none.
- **jaytiss-iems** (iem-711): default `VolumeS`; tuning none.
- **koi-iems** (iem-711): default `softears volume s low`; tuning none.
- **lestat-iems** (iem-711): default `Volume S` (Low Impedence); tuning none.
- **listener-5128** (iem-5128): default `VolumeS 5128` ((Softears Standard Tips)); tuning none.
- **listener-iems** (iem-711): default `VolS Black` ((Stock Black Tips)); tuning none.
- **lown-fi-iems** (iem-711): default `SOFTEARS Volume S low` ((Low Impedance) (Tips: Openaudio 003)); tuning `SOFTEARS Volume S high` ((High Impedance) (Tips: Openaudio 003)).
- **lumerion-iems** (iem-711): default `Softears Volume S`; tuning none.
- **obodio-iems** (iem-711): default `volume s li` (Low Impedance); tuning `volume s k7 max values` (K7 EQ Max Values (+12 Bass, +6 Treble)); `vsk12-12` (K7 EQ (-12 Bass, 0 Treble)); `vsk12+12` (K7 EQ (+12 Bass, 0 Treble)); `vsk6-6` (K7 EQ (0 Bass, -6 Treble)); `vsk6+6` (K7 EQ (0 Bass, +6 Treble)); `volume s k7 min values` (K7 EQ Min Values (-12 Bass, -6 Treble)); `volume s hi` (High Impedance).
- **practiphile-iems** (iem-711): default `Softears Volume S` (low imp); tuning `Softears Volume S high imp` (high imp).
- **precog-iems** (iem-711): default `Softears Volume S (Low Impedance)` (Low Impedance); tuning `Softears Volume S (High Impedance)` (High Impedance).
- **pw-iems** (iem-711): default `Softears Volume S Low` (Low); tuning `Softears Volume S 10ohm` (Low+10ohm).
- **sai-headphones** (iem-711): default `Softears VolumeS (black tip)`; tuning `Softears VolumeS (black tip high impedance mode)`.
- **sl0the-iems** (iem-711): default `Softears Volume S LOW W1` (: Low Impedance Mode (Spinfit W1)); tuning `Softears Volume S HIGH Velvet` (: High Impedance Mode (Divinus Velvet)); `Softears Volume S HIGH W1` (: High Impedance Mode (Spinfit W1)).
- **superreview-iems** (iem-711): default `Softears Volume S` ((switch: low impedance)); tuning `Softears Volume S impedance` ((switch: high impedance)).
- **theaudiostore-iems** (iem-711): default `SOFTEARS Volume S Low Imp` (Low Imp); tuning `SOFTEARS Volume S High Imp` (High Imp).
- **timmyv-iems** (iem-711): default `Softears VolumeS (LN)` ((Low Impedance Normal Insertion)); tuning `Softears VolumeS (HN)` ((High Impedance Normal Insertion)).
- **tonedeafmonk-iems** (iem-711): default `SOFTEARS VOLUME S LOW` ((low Impedance Setting)); tuning `SOFTEARS VOLUME S HIGH` ((High Impedance Setting)).
- **treblewellxtended-iems** (iem-711): default `Volume S Low` (Low Impedence); tuning `Volume S` (High Impedence).
- **zerostresslevel-iems** (iem-711): default `Volume S` ((Low Impedance)); tuning none.

#### CrinEar Reference

No bare switch-state vote applies: only impedance-adapter states were found. Hobbytalk's stock
curves are replacement units, so its 75-ohm adapter must not become the fallback default. Standard,
shorter-bore and other tip alternatives are fit variants, not modes inferred from the word Reference.

- **aden-iems** (iem-711): default `Crinear Reference` ((Sample 1)); tuning none.
- **aftersound-iems** (iem-711): default `CRINEAR REFERENCE`; tuning none.
- **animagus-iems** (iem-711): default `CrinEar Reference`; tuning none.
- **atechreviews-iems** (iem-711): default `CrinEar Reference`; tuning `CrinEar Reference (impedance adapter 10 ohm)` ((impedance adapter 10 ohm)).
- **audioamigo-iems** (iem-711): default `CrinEar Reference` ((Impedance: <1 Ohm)); tuning `CrinEar Reference 15 Ohm` ((Impedance: 15 Ohms)); `CrinEar Reference 30 Ohm` ((Impedance: 30 Ohms)).
- **banzai1122-iems** (iem-711): default `Crinear Reference`; tuning none.
- **bassaudio-iems** (iem-711): default `Crinear Reference` (Regular DAC); tuning none.
- **bloomaudio-iems** (iem-711): default `Crinear Reference`; tuning none.
- **boizoff-iems** (iem-711): default `Reference (stock standard, shorter bore tips) ✓`; tuning none.
- **breampike-iems** (iem-711): default `Crinear Reference`; tuning none.
- **dentreviews-iems** (iem-711): default `CrinEar Reference Moondrop`; tuning none.
- **dl-iems** (iem-711): default `Reference`; tuning none.
- **dvewlsh-iems** (iem-711): default `Crinear Ref Std` ((standard bore tips)); tuning none.
- **earphonesarchive-5128** (iem-5128): default `CrinEar Reference (Standard bore eartips)`; tuning none.
- **elrics-iems** (iem-711): default `CrinEar Reference Standard` ((Standard Bore Eartip)); tuning none.
- **faxepremium-iems** (iem-711): default `Crinear Reference`; tuning none.
- **fernandagunsan-iems** (iem-711): default `CrinEar Reference`; tuning none.
- **flare-iems** (iem-711): default `CrinEar Reference`; tuning none.
- **hbb-iems** (iem-711): default `Crin Ref`; tuning none.
- **headphonezone-iems** (iem-711): default `Crinear Reference`; tuning none.
- **hobbytalk-iems** (iem-711): default `CrinEar Reference S2`; tuning `CrinEar Reference 75` ((75ohm Adapter)).
- **iemocean-iems** (iem-711): default `CrinEar Reference`; tuning `CrinEar Reference 10 Ohm` (10 Ohm adapter).
- **jaraba-iems** (iem-711): default `Reference`; tuning none.
- **jaytiss-iems** (iem-711): default `Crinears Reference`; tuning none.
- **lestat-iems** (iem-711): default `Shorter bore reference`; tuning none.
- **lumerion-iems** (iem-711): default `Crinear Reference`; tuning `Crinear Reference 33ohm Fiio adapter`.
- **practiphile-iems** (iem-711): default `CrinEar Reference`; tuning none.
- **precog-iems** (iem-711): default `Crinears Reference`; tuning none.
- **sai-headphones** (iem-711): default `CrinEar Reference (standard bore tips)`; tuning none.
- **soundignity-iems** (iem-711): default `CrinEar Reference SE15` (w/ Azla Sedna SE1500); tuning none.
- **superreview-iems** (iem-711): default `CrinEar Reference` ((sample 1)); tuning none.
- **tdl-iems** (iem-711): default `Crinear Reference Azla Sedna Origin Tip`; tuning none.
- **tonedeafmonk-iems** (iem-711): default `Crinear Reference`; tuning none.

#### Kiwi Ears Quartet

Unresolved: source votes `{"switch:bits:00":6,"switch:du:dd":6,"switch:bits:11":3,"switch:du:uu":4}`.
The 00/DD tie is not broken by guessing an encoding equivalence. Multiple defaults below are
unresolved defaults inherited from separate source-index products, not a completed reconciliation.

- **achoreviews-iems** (iem-711): default `Kiwi Ears Quartet (0-0)` ((0-0)); tuning none.
- **aden-iems** (iem-711): default `KE Quartet 00 LS` ((Linsoul) (00)); tuning `KE Quartet 10 LS` ((Linsoul) (10)); `KE Quartet 01 LS` ((Linsoul) (01)); `KE Quartet 11 LS` ((Linsoul) (11)).
- **adri-n-iems** (iem-711): default `Kiwi Ears Quartet (S1 UU)` ((S1 UU)); tuning none.
- **ankramutt-iems** (iem-711): default `KiwiEars Quartet 00` (00); tuning `KiwiEars Quartet 01` (01); `KiwiEars Quartet 11` (11); `KiwiEars Quartet 10` (10).
- **atechreviews-iems** (iem-711): default `Kiwi Ears Quartet (OFF-OFF)` ((OFF-OFF)); tuning `Kiwi Ears Quartet (OFF-ON)` ((OFF-ON)); `Kiwi Ears Quartet (ON-ON)` ((ON-ON)); `Kiwi Ears Quartet (ON-OFF)` ((ON-OFF)).
- **audioamigo-iems** (iem-711): default `Kiwi Ears Quartet DD` ((Switches: 00)); tuning `Kiwi Ears Quartet DD 15 Ohm` ((Switches: 00, Impedance: 15 Ohms)); `Kiwi Ears Quartet UD` ((Switches: 10)); `Kiwi Ears Quartet UU 15 Ohm` ((Switches: 11, Impedance: 15 Ohms)); `Kiwi Ears Quartet UU` ((Switches: 11)); `Kiwi Ears Quartet DD 30 Ohm` ((Switches: 00, Impedance: 30 Ohms)); `Kiwi Ears Quartet DU` ((Switches: 01)); `Kiwi Ears Quartet UU 30 Ohm` ((Switches: 11, Impedance: 30 Ohms)).
- **bakkwatan-iems** (iem-711): default `Kiwi Ears Quartet 00` (1:OFF; 2:OFF); tuning `Kiwi Ears Quartet 11` (1:ON; 2:ON); `Kiwi Ears Quartet 01` (1:OFF; 2:ON); `Kiwi Ears Quartet 10` (1:ON; 2:OFF).
- **bassyalexander-iems** (iem-711): default `KiwiEars Quartet`; tuning none.
- **bloomaudio-iems** (iem-711): default `Kiwi Ears Quartet`; tuning none.
- **cqtek-iems** (iem-711): default `Kiwi Ears Quartet 00` (00); `Kiwi Ears Quartet 10` (10); `Kiwi Ears Quartet 01` (01); `Kiwi Ears Quartet 11` (11); tuning none.
- **dentreviews-iems** (iem-711): default `Kiwi Ears Quartet off off`; tuning `Kiwi Ears Quartet off on`; `Kiwi Ears Quartet on off`; `Kiwi Ears Quartet on on`.
- **earphonesarchive-5128** (iem-5128): default `Kiwi Ears Quartet (DD)`; tuning `Kiwi Ears Quartet (DU)`; `Kiwi Ears Quartet (UD)`; `Kiwi Ears Quartet (UU)`.
- **flare-iems** (iem-711): default `Kiwi Ears Quartet` ((UU)); tuning none.
- **hadoe-iems** (iem-711): default `Kiwi Ears Quartet (11)` ((11)); tuning none.
- **harpo-iems** (iem-711): default `Kiwi Ears Quartet DD` ((DD)); `Kiwi Ears Quartet UU` ((UU)); `Kiwi Ears Quartet UD` ((UD)); `Kiwi Ears Quartet DU` ((DU)); tuning none.
- **hbb-iems** (iem-711): default `Kiwi Ears Quartet Bass`; tuning none.
- **headphonezone-iems** (iem-711): default `Kiwi Quartet 1D 2U`; tuning none.
- **hobbytalk-iems** (iem-711): default `Kiwi Ears Quartet DD` (DD); tuning `Kiwi Ears Quartet UU` (UU); `Kiwi Ears Quartet UD` (UD); `Kiwi Ears Quartet UD 75` (UD (75ohm Adapter)); `Kiwi Ears Quartet DU` (DU).
- **ianfann-iems** (iem-711): default `KIWIEARS QUARTET DU` ((DU)); `KIWIEARS QUARTET DD` ((DD)); `KIWIEARS QUARTET UD` ((UD)); `KIWIEARS QUARTET UU` ((UU)); tuning none.
- **joshtbvo-iems** (iem-711): default `Kiwi Ears Quartet (UU)` ((UU)); `Kiwi Ears Quartet (DD)` ((DD)); `Kiwi Ears Quartet (DU)` ((DU)); `Kiwi Ears Quartet (UD)` ((UD)); tuning none.
- **listener-iems** (iem-711): default `Quartet UU Stock` ((Stock Tips)); tuning none.
- **mmagtech-iems** (iem-711): default `Kiwi Ears Quartet s.00 Foam` (s.00 (Foam)); tuning `Kiwi Ears Quartet s.10 Foam` (s.10 (Foam)); `Kiwi Ears Quartet s.01 Foam` (s.01 (Foam)); `Kiwi Ears Quartet s.11 Foam` (s.11 (Foam)).
- **nymz-iems** (iem-711): default `Kiwi Ears Quartet ON ON` ((ON/ON)); tuning `Kiwi Ears Quartet OFF OFF` ((OFF/OFF)); `Kiwi Ears Quartet OFF ON` ((OFF/ON)); `Kiwi Ears Quartet ON OFF` ((ON/OFF)).
- **obodio-iems** (iem-711): default `quatro dd` (DD); tuning `quatro uu` (UU); `quatro ud` (UD); `quatro du` (DU).
- **practiphile-iems** (iem-711): default `Kiwi Ears Quartet DD` (stock); tuning `Kiwi Ears Quartet UD` (UD); `Kiwi Ears Quartet DU` (DU); `Kiwi Ears Quartet UU` (UU).
- **precog-iems** (iem-711): default `KiwiEars Quartet (OFF)`; tuning none.
- **soundcheck39-iems** (iem-711): default `Kiwi Ears Quartet 00` (00); tuning `Kiwi Ears Quartet 11` (11); `Kiwi Ears Quartet 01` (01); `Kiwi Ears Quartet 10` (10).
- **superreview-iems** (iem-711): default `Kiwi Ears Quartet (11)` ((switches: on - on)); tuning `Kiwi Ears Quartet (10)` ((switches: on - off)); `Kiwi Ears Quartet (00)` ((switches: off - off)); `Kiwi Ears Quartet (01)` ((switches: off - on)).
- **suporsalad-iems** (iem-711): default `Kiwiears Quartet 11`; tuning `Kiwiears Quartet 10`; `Kiwiears Quartet 01`; `Kiwiears Quartet 00`.
- **tdl-iems** (iem-711): default `Kiwi Ears Quartet DD`; tuning `Kiwi Ears Quartet DU`; `Kiwi Ears Quartet UU`; `Kiwi Ears Quartet UD`.
- **therollo9-iems** (iem-711): default `Kiwi Ears Quartet UU` ((UU)); tuning `Kiwi Ears Quartet DU` ((DU)); `Kiwi Ears Quartet DD` ((DD)); `Kiwi Ears Quartet UD` ((UD)).
- **tonedeafmonk-iems** (iem-711): default `KiwiEars Quartet DD` ((DD)); tuning `KiwiEars Quartet DU` ((DU)); `KiwiEars Quartet UD` ((UD)); `KiwiEars Quartet UU` ((UU)).

#### Yanyin Canon Pro

Selected state: `switch:bits:00`; source votes `{"switch:bits:11":1,"switch:du:uuu":1,"switch:du:dd":2,"switch:du:ud":1,"switch:bits:00":3,"switch:du:uu":1}`.
DU-only sources without a separately labelled 00 state have no eligible selected-state default.
Aftersound/HBB retain unresolved inherited multiple defaults; other unmatched sources retain tuning
without a default where another source covers the same partition. No DD/00 or two-/three-switch
equivalence is invented. `Canon Pro 1on` remains separate, outside the exact parent listing below.

- **aftersound-iems** (iem-711): default `YANYIN CANON PRO UU` (UU); `YANYIN CANON PRO DD` (DD); `YANYIN CANON PRO UD` (UD); `YANYIN CANON PRO DU` (DU); tuning none.
- **audioamigo-iems** (iem-711): default `Yanyin Canon Pro 00` ((Switches: 00)); tuning `Yanyin Canon Pro 10 15 Ohm` ((Switches: 10, Impedance: 15 Ohms)); `Yanyin Canon Pro 11` ((Switches: 11)); `Yanyin Canon Pro 11 15 Ohm` ((Switches: 11, Impedance: 15 Ohms)); `Yanyin Canon Pro 10` ((Switches: 10)); `Yanyin Canon Pro 11 30 Ohm` ((Switches: 11, Impedance: 30 Ohms)); `Yanyin Canon Pro 10 30 Ohm` ((Switches: 10, Impedance: 30 Ohms)); `Yanyin Canon Pro 00 15 Ohm` ((Switches: 00, Impedance: 15 Ohms)); `Yanyin Canon Pro 00 30 Ohm` ((Switches: 00, Impedance: 30 Ohms)).
- **boizoff-iems** (iem-711): default `Canon Pro (00) (TENNMAK SoFoam tips) ✓`; tuning `Canon Pro (11) (any stock silicone tips)`; `Canon Pro (01) (TENNMAK SoFoam tips) ✓`; `Canon Pro (10) (TENNMAK SoFoam tips) ✓`; `Canon Pro (11) (TENNMAK SoFoam tips) ✓`.
- **breampike-iems** (iem-711): default `Yanyin Canon Pro 00` ((switches: 00)); tuning `Yanyin Canon Pro 11` ((switches: 11)); `Yanyin Canon Pro 01` ((switches: 01)); `Yanyin Canon Pro 10` ((switches: 10)).
- **cqtek-iems** (iem-711): default `Yanyin Canon Pro 00` ((00) · 00); tuning `Yanyin Canon Pro 01` ((01) · 01); `Yanyin Canon Pro 11` ((11) · 11); `Yanyin Canon Pro 10` ((10) · 10).
- **dl-iems** (iem-711): default **none**; tuning `Yanyin Canon Pro UU` ((Up Up)); `Yanyin Canon Pro DD` ((Down Down)); `Yanyin Canon Pro UD` ((Up Down)).
- **earphonesarchive-5128** (iem-5128): default **none**; tuning `Yanyin Canon Pro (UD)`; `Yanyin Canon Pro (DU)`; `Yanyin Canon Pro (DD)`; `Yanyin Canon Pro (UU)`.
- **foxtoldmeso-5128** (iem-5128): default `Yanyin Canon Pro`; tuning none.
- **gadgetrytech-iems** (iem-711): default **none**; tuning `Yanyin Canon Pro (UDU)` ((UDU)); `Yanyin Canon Pro (DUD)` ((DUD)); `Yanyin Canon Pro (UUU)` ((UUU)); `Yanyin Canon Pro (DDU)` ((DDU)); `Yanyin Canon Pro (DDD)` ((DDD)); `Yanyin Canon Pro (DUU)` ((DUU)).
- **hbb-iems** (iem-711): default `Yan Can Dd` (DD); `Yan Can P`; `Yan C Uu` (UU); tuning none.
- **iemocean-iems** (iem-711): default `Yanyin Canon Pro 12` (12); tuning none.
- **joycesreview-iems** (iem-711): default `Yanyin Canon Pro`; tuning none.
- **soundcheck39-iems** (iem-711): default `Yanyin Canon Pro 00` (00); tuning `Yanyin Canon Pro 10` (10); `Yanyin Canon Pro 01` (01); `Yanyin Canon Pro 11` (11).
- **soundignity-iems** (iem-711): default **none**; tuning `Yanyin Canon Pro DD` (switch: DD); `Yanyin Canon Pro DU` (switch: DU); `Yanyin Canon Pro UD` (switch: UD); `Yanyin Canon Pro UU` (switch: UU).
- **superreview-iems** (iem-711): default **none**; tuning `Yanyin Canon Pro DD` ((switches: down - down)); `Yanyin Canon Pro UU` ((switches: up - up)); `Yanyin Canon Pro UD` ((switches: up - down)); `Yanyin Canon Pro DU` ((switches: down - up)).

#### Night Oblivion Butastur

Selected state: `switch:du:dd`; source votes `{"switch:bits:00":2,"switch:du:dd":4,"switch:du:ud":2,"switch:named:bass=off,treble=off":1}`.
Bits and named bass/treble toggles are not equated with DD. Separate `Butastur 02`, `12` and `s2`
identities remain outside the exact parent listing; their multi-position/sample meanings are not
silently stripped.
TGX78's two inherited defaults remain unresolved because neither has the selected DD label.

- **breampike-iems** (iem-711): default **none**; tuning `night oblivion butastur 01` ((switches: 01)); `night oblivion butastur 10` ((switches: 10)); `night oblivion butastur 11` ((switches: 11)); `night oblivion butastur 00` ((switches: 00)).
- **ducbloke-iems** (iem-711): default `Night Oblivion Butastur`; tuning none.
- **faxepremium-iems** (iem-711): default `Night Oblivion Butastur DD` (DD); tuning none.
- **flare-iems** (iem-711): default `Night Oblivion Butastur` ((DD)); tuning none.
- **hbb-iems** (iem-711): default `No DD` (DD); tuning `No Uu` (UU); `No Du` (DU); `No Ud` (UD).
- **iemocean-iems** (iem-711): default `Night Oblivion Butastur DD` (DD); tuning `Night Oblivion Butastur UD` (UD); `Night Oblivion Butastur UU` (UU); `Night Oblivion Butastur DU` (DU).
- **jaytiss-iems** (iem-711): default **none**; tuning `Butastur` (UD).
- **kr0mka-iems** (iem-711): default **none**; tuning `butastur 10` (10); `butastur 00` (00); `butastur 11` (11); `butastur 01` (01).
- **mmagtech-iems** (iem-711): default `Night Oblivion Butastur s.DD Foam` (s.DD (Foam)); tuning `Night Oblivion Butastur s.UU Foam` (s.UU (Foam)); `Night Oblivion Butastur s.DU Foam` (s.DU (Foam)); `Night Oblivion Butastur s.UD Foam` (s.UD (Foam)).
- **precog-iems** (iem-711): default `Night Oblivion Butastur`; tuning none.
- **superreview-iems** (iem-711): default `Night Oblivion Butastur (DD)` ((switches: DD)); tuning `Night Oblivion Butastur (UU)` ((switches: UU)); `Night Oblivion Butastur (UD)` ((switches: UD)); `Night Oblivion Butastur (DU)` ((switches: DU)).
- **tgx78-iems** (iem-711): default `Butasturoo` (00); `Butastur10` (10); tuning none.
- **zerostresslevel-iems** (iem-711): default **none**; tuning `Night Oblivion Butastur (Bass Off, Treble On) Deep` ((Bass: Off, Treble: On) Deep); `Night Oblivion Butastur (Bass On, Treble On)` ((Bass: On, Treble: On)); `Night Oblivion Butastur (Bass Off, Treble Off) Deep` ((Bass: Off, Treble: Off) Deep); `Night Oblivion Butastur (Bass Off, Treble Off) Shallow` ((Bass: Off, Treble: Off) Shallow); `Night Oblivion Butastur (Bass On, Treble Off)` ((Bass: On, Treble: Off)); `Night Oblivion Butastur (Bass On, Treble On) Shallow` ((Bass: On, Treble: On) Shallow); `Night Oblivion Butastur (Bass Off, Treble Off)` ((Bass: Off, Treble: Off)); `Night Oblivion Butastur (Bass On, Treble On) Deep` ((Bass: On, Treble: On) Deep); `Night Oblivion Butastur (Bass Off, Treble On) Shallow` ((Bass: Off, Treble: On) Shallow); `Night Oblivion Butastur (Bass Off, Treble On)` ((Bass: Off, Treble: On)); `Night Oblivion Butastur (Bass On, Treble Off) Deep` ((Bass: On, Treble: Off) Deep); `Night Oblivion Butastur (Bass On, Treble Off) Shallow` ((Bass: On, Treble: Off) Shallow).
