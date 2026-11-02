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
Positive improvement means reduced same-product response distance in dB, not improved perceptual
accuracy. The same statistics and median spread per methodology frequency band are written to
`report.json` and printed per partition.

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
untouched. `data/products.json` contains only explicit, terminal brand/model aliases; string `_note`
entries are permitted at the top level and inside `aliases`. Malformed,
duplicate, cyclic or chained mappings stop ingestion. Initial Roman/Arabic numeral aliases were
verified against catalog/file names in dataset `3c9d923462f8b79c98aa4ef9` (evidence in the input note).
Tuning/fit/sample suffixes are not stripped. The report records pre/post identity counts, merged
name groups and remaining suspicious near-name pairs for manual review, never fuzzy auto-merging.
Near-name audit candidates are separated by form, and known forms are labelled in collision groups.
