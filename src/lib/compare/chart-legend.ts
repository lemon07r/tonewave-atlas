/** Local bridge until the shared chart includes its visible series number in the button name. */
export function chartLegendNames(element: HTMLElement): () => void {
	function sync() {
		for (const button of element.querySelectorAll<HTMLButtonElement>(
			'[aria-label="Chart series"] button[aria-pressed]'
		)) {
			const visible = [...button.querySelectorAll('span')].map((span) => span.textContent.trim()).join(' ');
			const label = `${button.getAttribute('aria-pressed') === 'true' ? 'Hide' : 'Show'} ${visible}`;
			if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
		}
	}
	const observer = new MutationObserver(sync);
	observer.observe(element, {
		subtree: true,
		childList: true,
		characterData: true,
		attributes: true,
		attributeFilter: ['aria-label', 'aria-pressed']
	});
	sync();
	return () => {
		observer.disconnect();
	};
}
