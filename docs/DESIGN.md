# Listening Room

An editorial workspace for measured comparisons: warm paper, deep ink, a cobalt action colour and
one framed instrument. The same system covers Discover, Compare, catalog/product pages, EQ, Method
and their loading, error, empty, menu and notification states. Copy tells readers what they can do;
it does not promise a listening experience or turn a measurement into a verdict.

## Typography and colour

Self-hosted **Newsreader Variable** carries page titles and product names. **DM Sans Variable** is the
interface and reading face; **IBM Plex Mono** is reserved for values, axes and technical labels.
Product brands are supporting text, not slogans. Body text is 16px; controls 14px; metadata 12px.
Display titles scale with viewport width. Tabular figures keep changing results steady.

`src/lib/styles/app.css` owns base mechanics and fallback theme tokens; `direction.css` owns the
Listening Room palette and editorial treatments. `workspace.css` owns shared page composition.

| Role                | Light   | Dark    |
| ------------------- | ------- | ------- |
| Paper               | #f4f0e6 | #171b25 |
| Instrument surface  | #fffdf7 | #202633 |
| Subtle surface      | #e8e2d5 | #292f40 |
| Ink                 | #172337 | #f2ecde |
| Secondary ink       | #555d6a | #b6bdce |
| Decorative hairline | #d7d1c4 | #3c4354 |
| Control boundary    | #797b7e | #8790a6 |
| Action / focus      | #234ac3 | #a5b8ff |
| Accent text         | #ffffff | #172148 |
| Accent surface      | #e2e7f7 | #303c60 |
| Detail              | #93502c | #edb18e |

Light is paper-led, with dark ink and restrained cobalt. Dark has a deeper page than its instrument
surface and brighter secondary text; it is not a colour inversion. Cautions use their own ink and
surface. Decorative rules are quiet; interactive boundaries and visible focus use stronger roles.
`contrast.test.ts` checks text at 4.5:1 and control/series colours at 3:1. Chart identities also have
numbered legends and dash patterns; colour is never the only means of identification.

## Layout and controls

Pages stop at 1440px, with 48px desktop gutters, 32px intermediate gutters and 20px mobile gutters.
Discover uses two near-equal columns: references/results on the left and a sticky chart on the right.
At 900px it stacks in DOM order and exposes chart/results jump links. Compare has a selection rail;
Explore and Method use narrower rails, stacking on small screens. Method prose stays readable at
720px. Chart plots are 292px high on desktop and 244px on mobile.

Spacing follows a 4px scale. Borders are 1px, corners 2px. Layers are sticky 10, popup 30, toast 50.
Controls use native elements where possible, minimum 24px targets (usually 36–44px), 2px focus rings,
and no timed dismissal of Undo. Transitions are 140ms and reduced-motion preference removes them.
Menus/popovers dismiss with Escape; comboboxes retain input focus while arrows, Home/End and Enter
operate the list. Theme preference is applied before paint and stored locally when available.

## One discovery workspace

Search adds an **unrated, inactive** product. Nothing, including a catalog example, selects or likes a
reference automatically. Examples are deterministic, ordered by source/measurement coverage within
the active form and default rig, not popularity or quality. Search normalises punctuation, accents
and joined model numbers and tolerates bounded typing errors without an added dependency.

References use compact name/rating rows. A single per-item Details disclosure contains aspects,
dislike reasons, comfort and measurement selection; the first explicit Like/Love/Dislike opens it.
Loaded references remain collapsed, with native keyboard-operable rating groups and disclosures.

- One sound-related Like/Love uses similar-response ranking.
- Two to four likes use independent reference trade-offs, with mean/minimax sorts, Pareto counts and
  an optional taste-model view.
- A sound-related dislike or five rated sound-related items uses the taste model. Neutral/unrated
  and fit/comfort-only items never enter the sound model.

Rig, budget, reviewer coverage, tunings, focus and treble controls live behind Refine matches.
Reviewer scoring offers coverage (products measured by selected reviewers, scoring all sources) or
selected-reviewer-only reference/candidate consensus. Engine caveats disclose lost source support;
no selected measurements means a reference is unavailable, not silently replaced. Settings auto-apply
with an updating notice; generation guards reject
older successes and errors. Charting a match or other view-only URL changes redraw without
re-ranking. Show more increases the engine topK beyond 20.
Source-only mode requires at least one reviewer; emptying the selection resets coverage atomically.
Changing rig or reviewers clears serialised corrections for the previous model. Pending results keep
the references and sort of their response until the replacement arrives.

