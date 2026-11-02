# Design system

## Character and hierarchy

A quiet publication around a precise instrument. Warm paper, deep ink, editorial whitespace and
hairlines establish hierarchy without a dashboard of cards. The chart is the one framed workspace.
Product names, evidence and provenance take precedence over decoration. Empty states describe what is
missing; they never simulate products, matches or measurements.
Empty-chart instructions explain how to load a curve; search guidance states the rig-family constraint
once, rather than repeating it under the chart or substituting slogans for instructions.

**Typography:** self-hosted DM Sans Variable for interface and headings. Its open forms work at compact
sizes, while moderate weight and tight title spacing give the publication its character without a
second display family. IBM Plex Mono 400 earns its place on chart axes, values and small section
indexes. Tabular figures are enabled globally. Body text is 16 px, secondary text 14 px, metadata
12 px; titles scale from 32 to 48 px. Small chart annotations are supplementary to the accessible
table and named controls, not the only way to read a value.

## Tokens and colour

The source of truth is `src/lib/styles/app.css`. Spacing is 4/8/12/16/20/24/32/40/48/64 px;
radius 4 px; hairlines 1 px. Layers: sticky 10, popup 30, toast 50. No gradients or shadows.

| Role                  | Light                 | Dark                  |
| --------------------- | --------------------- | --------------------- |
| Paper                 | `#f6f4ee`             | `#1c211f`             |
| Workspace             | `#fcfbf7`             | `#232a26`             |
| Subtle surface        | `#eeece5`             | `#2b332e`             |
| Ink                   | `#262d29`             | `#eeece4`             |
| Secondary ink         | `#626a63`             | `#afb8ae`             |
| Hairline              | `#d5d8ce`             | `#414b43`             |
| Control boundary      | `#8b948b`             | `#7d8b7f`             |
| Primary accent        | `#006b5e`             | `#85d5bb`             |
| Accent text           | `#ffffff`             | `#142b22`             |
| Accent surface        | `#e1ece4`             | `#2b4035`             |
| Caution ink / surface | `#805417` / `#f2e9d5` | `#e6bd76` / `#3c3426` |

One teal accent denotes interaction, not a preference score. Text contrast on the workspace is
13.61:1 / 12.41:1 for ink, 5.39:1 / 7.19:1 for secondary ink, and 6.21:1 / 8.55:1 for the accent
(light / dark). Decorative hairlines are intentionally quieter; input boundaries and focus rings use
stronger roles. Disabled controls are explicitly disabled, not presented as usable low-contrast text.

| Curve  | Light     | Dark      | Dash sequence (CSS px)              |
| ------ | --------- | --------- | ----------------------------------- |
| Teal   | `#007a83` | `#69cbd2` | Solid                               |
| Rust   | `#a64e22` | `#eda576` | 14, 5 (long dash)                   |
| Violet | `#6953a3` | `#b5a2ed` | 4, 4 (short dash)                   |
| Rose   | `#ab3f69` | `#ed91b3` | 1, 4 (dot)                          |
| Olive  | `#557328` | `#b4ce77` | 12, 4, 2, 4 (dash-dot)              |
| Blue   | `#3765b0` | `#91b5f5` | 12, 3, 2, 3, 2, 3 (dash-double-dot) |
| Ochre  | `#946800` | `#e3c36c` | 14, 4, 6, 4 (long-short)            |

All curve colours exceed 4.7:1 against the light workspace and 6.4:1 against the dark workspace.
The palette separates warm, cool and violet families, but colour alone is never an identifier:
unique dash patterns, numbered legend labels and an accessible table preserve identity when hues
converge under colour-vision deficiencies. References use neutral secondary ink with paired short
dashes (3, 3, 3, 8), distinct from the long rust dash. Plot, 48 px SVG swatches and export share one
pattern function so the legend never substitutes a misleading dash.
Uncertainty shading is supplementary, not a separate clickable series.

## Layout

Maximum page width 1440 px, with 48 px desktop gutters and a 64 px Discover column gap. Discover uses
roughly 1:1 columns and a sticky chart aligned with the top of the left heading block, without negative
offsets. Compare uses a 300 px selection rail; Explore and Method use
228 px rails. Method prose is limited to 720 px.

