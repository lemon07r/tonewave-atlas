# Project Brief: Build a Better IEM Discovery & Frequency Response Analysis Platform

## Your Role

Act as a principal software engineer, product designer, UX specialist, and audio measurement/DSP engineer.

Your assignment is to **research, design, architect, implement, test, and refine a production-quality web application** for discovering, comparing, analyzing, and recommending in-ear monitors (IEMs).

This must be a genuinely useful, technically credible product—not a demo, a generic AI-generated dashboard, or another graph viewer with additional filters.

Work autonomously. Make thoughtful engineering and product decisions, verify important assumptions, and implement the application rather than stopping after planning or scaffolding.

Prioritize, in order:

1. Scientific and mathematical correctness.
2. Intuitive, low-friction user experience.
3. Trustworthy and genuinely useful results.
4. Exceptional visual design and interaction quality.
5. Maintainability, reliability, and performance.
6. Extensibility without unnecessary complexity.

Treat the following as product requirements and design direction, not an inflexible implementation recipe. Investigate better approaches where appropriate and document important decisions.

---

## 1. Product Vision

Build an elegant, intelligent IEM discovery and analysis platform that makes frequency-response measurements genuinely useful to ordinary listeners and audio enthusiasts.

Existing tools such as Squiglink and Squig-Rank are useful but often require substantial knowledge of audio measurements, targets, compensation, and ranking methods. Their user experience can be confusing, and their recommendations typically rely on relatively simple target-matching approaches.

Our product should make complex analysis accessible without sacrificing technical sophistication.

Users should be able to:

- Find IEMs with frequency responses similar to any selected IEM or target.
- Select multiple IEMs they like and discover other IEMs they might enjoy.
- Select IEMs they dislike and explain which aspects they find unpleasant.
- Combine preferred IEMs, disliked IEMs, reference targets, and optional sound preferences into a personalized taste profile.
- Receive recommendations based on that profile, with clear explanations.
- Compare IEMs visually and numerically without needing to understand every audio engineering concept.
- Investigate frequency regions, tonal differences, measurement reliability, and potentially troublesome peaks.
- Discover lesser-known or recent IEMs rather than being limited to popular models.
- Explore advanced measurement analysis and EQ capabilities when desired.

A user should be able to arrive with only the knowledge that they like two particular IEMs, select them, and receive useful recommendations in less than a minute.

**The application should feel intelligent because its analysis and explanations are good—not because it uses unnecessary AI features or invented confidence scores.**

### Initial real-world use case

Use the CrinEar Reference and Softears Volume S as initial examples for evaluating the reference-matching workflow, provided legitimate numerical measurements can be obtained.

The application must remain completely general-purpose. Do not hardcode these as default preferences or fabricate measurements.

A particularly important use case is finding IEMs below $200 USD that closely match one or both references while avoiding unpleasant excess upper-midrange or treble energy.

---

## 2. Research Existing Tools Before Implementing

Examine the current implementations, functionality, and limitations of:

- Squig-Rank: https://github.com/PEQHUB/Squig-Rank
- Squiglink: https://squig.link/
- Squiglink source: https://github.com/squiglink/lab
- AutoEq: https://github.com/jaakkopasanen/AutoEq
- Headphones.com GraphWorks: https://graph.headphones.com/
- Other relevant measurement, target-matching, equalization, or headphone recommendation tools.

Investigate their algorithms, available data sources, measurement handling, interface design, filtering systems, and limitations.

Identify which features deserve adoption, improvement, replacement, or avoidance.

Do not blindly reproduce their interfaces, scoring methods, or code. Respect software licenses and distinguish code licenses from measurement-data redistribution permissions.

Create a concise competitive analysis and maintain a list of meaningful product differentiators.

Our objective is not simply more features. It is a more useful, more understandable, and better-engineered product.

---

## 3. Technical Architecture

### Preferred stack

Start with the following architecture, but verify all choices against current documentation and supported versions:

- **Svelte 5 + SvelteKit 3 or the latest newer stable release**
- TypeScript with strict type checking.
- Vite.
- Cloudflare Pages static deployment.
- A lightweight, high-performance graphing library, initially evaluate uPlot.
- Browser Web Workers for nontrivial numerical calculations.
- Comlink if it meaningfully simplifies worker communication.
- Typed arrays and optimized numerical TypeScript for the initial analysis engine.
- IndexedDB for persistent client-side datasets and preference profiles, with a lightweight wrapper only if justified.
- Versioned, compressed, static measurement files.
- GitHub Actions for automated dataset processing, validation, and updates.
- Vitest for unit and numerical tests.
- Playwright for end-to-end and visual regression tests.

