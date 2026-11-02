<script lang="ts">
	export type IconName =
		| 'search'
		| 'arrow'
		| 'close'
		| 'sun'
		| 'moon'
		| 'system'
		| 'menu'
		| 'chart'
		| 'plus'
		| 'download'
		| 'info'
		| 'warning'
		| 'chevron'
		| 'check'
		| 'catalog';
	let { name, size = 20 }: { name: IconName; size?: number } = $props();
	const paths: Record<IconName, string> = {
		search: 'M21 21l-5-5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0',
		arrow: 'M4 12h16m-6-6 6 6-6 6',
		close: 'm6 6 12 12M6 18 18 6',
		sun: 'M12 3V1m0 22v-2M3 12H1m22 0h-2M5.6 5.6 4.2 4.2m15.6 15.6-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
		moon: 'M20.7 14.7A9 9 0 0 1 9.3 3.3a9 9 0 1 0 11.4 11.4',
		system: 'M3 4h18v13H3zM8 21h8m-4-4v4',
		menu: 'M4 6h16M4 12h16M4 18h16',
		chart: 'M3 3v18h18M5 15l4-3 4 2 4-8 4 4',
		plus: 'M12 5v14M5 12h14',
		download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
		info: 'M12 11v6m0-10v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
		warning: 'M12 3 2 21h20L12 3zm0 6v5m0 3v.1',
		chevron: 'm6 9 6 6 6-6',
		check: 'm5 12 4 4L19 6',
		catalog: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'
	};
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"><path d={paths[name]} /></svg
>
