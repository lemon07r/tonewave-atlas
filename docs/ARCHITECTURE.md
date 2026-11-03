# Architecture

Static SvelteKit site on Cloudflare Pages. No backend: a build-time pipeline turns public measurement
databases into versioned, compressed files; the browser does all analysis in a Web Worker.

```
squig.link databases ──crawl──▶ .cache/ (raw files + ETags)
                                   │ build (deterministic)
                                   ▼
                  static/data/<version>/…  (catalog, ranking packs, detail shards, manifest)
                                   │ fetch + browser HTTP cache
                                   ▼
               browser: UI (Svelte) ◀─Comlink─▶ analysis worker (src/core)
```

## Layout

| Path              | Owns                                                                                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/`       | Framework-free engine: grid, parsing, resampling, smoothing, metrics, preference, PEQ, codec. No DOM/Svelte/Node imports (lint-enforced) so it runs in the worker, Node tools and tests. |
| `src/core/atlas/` | Dataset service and partition-local consensus/candidate indexes, lazy catalogs, ranking, detail curves, uploads and PEQ orchestration.                                                   |
| `src/lib/`        | UI: components, state, worker client, persistence.                                                                                                                                       |
| `src/routes/`     | Pages. All prerendered; dynamic state lives in the URL query string.                                                                                                                     |
| `src/workers/`    | Worker entry that exposes the engine via Comlink.                                                                                                                                        |
| `tools/ingest/`   | Node pipeline (`pnpm data:crawl`, `pnpm data:build`, `pnpm data:pull`).                                                                                                                  |
| `data/`           | Hand-maintained inputs: source overrides, brand aliases, exclusions, targets.                                                                                                            |
| `benchmarks/`     | Reproducible engine benchmarks (`pnpm bench`).                                                                                                                                           |

Node runs the `.ts` tools directly (type stripping), so imports use explicit `.ts` extensions and
`#core/*` / `#lib/*` subpath imports from `package.json`.

## Key decisions

- **Frequency grid.** One canonical log grid: `f_k = 20 · 2^(k/24)`, k = 0…239 (20 Hz–19.9 kHz,
  1/24 octave). Measurements are resampled by linear interpolation in log-frequency; points outside
  the measured range are `NaN`, never extrapolated. Ranking uses a coarser 1/12-octave view derived
  from the same grid.
- **Shape, not level.** Comparisons remove the weighted least-squares level offset between two curves,
  so distance is the weighted standard deviation of their difference. No single-frequency
  normalisation. Display alignment uses the same offset.
- **Rigs are partitions.** IEC 60318-4 ("711"-family) and B&K 5128 measurements never mix in one
  ranking. Headphone rigs are a separate form factor. Products are the bridge: a user picks a product,
  and each partition uses that product's measurement on its own rig.
- **Uncertainty is measured, not assumed.** Many products are measured by several reviewers on the
  same rig family. Partition statistics can carry estimated per-frequency cross-source spread and
  per-source systematic offsets from that overlap; the engine uses them for weighting and confidence
  when present. Similar/taste correction defaults on only with sufficient support and positive pooled
  improvement overall and in every validation fold; results report actual application. Missing
  statistics use the conservative default spread, never on-demand estimation. See `METHODOLOGY.md`.
- **Products vs measurements vs variants.** A product (brand + model) has measurements (one per source
  and variant). Variants keep their verbatim labels plus a heuristic kind: `default`, `tuning`
  (switches, impedance modes, nozzles, DSP), `fit` (tips, insertion), `setup` (adapters), `unit`
  (other samples, prototypes), `unknown`. Tunings are separate candidates; fit/unit variants inform
  variability. Raw files are never altered; derived curves record their processing.
- **Prices** are reviewer-listed values from source indexes, shown with source and crawl date, used
  only when parseable as USD.