The production application should initially require **no continuously running backend, external database service, user accounts, or server-side numerical computation**.

All ordinary analysis and ranking should run locally in the user's browser.

The application must be deployable as a static Cloudflare Pages site and should work on desktop and mobile.

### Version policy

Do not install outdated versions simply because they appear in training data, tutorials, or old project templates.

At implementation time:

1. Check official documentation, package registries, release notes, and peer dependency requirements.
2. Prefer the latest stable compatible versions of frameworks, libraries, and development tools.
3. Avoid prereleases for production dependencies unless there is a compelling, documented reason.
4. Use the correct current APIs and configuration conventions.
5. Record meaningful compatibility decisions.
6. Commit a reproducible dependency lockfile.
7. Configure controlled dependency update automation, preferably Renovate.

SvelteKit 3 introduced significant changes, including moving configuration into Vite configuration and changing the default library import alias to `#lib`. Use current conventions rather than copying SvelteKit 2 boilerplate.

### Rust / WebAssembly

Design the computational engine behind a clean, framework-independent interface.

Start with optimized TypeScript.

Benchmark the actual numerical workload before deciding whether Rust-WASM is worthwhile.

If substantial improvements are demonstrated for numerical optimization, batch processing, DSP, or other expensive operations, consider an optional Rust-WASM implementation using appropriate modern tooling.

Avoid WASM merely because it sounds technically sophisticated.

Do not introduce WebGPU, WebGL, heavy matrix frameworks, or server-side processing without a demonstrated benefit.

---

## 4. Product Structure and Information Architecture

The application should have a small number of understandable primary destinations.

A suggested structure:

### Discover

The primary experience for most users.

Find IEMs similar to a selected reference or receive personalized recommendations based on liked and disliked IEMs.

### Compare

Select multiple IEMs and compare their frequency responses, tonal characteristics, and numerical differences.

### Explore

Browse the measurement catalog, investigate individual products, and use advanced technical filters and analysis tools.

Preferences and saved collections should be integrated naturally, without requiring a large or complicated navigation hierarchy.

Treat this as an initial information architecture. Improve it through UX analysis.

### Progressive disclosure

Do not present every available slider, target, score, and measurement option immediately.

Provide understandable defaults, then reveal advanced capabilities as needed.

A beginner should never need to understand coupler compensation, normalization, weighting functions, or numerical optimization to receive an initial recommendation.

Experts should still have access to those controls.

---

## 5. Primary Feature: Find Similar IEMs

This should be a fully implemented, exceptionally smooth core workflow.

The user searches for an IEM, chooses the appropriate measurement if multiple configurations exist, and immediately sees the closest matches.

Results should include:

- Product name.
- Overall frequency-response distance or a clearly explained ranking metric.
- Visual miniature FR comparison where useful.
- Meaningful differences in bass, midrange, and treble.
- Measurement source and rig.
- Reliability or evidence indicators where justified.
- Price information only when supported by maintained data.
- Actions to compare, save, or add a result to the user's preference profile.

Allow meaningful sorting and filtering without overwhelming the interface.

Filters can include budget, measurement rig, driver configuration, release year, measurement source, and other reliable metadata.

Do not invent missing specifications.

### Frequency-specific matching

Users should be able to find the closest match:

- Across the complete reliable measurement range.
- Primarily in bass.
- Primarily in midrange and vocal regions.
- Primarily in upper-midrange and treble.
- With increased sensitivity to excess treble peaks.
- According to custom frequency-region weights.

The default ranking must be technically defensible.

Advanced weighting controls should be available but not mandatory.

---

## 6. Major Differentiator: Personalized Taste Discovery

This is a central product feature and deserves substantial design and engineering attention.

Allow the user to select **multiple IEMs and targets they like, as well as those they dislike**.

Example:

Liked:
- IEM A
- IEM B
- IEM C

Disliked:
- IEM D: too sharp or fatiguing
- IEM E: insufficient bass
- IEM F: muddy lower midrange

The system should attempt to identify consistent patterns in the user's preferences and recommend suitable IEMs.

### Input experience

Make preference entry effortless.

Users should be able to search and add an IEM, then classify it using simple controls such as:

- Love
- Like
- Neutral
- Dislike

Allow optional strength weighting and descriptive reasons.

Useful reasons might include:

- Too much or too little bass.
- Bass lacks punch.
- Too much mid-bass warmth.
- Thin or recessed vocals.
- Shouty upper midrange.
- Sharp, piercing, or fatiguing treble.
- Excessive sibilance.
- Dull or insufficient treble.
- General tonal balance feels wrong.
- Something else / unsure.

Keep these explanations optional.

