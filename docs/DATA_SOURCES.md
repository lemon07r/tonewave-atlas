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
  list actual membership; a source can appear in both form catalogs. Explicit 5128, 4128 and miniDSP
  EARS families can share their own headphone partition (EARS Pro remains separate); other headphone
  rigs remain source-specific. AKG detection uses established full-size model families, not all K/Q
  numbers: K319 earbuds and K391 NC/Q350 in-ears are not headphone matches. `data/sources.json` owns overrides.
- The parser ignores phase, drops nonfinite rows, averages duplicate Hz in dB, sorts and validates.
  Curves are linearly interpolated in log Hz on the canonical 240-bin 1/24-octave grid, never
  extrapolated. Flat raw curves (<0.05 dB range), >100 dB ranges, calibrated values outside ±200 dB,
  and calibrated curves with fewer than 16 finite bins are rejected. Targets, calibration curves,
  delta-symbol (∆/Δ) curves, averages and explicit post-hoc EQ curves are non-products. EQ matching
  uses tokens, not substrings: Fatfreq, bleqk, SuperEQ and Tequila are retained, as is the genuine
  Ecoustic EQ-100. Explicit no/default/blank/zero/flat-EQ labels, and `EQ: Neutral/Normal/Original`
  states (including `EQ: None` and `PEQ - no gain`) are retained; these are source labels, not
  independently verified zero processing. Only explicit user/third-party processing (`+ EQ`,
  EQ'd/EQed, a plain user/custom EQ declaration, Oratory1990/h0llow EQ, EQ to a target, AutoEQ, PEQ without an explicit
  zero/off/default state, “with EQ”, or evident gain/filter settings) is excluded. Zero-gain
  PEQ/custom slots (including `0 dB`) remain. A named custom slot alone is not a declaration of
  user processing. Factory app/DSP/ANC/ambient/transparency and voicing presets are retained
  as tuning alternatives. Uncertain labels, including EQ1/EQ2 and Qudelix's “Sunrise Neutral EQ”,
  are initially non-default tuning, subject to final coverage selection below. `+ HiFi EQ` is not the
  explicit `+ EQ` operation. The word “Delta” alone is not an exclusion. Tone-control/knob values
  such as “K7 EQ (+12 Bass, +6 Treble)” do not establish post-hoc processing without further evidence;
  they and a named “EQ: custom - MRS” slot stay ambiguous tuning, not claimed factory presets or
  confirmed user EQ. Explicit numeric EQ band lists (with or without per-band `dB` labels) and declared
  user/third-party operations remain excluded.
- Detail packs retain each available channel and numbered repetition. Ranking uses finite dB means
  within repeated channels, then the L/R dB mean (or available channel), 1/12-octave smoothing and
  every second canonical bin. Missing data stays missing. Channel contribution masks and paired-bin
  counts qualify imbalance RMS (L−R, 100 Hz–10 kHz). With repetitions this is the imbalance of the
  per-channel repetition means, not individual fits.
