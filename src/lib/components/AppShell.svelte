<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import { browser } from '$app/env';
	import { resolve } from '$app/paths';
	import type { PathnameWithSearchOrHash, ResolvedPathname } from '$app/types';
	import { goto } from '$app/navigation';
	import Icon from './Icon.svelte';
	import Button from './Button.svelte';
	import SegmentedControl from './SegmentedControl.svelte';
	let { children }: { children: Snippet } = $props();
	type Theme = 'system' | 'light' | 'dark';
	let theme = $state<Theme>('system');
	let mobileOpen = $state(false);
	let menuButton: HTMLButtonElement;
	const links = [
		{ href: '/', label: 'Discover' },
		{ href: '/compare', label: 'Compare' },
		{ href: '/explore', label: 'Explore' },
		{ href: '/method', label: 'Method' }
	] as const;
	let form = $derived(browser && page.url.searchParams.get('form') === 'headphones' ? 'headphones' : 'iems');
	function setForm(value: string) {
		const url = new URL(page.url.href);
		if (value === 'iems') url.searchParams.delete('form');
		else url.searchParams.set('form', value);
		void goto(resolve(`${url.pathname}${url.search}${url.hash}` as PathnameWithSearchOrHash), {
			reset: false
		});
	}
	function cycleTheme() {
		theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
		try {
			localStorage.setItem('tonewave-theme', theme);
		} catch {
			/* Storage can be unavailable in private contexts. */
		}
		applyTheme();
	}
	function applyTheme() {
		document.documentElement.dataset.theme =
			theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute(
				'content',
				getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()
			);
	}
	onMount(() => {
		try {
			const saved = localStorage.getItem('tonewave-theme');
			if (saved === 'light' || saved === 'dark') theme = saved;
		} catch {
			/* Use system preference. */
		}
		applyTheme();
		const media = matchMedia('(prefers-color-scheme: dark)');
		media.addEventListener('change', applyTheme);
		return () => {
			media.removeEventListener('change', applyTheme);
		};
	});
	function href(path: '/' | '/compare' | '/explore' | '/method'): ResolvedPathname {
		return resolve(`${path}${form === 'headphones' ? '?form=headphones' : ''}`);
	}
</script>

<svelte:window
	onkeydown={(event: KeyboardEvent) => {
		if (event.key === 'Escape' && mobileOpen) {
			mobileOpen = false;
			menuButton.focus();
		}
	}}
