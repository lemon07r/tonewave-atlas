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

- IEMs on 711-family couplers and B&K 5128 are separate partitions. An IEM directory entry without a
  rig description is inferred to be 711-family and marked as inferred, not verified hardware.
- Headphones never share an IEM partition, including databases labelled “5128” under `/headphones/`.
  Explicit 5128, 4128 and miniDSP EARS families can share their own headphone partition (EARS Pro
  remains separate); other headphone rigs remain source-specific. `data/sources.json` owns overrides.
- The parser ignores phase, drops nonfinite rows, averages duplicate Hz in dB, sorts and validates.
  Curves are linearly interpolated in log Hz on the canonical 240-bin 1/24-octave grid, never
  extrapolated. Flat/absurd curves and target, calibration, delta and EQ sandbox names are rejected.
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
  contain `statistics` fields, set to `null` until analysis-engine integration; never invented zeros.

## Updating and limitations

Updates are explicit: `pnpm data:crawl`, then `pnpm data:build`. There is no automatic schedule yet.
Use `--sites superreview,elrics --limit 10` for a partial crawl (limit is filename stems per database).
The crawler uses an identifying User-Agent, four global request slots (never more than six),
conditional ETag/Last-Modified requests, persistent content-addressed cache, and exponential backoff.
Failed revalidations retain the last successful body and record the failure separately; sources
without a successful configuration are excluded rather than silently losing calibration or rig data.
Remote configuration paths must stay on the database's HTTP(S) origin. Hand-maintained inputs are
strictly validated; missing keys, unknown keys (except `_note`), or wrong value types stop the command.
Persistent rate limiting or blocking stops the crawl. Interrupted crawls resume from cached files.
`pnpm data:pull` retrieves the published manifest/files and verifies SHA-256; `DATASET_URL` overrides
the default `https://tonewave.lr7.dev/data/`.

Builds are deterministic for unchanged cache/inputs; build time is the newest relevant cached content
fetch time, not the current wall clock. Output versions hash the artifacts and source attribution.
Verified existing versions stay in place on repeat publication; repairs use a recoverable backup and
commit the manifest last. Generated old versions are removed only after successful publication. Reports distinguish uncached
variants in partial crawls from rejected measurements and list parsing failures, HTTP gaps, unaliased
brands, duplicate index rows, normalised identity collisions, and suspicious adjacent near-names. Exact
duplicate index rows are removed; duplicate measurement identities retain the first accepted entry
with a report entry. Fuzzy names are never
automatically merged. Abbreviations may remain separate products; heuristic variant kinds can be
wrong and always retain the original label. Newer index schemas without `file` lists are reported as
unsupported, not silently guessed. Source hardware, raw calibration, insertion, tips, seal and prices
are not independently verified. 711/5128 data is not converted between rigs; high-frequency response
and inter-source differences require caution.