- `measurement_calibration_file` is a **subtracted** dB curve in the live squig.link graphtool's
  `applyMeasurementCalibrationToChannels`, not a target or an already-applied raw-file correction.
  The pipeline fetches it, subtracts it over its measured range, records its URL, and excludes a
  configured source if that calibration is unavailable; see the [live implementation](https://squig.link/graphtool.js).
- Binary TWFR v1 uses little-endian int16 at 0.02 dB steps with a NaN sentinel. Each pack's
  curve-major versus frequency-major layout is selected by measured gzip size and recorded in its
  header; the build report records both sizes. The catalog partitions and binary packs contain
  rank-grid `statistics` from the analysis engine: robust inter-source spread, aligned population
  median and shrunk source offsets. Unsupported bins are JSON `null`, never invented zeros;
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
Validation is nested leave-one-control-out: each fold refits direction, reference and threshold with
the held-out source absent, then classifies its interval. Training controls share that fold's direction
and each excludes itself from its reference. Controls with fewer than four comparable products are
reported as **insufficient support**, neither correct nor wrong. At least **30 controls** must be scored,
and every supported held-out control must classify correctly; any failure keeps all unverified sources
unknown. A supported control without a usable classification fails rather than being dropped.
Minimum overlap is selected from 4/8/12/16/20/24/32 products: 200 subsamples without replacement must
classify correctly against that control's held-out threshold in at least 99% of trials for **every**
supported control. All scored controls must have the candidate overlap, including at least three 711
and two 5128 controls. An unverified source needs that overlap and an interval wholly on one side of the
threshold; otherwise it stays unknown. Insufficiently separated/stable controls stop the real build.
The report records the direction, bin support, control scores, intervals, LOCO training/held-out results, stability trials and every
source decision. No unverified source trains this test; evidenced sources do not certify hardware.

### Partition statistics

Statistics use only products with at least two distinct sources. Each product/source contributes one
unique default rank curve, shared with the engine; unreconciled duplicate defaults stop statistics.
Non-default tuning/fit/unit variants never gain population weight. Products without a default from
two sources do not train statistics.
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
accuracy. Full statistics and median spread per methodology frequency band are written to the
report; the build log prints a per-partition summary of support, band spread and harmonisation.

## Catalog rules

### Exclusions and identity

Blank/placeholder identities and unresolved leading markers are quarantined. Numeric models such as
Binary 1900 are legitimate when their maker is named; wholly symbolic/numeric identities are not.
Complete source-chain category names (`Test`, `DAC Test`, `Amp Test`, `Cable Test`, source-chain
tests/comparisons) and models explicitly declared as DACs, amplifiers or dongles are non-products.
This is not a substring ban: named models containing `Test` or named `Reference`, and transducer
setups such as `Model with DAC`, remain. `HP Test`/`Headphone Test` is instead a headphone category:
its named measurements stay in a source-isolated headphone partition, with the category removed from
the maker field. Known maker prefixes can be recovered; otherwise the complete source name stays
source-local unbranded, without guessing an equivalence to another named headphone. Quarantined
non-products have no redirects.
Identity checks also run before per-file modification metadata is appended; a modified dongle remains
a non-product. A setup qualifier only protects a transducer subject, not `DAC with amplifier`.
Explicit fake/replica/counterfeit names or file descriptors, clone/copy product names, and unidentified
one-character custom names are non-products. Clone accessories alone do not make the product fake.
Earphones Archive's `*` is a mixed index category, not a uniform fake flag (its index, config and page
do not define a stronger meaning). Named mods/DIY/prototypes remain separate, source-attributed custom
products; an explicitly modified file grouped under stock gets its own full descriptor in the identity.
No mod label is stripped to merge it into stock. Near-identical defaults from the same source and
normalized product identity retain the first accepted curve only when coverage matches, aligned RMS
is ≤0.01 dB and every aligned bin differs by ≤0.02 dB. Separately labelled units/fits/tunings are not
deduplicated by shape. The build stops if this removes >3% of legitimate defaults from a partition
of at least 200 measurements; non-product exclusions and data-preserving moves are exempt.

Identity/alias keys ignore case, accents, spacing and punctuation except that `+` means `plus`:
NM2 and NM2+ stay separate. Before alias lookup, brand keys drop a trailing bracketed CJK/Japanese/Korean
annotation (except source-local `Custom (…)` and unrecovered `Unbranded (…)` brands), then one whitespace-separated `Audio`, `Acoustic` or `Acoustics` suffix with a nonempty
remainder; embedded/leading Audio names are untouched. Only `Unbranded (…)` collections recover a
complete leading catalog brand observed in another source (longest matching prefix after maker aliases);
unknown prefixes, `Custom (…)` collections and Custom Art stay unchanged; `+` is not a maker boundary.
Model keys strip bracketed
CJK-only translations or dash-wrapped CJK text only when Latin letters/digits remain; bare trailing CJK
tokens stay separate and are reported as ambiguous. Complete repeated raw/canonical brand prefixes are
removed at word boundaries, never partial words. Display labels are separate from identity: every accepted measurement contributes one vote
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
duplicate, cyclic or chained mappings stop ingestion. Numeral, MEMS and collaboration-spelling aliases
require explicit reviewed mappings, with evidence in the input notes; such descriptors are not stripped
generically. Response distances corroborate identity evidence, never authorize automatic merges.
Only the recognized sample/unit, fit/tip/pad and switch/cable rules below fold descriptors; revisions remain separate.
`identityMerges.productsBefore` counts globally unique original keys; `productsAfter` is the final
count and `merged` is their net difference. Separately, `groupwiseMerges` lists each many-to-one group's
original keys and reduction plus their total; this can differ from net reduction when an original key
also splits across final products. Near-name candidates are separated by form, with known forms
labelled in collision groups. The report retains every remaining group for manual review, never fuzzy
auto-merging; adjacent-name heuristics are not exhaustive, particularly across unrelated brand keys.
`identityAudit` adds every brand-key/placeholder merge and its original parts, plus-sign splits, model
annotations, cross-brand same/near-name candidates and cross-form identities (reported, never moved).
Merge evidence is unharmonised full-rank-grid LS RMS between finite, level-centred, source-balanced
median curves in each shared rig partition. Its per-rig same-product 90th percentile uses distinct-source
pairs within original identity parts, with linear percentile interpolation; larger distances are flags,
never vetoes, and absent shared-rig/default support or calibration is explicitly missing, not invented.
Reviewed plural/HiFi/Labs/typo aliases and their shared-model evidence are recorded in `data/aliases.json`.
Diagnostic thresholds and merge comparisons use final published default flags after switch/default
reconciliation, not provisional classification. Modified-product base lookup applies both reviewed
brand and product aliases to stock display names and stripped candidates, with the same ambiguity
and same-form guards as before.