Distinguish sound-related dislikes from comfort, fit, isolation, and other physical issues. An IEM disliked because it fits poorly should not automatically teach the FR model that its tuning is undesirable.

Also distinguish liking an IEM's overall sound from liking its specific FR shape.

### Preference modeling

Do not implement this as a naive average of liked frequency responses minus an average of disliked responses.

That would be mathematically simplistic and could produce pathological results.

Investigate and implement a robust, interpretable approach.

Consider:

- Weighted distances to positive references.
- Shared frequency-response characteristics across positively rated IEMs.
- Explicit preference constraints inferred from stated dislikes.
- Separate treatment of disliked tuning features.
- Multiple preference clusters if liked IEMs have substantially different signatures.
- Regularization to prevent extreme or nonsensical recommendations.
- Measurement uncertainty and source compatibility.
- Optional frequency-region importance.
- User-specified constraints and exclusions.

Explore suitable clustering, robust statistics, distance-based ranking, and preference-learning methods.

Avoid adding machine learning solely for marketing. An interpretable statistical model is preferable when it performs as well or better.

A user's dislike of one highly bassy IEM should not automatically imply that the ideal IEM has extremely low bass.

Likewise, if the user likes two acoustically different IEMs, don't automatically blend them into an artificial target that resembles neither.

Support multiple plausible preference profiles when the data indicates multiple tastes.

### Explain the learned preferences

Present a concise, natural-language summary such as:

"You seem to prefer moderate bass elevation, relatively full lower midrange, and restrained upper treble."

However, only make claims supported by the available measurements and preference inputs.

Allow the user to correct inferred preferences directly.

Show how adding or removing a reference changes the recommendation model.

Avoid spurious claims of precision, arbitrary percentages, or AI-generated explanations unsupported by actual calculations.

### Confidence and uncertainty

With one liked IEM, explain that recommendations are based on limited information.

With several consistent preferences, more specific conclusions may be possible.

Conflicting inputs should produce a useful explanation rather than silently forcing one profile.

Measurement quality and uncertainty must also influence confidence.

### Recommendation explanations

Each recommendation should include a short answer to:

**"Why might I like this?"**

Examples:

- Similar bass and midrange balance to two liked IEMs.
- Less measured energy in a region the user identified as fatiguing.
- Close match to a preferred target below 5 kHz.
- Some upper-treble differences remain uncertain.

Make explanations concrete, accurate, and helpful.

---

## 7. Frequency Response Analysis Engine

Build a well-tested, reusable numerical engine independent of the frontend.

The implementation should be deterministic, transparent, and reproducible.

### Measurement processing

Implement robust handling of:

- Frequency-response file parsing.
- Common CSV/TXT formats.
- Input validation.
- Log-frequency interpolation.
- Missing or incomplete frequency ranges.
- Duplicate frequency points.
- Channel measurements.
- Level alignment.
- Smoothing.
- Compensation.
- Target curves.
- Measurement variants.
- Rig-specific limitations.

Preserve original measurement data and provenance. Derived and smoothed curves must never silently replace raw measurements.

### Similarity metrics

Investigate and implement appropriate metrics, including:

- Weighted RMSE.
- Mean absolute error.
- Frequency-band-specific error.
- Broad tonal-shape differences.
- Frequency-response slope and tilt.
- Asymmetric penalties for excess energy where appropriate.
- Potential peak-sensitive measurements.
- Multi-reference aggregation.

Use logarithmically distributed frequency sampling.

Carefully distinguish response-shape similarity from absolute SPL differences.

Evaluate midrange alignment methods rather than blindly normalizing at one frequency point.

When computing numerical errors, use appropriate precision and test numerical stability. Typed arrays are suitable for efficient storage, but higher-precision accumulation may be appropriate for numerical calculations.

### Measurement uncertainty

This is essential.

IEC 711 and B&K 5128 measurements are not directly interchangeable.

Different measurement sources can have meaningful differences in couplers, insertion depth, calibration, ear tips, seal quality, and procedures.

Never directly compare incompatible raw measurements as though they were obtained under identical conditions.

Prefer comparisons within the same measurement source and rig.

Consider cross-source or cross-rig comparison only when a defensible transformation or methodology exists, with clearly communicated limitations.

Handle particularly uncertain high-frequency regions appropriately.

Avoid overinterpreting narrow peaks, especially where coupler resonances, insertion differences, and measurement variability dominate.

Implement sensible defaults for frequency weighting and trusted comparison ranges, but make advanced settings configurable.

### Robustness

Build numerical tests covering:

- Identical curves.
- Constant level offsets.
- Known frequency deviations.
- Sparse and irregular sampling.
- Missing data.
- Multiple references.
- Outliers.
- Narrow peaks and notches.
- Different smoothing settings.
- Invalid inputs.
- Incompatible measurement rigs.
- Duplicate measurements.

