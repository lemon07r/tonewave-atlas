# Architecture

Static SvelteKit site on Cloudflare Pages. No backend: a build-time pipeline turns public measurement
databases into versioned, compressed files; the browser does all analysis in a Web Worker.

```
squig.link databases ──crawl──▶ .cache/ (raw files + ETags)
                                   │ build (deterministic)
                                   ▼
                  static/data/<version>/…  (catalog, ranking packs, detail shards, manifest)
                                   │ fetch + IndexedDB cache
                                   ▼
               browser: UI (Svelte) ◀─Comlink─▶ analysis worker (src/core)
```

## Layout

| Path            | Owns                                                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/`     | Framework-free engine: grid, parsing, resampling, smoothing, metrics, preference, PEQ, codec. No DOM/Svelte/Node imports (lint-enforced) so it runs in the worker, Node tools and tests. |
| `src/lib/`      | UI: components, state, worker client, persistence.                                                                                                                                       |
| `src/routes/`   | Pages. All prerendered; dynamic state lives in the URL query string.                                                                                                                     |
| `src/workers/`  | Worker entry that exposes the engine via Comlink.                                                                                                                                        |
| `tools/ingest/` | Node pipeline (`pnpm data:crawl`, `pnpm data:build`, `pnpm data:pull`).                                                                                                                  |
| `data/`         | Hand-maintained inputs: source overrides, brand aliases, exclusions, targets.                                                                                                            |
| `benchmarks/`   | Reproducible engine benchmarks (`pnpm bench`).                                                                                                                                           |

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
  same rig family. The build estimates per-frequency cross-source spread and per-source systematic
  offsets from that overlap and ships them with each partition; the engine uses them for weighting and
  confidence. See `METHODOLOGY.md`.
- **Products vs measurements vs variants.** A product (brand + model) has measurements (one per source
  and variant). Variants keep their verbatim labels plus a heuristic kind: `default`, `tuning`
  (switches, impedance modes, nozzles, DSP), `fit` (tips, insertion), `setup` (adapters), `unit`
  (other samples, prototypes), `unknown`. Tunings are separate candidates; fit/unit variants inform
  variability. Raw files are never altered; derived curves record their processing.
- **Prices** are reviewer-listed values from source indexes, shown with source and crawl date, used
  only when parseable as USD.
- **Worker boundary.** Packs are decoded into the worker once; the UI sends small requests (ids,
  settings) and receives small results. Large arrays cross threads only as transferables.
- **Caching.** Dataset files live under a content-hashed version path and are served immutable;
  `manifest.json` is revalidated. IndexedDB holds decoded packs keyed by version and saved profiles.

## Dataset files (`static/data/`)

- `manifest.json` — dataset version, build time, per-file hashes and sizes, source list.
- `<version>/catalog-<form>.json.gz` — products, measurements, sources (metadata only).
- `<version>/rank-<partition>.bin.gz` — 1/12-octave channel-averaged curves for ranking, plus
  partition statistics (spread, source offsets, population median).
- `<version>/detail-<partition>-<n>.bin.gz` — per-channel 1/24-octave curves, sharded, loaded on demand.

Gzip is decoded with the native `DecompressionStream`; no compression dependency. Cloudflare Pages
limits (20 000 files, 25 MiB per file) shape the shard sizes.

## Deployment

`pnpm build` writes `build/`; `wrangler pages deploy build` publishes it. CI (GitHub Actions) runs
checks on every push, rebuilds the dataset on a schedule, and deploys `main`.
