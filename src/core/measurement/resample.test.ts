import { describe, expect, it } from 'vitest';
import { averageChannels, resample } from './resample.ts';

describe('log-frequency resampling', () => {
	it('puts the geometric midpoint halfway in dB and does not extrapolate', () => {
		const out = resample(
			{ hz: new Float64Array([100, 10000]), db: new Float64Array([40, 80]), dated: null },
			[20, 100, 1000, 10000, 20000]
		);
		expect([...out]).toEqual([NaN, 40, 60, 80, NaN]);
	});
	it('uses the canonical grid by default', () => {
		const out = resample({ hz: new Float64Array([20, 20480]), db: new Float64Array([0, 240]), dated: null });
		expect(out).toHaveLength(240);
		expect(out[24]).toBeCloseTo(24, 10);
	});
	it('averages dB, tracks contributions, and derives imbalance only in 100 Hz–10 kHz', () => {
		const out = averageChannels([0, 10, 10, NaN, 0], [20, 13, 14, 8, NaN], [20, 100, 10000, 12000, 20000]);
		expect([...out.values]).toEqual([10, 11.5, 12, 8, 0]);
		expect([...out.contributions]).toEqual([3, 3, 3, 2, 1]);
		expect(out.imbalanceDb).toBeCloseTo(Math.sqrt((9 + 16) / 2), 12);
		expect(out.pairedBins).toBe(2);
	});
	it('handles missing channels/bins without pretending there is zero imbalance', () => {
		const out = averageChannels(null, [5, NaN], [100, 1000]);
		expect([...out.values]).toEqual([5, NaN]);
		expect([...out.contributions]).toEqual([2, 0]);
		expect(out.imbalanceDb).toBeNull();
	});
});