Use property-based testing where it provides meaningful coverage.

Document the mathematical definitions, assumptions, and limitations.

Do not claim that an FR match proves equivalent distortion, crossover implementation, phase behavior, dynamics, soundstage, or other properties not established by the measurements.

---

## 8. Recommendations and Ranking Presentation

Present results in a way that helps users make decisions, rather than overwhelming them with numbers.

The initial result should be a clear ranked list of relevant products.

For each result, show:

- What makes it a good match.
- Where it differs from the user's preferences or references.
- Meaningful frequency-region comparisons.
- Any important uncertainties.
- Available measurement evidence.
- An easy path to more detailed analysis.

Use direct, understandable language.

Examples of useful distinctions:

- Closest overall match.
- Closest bass and midrange match.
- Less excess upper-midrange energy.
- Most consistent across available measurements.
- Potentially easier to approximate with PEQ.

These must represent actual calculations, not decorative labels.

### Ranking modes

Include meaningful alternatives to a single opaque overall score.

Consider:

- Overall FR similarity.
- Personalized preference match.
- Bass/midrange-focused similarity.
- Treble-sensitive similarity.
- Measurement confidence.
- EQ-correctability, when implemented.
- Lowest measured distortion, where comparable data exists.

Avoid mixing unrelated measures into one score without justification.

Make the ranking method inspectable.

Prefer understandable units and comparisons over invented "98% match" figures.

If a normalized score is introduced, define, calibrate, and validate it.

---

## 9. Graphing and Comparison Experience

Implement an excellent interactive frequency-response viewer.

Investigate uPlot and other appropriate lightweight libraries. Select the best option based on actual requirements and performance.

Essential capabilities:

- Accurate logarithmic frequency axis.
- Multiple FR curves.
- Responsive chart resizing.
- Smooth interaction and tooltips.
- Clear, accessible colors.
- Curve toggling and highlighting.
- Normalization controls.
- Smoothing controls.
- Raw and compensated views.
- Reference and target overlays.
- Difference curves.
- Adjustable frequency-region focus.
- Individual measurement and channel selection.
- Exporting useful graph images.
- Shareable comparison state.

Do not overload charts with twenty indistinguishable lines by default.

Use intelligent visibility, highlighting, and comparison limits where needed.

Make it easy to select two IEMs and understand the differences immediately.

### Beginner-friendly interpretation

Introduce simple, optional overlays identifying:

- Sub-bass.
- Mid-bass.
- Lower midrange.
- Vocal presence.
- Upper midrange.
- Treble.

Hovering or selecting a region should provide a concise explanation of what differences there may mean perceptually, without implying universal audibility or preference.

Advanced users should be able to disable educational overlays and see conventional technical measurements.

---

## 10. Additional High-Value Features

Implement the core features first, then extend the product with the following where they add genuine value.

### A. Target builder

Allow users to construct or modify a target FR using understandable controls.

Possible parameters:

- Bass shelf.
- Mid-bass warmth.
- Midrange tilt.
- Vocal presence.
- Ear-gain intensity.
- Treble energy.

Offer advanced numerical controls separately.

Allow imported targets, standard targets, saved custom targets, and modifications of existing curves.

Use proper rig-specific target handling.

### B. Similar-to-multiple-targets search

Allow users to search for IEMs that approximate multiple preferred curves simultaneously.

Show the trade-offs instead of reducing every situation to a single average curve.

Consider Pareto-style results when no candidate is closest to every reference.

### C. Treble sensitivity analysis

Offer an optional treble-focused analysis mode.

Look for measured excess energy relative to a selected reference or preference profile.

Distinguish broad excess treble from narrow peaks.

Do not label an IEM as objectively painful or fatiguing from a coupler measurement.

Use appropriately cautious language and account for unreliable measurement regions.

### D. EQ-correctability

Investigate a feature estimating how effectively an IEM can be transformed toward a chosen target using constrained parametric EQ.

Useful outputs could include:

- Estimated residual FR error.
- Number of filters required.
- Maximum gain and Q constraints.
- Frequency regions that remain difficult to correct.
- A preview of the estimated corrected response.
- Optional PEQ export.

Avoid aggressively correcting measurement artifacts or uncertain narrow notches.

Do not claim PEQ can correct distortion, nonlinear driver behavior, physical fit, or every acoustic problem.

Use validated filter calculations and optimization algorithms. Study AutoEq and other established implementations.

Treat this as an advanced feature that follows a reliable baseline matching engine.

### E. Engineering-oriented data

Where trustworthy data exists, eventually incorporate:

- THD measurements.
- Impedance measurements.
- Channel matching.
- Driver configuration.
- Sensitivity.
- Repeatability and measurement variation.
- Other relevant technical information.

Keep each measurement type separate and source-attributed.

Do not infer hardware engineering quality solely from driver count, crossover marketing, or FR smoothness.

Never substitute missing measurements with fabricated estimates.

### F. Saved profiles and collections

Support:

- Saved liked/disliked IEM profiles.
- Saved searches.
- Favorite products.
- Custom targets.
- Saved comparison sets.
- Profile export and import.
- Shareable links.

Prefer local storage without mandatory authentication.

A profile should be understandable and portable rather than locked inside an opaque application format.

### G. Smart discovery

Help users find relevant IEMs they might otherwise miss.

Support filtering by newer models, unfamiliar manufacturers, and independent measurement availability.

Avoid a popularity-driven recommendation bias.

Provide sufficient product information and meaningful context to make discovery useful.

### H. Data and methodology transparency

Every measurement should identify its origin.

Allow users to inspect:

- Measurement source.
- Measurement rig.
- Relevant configuration.
- Processing method.
- Available original data.
- Dataset update information.
- Measurement limitations.

Make the information accessible without cluttering the main experience.

---

## 11. Measurement Data Pipeline

The quality of this product will depend heavily on its underlying dataset.

Treat ingestion and validation as a first-class engineering system.

Investigate available legitimate measurement sources and appropriate means of retrieving their data.

### Required data model

Preserve, where available:

- Canonical product identity.
- Manufacturer and model.
- Product variants.
- Measurement identity.
- Source and original URL.
- Measurement date or source update timestamp.
- Rig/coupler type.
- Measurement procedure metadata.
- Ear-tip and filter configuration.
- Switches and impedance modes.
- Channel information.
- Raw frequency and SPL values.
- Data transformation history.
- License and redistribution permissions.
- Additional technical metadata.

Do not merge distinct tuning configurations into one curve.

### Data architecture

Prefer a build-time ingestion pipeline that produces validated, compressed, versioned datasets suitable for static hosting.

Consider:

- Incremental source updates.
- Deduplication.
- Canonical product-name resolution.
- Rig-aware data partitioning.
- Numerical integrity checks.
- Source attribution.
- Metadata validation.
- Content hashes.
- Reproducible transformations.
- Clear failure reporting.
- Dataset version manifests.

Keep ingestion separate from the browser application.

The data preparation tools may use modern Node.js/TypeScript, Bun, Python, or another suitable implementation if it has a clear technical advantage.

Use licensed or otherwise authorized data for distribution. Public access alone does not guarantee redistribution permission.

Do not bypass access controls or aggressively scrape measurement hosts.

Where full redistribution isn't permitted, consider supported links, authorized imports, or user-supplied measurements instead.

### Hosting and caching

Keep Cloudflare Pages as the default hosting target.

Split large datasets into appropriately sized files, respecting current platform limits.

Prefer lazy loading, efficient caching, and progressive dataset access.

Avoid unnecessary downloads of the entire catalog when a smaller subset is sufficient.

Use IndexedDB where it improves repeated usage.

Version cached datasets correctly so users don't retain obsolete or incompatible data.

---

## 12. Visual Design Direction

**The application must look intentionally designed by an experienced product design team, not assembled from generic AI-generated UI patterns.**

Aim for the visual quality and refinement of a premium scientific instrument combined with a polished modern consumer application.

Desired qualities:

- Elegant.
- Minimal but not empty.
- Precise.
- Calm.
- Modern.
- Approachable.
- Highly legible.
- Technically credible.
- Visually distinctive without being theatrical.

### Design language

Create a coherent design system with deliberate:

- Typography.
- Spacing scale.
- Grid and layout rules.
- Color palette.
- Surface treatment.
- Border hierarchy.
- Component sizing.
- Iconography.
- Chart colors.
- Interaction states.
- Motion principles.

Consider a restrained editorial/technical visual language with warm neutral surfaces, deep ink colors, and a carefully selected accent palette.

Support light and dark themes if they can both be implemented to the same quality standard.

Use typography and spacing as the main tools for visual hierarchy, rather than excessive borders, shadows, and colored backgrounds.

### Avoid generic "vibecoded" aesthetics

Do not default to:

- Excessive cards and rounded rectangles.
- Giant gradients or glowing backgrounds.
- Unnecessary glassmorphism.
- Decorative emojis.
- Excessive pill badges.
- Large, wasteful padding.
- Oversized headings everywhere.
- Random accent colors.
- Generic dashboard layouts.
- Dense grids of unrelated statistics.
- Long paragraphs inside every card.
- Unnecessary animations.
- AI-generated marketing copy.
- Default-looking component library themes.