The frozen-cache `8a730bf5584c9e0011d182ad` supplemental review found 17 glued/hyphenated maker pairs.
Eight explicit aliases below have distinct-source, shared-model/default evidence in `iem-711`, below
that build's same-product P90 of **2.625960 dB**. These evidence distances decode the unharmonised
0.02 dB rank packs, centre each curve, take per-source then equal-source medians and calculate
shared-finite-bin level-aligned RMS. They corroborate the reviewed maker spellings; no generic
glued/hyphenated suffix-removal rule is added.

| Reviewed spellings          | Shared model   | RMS dB              |
| --------------------------- | -------------- | ------------------- |
| Ear Acoustics / EarAcoustic | SPA Hi-End Max | 1.812640            |
| Floaudio / Flo Audio        | Lily           | 1.068310            |
| IOAudio / I/O               | SOGNO          | 1.267324            |
| MAKINAaudio / Makina Audio  | T-100B         | 1.059586            |
| MYER-AUDIO / Myer Audio     | SLIIVO SLA3    | 0.481392            |
| NFaudio / NF Audio          | NM2 / NM2+     | 1.316814 / 1.147201 |
| OpenAudio / Open Audio      | Mercury        | 1.102714            |
| See Audio / SeeAudio        | Yume II        | 1.294924            |

MYER-AUDIO/Myer Audio also shares CKLVX D62 at **0.676471 dB**. Six candidate pairs lack an exact
shared model: Epicaudio/Epic Audio, Jadeaudio/Jade Audio, Meeaudio/MEE Audio, PMGAudio/PMG,
ShiroAudio/Shiro Audio and ZEMPIREAUDIO/Zempire. RaynAudio/Rayn Audio (one shared model),
Thieaudio/Thie Audio (one) and XK-Audio/XK Audio (three) lack shared-rig default evidence.
All nine remain unresolved; embedded `Thieaudio` is never reduced to `thie`. Annotation-bearing
`NFAudio (NFAcous)` remains a separate, uncorroborated key.

Products receive metadata-only `modified: true` for a `[modified: …]` model marker, a standalone
case-insensitive `mod`, `modded`, `modified`, `prototype` or `proto` model word, or a source-local
`Custom (…)` brand (never Custom Art). Removing a terminal marker or those words and an adjacent
Foam descriptor links `baseProductId` only to one existing unmodified product with the same form and
brand/model identity key; missing or ambiguous bases stay unlinked.
An unmatched base next tries removing a trailing bracketed/parenthesised mod/prototype segment, then
a trailing one- or two-word qualifier plus `mod`, `modded` or `prototype`; multiple matching stock
bases stay ambiguous, and a stripped model that would itself be modified is never a base.
The phrase fallback stops before Roman numerals II–X, digit-containing tokens (including V-number
revisions), single letters, or Pro/Plus/Max/Mini/Lite/SE/MK/Mark/Gen/Edition, case-insensitively;
only a shorter permitted strip can then match stock, never a strip across a protected model token.
These annotations never change identities, IDs, measurements or redirects. The build report's `productFlags` gives overlapping
per-rule counts and every word-rule match, including the `modified` word inside explicit markers.

