import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const css = readFileSync(new URL('./direction.css', import.meta.url), 'utf8');
function luminance(hex: string): number {
	const channels = [1, 3, 5].map((offset) => {
		const n = parseInt(hex.slice(offset, offset + 2), 16) / 255;
		return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
	});
	return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
}
test.each(['light', 'dark'])('%s Listening Room text, boundaries and series meet AA contrast', (theme) => {
	const block =
		theme === 'light'
			? css.split(':root {')[1]?.split('}')[0]
			: css.split(":root[data-theme='dark'] {")[1]?.split('}')[0];
	const tokens = new Map<string, string>();
	for (const match of block?.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/g) ?? []) {
		if (match[1] && match[2]) tokens.set(match[1], match[2]);
	}
	function ratio(a: string, b: string) {
		const first = tokens.get(a),
			second = tokens.get(b);
		if (!first || !second) throw new Error(`Missing ${a} or ${b}`);
		const x = luminance(first),
			y = luminance(second);
		return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
	}
	for (const bg of ['paper', 'surface', 'subtle', 'accent-soft']) {
		for (const fg of ['ink', 'muted', 'accent', 'detail'])
			expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
	}
	expect(ratio('accent-ink', 'accent')).toBeGreaterThanOrEqual(4.5);
	expect(ratio('caution', 'caution-soft')).toBeGreaterThanOrEqual(4.5);
	for (const fg of ['strong-line', ...Array.from({ length: 7 }, (_, i) => `curve-${i + 1}`)])
		expect(ratio(fg, 'surface'), fg).toBeGreaterThanOrEqual(3);
});
