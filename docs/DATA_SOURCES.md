# Measurement sources

Tonewave Atlas discovers reviewer databases from the public [squig.link directory](https://squig.link/squigsites.json).
Each database supplies its configuration, brand/model index (`data/phone_book.json`), and channel text
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

Every crawl reads the network's `optedOut` list from `squigsites.js`; builds reapply the cached list and
our local `data/exclusions.json`. Opted-out reviewers, all alternate-domain databases, and
crinacle/hangout.audio are excluded. Earbuds are not supported yet. For exclusion, correction, or
takedown, open a [GitHub issue on lemon07r/tonewave-atlas](https://github.com/lemon07r/tonewave-atlas/issues).
We honour source-owner removal requests by adding an exclusion and rebuilding; raw cache entries are
local ingestion state, never part of the published dataset. Discovery must succeed before a crawl;
an unrecognisable opt-out list fails closed.

## Rigs and processing

- IEMs on 711-family couplers and B&K 5128 are separate partitions. An IEM entry without a recognised
  rig defaults to 711-family and is marked as inferred, not verified hardware; explicit partition
  overrides are curator decisions.
- Headphones never share an IEM partition, including databases labelled “5128” under `/headphones/`.
  Explicit 5128, 4128 and miniDSP EARS families can share their own headphone partition (EARS Pro
  remains separate); other headphone rigs remain source-specific. `data/sources.json` owns overrides.
- The parser ignores phase, drops nonfinite rows, averages duplicate Hz in dB, sorts and validates.
  Curves are linearly interpolated in log Hz on the canonical 240-bin 1/24-octave grid, never
  extrapolated. Flat/absurd curves and target, calibration, delta-symbol (∆/Δ) and EQ sandbox names are
  rejected. The word “Delta” alone is ambiguous with product names and is not an exclusion.
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

### Statistics support and validation

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

Updates are explicit: `pnpm data:crawl`, then `pnpm data:build`. There is no automatic schedule yet.
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
automatically merged. Abbreviations may remain separate products; heuristic variant kinds can be
wrong and always retain the original label. Newer index schemas without `file` lists are reported as
unsupported, not silently guessed. Source hardware, raw calibration, insertion, tips, seal and prices
are not independently verified. 711/5128 data is not converted between rigs; high-frequency response
and inter-source differences require caution.

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
Tuning/fit/sample suffixes are not stripped. `identityMerges.productsBefore` counts globally unique
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