Catalog redirects preserve historical product and measurement links across identity/form moves.
An existing measurement ID wins first, even after its variant or parent changed during a descriptor
fold. Otherwise candidates match by source ID and their unordered original file-URL set. When several rows match,
the old variant's kind and label narrow that set if an exact match survives; `isDefault` is not an
identity constraint. A measurement redirects only to one eligible row, while a product can resolve
when all eligible rows share one destination product. Each old measurement contributes at most one
product vote, regardless of duplicate current rows. Splits first maximize former-default counts,
then total former-measurement counts among those leaders, then require a unique matching identity
among the remaining tied candidates, recomputed with current brand/product aliases and identity
rules, with the same accepted-maker evidence and measurement source context used during ingestion.
Otherwise they stay unmapped. Maker recovery evidence comes only from makers with an accepted curve
after source config, calibration, exclusion and curve-quality gates, never merely a cached index.
Existing IDs never redirect. Previous redirects are retained, chains collapse to current IDs and dead
targets are dropped; unavailable previous catalogs produce warnings, not a failed build. The build
report's `redirects` records the baseline version, counts and split decisions. Engine ID-taking
requests return canonical IDs plus `resolvedIds` when changed, allowing saved state to be migrated;
an explicit historical measurement retains its exact canonical parent even across a product split.

### Variant kinds and initial defaults

Variant classification strips only maker/model prefixes, never shared descriptor words such as ANC
or Sample, and retains descriptive labels: explicit replacement samples (sample/unit 2) take precedence as `unit`; tips, foam, insertion
and pads are `fit`; switches, filters, impedance, nozzles and DSP are `tuning`; cables and adapters
are `setup`. Default selection prefers explicit default/stock, neutral EQ/normal/standard/original,
then ANC-off states; ties use source order. Without an obvious stock state, the first non-excluded,
non-ambiguous file remains the fallback, including mode-only products. Other modes are non-default
tuning unless required by final coverage. Explicit sample 1 is initially eligible; replacement samples
are initially excluded from default selection, not from the catalog. `S1`–`S9` shorthand requires
explicit sample/unit wording elsewhere in the source's phone book or other S-number measurements of
the same maker/product at that source. Otherwise it is model text, not a sample claim. B&W generation
labels such as Pi7 S2, Px7 S3 and Px8 S2 are not replacement-sample labels. Parenthesized/bracketed
`(by person)`, `(measured by person)` and similar credits are neutral attribution: stripped from variant
labels/descriptors, retained verbatim in original filenames. Heuristic kinds can be wrong; labels and
processing provenance retain the evidence rather than claiming a verified physical configuration.
Every non-default measurement must have a non-empty label, using its filename when an originally
unlabelled default is demoted; an empty non-default label stops publication.

### Review sample identities

In both catalogs, a trailing `Sample N`/`Unit N` (including zero-padded numbers and `Sample1`),
or an exact parenthesized `(sample N)`/`(unit N)`/`(SN)`, identifies a review unit, not a product.
The marker is removed from the maker/model identity. Sample-only products create the same base identity
even when no unsuffixed entry exists; reviewed aliases supply a new base's canonical model name,
while unaliased source spelling is retained. An empty remaining model is not invented. Bare model tokens such
as Moondrop S8, Letshuoer S12, Simgot EA500 S and B&W Px8 S2 do not match this identity rule.
Mixed, uninterpreted descriptors such as `Sample 3L + 4R` or `(sample 02 golden)` remain separate.
An explicit sample/unit number immediately before a modification marker is also removed, but the mod,
DIY, prototype or reshell descriptor stays in the identity: a modded sample never joins stock.

Folding happens after curve acceptance, without shape deduplication: original measurement IDs, files,
URLs and curve values survive. Folded measurements start as `unit`, with sample and tip/fit labels
preserved from the original file, suffix and model marker, plus the identity move and previous kind
in processing provenance. An existing base default from the same source/partition wins, including when
only a folded sample matches the preferred switch state: reconciliation preserves that base default,
and final coverage cannot select the sample over existing base defaults. A sample-only
source/partition receives one default under final coverage, preferring the lowest sample number
(explicit sample/unit numbers before parenthesized shorthand, never an S8 model token). Its label and
previous `unit` kind remain recorded; default does not mean verified stock. Retired product IDs redirect
to the base, and inherited product/measurement redirects continue to resolve.

### Fit, tip and pad identities

