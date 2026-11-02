/**
 * TWFR v1, little-endian. Header (24 bytes): magic ASCII TWFR, u8 version, u8 kind
 * (1 rank / 2 detail), u8 layout (0 curve-major / 1 frequency-major), u8 reserved=0,
 * u16 points, u16 step in milli-dB (=20), u32 curve count, u32 JSON bytes, u32 reserved=0.
 * UTF-8 JSON metadata follows, then signed int16 samples, 0.02 dB/step; -32768 is NaN.
 * Metadata records identify each curve's measurement and channel; rank uses channel "avg".
 * Build tries both layouts on actual curves and picks the smaller gzip (ties: curve-major).
 * No clipping: out-of-range/infinite encoder input is an error. Decoders reject malformed packs.
 */
import type { PartitionStatistics } from './types.ts';

export interface PackedCurve {
	measurementId: string;
	channel: string;
	values: Float64Array;
}

export interface CurvePack {
	kind: 'rank' | 'detail';
	partition: string;
	points: number;
	curves: PackedCurve[];
	statistics: PartitionStatistics | null;
}

export type PackLayout = 'curve-major' | 'frequency-major';
const STEP_MILLI_DB = 20;
export const DB_STEP = STEP_MILLI_DB / 1000;
const HEADER = 24;
const SENTINEL = -32768;

export function encodePack(pack: CurvePack, layout: PackLayout = 'curve-major'): Uint8Array {
	if (!Number.isInteger(pack.points) || pack.points < 1 || pack.points > 65535)
		throw new Error('Invalid point count');
	if (!statistics(pack.statistics, pack.points)) throw new Error('Invalid pack statistics');
	const metadata = new TextEncoder().encode(
		JSON.stringify({
			partition: pack.partition,
			curves: pack.curves.map(({ measurementId, channel }) => ({ measurementId, channel })),
			statistics: pack.statistics
		})
	);
	const bytes = new Uint8Array(HEADER + metadata.length + 2 * pack.points * pack.curves.length);
	const view = new DataView(bytes.buffer);
	bytes.set([84, 87, 70, 82, 1, pack.kind === 'rank' ? 1 : 2, layout === 'curve-major' ? 0 : 1, 0]);
	view.setUint16(8, pack.points, true);
	view.setUint16(10, STEP_MILLI_DB, true);
	view.setUint32(12, pack.curves.length, true);
	view.setUint32(16, metadata.length, true);
	bytes.set(metadata, HEADER);
	pack.curves.forEach((curve, c) => {
		if (curve.values.length !== pack.points) throw new Error('Curve length mismatch');
		for (let f = 0; f < pack.points; f++) {
			const value = curve.values[f] ?? NaN;
			const q = Number.isNaN(value) ? SENTINEL : Math.round(value / DB_STEP);
			if (!Number.isInteger(q) || q < -32767 || q > 32767) {
				if (q !== SENTINEL || !Number.isNaN(value)) throw new Error('Sample cannot be represented');
			}
			const i = layout === 'curve-major' ? c * pack.points + f : f * pack.curves.length + c;
			view.setInt16(HEADER + metadata.length + 2 * i, q, true);
		}
	});
	return bytes;
}

function object(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numbers(value: unknown): value is (number | null)[] {
	return (
		Array.isArray(value) &&
		value.every((n: unknown) => n === null || (typeof n === 'number' && Number.isFinite(n)))
	);
}

const count = (value: unknown): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const optionalNumber = (value: unknown) =>
	value === null || (typeof value === 'number' && Number.isFinite(value));
function summary(value: unknown): boolean {
	return (
		object(value) &&
		count(value.pairs) &&
		['meanBefore', 'meanAfter', 'meanImprovement', 'medianImprovement'].every((key) =>
			optionalNumber(value[key])
		) &&
		(value.improved === null || typeof value.improved === 'boolean')
	);
}

function statistics(value: unknown, points: number): value is PartitionStatistics | null {
	if (value === null) return true;
	if (
		!object(value) ||
		!numbers(value.spread) ||
		!numbers(value.populationMedian) ||
		!object(value.sourceOffsets)
	)
		return false;
	if (value.support !== undefined) {
		const s = value.support;
		if (
			!object(s) ||
			!['sufficient', 'low'].includes(String(s.status)) ||
			!(s.reason === null || typeof s.reason === 'string') ||
			!count(s.minimumProducts) ||
			!count(s.multiSourceProducts) ||
			!count(s.sources) ||
			!Array.isArray(s.spread) ||
			s.spread.length !== points ||
			!s.spread.every(count) ||
			!object(s.sourceProducts) ||
			!Object.values(s.sourceProducts).every(count) ||
			!object(s.sourceBins) ||
			!Object.values(s.sourceBins).every(
				(bins) => Array.isArray(bins) && bins.length === points && bins.every(count)
			)
		)
			return false;
	}
	if (value.harmonisation !== undefined) {
		const h = value.harmonisation;
		if (
			!object(h) ||
			!summary(h) ||
			!count(h.foldCount) ||
			h.foldCount < 2 ||
			!Array.isArray(h.folds) ||
			h.folds.length !== h.foldCount ||
			!h.folds.every(
				(f: unknown, i: number) =>
					object(f) && f.fold === i && count(f.trainingProducts) && count(f.heldOutProducts) && summary(f)
			)
		)
			return false;
	}
	return (
		value.spread.length === points &&
		value.populationMedian.length === points &&
		Object.values(value.sourceOffsets).every((v) => numbers(v) && v.length === points)
	);
}

export function decodePack(bytes: Uint8Array): CurvePack {
	if (bytes.byteLength < HEADER) throw new Error('Truncated pack');
	const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (v.getUint32(0) !== 0x54574652 || v.getUint8(4) !== 1) throw new Error('Unknown pack format');
	const kind = v.getUint8(5);
	const layout = v.getUint8(6);
	const points = v.getUint16(8, true);
	const count = v.getUint32(12, true);
	const jsonBytes = v.getUint32(16, true);
	if (
		(kind !== 1 && kind !== 2) ||
		layout > 1 ||
		!points ||
		v.getUint16(10, true) !== STEP_MILLI_DB ||
		v.getUint8(7) ||
		v.getUint32(20, true)
	)
		throw new Error('Invalid pack header');
	const start = HEADER + jsonBytes;
	if (start + 2 * points * count !== bytes.length) throw new Error('Pack length mismatch');
	const meta: unknown = JSON.parse(
		new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(HEADER, start))
	);
	if (
		!object(meta) ||
		typeof meta.partition !== 'string' ||
		!Array.isArray(meta.curves) ||
		meta.curves.length !== count ||
		!statistics(meta.statistics, points)
	)
		throw new Error('Invalid pack metadata');
	const curves: PackedCurve[] = meta.curves.map((row: unknown, c: number) => {
		if (!object(row) || typeof row.measurementId !== 'string' || typeof row.channel !== 'string')
			throw new Error('Invalid curve identity');
		const values = new Float64Array(points);
		for (let f = 0; f < points; f++) {
			const i = layout === 0 ? c * points + f : f * count + c;
			const q = v.getInt16(start + 2 * i, true);
			values[f] = q === SENTINEL ? NaN : q * DB_STEP;
		}
		return { measurementId: row.measurementId, channel: row.channel, values };
	});
	return {
		kind: kind === 1 ? 'rank' : 'detail',
		partition: meta.partition,
		points,
		curves,
		statistics: meta.statistics
	};
}

/** Native gzip decoder shared by browsers/workers (also available in Node for tests). */
export async function decompressGzip(bytes: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([Uint8Array.from(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}