- At 1150 px: tighten navigation and column gaps.
- At 1050 px: gutters become 32 px; secondary rails narrow.
- At 900 px: navigation becomes a button-controlled disclosure; Discover and Compare stack.
- At 700 px: Explore filters move after the catalog; Method contents precede the article.
- At 640 px: 20 px gutters, smaller titles, mobile-only form switch inside navigation.

The chart reserves a 280 px plotting height, 304 px from 1200 px, and 244 px at mobile widths; Compare
provides a larger 364 px desktop workspace (300 px when stacked). ResizeObserver sizes the canvas,
not the surrounding layout. The fixture page has no production counterpart: use
`/compare?visual` with `pnpm dev`. Its four curves are explicitly synthetic and include NaN gaps.

## Component behaviour

- Shell: skip link, current-page navigation, mobile disclosure with Escape/focus return, native
  form-factor radios reflected in `?form=headphones`. Theme cycles system → light → dark, persists
  locally when storage is available and follows system changes in system mode. The document applies
  theme before paint. Query state is browser-only so the four routes remain prerenderable.
- Discover presents single-reference and taste-profile modes together above the real catalog search.
  Products are grouped by brand, with variant/source counts. Similar-mode reference, optional
  measurement/rig, focus, budget, tunings, advanced source/treble controls and up to five overlays
  are URL state; reload restores them. Worker requests ignore stale responses. Taste updates debounce
  for 300 ms; neither worker errors nor missing support become successful empty results.
- Search: input retains focus while `aria-activedescendant` follows grouped listbox options. Arrows
  wrap, Home/End jump within an open list, Enter selects, Escape/Tab dismiss. Literal substring
  highlights are text nodes, never injected HTML. Loading and empty feedback are announced. Callers
  can supply asynchronously filtered items with `filter={false}` and own cancellation/race handling.
  Only the page's primary search enables `/` and Command/Ctrl+K; `/` does not interrupt typing.
- Segments and ratings use native radios; optional reason tags use checkboxes. Labels and SVGs are
  both present, with no emoji. Sliders pair a native range with a clamped, step-aligned number input.
- Advanced controls use native details/summary. Popovers and action menus use native auto popovers
  for Escape/light dismissal; menu items support arrows and Home/End. Tooltips work on hover/focus,
  expose descriptions and dismiss with Escape. Toasts keep Undo available until dismissed rather
  than racing a timer. Notices are inline; generic skeletons reserve 88 px per row, overridden to
  160 px for Discover result rows. The result section reserves space while analysis loads.

## Discover evidence and profile patterns

Results are a dense ordered list separated by hairlines, not a card grid. Each row leads with rank,
brand/model, verbatim tuning label and one-decimal response distance in dB (lower is closer, not better).
Numbers and units stay together. Reviewer ranges appear only when the service supplies them, with
its participating-source count; equal one-decimal endpoints print as one value. Rig labels come from
`src/lib/rigs.ts`, using catalog source names for source-specific headphone rigs when available.
USD listings retain source and crawl month/year; no raw-currency
conversion or current-price claim is implied. Show/remove chart buttons expose pressed state;
Compare uses product IDs, and Product page links carry the selected product. Action targets are at
least 24×24 px (currently 36 px tall) and wrap only as whole items, with 16 px gaps. View chart/back
links appear only at the stacked layout breakpoint (900 px and below), connecting the instrument and
results without moving keyboard focus unexpectedly; desktop already has the visible sticky chart.

The wording policy lives in `src/lib/discover/describe.ts` and the plain-language section of
`docs/METHODOLOGY.md`: omit absolute band means below 0.75 dB, “slightly” below 2 dB, plain more/less
below 4 dB, “much” from 4 dB. These are editorial thresholds, not audibility or significance claims.
Treble/air differences share one trailing plain-language reliability note above 8 kHz per row.
Expandable details retain signed band means,
RMS, coverage, contribution, tilt, measured-source links and uncertainty rather than hiding the evidence
behind a summary. Profile results separately explain nearest-liked distance, matched/differing bands,
tolerance-weighted fit and each dislike constraint; the combined ranking score is not labelled dB.