After the established sample and exact-parent switch/accessory folds, both catalogs remove only
remaining positioned fit descriptors:
terminal parentheses containing `Deep Insertion`/`Shallow Insertion`, `Foam`/recognized foam-tip terms, `… pad(s)`/
`… earpad(s)` (including `used pads` and `foam pads on`); a terminal standalone `deep`/`shallow`;
`Stock [colour] Tip`; a named `Tip`/`Pads` suffix; and `pad-rolling`, `[Pads Collection]` or `- Pads`.
Named multiword accessories require an already accepted exact parent; otherwise only one accessory
word, or an alphanumeric accessory code followed by `PRO`, is removed. No fuzzy parent is inferred.
Parenthesized content must be entirely a recognized fit descriptor; mixed model/fit text such as
`PR1(HiFi version foam)` stays a separate product and is reported as an ambiguous marker.
Years, bare S1/S2 and ordinal unit qualifiers are retained; only the existing explicit sample rules
run again to remove a sample marker exposed by fit folding. Existing exact-parent accessory decisions
take precedence over synthesizing fit-only bases, so a model word before bare `tips` is not guessed
away. Empty or unidentified `Sample N`/`Unit N` identities
are not invented: `Sample | 1 Deep` remains a known limitation, as does the uninterpreted `2nd Unit`
in `Sonata 2nd Unit`.

Fit words inside real names remain identity: `Fit Open S50`, `Fit Pro`, `LinkBuds Fit`, `Deep Blue`,
`Deep Bass` and `Deep Cup` do not match these positions, and `(S)` is not interpreted as shallow.
Any `[modified: …]`, whole-word mod/modded/modification, DIY, prototype or reshell marker takes
precedence over the fit rule, including Foam Mod products and modded builds ending in named tips.

The shared sample-fold machinery resolves canonical IDs and reviewed aliases, synthesizes missing
bases, preserves every accepted measurement/file/URL/curve and redirects retired IDs with history.
The full source label and descriptor survive in variant labels and processing provenance. Curves
start as `fit`, preserving an existing `tuning` or stronger `unit` kind; a combined sample/fit keeps
both descriptors and the lowest-numbered-sample coverage fallback. A folded fit cannot displace an
existing base default from the same source/partition, even if it alone matches the preferred switch state.
Without a base default, unchanged final coverage can select one fit/tuning/unit curve as `default`, with
its descriptor and previous kind retained; this is a usable source reference, not verified stock.
The build report's `fitIdentity` lists each move and synthesized base.

Aftermarket pad descriptors fold only when the same source already has a stock default for the exact
base product and partition; otherwise the pad product keeps its original ID with no redirect.
Folded pad curves can never be defaults, while `(used pads)` denotes worn stock and keeps ordinary fit/default coverage.

### Switch and accessory folding

Recognized terminal switch-state suffixes (high/low impedance, including “impedence”/“imp”, DU or
binary switch positions, explicit named modes), cable/termination suffixes and recognized tip
suffixes are folded into an **already accepted exact parent** of the same maker/form. Normal identity
spelling rules apply; no new fuzzy, Roman/Arabic, revision or bare “Balanced” model equivalence is
inferred. The suffix becomes part of the original variant label, with the move retained in provenance.
2.5/3.5/4.4 mm, named cables, balanced connections and single-ended terminations use `setup`.
A source's sole cable option stays default; multiple split cable options retain one default (explicit
standard/stock/default first, then source order). Existing unit/fit/tuning meaning wins over generic
cable metadata; DSP cables and bass/impedance plugs are not neutral cable defaults.

