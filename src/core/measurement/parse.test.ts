import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseMeasurement } from './parse.ts';

const relaxed = { minPoints: 2, maxStartHz: Infinity, minEndHz: 0 };

describe('measurement text', () => {
	it.each([' ', '\t', ',', ';'])('reads headers, comments and optional phase (%j)', (separator) => {
		const text = `\uFEFF* Dated: Sep 27, 2024 11:57:09 PM\nFrequency${separator}SPL${separator}Phase\n20${separator}70${separator}0\n20000${separator}80${separator}-10`;
		const result = parseMeasurement(text, relaxed);
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error(result.error);
		expect([...result.points.db]).toEqual([70, 80]);
		expect(result.points.dated).toBe('Sep 27, 2024 11:57:09 PM');
	});
	it.each(['20,0;70,5\n20000,0;80,5', '20\t70,5\n20000\t80,5', '20 70,5\n20000 80,5'])(
		'accepts unambiguous decimal comma',
		(text) => {
			const result = parseMeasurement(text, relaxed);
			expect(result.ok && [...result.points.db]).toEqual([70.5, 80.5]);
		}
	);
	it('sorts, merges duplicate Hz by an arithmetic dB mean and drops nonfinite rows', () => {
		const r = parseMeasurement('20000 80\n20 60\n20 80\nNaN 10\n100 Infinity\nbroken', relaxed);
		expect(r.ok).toBe(true);
		if (!r.ok) throw new Error(r.error);
		expect([...r.points.hz]).toEqual([20, 20000]);
		expect([...r.points.db]).toEqual([70, 80]);
		expect(r.warnings).toHaveLength(3);
	});
	it.each(['20,0 -3.5', '20.0 -3,5', '20,70,0,10', ',-3.5', ',SPL'])(
		'drops malformed or ambiguous rows: %s',
		(row) => {
			const result = parseMeasurement(`${row}\n20 70\n20000 80`, relaxed);
			expect(result.ok).toBe(true);
			if (!result.ok) throw new Error(result.error);
			expect([...result.points.hz]).toEqual([20, 20000]);
			expect([...result.points.db]).toEqual([70, 80]);
			expect(result.warnings).toEqual(['Dropped 1 malformed/nonfinite rows']);
		}
	);
	it.each([
		'"20","70.5","0"\n"20000","80.5","-10"',
		'"20,0";"70,5";"0"\n"20000,0";"80,5";"-10"',
		'20,"70.5",0\n20000,"80.5",-10'
	])('reads quoted CSV numeric fields', (text) => {
		const result = parseMeasurement(text, relaxed);
		expect(result.ok && [...result.points.db]).toEqual([70.5, 80.5]);
	});
	it.each(['\n', '\r\n', '\r'])('reads each supported line ending (%j)', (newline) => {
		const result = parseMeasurement(['* Dated: original date', '20 70', '20000 80'].join(newline), relaxed);
		expect(result.ok && [...result.points.hz]).toEqual([20, 20000]);
		expect(result.ok && result.points.dated).toBe('original date');
	});
	it.each(['', 'header\n1 10', '0 70\n20000 80', '20 300\n20000 80', '200 50\n300 60'])(
		'rejects invalid/insufficient input without throwing',
		(text) => {
			expect(parseMeasurement(text).ok).toBe(false);
		}
	);
	it('enforces default coverage and distinct-point count', () => {
		const valid = Array.from({ length: 32 }, (_, i) => `${20 * 2 ** (i / 3)} ${70 + i / 10}`).join('\n');
		expect(parseMeasurement(valid).ok).toBe(true);
		expect(parseMeasurement(Array(30).fill('20 70').join('\n')).ok).toBe(false);
	});
	it('never throws on arbitrary text', () => {
		fc.assert(
			fc.property(fc.string(), (text) => {
				const result = parseMeasurement(text);
				expect(typeof result.ok).toBe('boolean');
			})
		);
	});
});