Profile products use hairline-separated rows with named native rating groups, optional liked aspects
or engine-supported dislike reasons, a fit/comfort-only checkbox and Remove. Decorative selected-tag
checks are hidden from assistive technology so reason names remain stable. New additions start as Love,
explicitly explained above the rows. Neutral and non-sound ratings stay stored but do not inform the
model. Until there is a sound-related Like/Love, the page explains what is needed rather than querying
an invented taste. Model groups list their actual members, plain-language supported statements, qualitative confidence
reasons, conflicts and unused evidence. Advanced per-band corrections alter model centres, not the
learned statements or confidence. Reader-facing taste wording lives in `src/lib/discover/taste-wording.ts`;
it preserves the service's directions, support counts and measured ranges, explains default uncertainty
without internal terminology, and retains unknown service reasons rather than hiding evidence.

Profiles use `tonewave.profile.v1` localStorage, separated by form factor. Export includes both forms;
import validates schema, reasons, aspects, strengths and IDs before replacing anything. Malformed or
oversized files produce an inline error. Storage failures explain session-only operation and export.
Clear and successful import offer persistent Undo; there is no account or server-side profile upload.

## Chart conventions

- Input arrays must match the canonical 240-point GRID, as Float32Array or Float64Array. NaNs become
  explicit gaps; the chart does not smooth, extrapolate, normalise or invent measurements.
  Discover fetches detail consensus for default products and measured detail curves for explicit
  measurements/tunings. Derived taste centres alone are log-frequency interpolated from the service's
  corrected 120-point model, labelled “Taste N centre (derived)”; even samples remain exact, missing
  neighbours remain gaps and the final point is not extrapolated. Corrections are not applied twice.
  Chart source disclosure links to each contributor's provenance database; export retains attribution.
  Discover level-aligns displayed curves to the first curve with weighted LS on GRID, so arbitrary
  source levels do not masquerade as broadband tonal differences. This display-only processing is
  labelled below the instrument and in export attribution; ranking/explanations remain unchanged.
- Logarithmic 20 Hz–20 kHz x axis; explicit 20/50/100/200/500/1k/2k/5k/10k/20k labels.
  Axis, table and export labels use Level (dB) / Frequency (Hz), or Difference (dB) in difference mode.
  Adaptive y bounds include supplied envelopes, with outward 5 dB boundaries and padding.
  Empty charts retain a faint frequency/level grid, with no invented curve.
- Difference view subtracts the selected baseline pointwise. It performs no extra alignment and
  retains missing baseline coverage. Supplied envelopes are shifted by that same fixed baseline;
  this does not propagate baseline uncertainty or manufacture a confidence interval.
- Hover crosshair updates every legend value. The frequency slider offers keyboard/touch inspection.
  Legend buttons toggle visibility; hover/focus highlights a curve. The octave-spaced table retains
  every series, including hidden ones, and uses a dash for missing values.
- Optional regions are approximately perceptual descriptions, not universal sound claims. Focus or
  hover reveals the range and caveat; abbreviated mobile labels remain horizontal with complete accessible names. The
  span-aligned label strip has no filled cells or rules; alternating shading stays inside the plot.
- PNG export preserves the displayed plot's aspect ratio, adds mode, units, numbered/dashed legend
  and supplied attribution, and wraps long labels/source text. The in-app footer links to Sources and
  limitations rather than displaying the plain-text export attribution. Theme changes redraw the canvas.

## Motion, accessibility and verification

Motion is limited to 140 ms control transitions. Reduced-motion preference removes transitions and
loading animation. There is no animated chart entrance, scroll trapping or timed toast dismissal.

Commitments: keyboard access, visible 2 px focus rings, native semantics before ARIA, text contrast
at WCAG AA levels, non-colour chart identities, named controls and an inspectable table. Automated
tests cover combobox navigation/async replacement, native rating semantics, chart subtraction,
missing coverage, series controls, keyboard inspection, derived-centre identities, wording thresholds,
profile imports, result actions and the table. Real-data Discover e2e journeys cover search, distance,
overlays and reload, love/reasoned dislike, model explanations, profile persistence, Undo, import errors
and axe in both modes on desktop/mobile. Browser review covers light
and dark at 1440×900, 834×1112 and 390×844. These checks do not replace real screen-reader testing.

Discover uses the published catalog and analysis worker. Compare/Explore/Method integration is owned
by the separate pages lane; their route implementation is not described here as Discover behaviour.