- **Worker boundary.** `src/workers/analysis.ts` exposes a service factory through Comlink.
  `await getAnalysis(baseUrl)` in `src/lib/analysis/client.ts` lazily creates one worker and returns a
  typed `Remote<Analysis>`; the UI supplies `asset('/data/')`. `dispose()` rejects pending initialization,
  releases the root endpoint once, then stops
  the worker. Requests contain ids/settings; results are plain data with typed arrays copied through
  structured clone, so the worker's cached curves are not detached. Uploads stay in worker memory and
  are never sent to a server. Upload-to-dataset comparisons require the caller to choose the rig.
- **Caching.** Dataset files live under a content-hashed version path and are served immutable (`static/_headers`);
  `manifest.json` is revalidated by the browser HTTP cache. The service pins its first manifest for
  its lifetime; dispose/recreate to pick up a new dataset. A failed versioned-file fetch/status/body/decompression
  triggers a shared `manifest.json` refresh with `cache: 'no-store'`. If its version changed, the service
  raises a sticky `DatasetUpdatedError`, never adopts the new manifest or mixes versions. An unchanged
  or unavailable refresh preserves the original file failure and permits retry. Retained old-version
  files remain usable without a refresh. Decoded reference targets, catalogs, rank packs and indexes
  stay in worker memory; decoded detail shards use an eight-shard LRU (configurable in the pure
  service). Concurrent requests share pending loads; failed loads can be retried. No decoded-pack
  IndexedDB cache is implemented.
- **Scoring caches.** Similar, compare and taste each retain one full scoring computation, sharing
  concurrent requests and evicting their previous key; rejected computations are retriable. The key is
  the pinned dataset version plus the recursively property-sorted request after identity resolution,
  excluding only top-level `sort`, `paretoOnly` and `topK`; array order is retained. References/exact
  measurements/uploads, partition, all filters/source settings, focus/custom bands, treble penalty,
  harmonisation, ratings and corrections therefore participate. Compare re-filters/re-sorts the
  **entire** cached objective/Pareto list before slicing. Similar/taste cache all scalar scores;
  winner explanations are rebuilt. Similar/compare rebuild stability for the new topK+10 set from
  cached reviewer variants. Returned ranking results are copied to isolate cache-owned data.

## Atlas service

`AtlasService({ baseUrl, fetch, detailCacheSize? })` has no UI or worker dependency. Its public
`Analysis` type and the request/result types in `src/core/atlas/types.ts` define the worker contract.
`summary`, `products`, `targets`, `measurements`, `similar`, `taste`, `compare`, `productDetail`, `curves` and `peq` are async;
`parseUpload` is synchronous locally (async through Comlink). Missing identities/rig support return
`{ ok: false, error, message }`; invalid numeric settings throw `RangeError`, and failed dataset
requests reject. `curves` preserves request order and returns missing-channel/identity errors per row.
The additive `DatasetUpdatedError` in `src/core/atlas/errors.ts` rejects with `name: 'DatasetUpdatedError'`,
`code: 'dataset-updated'`, string `previousVersion`/`newVersion`, and
`reloadMessage: 'The dataset was updated. Reload to continue.'`. Its `message` is that text, a newline,
then JSON `{ "previousVersion": "…", "newVersion": "…" }`. Comlink preserves only Error name/message/stack,
so callers use `DatasetUpdatedError.from(caught)` to recover these fields across the existing worker
transport (null for unrelated errors). No method signatures/result unions or client handling changed;
after an update is detected, dataset access including cached ranking requests rejects until the
service is disposed/recreated or the page reloaded.
Taste results include unused ratings and their reasons, qualitative confidence, conflicts and
winner explanations. Price filters require at least one observed USD price inside both bounds;
unknown prices do not pass a price bound. Source filters select candidates with an attributed source
in the set under the default `filters.sourceMode: 'coverage'`, without changing the consensus curve.
`'only'` instead filters individual rank measurements before pooling references and candidates;
it requires selected sources, echoes the effective mode, and caveats lost measurements. Partition-wide
reliability/population/reviewer-offset statistics remain unchanged. Derived indexes are cached by
partition, harmonisation and canonical source set (deduplicated, sorted, restricted to that partition).
Source-specific indexes use a four-entry LRU separate from resident unfiltered indexes; eviction
retains shared raw packs. Tuning candidates are opt-in through
`filters.includeTunings`; similarity excludes the reference product's default but may include its
explicit tunings when enabled. Taste always excludes every rated product, including its tunings.
An explicit tuning measurement is never its own similarity candidate, even with tunings enabled.
Multi-reference compare excludes all reference products, accepts exact measurement variants, and
returns filtered/sorted top-K trade-offs with full candidate/Pareto counts. Missing references name
the unavailable items and list rigs supporting all requested identities. Default partition selection
uses the greatest coverage of usable requested/rated items; ties prefer more measured products, then
partition id. Explicit measurement references keep their own rig, including non-default variants. A product with no
usable default on that rig requires an explicit measurement id rather than substituting a fit variant.
Explicit references, automatic default-product selection and alternative-rig adequacy use query
weights. Default-product references still require a consensus that passes the uniform full-grid
coverage check; query adequacy is an additional prerequisite, not a replacement for consensus coverage.
Successful explicit-rig compare requests never load unrelated rigs; alternatives are computed only
for missing-rig errors, after intersecting metadata support.