/>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
	<div class="header-inner">
		<a href={href('/')} class="wordmark" aria-label="Tonewave Atlas home"
			><svg
				width="32"
				height="32"
				viewBox="0 0 32 32"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				aria-hidden="true"><path d="M2 18h4l3-9 5 17 5-21 4 13h7" /></svg
			><span>Tonewave <span class="atlas">Atlas</span></span></a
		>
		<nav class="desktop-nav" aria-label="Primary">
			{#each links as link (link.href)}<a
					href={href(link.href)}
					aria-current={page.url.pathname === resolve(link.href) ? 'page' : undefined}>{link.label}</a
				>{/each}
		</nav>
		<div class="header-controls">
			<div class="form-switch">
				<SegmentedControl
					label="Form factor"
					options={[
						{ value: 'iems', label: 'IEMs' },
						{ value: 'headphones', label: 'Headphones' }
					]}
					value={form}
					onchange={setForm}
				/>
			</div>
			<Button
				variant="icon"
				aria-label={`Theme: ${theme}. Switch to ${theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'} theme`}
				onclick={cycleTheme}
				><Icon name={theme === 'light' ? 'sun' : theme === 'dark' ? 'moon' : 'system'} size={18} /></Button
			><button
				bind:this={menuButton}
				type="button"
				class="button icon mobile-menu"
				aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
				aria-expanded={mobileOpen}
				aria-controls="mobile-navigation"
				onclick={() => (mobileOpen = !mobileOpen)}><Icon name={mobileOpen ? 'close' : 'menu'} /></button
			>
		</div>
	</div>
	<div id="mobile-navigation" class="mobile-panel" hidden={!mobileOpen}>
		<nav aria-label="Mobile primary">
			{#each links as link (link.href)}<a
					href={href(link.href)}
					aria-current={page.url.pathname === resolve(link.href) ? 'page' : undefined}
					onclick={() => (mobileOpen = false)}>{link.label}<Icon name="arrow" size={18} /></a
				>{/each}
		</nav>
		<SegmentedControl
			label="Mobile form factor"
			options={[
				{ value: 'iems', label: 'IEMs' },
				{ value: 'headphones', label: 'Headphones' }
			]}
			value={form}
			onchange={setForm}
		/>
	</div>
</header>
<main id="main" tabindex="-1">{@render children()}</main>
<footer class="site-footer">
	<a href={href('/')} class="footer-brand">Tonewave Atlas</a>
	<p>Measured response. Personal preference.</p>
	<div>
		<span>No account. No tracking.</span><a href={href('/method')}
			>Method & data attribution <span aria-hidden="true">↗</span></a
		>
	</div>
</footer>

<style>
	.skip {
		position: fixed;
		top: -80px;
		left: 20px;
		z-index: 100;
		padding: 12px 20px;
		background: var(--accent);
		color: var(--accent-ink);
	}
	.skip:focus {
		top: 12px;
	}
	.site-header {
		border-bottom: var(--hairline) solid var(--line);
	}
	.header-inner {
		max-width: 1440px;
		margin: auto;
		min-height: 88px;
		display: flex;
		align-items: center;
		padding: 0 48px;
		gap: 40px;
	}
	.wordmark {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--ink);
		text-decoration: none;
		white-space: nowrap;
		font-size: 18px;
		font-weight: 600;
		letter-spacing: -0.04em;
	}
	.wordmark > :global(svg) {
		color: var(--accent);
	}
	.atlas {
		font-weight: 400;
	}
	nav {
		display: flex;
		gap: 28px;
	}
	.desktop-nav {
		align-self: stretch;
	}
	nav a {
		color: var(--muted);
		text-decoration: none;
		font-size: var(--text-sm);
		display: flex;
		align-items: center;
		position: relative;
	}
	nav a:hover {
		color: var(--ink);
	}
	nav a[aria-current='page'] {
		color: var(--ink);
		font-weight: 600;
	}
	.desktop-nav a[aria-current='page']::after {
		content: '';
		height: 2px;
		background: var(--accent);
		position: absolute;
		bottom: -1px;
		left: 0;
		right: 0;
	}
	.header-controls {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-left: auto;
	}
	.form-switch {
		display: flex;
	}
	.mobile-menu {
		display: none;
	}
	.mobile-panel {
		display: none;
	}
	main {
		min-height: calc(100svh - 205px);
	}
	.site-footer {
		max-width: 1344px;
		margin: 0 auto;
		border-top: var(--hairline) solid var(--line);
		min-height: 116px;
		display: flex;
		align-items: center;
		gap: 24px;
		padding: 24px 0;
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.footer-brand {
		color: var(--ink);
		text-decoration: none;
		font-weight: 550;
		font-size: var(--text-sm);
	}
	.site-footer > div {
		margin-left: auto;
		display: flex;
		gap: 24px;
	}
	.site-footer > div a {
		color: var(--muted);
	}
	@media (max-width: 1439px) {
		.site-footer {
			margin: 0 48px;
		}
	}
	@media (max-width: 1150px) {
		.header-inner {
			gap: 24px;
			padding: 0 32px;
		}
		nav {
			gap: 20px;
		}
		.wordmark {
			font-size: 16px;
			gap: 6px;
		}
		.header-controls {
			gap: 8px;
		}
		.site-footer {
			margin: 0 32px;
		}
		.site-footer > p {
			display: none;
		}
	}
	@media (max-width: 900px) {
		.header-inner {
			min-height: 76px;
		}
		.desktop-nav {
			display: none;
		}
		.mobile-menu {
			display: inline-flex;
		}
		.mobile-panel:not([hidden]) {
			display: grid;
			gap: 24px;
			padding: 8px 32px 28px;
		}
		.mobile-panel nav {
			display: grid;
			gap: 0;
		}
		.mobile-panel nav a {
			justify-content: space-between;
			min-height: 52px;
			border-bottom: var(--hairline) solid var(--line);
			font-size: var(--text-base);
		}
		.mobile-panel :global(.segmented) {
			display: none;
		}
	}
	@media (max-width: 640px) {
		.header-inner {
			padding: 0 20px;
			min-height: 72px;
			gap: 12px;
		}
		.wordmark {
			font-size: 17px;
		}
		.wordmark > :global(svg) {
			width: 26px;
		}
		.form-switch {
			display: none;
		}
		.header-controls {
			gap: 8px;
		}
		.header-controls :global(.button.icon) {
			width: 36px;
			min-height: 40px;
			border: 0;
			padding: 8px;
		}
		.mobile-panel:not([hidden]) {
			padding: 0 20px 24px;
		}
		.mobile-panel :global(.segmented) {
			display: inline-flex;
		}
		.site-footer {
			margin: 0 20px;
			padding: 24px 0;
			display: grid;
			gap: 8px;
		}
		.site-footer > div {
			margin: 0;
			display: grid;
			gap: 8px;
		}
		.site-footer > div span {
			display: none;
		}
	}
</style>
