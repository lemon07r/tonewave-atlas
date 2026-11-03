# Product

Tonewave Atlas helps people find IEMs (and headphones) that will probably sound right to them, using
real frequency-response measurements, without making them learn measurement jargon first. It should
feel intelligent because the analysis and explanations are good, not because of AI theatre or
invented scores.

## Who it serves

- **Listeners** who know they like one or two IEMs and want "more like this, maybe cheaper".
- **Enthusiasts** who want rig-aware comparisons, region-focused matching, uncertainty and EQ.
- **Reviewers and measurers** who care that their data is attributed and represented honestly.

## Principles

1. **One obvious first step.** Add a product you know → give it an explicit rating → inspect measured matches.
2. **Explain in plain words, back it with numbers.** Every claim ("a little brighter around vocals")
   comes from a calculation the user can expand and inspect.
3. **Honest uncertainty.** Measurements disagree across rigs, units and insertion depth. Say so where
   it matters (upper treble, bass seal), and never present a coupler measurement as how something
   will sound in a particular ear.
4. **Rig-aware by default.** Never rank 711 and 5128 measurements against each other.
5. **Progressive disclosure.** Defaults that work; advanced controls one click away, not in the way.
6. **Local-first.** No account, no tracking; profiles live in the browser and export as readable JSON.
7. **No popularity bias.** Rank by measured fit; surface lesser-known and newly measured models.

## Information architecture

- **Discover** (home) — one reference-and-preference workspace (explicit ratings and optional reasons). Results
  with explanations, filters (budget, rig, source, variant kind) and focus presets.
- **Compare** — up to ~6 curves with difference view, normalisation, smoothing, region overlays,
  L/R/variants, targets, image export, shareable URL.
- **Explore** — catalog browsing and product pages: all measurements of a product across sources and
  rigs, variants, spread between sources, EQ toward a target, provenance.
- **Method** — how matching works, data sources and attribution, limitations.

Saved items (profiles, targets, comparisons) appear where they are used rather than in a separate
account area.

Catalog redirects update old shared links and saved profile ids in place, without adding a history
entry. A surviving explicit measurement can identify a split product; unresolved items stay intact
with a quiet, one-time note. Duplicate profile products merge: equal ratings combine their preference
details, fit/comfort flag and explicit variant; an active rating beats Neutral or unrated. Conflicting
active ratings prefer the already-current product entry and explain the dropped older rating by name.
Migration Undo restores the earliest pre-migration profile for the tab session, retaining it and later edits across navigation in sessionStorage while leaving the saved canonical profile intact. Ordinary workspace Undo restores the visible references (including shared URL references); import has its own ordinary Undo.
A destructive migration keeps its Undo for the tab session, across reloads and form or page changes, until Undo or Dismiss, even when its message was already shown once.
Mixed reviewer databases remain available in each form and measurement rig they actually cover.
Cross-form redirects check the other catalog: unambiguous links switch form and saved items move to that form’s profile; mixed or unresolved links remain intact with a quiet note.

## Core flows

1. _Start a workspace_: search → add an unrated product → choose Like/Love (and variant if it matters)
   → measured response matches with differences → compare, chart or rate a result with Undo.
   Compact reference rows keep ratings visible; Details opens on the first Like/Love/Dislike and holds
   optional sound notes, comfort and variant selection.
2. _Refine preferences_: add products as unrated, then explicitly love / like / neutral / dislike, with optional reasons → the model
   summarises what the likes share, shows separate tastes if they differ, applies dislike reasons as
   directional constraints → personalised ranking with per-result explanations → user can correct the
   inferred preferences directly.
3. _Region focus_: "match mainly the bass/mids", "avoid extra treble energy", custom weights.
4. _Several references_: two to four sound-related likes default to trade-offs (mean/minimax and Pareto
   filtering), with an optional taste view. Dislikes or five rated items use the taste model.
   Fit/comfort-only evidence stays out of sound ranking. A local measurement can be a single reference
   after choosing its rig; matching stays locked to that declared rig until the local reference is removed.
   Its contents never enter storage or the URL.
5. _EQ path_: how close a cheaper IEM gets to a reference with a few PEQ filters; export filters.

## Competitive landscape (Nov 2026)

| Tool                   | Good                                                                    | Weak                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| squig.link graph tools | Huge decentralised data; fast overlays; L/R, variants, baselines        | One reviewer per site; no ranking; normalisation/smoothing units unexplained; incomplete share state                              |
| Squig-Rank             | Ranks across many squig databases; target builder; similarity to an IEM | Modified Harman regression presented as a score; keeps the best-scoring duplicate (cherry-picks); single opaque number; expert UX |
| AutoEq                 | Rigorous, documented EQ fitting; many targets                           | EQ only; data now stale; no discovery                                                                                             |
| GraphWorks             | Repeat-measurement envelopes; clean comparisons; preference bounds      | One lab's data; no recommendation                                                                                                 |

## Differentiators

- Taste model from likes **and** reasoned dislikes, with separate tastes, conflicts and confidence.
- Explanations per result in plain language, tied to region-level numbers.
- Product-level results aggregating every reviewer's measurement, with measured cross-source spread
  instead of cherry-picking.
- Uncertainty-aware weighting learned from the data's own cross-source disagreement.
- Region-focused and treble-sensitive matching; trade-off view for multiple references.
- EQ-reachability of candidates, with exports.
- Headphone mode using the same engine where the data supports it.

## Out of scope (for now)

Distortion/impedance rankings (no consistent open data), user accounts, server-side compute, AI chat.
