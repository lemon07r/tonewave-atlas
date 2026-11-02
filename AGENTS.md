# Tonewave Atlas — agent notes

IEM/headphone frequency-response discovery and recommendation site. Static SvelteKit 3 (Svelte 5 runes)
on Cloudflare Pages; all analysis runs client-side in a Web Worker. Product intent: `docs/PRODUCT.md`;
system map: `docs/ARCHITECTURE.md`; maths: `docs/METHODOLOGY.md`; data rights: `docs/DATA_SOURCES.md`.

## Commands

- `pnpm dev` · `pnpm build` · `pnpm verify` (format, lint, types, knip, unit + component tests)
- `pnpm test:e2e` — Playwright journeys, axe and screenshots against a built preview
- `pnpm data:pull` — fetch the published dataset into `static/data/` (fastest way to get real data locally)
- `pnpm data:crawl` / `pnpm data:build` — refresh from sources (slow, polite; see `tools/ingest/`)
- `pnpm bench` — engine benchmarks; record notable changes in `docs/VALIDATION.md`

## Working here

- `src/core/` is the engine and must stay free of DOM, Svelte and Node APIs; UI and tools depend on it,
  never the reverse. Numerical changes deserve a test against an independently derived expectation,
  not a re-statement of the implementation.
- Scientific honesty is a product feature: never invent data, precision or perceptual claims. If a
  number is shown, it should be defined in `docs/METHODOLOGY.md` and traceable to a calculation.
- Kit 3 conventions: config lives in `vite.config.ts`; aliases are `#lib/…` and `#core/…` subpath
  imports with explicit `.ts` extensions; use `$app/state`, not stores.
- Docs describe what exists. When behaviour changes, update the one doc that owns it rather than adding
  a new file; delete guidance that has gone stale.
- Secrets live in `.env` (gitignored; see `.env.example`). Local Cloudflare Pages deploys pass `CLOUDFLARE_PAGES_TOKEN` as `CLOUDFLARE_API_TOKEN`
  (the zone token is IP-restricted); the Deploy workflow uses the `CLOUDFLARE_API_TOKEN` repository secret.

## Code Search

<!-- vera:begin -->

In a repository with a Vera index, your first search goes through Vera, not grep, rg, or file reads: run `vera overview` when you have not searched this repository yet, then `vera search "<what the code does>"`. Fall back to grep or rg only after a Vera call has missed.

If Vera reports no index and this is a code repository you will work in, run `vera index .` from its root. A first index can take several minutes, so give the command a long timeout or run it in the background, and use rg until it finishes; an interrupted API-mode run reuses its finished embeddings. Otherwise, or if you cannot run shell commands, use your usual search tools.

Route by question type:

- How or where something works: `vera search "request teardown ordering"`. Describe behavior ("JWT validation"), not nouns ("auth"). If a phrasing misses, add `--intent "<goal>"` or use `--deep`.
- The question names a function, class, or config key: `vera structural definitions <symbol>` for the definition, `vera references <symbol>` for callers (`--callees` for callees). One call returns ranked definitions or call sites, not raw matching lines.
- Exact text or regex: `vera grep "pattern"`. Line numbers are always shown; cap results with `--limit <N>`.
- Enumerate every X (signals, routes, env reads, implementations): `vera structural routes`, `vera structural env <NAME>`, `vera structural impls <symbol>`, or `vera grep "X" --lang <lang>`.

Working with results:

- Hits are `path:start-end kind:name` plus the code. Cite from the hit; open a file only for lines the hit did not include.
- If the top hit is a usage site, re-run with the symbol name or `vera structural definitions <symbol>` instead of trying more phrasings.
- `--path` is relative to the repository root (`--path src/flask`, not an absolute path). Narrow with `--lang`, `--path`, `--type`, or `--scope docs`; widen with `--limit 8`.
- Vera indexes this repository only. For dependency sources (site-packages, uv or pip caches) use rg, then return to Vera for repository code.
- A stale-index warning does not invalidate hits. After editing files, run `vera update .` from any directory (it refreshes the repository root's index).
- `vera explain-path <file>`, `vera stats --json`, and detailed usage are in the Vera skill installed by `vera agent install`.

<!-- vera:end -->