The established vocabulary-based tip suffixes include Stock Tip, branded tips,
foam, wide/narrow/standard bore, CP100/CP145 and named
tip families. They become `fit` only when every token is a recognized tip term; a source's sole neutral
tip option stays default, while additional split tip defaults prefer stock/standard/default then source
order. Other tokens (including `02`/`12` in Hisenior T4's foam labels) stay in the variant label and
make it initially non-default `tuning`, without guessing their meaning. Model designators such as
Pro/Max/II/2/S/Ultra/Plus, T4/X2, revisions, samples and mods prevent that suffix from being folded.
Existing unit or tuning meaning wins over neutral tip metadata. Ambiguous tip suffixes retain their
tokens and default protection in provenance; ordinary switch reconciliation cannot promote them,
but final coverage can select a default while retaining the label and previous kind in provenance.
Recognized tip vocabulary includes stock/standard/original, silicone/foam, ear/tip/bore descriptors,
CP codes and ABP-T; SpinFit W1/Omni, Azla/Sedna Short/Light/Crystal/Origin, Divinus Velvet, Baroque,
Moondrop Spring, Final E, JVC Spiral Dot, Sennheiser foam, TENNMAK SoFoam and KZ tips. Other names,
colors and codes are not assumed neutral merely because the same suffix also contains “tip”.

A terminal parenthesized `Depth Test`/`Insertion Depth Test`, optionally preceded by a declared filter,
folds into an already accepted exact maker/model parent as insertion-fit metadata. Filter and numeric
depth labels survive, including the first file's depth; no parent is invented when none exists.
A same-source unsuffixed default takes precedence over a depth experiment regardless of entry order.
Depth-only sources retain the existing coverage fallback, with explicit fit labels rather than an
assumption of stock equivalence. Filename depths survive generic suffixes; attribution stays in filenames,
not display labels.

Before rig evidence and statistics, labelled switch defaults are reconciled **per product**, with
one vote per source's unambiguous existing default state. A unique plurality selects the common state.
Each source with an eligible explicitly labelled curve in that state selects it; other explicit
states are non-default tuning. Existing defaults break within-source ties, then source index order.
Replacement units, ambiguous EQ and impedance-adapter loads cannot become the bare switch-state default.
A different switch state wins over incidental tip/fit metadata; same-state tip changes remain `fit`.
Unlabelled defaults are preserved, not acoustically assigned. Tied pluralities remain unresolved.
DU and 00, or named modes and impedance positions, are **not** equated without evidence. When multiple
defaults cannot be reconciled to an eligible selected state, the source's original phone-book/file order
selects one default (lowest stable ID only if that order is unavailable); the rest become non-default
`tuning`. This selects a source reference, not an inferred switch equivalence; unresolved states remain reported.

### Final default coverage

After final rig/partition assignment, **every measured (product, partition) must have a default**.
Every (product, source, partition) must also have one except when a selected labelled switch state is
absent at that source and another source supplies defaults for that product in the **same partition**.
Sample-only groups and singleton fit/unknown groups always receive a default. Otherwise missing defaults use the lowest
numbered sample (or first unit), stock/neutral fit first, or the existing tuning/default tie-break and
source order. Every selected default has **`kind: 'default'` and `isDefault: true`**, retaining its
label and recording the previous kind in provenance. This makes a measurement usable without claiming
it is stock. Every (product, source, partition) has **at most one default**, including unresolved state
groups; no encoding is guessed. The build enforces `isDefault === (kind === 'default')` for every
measurement; kind/flag mismatch, multiple source defaults, missing product coverage or unjustified
missing source coverage stops publication.
Coverage counts use `kind`, consumed by the engine, UI and rig evidence; statistics uses the equivalent
`isDefault` flag. Rig evidence receives kind-correct provisional defaults, then those choices are
restored before final selection so final partitions determine published fallbacks. App compatibility
requires an engine product candidate for every measured product/partition, in raw and harmonised modes.

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

Manual updates use `pnpm data:crawl`, then `pnpm data:build`. The Deploy workflow restores the
published dataset before refresh builds, preserving its catalog and redirect history, then re-crawls
weekly on Monday at 06:17 UTC (`17 6 * * 1`) before rebuilding and deploying. A failed pull stops deployment.
Use `--sites superreview,elrics --limit 10` for a partial crawl (limit is filename stems per database).
The crawler uses an identifying User-Agent, four global request slots (never more than six),
conditional ETag/Last-Modified requests, persistent content-addressed cache, and exponential backoff.
Failed revalidations retain the last successful body and record the failure separately; sources
without a successful configuration are excluded rather than silently losing calibration or rig data.
Retained discovery, configuration, calibration and measurement failures are listed with their URL/status
in the report; the crawl summary also records retained fetch failures. A retained body is not counted
as a fresh successful retrieval. Remote configuration paths must stay on the database's HTTP(S) origin.
Hand-maintained inputs are strictly validated; missing keys, unknown keys (except `_note`), or wrong
value types stop the command. Persistent rate limiting or blocking stops the crawl. Interrupted crawls
resume from cached files. `pnpm data:pull` retrieves the published manifest/files and verifies SHA-256;
`DATASET_URL` overrides the default `https://tonewave.lr7.dev/data/`.

Builds are deterministic for unchanged cache/inputs; build time is the newest relevant cached content
fetch time, not the current wall clock. Output versions hash the artifacts and source attribution.
Verified existing versions stay in place on repeat publication; repairs use a recoverable backup and
commit the manifest last. Successful publication retains the current version and the version named
by the previous manifest; only older generated versions are removed, so pre-deploy tabs can still fetch
their remaining artifacts.
Re-publishing the same version preserves the already-retained history rather than guessing its age.
Serial publication sweeps abandoned build/pull/interrupted staging on success and failure. Every
backup survives a failed publication; backup and old-version sweeping requires a committed manifest
whose current version and live files are reverified. Cleanup errors are warnings after a committed
manifest, not failed publications. Reports distinguish missing channel HTTP responses, uncached variants
in partial crawls and rejected measurements, and list parsing failures, unaliased brands, normalized
identity collisions and suspicious near-names. Exact duplicate index rows are removed; duplicate
measurement identities retain the first accepted entry with a report entry. Quarantine reasons,
category/marker changes, variant corrections and per-database form counts are retained as evidence.

`pnpm data:build` writes machine-readable evidence to `.cache/ingest/report.json`: `variantReview`
lists products with state/accessory descriptors, including every source variant's ID, partition,
filename, label and kind;
`sampleIdentity` contains unit identity moves and newly created bases;
`switchIdentity`/`switchDefaults` contain moves, ambiguities, votes and source choices; `defaultCoverage`
contains before/after counts, selections, exceptions, `unresolvedStates` and `unresolvedMultipleDefaults`, with provisional
coverage in `rigDefaultCoverage`; `unknownVariants`, `rigEvidence`, `sourceEvidence`, `quality`,
`quarantineSummary`, `remainingCollisionGroups`, `remainingFormConflicts`, `statistics` and `files`
retain the remaining labels, rig decisions, exclusions, conflicts, fold statistics and artifact hashes.

### Known unresolved cases

Switch-state ties and incompatible encodings (including Quartet, Canon Pro and Butastur cases) can
leave unresolved state choices or justified source-level gaps; source-order selection is not successful state
reconciliations. Opaque colors, positions and multi-position codes remain uninterpreted, and suffixes
without an accepted exact parent remain separate. Abbreviations, real model families, revisions and
ambiguous sample descriptors are not fuzzy aliases. Cross-form names can genuinely name both forms, as with 1MORE Triple
Driver; mixed-index earbud/open-ear candidates such as QKZ MDR, Yuin PK1 and TrueFree O1 remain reported
pending a supported form policy rather than inventing a third `Form`. Newer index schemas without
`file` lists are reported as unsupported, not guessed. Source hardware, raw calibration, insertion,
tips, seal and prices are not independently verified. 711/5128 data is not converted between rigs;
high-frequency response and inter-source differences require caution.

### Current build summary

Local build `f9ba2374a78706b8379bfed8`: **9,155 products / 40,821 measurements / 138 databases /
118 publishers**, across **57 partitions** (7,477 IEM products / 33,507 measurements; 1,678 headphone
products / 7,314 measurements). The build has **305 quality-quarantine candidates**, not counts of
previously published removals. All **10,717 measured product/partition groups** have a default;
**zero duplicate source defaults**, **45 unresolved state groups** and **67 selected-switch-state
source exceptions** are reported.

The frozen-cache comparison uses origin/main `d031d7e` as B0 (`25fd1290788e29311d0a9e01`) and the
identity branch plus the eight reviewed aliases as B1 (`4faef5c62875b2b41735c95e`). Both started from
`4199d08ffc44cf0977b5bae0`. Their **182,761 input files / 1,875,054,088 bytes** have SHA-256 fingerprint
`9a0f28798869e899e2c39f9e0ac24518716733765bf5f51ddad68816950e263c`, unchanged after all builds.
The builder reads `cached()` only, with no fetch-on-miss path. The complete **40,821-measurement
multiset**, keyed by source and unordered original URL/channel pairs, and every matched rank curve's
decoded int16 bytes are identical between B0 and B1. Repeated raw keys retain their multiplicities.

B0 has **9,490 products**; B1 has **335 fewer**. Changed grouping components comprise **319 merges,
22 splits, nine mixed merge/splits and 856 identity-only rekeys**. Categories below overlap within
components; no changed component is outside the reviewed rules.

| Category             | Merges | Splits | Mixed | Rekeys |
| -------------------- | -----: | -----: | ----: | -----: |
| Brand rule A         |    268 |      5 |     3 |    683 |
| Plus identity keys   |      3 |     22 |     9 |    129 |
| Placeholder recovery |     31 |      0 |     0 |     14 |
| CJK model annotation |      5 |      0 |     0 |      9 |
| Reviewed aliases     |     42 |      0 |     5 |     38 |

The supplemental aliases alone merge **38** initial-B1 product pairs, with **15 additional rekeys**,
no measurement or curve changes, no partition moves and two default-flag changes. Against B0,
**56 default flags change** and **160 yoshiultra measurements move from source isolation to iem-711**
after renewed rig evidence; the curves themselves do not change. MYER-AUDIO/Myer Audio maker
duplicates are resolved; distinct CKLVX and SLIIVO model/revision near-name groups remain separate.

The identity audit flags **53 shared-rig comparisons across 28 products**, all above the iem-711
same-product P90 of **2.625960 dB**. The five watched products are present: CVJ MEI has 12 flagged
comparisons (largest **6.375170 dB**); Noble Audio Kaiser Encore **4.662281**; Hi-Fri Audio 1+3
**4.627270**; Moondrop Block **4.617915**; Whizzer A15 **3.586715**. These are diagnostic flags,
not automatic identity vetoes.

Metadata flags cover **429 modified products** (249 IEM / 180 headphone) and **308 base links**
(163 / 145). Overlapping marker/word/custom rule counts are **282 / 419 / 30**. Truthear Hexa is one
product with **116 measurements**; I/O Cielo has **24**. sai's Shure SE425 is under Shure. NF Audio
NM2 and NM2+ are two products with **nine / ten measurements**: compact `NFaudio` no longer creates
duplicates. The CanJam NYC 2025 prototype is modified and links to CrinEar Reference
`p-437de4e3e3402077cdc3`.

Of **1,241 disappeared seed product IDs**, **1,237 redirect**. Truthears Hexa redirects to Truthear
Hexa; I/O Audio Cielo redirects to the retained I/O Cielo ID. The old NF Audio NM2 ID
`p-4403886ad1f935e4f84b` is not retained literally: it redirects to NM2 `p-6c8049b80dd9c29ce91f`,
not NM2+ `p-49559a08f80ed81c94c7`. Full inherited maps contain **2,009 product / 4,710 measurement
redirects**, with zero invalid targets or lost inherited routes. Universal disappeared-ID
coverage is **not** achieved: four products (Nowa Acoustics Inferno, QoA x 7th Acoustics Ryusei,
FAudio Mezzo and Aure Nirvana EP) have no surviving raw-file match and remain unmapped.
Old NF ACOUS NM2+ `p-f625e0cf0798654fbf72` now redirects to NM2+: former defaults tie 1–1,
but NM2+ holds two of its three former measurements. EarAcoustic Audio Silver Angel SPA Limited
`p-ab9faeabbd0c6f9a33e2` redirects to `p-6b89f8d0f23ef2a5cfb6` after matching variant kind/label.

The frozen tonedeafmonk index explicitly reuses the Limited raw file under High End Ultra:
`m-2149597d444f511add19` is a **non-default fit**, labelled `(SPA LIMITED EDITION FOAM TIPS)`,
while `m-d30d9dec8d271b0e88bb` is Limited's empty-label default-kind row. The old Limited measurement
matches the latter variant. This is source-defined reuse, not an importer-created second stock
default. Both source references remain intact; their physical equivalence is not independently
verified. These general redirect rules add **two product / two measurement routes** versus
`4faef5c62875b2b41735c95e`, without removing or retargeting any existing route.
The redirect-only rebuild uses the same frozen cache and `4199d08` seed; products, measurements,
all curves, non-redirect catalog fields and statistics are identical to `4faef5c`.

Upstream drift is separate: B0 versus `4199d08` adds **five products / 27 measurements**, removes
**four products / eight measurements**, and changes **one matched Cozoy D2 rank curve**. No database
or publisher is added or removed. Five sources' **257 measurements change partition**, partitions
increase **53 → 58**, and one default flag changes before applying the identity rules.
LOCO is unchanged between B0 and B1: **37 scored / 37 correct / one insufficient-support / zero
wrong controls**. Current held-out harmonisation figures, including negative small-partition folds,
are in [METHODOLOGY.md](METHODOLOGY.md); this is observational validation, not physical calibration.
