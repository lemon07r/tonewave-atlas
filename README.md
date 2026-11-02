# Tonewave Atlas

Find in-ear monitors (IEMs) that measure like the ones you already love, using the frequency-response
data reviewers publish.

**[tonewave.lr7.dev](https://tonewave.lr7.dev)** · free · no account · no tracking

![Discover: matches for a reference IEM, with the reference and match curves overlaid](docs/images/discover.png)

Pick an IEM you know and get its closest measured matches, each with a plain description of where it
differs: more bass, a recessed upper midrange, extra treble energy. Rate a few more and the ranking
follows your taste instead of a single reference.

As of November 2026 the catalog covers **10,013 products** and **41,064 measurements** from
**138 databases** published by **118 reviewers** in the squig.link network.

## What you can do

**Find similar IEMs.** Choose a reference and get ranked matches. Each result shows its response
distance in dB (lower means a closer measured shape), the regions where it departs from the reference
and, when several reviewers measured it, how far apart their results land. Focus on bass, vocals or
treble, penalise extra treble energy, filter by reviewer, or set a budget using reviewer-listed USD
prices.

**Match your taste.** Rate IEMs as love, like, neutral or dislike. Specific dislike reasons map to
measured traits: "Too much bass" penalises candidates with more bass than the IEM you disliked, and
"Sibilance" penalises narrow peaks between 5 and 9 kHz. Ratings about fit or comfort stay
out of the sound model. The summary shows what your likes have in common and splits them into
separate tastes when they pull in different directions. Profiles stay in your browser and export as
plain JSON.

**Compare curves.** Overlay up to six measurements, view them as differences from a baseline, adjust
smoothing and pick left, right or averaged channels. Drop in your own measurement file to see it next
to the catalog; it never leaves your browser. Comparisons are shareable by URL, and PNG exports keep
the source attribution on the image.

**Inspect a product.** Product pages gather every measurement of a model across reviewers and rigs:
the combined curve, the spread between measurements, variants such as tuning switches and ear tips,
and links to each reviewer's original files.

**Generate EQ.** Fit parametric EQ toward a reference target or another IEM's measured curve, see
what difference remains after the filters, and download them for Equalizer APO, Wavelet (GraphicEQ)
or as JSON.

Headphones work the same way with a smaller dataset; IEMs are the focus.

## How matching works

A frequency-response curve shows how loud an IEM plays from bass to treble on a measurement rig. Close
curves are a strong hint, not a guarantee: fit and ear shape change what you hear, and measurements
above about 8 kHz vary a lot between rigs and insertion depths. Tonewave Atlas is built around those
limits.

- **Rig families stay separate.** 711-type ear simulators and the B&K 5128 produce different curves
  for the same IEM, so their measurements are ranked separately and never mixed. Databases that don't
  name their rig default to the 711 group and are labelled as inferred.
- **Reviewers are combined, not cherry-picked.** A product's reference is the level-aligned median of
  every usable default measurement on that rig family. Tuning variants are separate candidates.
- **Measured disagreement sets the weighting.** About 2,500 IEMs have been measured by more than one
  reviewer. That overlap shows how much measurements disagree at each frequency, and the comparison
  trusts noisy regions less. Correction for each reviewer's systematic offset is switched on only
  where held-out validation shows it helps: in the current 711-group data it reduces the average
  difference between two reviewers' measurements of the same IEM from 1.76 to 1.58 dB.
- **No percentages.** Distances are in dB. Taste rankings add penalties for your dislikes and show
  that as a separately labelled ranking score. Neither is a "% match" or a sound-quality rating. Every
  number is defined in [the methodology](docs/METHODOLOGY.md).
- **Original files are untouched.** Smoothing, alignment and corrections are applied to copies and
  listed on the product page next to links to the reviewers' files.

## Sources and credit

Every curve comes from a reviewer's public squig.link database, and every one is credited: the Method
page lists each database, and each measurement links back to its source. Tonewave Atlas is
non-commercial and serves resampled curves, not the raw text files. The measurements belong to their
reviewers; they are public, but most are not explicitly licensed, and credit is not a substitute for
permission.

If you publish measurements and would rather not be included, or something is attributed or labelled
wrongly, [open an issue](https://github.com/lemon07r/tonewave-atlas/issues) and it will be fixed in
the next build. Details: [data sources and rights](docs/DATA_SOURCES.md).

## How it's built

There is no application backend. A build-time pipeline crawls the reviewer databases, parses and
validates every file, resamples it onto a common 1/24-octave grid, groups measurements into products
and publishes the result as versioned, compressed static files. The browser loads only the catalogs
and curve packs a page needs, and rankings and EQ fitting run in a Web Worker. Once the data is
loaded, ranking the whole catalog takes a few milliseconds in the engine benchmarks
([measured timings](docs/VALIDATION.md)).

```
squig.link databases ─ crawl ─▶ raw cache ─ build ─▶ versioned static dataset
                                                              │
                                     browser UI ◀── Web Worker analysis engine
```

SvelteKit and TypeScript on Cloudflare Pages. The analysis engine in `src/core/` has no framework
dependencies; its tests use hand-calculated cases, such as known distances and independently computed
EQ filter responses.

## Development

Requires Node 24+ and pnpm.

```sh
pnpm install
pnpm data:pull   # download the published dataset into static/data/
pnpm dev
```

Tests run in a real browser, so install Chromium once with
`pnpm exec playwright install --with-deps chromium`.

| Command           | Purpose                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| `pnpm verify`     | Formatting, lint, types, unused-code check, unit and component tests   |
| `pnpm build`      | Production build into `build/`                                         |
| `pnpm test:e2e`   | Playwright journeys with accessibility checks (run `pnpm build` first) |
| `pnpm data:crawl` | Fetch or revalidate the source databases (slow and rate-limited)       |
| `pnpm data:build` | Build the dataset from the crawl cache                                 |
| `pnpm bench`      | Engine benchmarks                                                      |

## Documentation

- [Product](docs/PRODUCT.md): who it is for and what it should do
- [Architecture](docs/ARCHITECTURE.md): how the pieces fit together
- [Methodology](docs/METHODOLOGY.md): the maths behind every number
- [Validation](docs/VALIDATION.md): tests, benchmarks and dataset checks
- [Data sources](docs/DATA_SOURCES.md): crawling, processing, rights and removal
- [Design](docs/DESIGN.md): visual language and accessibility

## License

The code is [MIT](LICENSE). The measurements belong to the reviewers who published them and are not
covered by this license.