Do not confuse visual minimalism with missing functionality or poor information density.

Create a deliberate identity appropriate to an audio measurement and discovery product.

If using headless UI libraries, build a cohesive visual system around them instead of accepting generic defaults.

### Interaction design

Important details:

- Excellent search and autocomplete.
- Fast, obvious reference selection.
- Clear selected/unselected states.
- Thoughtful hover and focus behavior.
- Keyboard navigation.
- Accessible tooltips.
- Responsive menus.
- Sensible defaults.
- Clear loading and error states.
- No layout shifts during ordinary interaction.
- Undo for destructive actions where appropriate.
- Meaningful empty states.
- Clear navigation and back behavior.

Avoid modal dialogs for tasks better handled inline.

Make interactions efficient for repeated use.

### Responsive design

Design for desktop, tablet, and mobile from the beginning.

Desktop users should benefit from greater information density and effective use of horizontal space.

Mobile users should receive a properly redesigned layout rather than a compressed desktop interface.

Graphs, comparison controls, and search results must remain useful on smaller screens.

### Accessibility

Target WCAG 2.2 AA where applicable.

Support:

- Keyboard interaction.
- Screen-reader labels.
- Appropriate semantic structure.
- Visible focus indicators.
- Sufficient color contrast.
- Reduced-motion preferences.
- Accessible chart alternatives.
- Non-color methods of communicating important distinctions.

---

## 13. UX Principles

The application should require little instruction.

An unfamiliar user should immediately understand what to do.

### Preferred onboarding

Do not require registration or a lengthy setup wizard.

The primary starting action should be obvious, such as:

"Find IEMs similar to…"

After selecting one reference, the user can immediately receive results.

Adding another reference or a disliked IEM should be a natural extension of the same workflow.

### Human-readable explanations

Technical concepts should be explained in plain language when necessary.

For example:

"These IEMs have similar bass and midrange balance, but this one measures slightly brighter around the vocal-presence region."

Do not force users to interpret raw RMSE values without context.

Provide expandable technical details for enthusiasts.

### Useful defaults

Users should not need to configure ten weight sliders to obtain sensible results.

Offer tested defaults and a few understandable presets.

Keep advanced customization available.

### Error prevention

Anticipate confusing cases, including:

- No available measurement for a selected IEM.
- Different versions of the same IEM.
- Multiple source measurements.
- Different impedance modes.
- Incompatible rigs.
- Missing product prices.
- Contradictory preferences.
- Insufficient data.
- Unknown frequency ranges.

Explain what happened and how the user can proceed.

Avoid silent failures and misleading results.

---

## 14. Static Analysis, Testing, and AI-Assisted Code Quality

Because this project will be implemented substantially through an AI coding agent, code quality checks and maintainability are especially important.

Use a **small, intentional, effective toolchain** rather than installing every available analyzer.

### Recommended baseline

Evaluate and configure current compatible versions of:

- TypeScript strict mode.
- `svelte-check`.
- ESLint flat configuration.
- `typescript-eslint` with appropriate type-aware rules.
- `eslint-plugin-svelte`.
- Prettier with current Svelte support.
- Knip for unused exports, dependencies, and dead code.
- Vitest.
- Playwright.
- Accessibility testing, potentially using axe-core.
- Appropriate dependency/security auditing.
- Renovate for controlled dependency updates.

Consider `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` where they improve correctness without excessive ceremony.

Avoid contradictory or redundant linting tools.

Do not add multiple tools that perform nearly identical checks unless they offer a demonstrated benefit.

For example, do not configure two full linting systems merely to claim more static-analysis coverage.

Consider specialized architecture or dependency-boundary checks only if the repository grows enough to justify them.

### Coding standards

- Prefer clear types and explicit contracts.
- Validate untrusted dataset and file inputs at runtime.
- Avoid `any` except when narrowly justified.
- Avoid broad type assertions that hide errors.
- Avoid unnecessary abstractions.
- Keep numerical algorithms separate from UI components.
- Keep business logic testable without a browser.
- Avoid giant multi-purpose files and components.
- Avoid deeply nested conditional rendering.
- Avoid unnecessary dependencies.
- Prefer composable modules with clear responsibilities.
- Document non-obvious mathematics and processing assumptions.
- Avoid suppressing compiler or linter errors instead of fixing their causes.

For any unusual suppression or exception, document why it is necessary.

### Tests

Prioritize meaningful tests over superficial coverage statistics.

Include:

- Unit tests for numerical functions.
- Data ingestion and validation tests.
- Property-based mathematical tests.
- Tests against independently calculated expected results.
- Regression tests for known comparison cases.
- Preference-model behavior tests.
- Component interaction tests.
- End-to-end user journeys.
- Accessibility tests.
- Visual regression tests.
- Static deployment build verification.

Numerical algorithms should be tested against independent reference calculations where feasible.

Do not write tests that simply duplicate the implementation's assumptions and therefore always agree with incorrect code.

### CI

Set up GitHub Actions to run appropriate checks, including:

- Formatting validation.
- Static analysis.
- Type checking.
- Unit tests.
- Data validation.
- Production build.
- Relevant end-to-end and accessibility checks.

Use caching and sensible job separation so the checks remain practical.

Use a reproducible package manager setup and lockfile.

Do not commit code with known failing critical checks.

---

## 15. Performance and Resource Efficiency

The product should feel fast on ordinary laptops and modern smartphones, not just high-end development hardware.

Optimize based on measurement, not speculation.

### Expectations

- Fast initial rendering.
- Responsive search.
- Efficient graph redraws.
- Smooth comparison switching.
- Nonblocking numerical calculations.
- Minimal unnecessary reactivity.
- Lazy-loaded advanced features.
- Efficient dataset downloads.
- Proper browser caching.
- Sensible memory usage.
- Fast repeated searches.

Use browser Web Workers for expensive calculations.

Avoid repeatedly transferring large arrays between threads; investigate transferable buffers or other appropriate data layouts.

Consider precomputing reusable measurements, band features, or transformed curves.

Use efficient data structures and algorithms before introducing more complicated execution environments.

### Benchmarks

Create reproducible benchmarks for:

- Single-reference matching.
- Multiple-reference preference ranking.
- Dataset loading and decoding.
- Smoothing and interpolation.
- Graph interactions.
- Memory usage.
- Potential EQ fitting.
- TypeScript vs Rust-WASM, if applicable.

Benchmark realistic data sizes and hardware classes.

Measure initial page loading separately from computation performance.

Set reasonable performance budgets based on actual measurements and document the results.

---

## 16. Privacy and Reliability

Prefer a privacy-conscious local-first design.

Users should be able to save their preferences without creating an account.

Do not require analytics, advertising infrastructure, or external AI services.

If telemetry is later considered, make it privacy-conscious and clearly documented.

Store only necessary data.

Provide understandable import, export, reset, and deletion options.

Avoid misleading product rankings or unsupported engineering claims.

External price or availability information must be labeled with appropriate timestamps and sources.

Never silently fill missing data with invented values.

When data quality is insufficient for a reliable conclusion, communicate that limitation clearly.

---

## 17. Suggested Repository Organization

Prefer a maintainable structure without premature monorepo complexity.

A possible structure:

- `apps/web` — SvelteKit application.
- `packages/fr-core` — independent numerical analysis and preference-ranking engine.
- `packages/fr-data` — measurement types, validation, transformation, and serialization.
- `tools/ingest` — data acquisition and preparation scripts.
- `benchmarks` — numerical and performance testing.
- `docs` — architecture, methodology, product decisions, and data provenance.

Adapt this if a simpler structure is more appropriate.

The key requirement is that numerical algorithms and measurement ingestion should not be tightly coupled to UI components.

The core analysis engine should be usable independently of SvelteKit.

---

## 18. Documentation and Agent Handoff

Maintain useful, concise engineering documentation.

Create appropriate documents such as:

- `README.md` — project setup, usage, build, and deployment.
- `AGENTS.md` — coding-agent guidance, commands, architecture constraints, and quality requirements.
- `docs/PRODUCT.md` — product principles, user flows, feature priorities.
- `docs/ARCHITECTURE.md` — system structure and major decisions.
- `docs/METHODOLOGY.md` — numerical methods, assumptions, limitations.
- `docs/DATA_SOURCES.md` — measurement sources, licensing, attribution, update strategy.
- `docs/DESIGN.md` — visual and interaction design system.
- `docs/VALIDATION.md` — test methodology and benchmark results.
- `docs/ROADMAP.md` — remaining work, prioritized improvements, and explicitly deferred features.

Avoid duplicating the same information across many files.

Keep documentation aligned with the actual implementation.

Documentation must not become a substitute for building working functionality.

---

## 19. Implementation Strategy

Do not attempt to implement every advanced feature superficially in one giant pass.

Work in complete, validated vertical slices.

### Phase 1 — Investigation and design

Research current dependencies, existing tools, data sources, and relevant algorithms.

Create:

- A technical architecture.
- A concise competitor analysis.
- A product requirements document.
- A visual design direction.
- Initial wireframes or implemented layout experiments.
- A measurement-data strategy.
- A prioritized implementation plan.