`index.ts` builds deterministic overlap-medoid product consensuses (also used by detail spread).
`ranking.ts` owns pure query validation, weighting, candidate selection and caveats;
`taste-ranking.ts` owns pure model/correction/packed-rank/result orchestration. `service.ts` retains
loading, reference/partition resolution and caches. The extraction preserves the `Analysis` contract
and keeps numerical helpers testable without worker, fetch or UI dependencies.

`targets(form)` lazily caches published GRID reference curves with attribution and artifact provenance.
PEQ accepts product, raw curve or `{ kind: 'reference', targetId }` targets. Reference targets must
explicitly include the measurement's partition; uploads require an explicit matching partition.
Similar, taste and compare expose rank frequencies, exact scored/aligned curves and effective weights;
taste also exposes per-centre fit weights, similar/compare their effective treble penalty. These fields
support rank-basis charts and independent score reproduction without loading detail shards. Compare
uses the same validated harmonisation policy as similar/taste; detail and PEQ remain uncorrected.
Each compare candidate's `alignedTo` names the first adequately overlapping reference, or is null
when no alignment is possible. A null-aligned curve must not be overlaid as though aligned.
Taste winners additionally expose the exact nearest-liked member curve/relative offset, and constraint
statements use measured-correlate wording. `DISLIKE_REASON_LABELS` in the taste engine provides labels
for legacy stored reason ids; the narrow 5–9 kHz reason has a bounded total influence.

## Dataset files (`static/data/`)

- `manifest.json` — dataset version, build time, per-file hashes and sizes, source list with accepted
  measurement counts, and per-partition form/product/measurement counts. `summary()` uses these counts
  without fetching either catalog; older manifests without the optional counts fall back to catalogs
  so a code deployment remains compatible with the previously published dataset.
- `<version>/catalog-<form>.json.gz` — products, measurements, sources (metadata only).
- `<version>/targets.json.gz` — rig-specific reference curves on GRID, attribution and source provenance.
- `<version>/rank-<partition>.bin.gz` — 1/12-octave channel-averaged curves for ranking, plus
  partition statistics (spread, source offsets, population median).
- `<version>/detail-<partition>-<n>.bin.gz` — per-channel 1/24-octave curves, sharded, loaded on demand.

Gzip is decoded with the native `DecompressionStream`; no compression dependency. Cloudflare Pages
limits (20 000 files, 25 MiB per file) shape the shard sizes.

## Deployment

`pnpm build` writes `build/`; `wrangler pages deploy build` publishes it. CI (GitHub Actions) runs
checks on every push, rebuilds the dataset on a schedule, and deploys `main`.
