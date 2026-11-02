import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DB_STEP, decodePack, decompressGzip, encodePack, type CurvePack } from './codec.ts';

const pack: CurvePack = {
	kind: 'rank',
	partition: 'iem-711',
	points: 3,
	curves: [
		{ measurementId: 'm-a', channel: 'avg', values: new Float64Array([80, NaN, -3.01]) },
		{ measurementId: 'm-b', channel: 'avg', values: new Float64Array([1, 2, 3]) }
	],
	statistics: { spread: [1, 2, 3], populationMedian: [80, 70, 60], sourceOffsets: { reviewer: [0, 1, 2] } }
};

describe('TWFR v1', () => {
	it.each(['curve-major', 'frequency-major'] as const)(
		'round trips metadata, order, missing bins (%s)',
		(layout) => {
			const bytes = encodePack(pack, layout);
			const decoded = decodePack(bytes);
			expect(decoded.partition).toBe(pack.partition);
			expect(decoded.statistics).toEqual(pack.statistics);
			expect(decoded.curves.map((c) => c.measurementId)).toEqual(['m-a', 'm-b']);
			expect(decoded.curves[0]?.values[1]).toBeNaN();
			expect(Math.abs((decoded.curves[0]?.values[2] ?? 0) + 3.01)).toBeLessThanOrEqual(DB_STEP / 2 + 1e-12);
			expect([...(decoded.curves[1]?.values ?? [])]).toEqual([1, 2, 3]);
			const embedded = new Uint8Array(bytes.length + 10);
			embedded.set(bytes, 5);
			expect(decodePack(embedded.subarray(5, 5 + bytes.length))).toEqual(decoded);
		}
	);
	it('bounds quantisation error independently for arbitrary curves', () => {
		fc.assert(
			fc.property(
				fc.array(fc.oneof(fc.double({ min: -200, max: 200, noNaN: true }), fc.constant(NaN)), {
					minLength: 1,
					maxLength: 240
				}),
				(values) => {
					const input: CurvePack = {
						kind: 'detail',
						partition: 'test',
						points: values.length,
						curves: [{ measurementId: 'm', channel: 'L', values: Float64Array.from(values) }],
						statistics: null
					};
					const out = decodePack(encodePack(input)).curves[0]?.values;
					expect(out?.length).toBe(values.length);
					values.forEach((v, i) => {
						if (Number.isNaN(v)) expect(out?.[i]).toBeNaN();
						else expect(Math.abs((out?.[i] ?? Infinity) - v)).toBeLessThanOrEqual(0.01000000001);
					});
				}
			)
		);
	});
	it('uses native gzip streams', async () => {
		const raw = encodePack(pack);
		const gzip = new Uint8Array(
			await new Response(
				new Blob([Uint8Array.from(raw)]).stream().pipeThrough(new CompressionStream('gzip'))
			).arrayBuffer()
		);
		expect(await decompressGzip(gzip)).toEqual(raw);
	});
	it('rejects truncated, unknown and corrupted headers', () => {
		const bytes = encodePack(pack);
		expect(() => decodePack(bytes.slice(0, 12))).toThrow('Truncated');
		expect(() => decodePack(bytes.slice(0, -1))).toThrow('length');
		bytes[4] = 99;
		expect(() => decodePack(bytes)).toThrow('Unknown');
	});
	it('does not silently clip values or lengths', () => {
		expect(() => encodePack({ ...pack, points: 2 })).toThrow('length');
		expect(() =>
			encodePack({
				...pack,
				points: 1,
				curves: [{ measurementId: 'x', channel: 'R', values: new Float64Array([Infinity]) }]
			})
		).toThrow('represented');
		expect(() =>
			encodePack({
				...pack,
				points: 1,
				curves: [{ measurementId: 'x', channel: 'R', values: new Float64Array([-655.36]) }]
			})
		).toThrow('represented');
	});
});
