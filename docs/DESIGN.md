# Design system

## Character and hierarchy

A quiet publication around a precise instrument. Warm paper, deep ink, editorial whitespace and
hairlines establish hierarchy without a dashboard of cards. The chart is the one framed workspace.
Product names, evidence and provenance take precedence over decoration. Empty states describe what is
missing; they never simulate products, matches or measurements.

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

| Curve  | Light     | Dark      | Dash sequence (CSS px) |
| ------ | --------- | --------- | ---------------------- |
| Teal   | `#007a83` | `#69cbd2` | Solid                  |
| Rust   | `#a64e22` | `#eda576` | 8, 3                   |
| Violet | `#6953a3` | `#b5a2ed` | 3, 3                   |
| Rose   | `#ab3f69` | `#ed91b3` | 10, 3, 2, 3            |
| Olive  | `#557328` | `#b4ce77` | 5, 2                   |
| Blue   | `#3765b0` | `#91b5f5` | 2, 4                   |
| Ochre  | `#946800` | `#e3c36c` | 12, 4                  |

All curve colours exceed 4.7:1 against the light workspace and 6.4:1 against the dark workspace.
The palette separates warm, cool and violet families, but colour alone is never an identifier:
unique dash patterns, numbered legend labels and an accessible table preserve identity when hues
converge under colour-vision deficiencies. References use neutral secondary ink with a 6, 5 dash.
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
- Discover presents single-reference and taste-profile modes together above the search. The empty
  profile explains adding, rating and optional reasons without a wizard; controls remain disabled
  until a real product can be added. It does not manufacture a saved profile or recommendation.
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
  than racing a timer. Notices are inline; skeletons reserve 88 px per result row.

## Chart conventions

- Input arrays must match the canonical 240-point GRID, as Float32Array or Float64Array. NaNs become
  explicit gaps; the chart does not smooth, extrapolate, normalise or invent measurements.
- Logarithmic 20 Hz–20 kHz x axis; explicit 20/50/100/200/500/1k/2k/5k/10k/20k labels.
  Adaptive y bounds include supplied envelopes, with outward 5 dB boundaries and padding.
- Difference view subtracts the selected baseline pointwise. It performs no extra alignment and
  retains missing baseline coverage. Supplied envelopes are shifted by that same fixed baseline;
  this does not propagate baseline uncertainty or manufacture a confidence interval.
- Hover crosshair updates every legend value. The frequency slider offers keyboard/touch inspection.
  Legend buttons toggle visibility; hover/focus highlights a curve. The octave-spaced table retains
  every series, including hidden ones, and uses a dash for missing values.
- Optional regions are approximately perceptual descriptions, not universal sound claims. Focus or
  hover reveals the range and caveat; compact mobile labels have complete accessible names.
- PNG export preserves the displayed plot's aspect ratio, adds mode, units, numbered/dashed legend
  and supplied attribution, and wraps long labels/source text. Theme changes redraw the canvas.

## Motion, accessibility and verification

Motion is limited to 140 ms control transitions. Reduced-motion preference removes transitions and
loading animation. There is no animated chart entrance, scroll trapping or timed toast dismissal.

Commitments: keyboard access, visible 2 px focus rings, native semantics before ARIA, text contrast
at WCAG AA levels, non-colour chart identities, named controls and an inspectable table. Automated
tests cover combobox navigation/async replacement, native rating semantics, chart subtraction,
missing coverage, series controls, keyboard inspection and the table. Browser review covers light
and dark at 1440×900, 834×1112 and 390×844. These checks do not replace real screen-reader testing.

Phase 2 owns the catalog, worker connection, result explanations, measurement provenance, taste
profile persistence, comparison URL serialization, alignment/smoothing controls and sharing. The
current routes deliberately do not pretend those behaviours exist.