Make decisions and proceed rather than stopping at planning.

### Phase 2 — Working foundation

Set up the application, project tooling, static analysis, testing, and Cloudflare Pages deployment configuration.

Implement a legitimate, nontrivial measurement dataset pipeline and an initial working graphing system.

The application must display real supported measurement data.

### Phase 3 — Core discovery

Implement:

- Search and reference selection.
- Rig-aware frequency-response matching.
- Numerical ranking.
- Results with useful explanations.
- Basic filtering and sorting.
- Interactive graph comparison.
- Measurement provenance.

This phase should already produce a genuinely useful application.

### Phase 4 — Personalized recommendations

Implement multiple liked/disliked references, preference reasons, profile inference, and personalized rankings.

Validate the mathematical behavior with controlled test cases.

Make the user experience exceptionally easy.

### Phase 5 — Advanced analysis

Implement valuable extensions such as:

- Advanced region weighting.
- Multi-target trade-off analysis.
- Treble-focused comparison.
- Custom targets.
- EQ-correctability.
- Additional engineering measurements where available.

Prioritize based on usefulness and correctness.

### Phase 6 — Product polish and validation

Conduct thorough:

- UI refinement.
- Accessibility checks.
- Responsive testing.
- Performance measurements.
- Mathematical validation.
- Realistic user-flow testing.
- Visual regression review.

Do not leave the final product looking like a development dashboard.

---

## 20. Visual Quality Assurance

Visual quality is a release requirement.

Do not rely solely on successful compilation or automated functional tests to determine whether the interface is good.

Use browser-based inspection and screenshots where available.

Review representative desktop, tablet, and mobile layouts.

Pay attention to:

- Alignment.
- Typography.
- Spacing.
- Graph proportions.
- Visual hierarchy.
- Control density.
- Text wrapping.
- Empty and loading states.
- Table readability.
- Search interactions.
- Responsive layouts.
- Consistency between screens.

Inspect real populated states, not only blank initial views.

Improve weak layouts instead of merely recording that the screenshots were generated.

Avoid placeholder charts, fake results, and unfinished interface controls in production paths.

Every visible action should function correctly.

---

## 21. Acceptance Criteria

The project is not considered finished merely because the site builds successfully.

At minimum, the following must be true:

1. A user can select an IEM and find genuinely similar measured IEMs.
2. The ranking is based on implemented, validated numerical algorithms.
3. Multiple preferred references work correctly.
4. Disliked IEMs and optional dislike reasons influence recommendations in a technically defensible way.
5. Recommendations explain why a product may match the user's preferences.
6. Users can compare selected IEMs using readable, accurate, interactive FR graphs.
7. Measurement sources, rigs, and limitations are clearly available.
8. Beginners can complete the main workflow without learning advanced terminology.
9. Advanced users can inspect and adjust important settings.
10. The interface is responsive, accessible, and visually refined.
11. The application runs from static hosting on Cloudflare Pages.
12. Numerical calculations do not unnecessarily block the UI.
13. The codebase passes the configured critical static-analysis and test checks.
14. The dataset is real, validated, properly attributed, and distributed with appropriate permissions.
15. The project has reproducible setup and deployment instructions.
16. No unsupported performance, measurement, or recommendation claims are presented as fact.
17. The result is useful enough to outperform a basic Squig-Rank workflow in clarity, functionality, or insight.

---

## 22. Working Instructions

Start by inspecting the repository and any existing files.

If the repository is empty, initialize the project appropriately.

Verify current official framework and library versions before installation.

Research the most relevant existing tools and implementations, then make architecture and UX decisions grounded in that research.

Produce a concise implementation plan and execute it.

Do not stop after generating design documents, creating mockups, or scaffolding files.

Build working functionality, test it, review it in a browser, and improve it.

Make independent, technically justified decisions rather than requesting approval for every minor implementation choice.

If a feature is blocked by unavailable licensed measurements, absent credentials, or another genuine external dependency, implement the best legitimate alternative and clearly document the limitation.

Maintain a short record of meaningful design and engineering decisions.

Prefer complete, reliable features over a larger set of half-implemented features.

When evaluating new dependencies or techniques, consider whether they meaningfully improve correctness, UX, maintainability, or performance.

Do not implement complexity for its own sake.

### Final objective

Deliver a polished, production-ready, scientifically responsible IEM analysis and recommendation application that combines the measurement depth of enthusiast tools with the clarity and ease of use of an excellent consumer product.

The user should feel that the application understands what they're trying to accomplish and presents the relevant information naturally—without making them learn how the software works first.

**Build something that is measurably more useful than existing frequency-response ranking tools, not merely more elaborate.**