Rows lead with rank, product and dB distance, or an explicitly labelled taste ranking score (not dB
or percent). The summary keeps at most two important band differences. One historical USD listing
stays visible with its reviewer and observation date, explicitly not a listing date; observations
older than twelve months are flagged as potentially out of date. Additional listings and band evidence are expandable. Unknown
prices are explicit. Rate this product permits a rating, optional reasons and comfort-only flag
before saving, without navigation. Remove, clear and rating changes offer keyboard-reachable Undo.

## Chart and evidence

Discover defaults to **As ranked: smoothed, level-aligned**, adding “reviewer offsets corrected” when
the engine reports harmonisation. It passes returned rank curves directly on rankFrequencies: no
interpolation, extra smoothing or second alignment. Taste candidates show the centre named by their
tasteId. Multi-reference charts group candidates with the returned alignment reference, keeping every
reference in its own panel. Null-aligned candidates are omitted from both ranked response and Difference
views with a note; no new level alignment is applied. Each objective's distance independently fits
its own offset. Expandable band tables explain each reference separately.
Distance headers use “closest” / “furthest” at the displayed one-decimal precision, with no labels
when the distances round to a tie. Reference and band headers use 12px text with normal tracking and
explicit kerning. Empty charts distinguish missing rig coverage from references still awaiting a rating.

Detail measurements are an explicit alternate view, labelled uncorrected and display-aligned.
Compare, product charts and EQ use their own uncorrected detail measurements. Missing bins remain
gaps. The chart has a log-frequency axis, keyboard frequency inspection, response/difference views,
visibility controls, an accessible sampled data table and attributed PNG export. Difference mode
subtracts the selected baseline without another alignment.
Inspection starts at the nearest 1 kHz bin and retains the selected frequency across series/grid changes.
Blue, orange and teal lead the shared series palette, paired with distinct dash patterns (primary
reference solid). The plot, SVG legend and PNG export share those identities; colour is not the only cue.

Missing-rig diagnostics identify each reference's default or explicitly selected measurement support,
then offer engine-provided common partitions. They never substitute a variant or silently mix rigs.
A local reference requires an explicit rig choice; file data stays in the browser session and is
excluded from URLs and saved profiles.
Its declared rig is retained with the session-local reference and locks the independent rig control.

## Persistence and compatibility

The existing `tonewave.profile.v1` storage key remains; version 1 data migrates to version 2 without
changing explicit ratings. Version 2 adds `unrated`. Profiles remain separate by form factor; import
validates bounded IDs, rating strengths, reasons and aspects before replacing data. Storage failures
leave session editing and JSON export available.

Old `ref`/`m` links become one explicit Like. Old `mode=profile` or `mode=taste` selects the taste view.
Existing focus, alpha, rig, budget, source, tuning and correction parameters remain recognised.
Canonical edits write a JSON `ratings` parameter; an explicit empty list overrides local storage.
Malformed shared evidence is reported without overwriting the saved profile. Form switching removes
form-specific URL evidence and restores the appropriate local profile. Uploads are never serialised.

## Review

Method validation figures are read from the active form’s published catalog metadata, labelled with
the dataset version/build date and partition. Missing statistics are reported, never replaced with
figures from an older build. Source support, held-out pair/fold counts, pooled mean before/after,
available median and fold improvements remain distinct.

Unit/component checks cover search, migration, query races, chart values and controls, diagnostics,
band/price wording and contrast. Browser journeys and axe cover the real dataset. Visual review uses
1440×900, 834×1112 and 390×844, in both themes, including expanded evidence and EQ. Automated checks
do not replace real assistive-technology testing.

`tests/e2e/visual.spec.ts` captures empty/unrated/single/multi-reference workspaces, per-reference
tables, reviewer-only scoring, taste constraints, missing variants and current validation figures.
The page journeys capture Compare, catalog/product, EQ and Method/source tables. Captures use CSS
pixel dimensions (including mobile), check document overflow and keep exports outside the repo.
Visual review also checks clear series identities, readable wrapped evidence, native control text
and consistent product headings; it found and corrected the mobile reviewer-select overflow.
